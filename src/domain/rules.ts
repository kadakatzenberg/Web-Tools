/**
 * Pure combat rules.
 *
 * Every function here is a total function of its inputs with no I/O and no
 * mutation of its arguments. The numbers produced must match the v1 single-file
 * app exactly; see tests/unit/rules.test.ts for the pinned cases.
 */

import type {
  Ability,
  Combatant,
  DamageType,
  DerivedStats,
  Dot,
  HealthBand,
  ModTarget,
  ReactionTrigger,
  Regen,
  Stats,
  TempMod,
  TempShield,
} from "./types";
import { STAT_KEYS } from "./constants";
import { gid } from "./factory";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Sum of temporary modifiers applied to a single stat. */
export function modifierTotal(mods: TempMod[] | undefined, stat: ModTarget): number {
  let total = 0;
  for (const m of mods ?? []) if (m.stat === stat) total += m.val;
  return total;
}

/**
 * Extra damage this combatant takes on every hit, from flat modifiers and from
 * any stack carrying a per-stack penalty.
 *
 * Vulnerability is the reason stacks feed in here: "each stack increases all
 * damage target receives by 1" is a property of the victim, and applying it by
 * hand across a stacking debuff is exactly the arithmetic this tool exists to
 * stop dropping.
 */
export function damageTakenBonus(
  c: Pick<Combatant, "tempMods" | "stacks">,
): number {
  let total = modifierTotal(c.tempMods, "dmgTaken");
  for (const st of c.stacks ?? []) {
    if (st.perStackDamage) total += st.perStackDamage * st.count;
  }
  return total;
}

/** Base stats plus active temporary modifiers. */
export function effectiveStats(stats: Stats, mods: TempMod[] | undefined): Stats {
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = (stats[k] ?? 0) + modifierTotal(mods, k);
  return out;
}

/**
 * Derived combat values.
 *
 * AC = 10 + AGI*2 · Hit = DEX*2 · Physical damage = 2 + STR ·
 * Magical damage = 2 + INT · Physical resist = CON · Magical resist = WIS
 */
export function deriveStats(stats: Stats, mods?: TempMod[]): DerivedStats {
  const e = effectiveStats(stats, mods);
  return {
    ac: 10 + e.AGI * 2,
    hit: e.DEX * 2,
    physicalDamage: 2 + e.STR,
    magicalDamage: 2 + e.INT,
    physicalResist: e.CON,
    magicalResist: e.WIS,
  };
}

/**
 * Resistance applied against an incoming hit, as a signed value.
 *
 * Positive reduces the hit; **negative increases it**. A combatant with CON -2
 * takes two extra physical damage per hit.
 *
 * This is a deliberate rules change from v1, which clamped the value at zero
 * and so made a negative CON or WIS completely free. Because those two stats
 * feed nothing but resistance, clamping meant CON -3 and CON 0 were identical,
 * which made dumping a mandatory weakness into them a dominant choice for both
 * player sheets and generated enemies. See docs/MIGRATION.md.
 *
 * True and raw damage still bypass the calculation entirely.
 */
export function resistanceFor(
  type: DamageType,
  effCON: number,
  effWIS: number,
): number {
  if (type === "physical") return effCON;
  if (type === "magical") return effWIS;
  return 0;
}

export interface DamageResult {
  hp: number;
  shield: number;
  tempShields: TempShield[];
  /** Diagnostics for UI feedback; not persisted. */
  breakdown: {
    incoming: number;
    /** Damage prevented by positive resistance. Never negative. */
    resisted: number;
    /** Extra damage added by negative resistance. Never negative. */
    amplified: number;
    afterResist: number;
    absorbedByTemp: number;
    absorbedByShield: number;
    toHp: number;
    brokeTempShieldIds: string[];
    brokeShield: boolean;
  };
}

/**
 * Apply damage through the canonical pipeline:
 *   resistance → temporary shields (in order) → normal shield → HP
 *
 * HP is clamped to [0, maxHp]. Temporary shields that reach zero are dropped.
 */
export function applyDamage(
  c: Pick<
    Combatant,
    "hp" | "maxHp" | "shield" | "tempShields" | "stats" | "tempMods"
  >,
  amount: number,
  type: DamageType,
): DamageResult {
  const amt = Math.max(0, amount || 0);
  const existingTemp = (c.tempShields ?? []).map((s) => ({ ...s }));

  if (!amt) {
    return {
      hp: c.hp,
      shield: c.shield,
      tempShields: existingTemp,
      breakdown: {
        incoming: 0,
        resisted: 0,
        amplified: 0,
        afterResist: 0,
        absorbedByTemp: 0,
        absorbedByShield: 0,
        toHp: 0,
        brokeTempShieldIds: [],
        brokeShield: false,
      },
    };
  }

  const mods = c.tempMods ?? [];
  const effCON = (c.stats.CON ?? 0) + modifierTotal(mods, "CON");
  const effWIS = (c.stats.WIS ?? 0) + modifierTotal(mods, "WIS");
  const tax = resistanceFor(type, effCON, effWIS);

  // Order matters: resistance first, then flat vulnerability. Applying the
  // bonus before resistance would let a target's CON eat a Vulnerability stack,
  // which is the opposite of what the stack is for.
  const vuln = damageTakenBonus(c);
  let left = Math.max(0, amt - tax + vuln);
  const afterResist = left;

  let ts = existingTemp;
  const broke: string[] = [];
  let absorbedByTemp = 0;
  for (let i = 0; i < ts.length && left > 0; i++) {
    const shield = ts[i]!;
    const a = Math.min(shield.val, left);
    ts[i] = { ...shield, val: shield.val - a };
    absorbedByTemp += a;
    left -= a;
    if (ts[i]!.val === 0) broke.push(shield.id);
  }
  ts = ts.filter((s) => s.val > 0);

  let shield = c.shield;
  let absorbedByShield = 0;
  let brokeShield = false;
  if (shield > 0) {
    const a = Math.min(shield, left);
    shield -= a;
    absorbedByShield = a;
    left -= a;
    if (shield === 0 && a > 0) brokeShield = true;
  }

  const hpVal = clamp(c.hp - left, 0, c.maxHp);

  return {
    hp: hpVal,
    shield,
    tempShields: ts,
    breakdown: {
      incoming: amt,
      resisted: tax > 0 ? Math.min(tax, amt) : 0,
      amplified: (tax < 0 ? -tax : 0) + Math.max(0, vuln),
      afterResist,
      absorbedByTemp,
      absorbedByShield,
      toHp: left,
      brokeTempShieldIds: broke,
      brokeShield,
    },
  };
}

/** Healing never exceeds maxHp and never revives below zero. */
export function applyHeal(c: Pick<Combatant, "hp" | "maxHp">, amount: number): number {
  const amt = Math.max(0, amount || 0);
  return clamp(c.hp + amt, 0, c.maxHp);
}

export interface HealResult {
  hp: number;
  tempShields: TempShield[];
  /** Hit points actually restored. */
  healed: number;
  /** Overflow converted into a temporary shield. */
  warded: number;
}

/**
 * Healing, with the overflow optionally becoming a ward.
 *
 * Twelve skills in the pool end with "Overheal converts to temporary shield",
 * and the tracker used to clamp at max HP and discard the excess — so every one
 * of them resolved wrong unless the GM caught it by hand. `overheal` defaults
 * off at this layer so nothing changes for callers that have not opted in; the
 * healing controls in the UI turn it on.
 *
 * `wardCap` covers the skills that bound the conversion ("capped at 3").
 */
export function applyHealing(
  c: Pick<Combatant, "hp" | "maxHp" | "tempShields">,
  amount: number,
  opts: { overheal?: boolean; wardCap?: number } = {},
): HealResult {
  const amt = Math.max(0, Math.trunc(amount) || 0);
  const hp = clamp(c.hp + amt, 0, c.maxHp);
  const healed = hp - Math.max(0, c.hp);

  const tempShields = [...(c.tempShields ?? [])];
  let warded = 0;

  if (opts.overheal) {
    const overflow = amt - healed;
    warded = opts.wardCap != null ? Math.min(overflow, Math.max(0, opts.wardCap)) : overflow;
    if (warded > 0) {
      tempShields.push({
        id: gid(),
        val: warded,
        duration: tempShieldDuration(warded),
        label: "Overheal",
      });
    }
  }

  return { hp, tempShields, healed, warded };
}

/**
 * Temporary shield duration is derived from its magnitude:
 * 1–2 → 3 rounds, 3–4 → 2 rounds, 5+ → 1 round.
 */
export function tempShieldDuration(val: number): number {
  return val <= 2 ? 3 : val <= 4 ? 2 : 1;
}

/** Health banding used for badges, bars, and the battlefield view. */
export function healthBand(hp: number, maxHp: number): HealthBand {
  if (hp <= 0) return "unconscious";
  const pct = clamp((hp / maxHp) * 100, 0, 100);
  if (pct <= 25) return "critical";
  if (pct <= 50) return "wounded";
  return "healthy";
}

export function healthPercent(hp: number, maxHp: number): number {
  if (!maxHp) return 0;
  return clamp((hp / maxHp) * 100, 0, 100);
}

/* ── Abilities ── */

/** Whether an ability is locked out by a phase-count gate. */
export function isPhaseLocked(
  ab: Pick<Ability, "phaseLock" | "phaseLockType">,
  playerPhaseCount: number,
  enemyPhaseCount: number,
): boolean {
  if (!ab.phaseLock) return false;
  return ab.phaseLockType === "enemy"
    ? enemyPhaseCount < ab.phaseLock
    : playerPhaseCount < ab.phaseLock;
}

/** Whether an ability can be fired right now, ignoring phase locks. */
export function isAbilityReady(ab: Ability): boolean {
  switch (ab.mode) {
    case "ammo":
      return ab.cur > 0;
    case "charge":
      return ab.cur >= ab.max;
    case "reaction":
    case "cooldown":
      return ab.cur === 0;
    default:
      return false;
  }
}

export function isAmmoEmpty(ab: Ability): boolean {
  return ab.mode === "ammo" && ab.cur === 0;
}

/** Fill fraction (0–100) for an ability's progress bar. */
export function abilityFillPercent(ab: Ability): number {
  const max = ab.max || 1;
  if (ab.mode === "ammo" || ab.mode === "charge" || ab.mode === "stack") {
    return clamp((ab.cur / max) * 100, 0, 100);
  }
  if (ab.mode === "cooldown" || ab.mode === "reaction") {
    return clamp(((ab.max - ab.cur) / max) * 100, 0, 100);
  }
  return 0;
}

/**
 * Advance one ability across a round boundary.
 * Charge accrues only while charging; cooldown and reaction tick down.
 *
 * A skill with `refill: "round"` restores its whole budget instead — that is
 * how "once per round" is said. `refill: "combat"` never restores, so a
 * once-per-combat skill stays spent until the encounter is reset.
 */
export function tickAbility(ab: Ability): Ability {
  if (ab.refill === "round") return { ...ab, cur: ab.max };
  if (ab.refill === "combat") return { ...ab };
  if (ab.mode === "charge") {
    return ab.charging
      ? { ...ab, cur: clamp(ab.cur + (ab.gainPerPhase || 1), 0, ab.max) }
      : { ...ab };
  }
  if (ab.mode === "cooldown" || ab.mode === "reaction") {
    return { ...ab, cur: clamp(ab.cur - 1, 0, ab.max) };
  }
  return { ...ab };
}

/* ── When will this be ready? ── */

/**
 * Presses of Next Phase between now and the next round boundary.
 *
 * Abilities accrue only when the round turns over, but the control a GM
 * actually presses is the phase. Reporting readiness in rounds meant a
 * one-round charge sat unchanged through three presses — technically correct
 * and useless. Counting in phases makes the wait match the button.
 */
export function phasesUntilRoundTick(phase: number): number {
  return PHASE_COUNT - (phase % PHASE_COUNT);
}

const PHASE_COUNT = 3;

/**
 * How many phases until an ability is usable, or 0 if it already is.
 * Returns null when the answer is not a wait — a spent ammo clip, a gate that
 * is not satisfied, an idle charge nobody has started.
 */
export function phasesUntilReady(ab: Ability, phase: number): number | null {
  const rounds =
    ab.mode === "charge"
      ? ab.charging && ab.cur < ab.max
        ? Math.ceil((ab.max - ab.cur) / (ab.gainPerPhase || 1))
        : 0
      : ab.mode === "cooldown" || ab.mode === "reaction"
        ? ab.cur
        : 0;

  if (rounds <= 0) return 0;
  return (rounds - 1) * PHASE_COUNT + phasesUntilRoundTick(phase);
}

/* ── Requirements ── */

export interface RequirementState {
  /** Whether this ability is gated at all. */
  gated: boolean;
  met: boolean;
  /** Sentence explaining the gate, for the chip and the disabled control. */
  label: string;
}

/**
 * Whether a skill's prerequisite is satisfied, and how to say so.
 *
 * A gated skill is shown and explained rather than hidden or silently dead:
 * an inactive control that gives no reason is the single most common way an
 * interface leaves someone stuck, and in a turn-based game there is plenty of
 * room to just write the condition down.
 */
export function requirementState(
  ab: Pick<Ability, "requires">,
  siblings: Ability[],
): RequirementState {
  const req = ab.requires;
  if (!req?.skill) return { gated: false, met: true, label: "" };

  const want = req.skill.trim().toLowerCase();
  const other = siblings.find(
    (s) => s.name.trim().toLowerCase() === want || s.name.trim().toLowerCase().endsWith(want),
  );

  if (!other) {
    return { gated: true, met: false, label: `Needs ${req.skill}, which this combatant does not have` };
  }

  const threshold = req.atMax ? other.max : (req.atLeast ?? other.max);
  const met = other.cur >= threshold && threshold > 0;
  return {
    gated: true,
    met,
    label: met
      ? `${other.name} at ${other.cur}/${other.max}`
      : `Needs ${other.name} at ${threshold}/${other.max} — currently ${other.cur}`,
  };
}

/**
 * Readiness including any prerequisite.
 *
 * A charge whose gate is met counts as charged. Dawn's ult is not something the
 * player winds up separately; it becomes available the moment Sangre Lanza
 * reaches four, and making them press Charge as well would be bookkeeping the
 * skill text never asked for.
 */
export function isAbilityReadyWith(ab: Ability, siblings: Ability[]): boolean {
  const req = requirementState(ab, siblings);
  if (req.gated) {
    if (!req.met) return false;
    if (ab.mode === "charge") return true;
  }
  return isAbilityReady(ab);
}

/* ── Reactions ── */

/** Something that just happened, which a reaction might answer. */
export interface CombatEvent {
  kind: "hit" | "down";
  /** Who it happened to. */
  targetId: string;
  damageType?: DamageType;
}

function triggerMatches(
  trigger: ReactionTrigger,
  event: CombatEvent,
  self: Combatant,
  subject: Combatant,
): boolean {
  const isSelf = self.id === subject.id;
  // "Ally" means the same side, and never the reacting unit itself.
  const isAlly = !isSelf && self.role === subject.role;
  const physical = event.damageType === "physical";
  const magical = event.damageType === "magical";

  switch (trigger) {
    case "hit":
      return event.kind === "hit" && isSelf;
    case "physicalHit":
      return event.kind === "hit" && isSelf && physical;
    case "magicHit":
      return event.kind === "hit" && isSelf && magical;
    case "allyHit":
      return event.kind === "hit" && isAlly;
    case "allyDown":
      return event.kind === "down" && isAlly;
    case "selfDown":
      return event.kind === "down" && isSelf;
  }
}

export interface ArmedReaction {
  combatant: Combatant;
  ability: Ability;
}

/**
 * Reactions that are ready and whose trigger this event satisfies.
 *
 * Pure and derived: nothing is stored, so a reaction prompt can never go stale
 * or survive an undo. A reaction with no trigger set is skipped rather than
 * assumed to answer everything — guessing here would cry wolf on every hit.
 */
export function armedReactions(
  combatants: Combatant[],
  event: CombatEvent,
  playerPhaseCount = 0,
  enemyPhaseCount = 0,
): ArmedReaction[] {
  const subject = combatants.find((c) => c.id === event.targetId);
  if (!subject) return [];

  const out: ArmedReaction[] = [];
  for (const c of combatants) {
    if (c.hp <= 0) continue; // the unconscious do not answer
    for (const ab of c.abilities ?? []) {
      if (ab.mode !== "reaction" || !ab.trigger) continue;
      if (!isAbilityReady(ab)) continue;
      if (isPhaseLocked(ab, playerPhaseCount, enemyPhaseCount)) continue;
      if (triggerMatches(ab.trigger, event, c, subject)) out.push({ combatant: c, ability: ab });
    }
  }
  return out;
}

/* ── Redirection ── */

/**
 * Who actually takes a hit aimed at `id`.
 *
 * Follows a chain of redirects, because an intercept can itself be intercepted.
 * Redirects to a downed combatant are ignored — a body cannot cover anyone.
 *
 * A circular arrangement resolves back to the original target. A protecting B
 * while B protects A is an easy thing for a table to set up by accident, and
 * the cover cancels out: nobody can be said to be in front. Returning the
 * original is the one answer that does not depend on where the walk happened
 * to start or stop, which matters because a longer chain feeding into a cycle
 * would otherwise land on an arbitrary member of it.
 */
export function resolveRedirect(combatants: Combatant[], id: string): string {
  const byId = new Map(combatants.map((c) => [c.id, c]));
  const seen = new Set<string>();
  let current = id;

  while (true) {
    if (seen.has(current)) return id;
    seen.add(current);
    const c = byId.get(current);
    const to = c?.redirect;
    if (!to || to.duration <= 0) return current;
    const next = byId.get(to.toId);
    if (!next || next.hp <= 0) return current;
    current = to.toId;
  }
}

/** Redirects lose a round, and expire. */
export function tickRedirect(
  redirect: Combatant["redirect"],
): Combatant["redirect"] {
  if (!redirect) return undefined;
  const duration = redirect.duration - 1;
  return duration > 0 ? { ...redirect, duration } : undefined;
}

/* ── Duration bookkeeping ── */

export function tickDots(dots: Dot[] | undefined): Dot[] {
  return (dots ?? [])
    .map((d) => (d.permanent ? d : { ...d, duration: (d.duration ?? 0) - 1 }))
    .filter((d) => d.permanent || (d.duration ?? 0) > 0);
}

/**
 * Regens currently in force. A legacy scalar `hpRegen` is promoted to a
 * permanent regen only when the modern list is empty.
 */
export function activeRegens(c: Pick<Combatant, "hpRegens" | "hpRegen">): Regen[] {
  if (c.hpRegens && c.hpRegens.length > 0) return c.hpRegens;
  if ((c.hpRegen ?? 0) > 0) {
    return [{ id: "legacy", val: c.hpRegen, permanent: true, duration: null }];
  }
  return [];
}

export function tickRegens(regens: Regen[]): Regen[] {
  return regens
    .map((r) => (r.permanent ? r : { ...r, duration: (r.duration ?? 0) - 1 }))
    .filter((r) => r.permanent || (r.duration ?? 0) > 0);
}

export function tickDurations<T extends { duration: number }>(items: T[] | undefined): T[] {
  return (items ?? [])
    .map((s) => ({ ...s, duration: s.duration - 1 }))
    .filter((s) => s.duration > 0);
}

/* ── Round processing ── */

export interface RoundTickEvent {
  combatantId: string;
  dotDamage: number;
  regenHealed: number;
  expiredStatuses: string[];
  expiredMods: string[];
  expiredShields: string[];
  expiredDots: string[];
  died: boolean;
}

/**
 * Process a single combatant across a round boundary.
 *
 * Order matches v1 exactly: DoTs resolve first (each through the full damage
 * pipeline, threading HP/shields between ticks), then regeneration, then every
 * duration counter decrements and expired entries drop. `done` resets.
 */
export function tickCombatant(c: Combatant): { next: Combatant; event: RoundTickEvent } {
  const hpBefore = c.hp;
  let hp = c.hp;
  let shield = c.shield;
  let ts = (c.tempShields ?? []).slice();

  let dotDamage = 0;
  for (const dot of c.dots ?? []) {
    const res = applyDamage(
      { ...c, hp, shield, tempShields: ts },
      dot.dmg,
      dot.type,
    );
    dotDamage += hp - res.hp;
    hp = res.hp;
    shield = res.shield;
    ts = res.tempShields;
  }

  const regens = activeRegens(c);
  let regenHealed = 0;
  for (const r of regens) {
    const before = hp;
    hp = clamp(hp + r.val, 0, c.maxHp);
    regenHealed += hp - before;
  }
  const newRegens = tickRegens(regens);

  const nextStatuses = tickDurations(c.statuses);
  const nextMods = tickDurations(c.tempMods);
  const nextRedirect = tickRedirect(c.redirect);
  const nextShields = tickDurations(ts);
  const nextDots = tickDots(c.dots);

  const expiredStatuses = (c.statuses ?? [])
    .filter((s) => !nextStatuses.some((n) => n.id === s.id))
    .map((s) => s.name);
  const expiredMods = (c.tempMods ?? [])
    .filter((m) => !nextMods.some((n) => n.id === m.id))
    .map((m) => m.label);
  const expiredShields = ts
    .filter((s) => !nextShields.some((n) => n.id === s.id))
    .map((s) => s.label || "temp");
  const expiredDots = (c.dots ?? [])
    .filter((d) => !nextDots.some((n) => n.id === d.id))
    .map((d) => d.name);

  const next: Combatant = {
    ...c,
    hp,
    shield,
    hpRegens: newRegens,
    hpRegen: c.hpRegen,
    done: false,
    dots: nextDots,
    abilities: (c.abilities ?? []).map(tickAbility),
    statuses: nextStatuses,
    tempMods: nextMods,
    tempShields: nextShields,
  };

  // Left off the object literal above so an expired redirect is deleted rather
  // than persisted as `undefined` through a JSON round trip.
  if (nextRedirect) next.redirect = nextRedirect;
  else delete next.redirect;

  return {
    next,
    event: {
      combatantId: c.id,
      dotDamage,
      regenHealed,
      expiredStatuses,
      expiredMods,
      expiredShields,
      expiredDots,
      died: hpBefore > 0 && hp <= 0,
    },
  };
}
