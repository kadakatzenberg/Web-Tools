/**
 * Construction of combatants from every source the app supports:
 * the manual add form, the character library, and the enemy generator.
 *
 * The field-by-field defaults here are ported verbatim from v1 so that a
 * combatant built in v2 serialises to the same shape already stored in
 * `combat_sessions.state`.
 */

import type {
  AbilityRequirement,
  Ability,
  Combatant,
  CombatSheet,
  CombatSkillRow,
  DamageStat,
  GeneratedEnemy,
  Position,
  ReactionTrigger,
  RefillCadence,
  Role,
  SheetSkill,
  SheetSkills,
  StatKey,
  Stats,
} from "./types";
import { EMPTY_STATS, STAT_KEYS, TIER_CFG } from "./constants";
import { archetypeLabel } from "./generator";

/** Short opaque id, matching v1's `Math.random().toString(36).slice(2,9)`. */
export function gid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function normaliseStats(input: unknown): Stats {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_STATS };
  for (const k of STAT_KEYS) {
    const v = src[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
  }
  return out;
}

/** Baseline combatant with every collection field present and empty. */
function baseCombatant(partial: Partial<Combatant> & { name: string; role: Role }): Combatant {
  return {
    id: partial.id ?? gid(),
    name: partial.name,
    role: partial.role,
    type: partial.type ?? "",
    hp: partial.hp ?? 15,
    maxHp: partial.maxHp ?? 15,
    shield: partial.shield ?? 0,
    tempShields: partial.tempShields ?? [],
    dots: partial.dots ?? [],
    hpRegen: partial.hpRegen ?? 0,
    hpRegens: partial.hpRegens ?? [],
    stats: partial.stats ?? { ...EMPTY_STATS },
    statuses: partial.statuses ?? [],
    abilities: partial.abilities ?? [],
    tempMods: partial.tempMods ?? [],
    position: partial.position ?? "Front",
    notes: partial.notes ?? "",
    sheetSkills: partial.sheetSkills ?? {},
    done: partial.done ?? false,
    player: partial.player ?? "",
    // Left undefined rather than "" so an absent portrait stays absent through
    // a JSON round trip instead of becoming an empty <img src>.
    ...(partial.portrait ? { portrait: partial.portrait } : {}),
    // Likewise absent unless the sheet actually declared one, so "no opinion"
    // stays distinguishable from "physical" and the automatic pick still runs.
    ...(partial.damageStat ? { damageStat: partial.damageStat } : {}),
  };
}

/* ── Manual add ── */

export function createManualCombatant(input: {
  name: string;
  role: Role;
  type: string;
  maxHp: number;
  stats: Stats;
  position?: Position;
}): Combatant {
  const hp = Math.trunc(input.maxHp) || 15;
  return baseCombatant({
    name: input.name,
    role: input.role,
    type: input.role === "Enemy" ? input.type : "",
    hp,
    maxHp: hp,
    stats: { ...input.stats },
    position: input.position ?? "Front",
  });
}

/* ── Library sheet → combatant ── */

const SHEET_SKILL_KEYS = ["s1", "s2", "ult"] as const;

/**
 * Map a sheet skill onto a tracker ability.
 *
 * Default capacity depends on mode: cooldown and reaction default to 2,
 * everything else to 1. Ammo abilities enter play fully loaded.
 */
/**
 * Read a prerequisite out of a sheet's free-text cooldown field.
 *
 * Sheets already say things like "Requires Sangre Lanza at max (+4 STR)" in
 * prose, because there was nowhere structured to put it. Parsing that is what
 * makes the gate appear on existing characters without anyone re-entering
 * their sheet — the alternative is a feature nobody's data uses.
 *
 * Deliberately narrow: only the "requires <skill> at max" and
 * "requires <skill> at <n>" shapes, anchored on the word "requires". Anything
 * cleverer would start inventing gates out of ordinary sentences.
 */
export function requirementFromText(text: string | undefined): AbilityRequirement | null {
  if (!text) return null;
  const atMax = /requires?\s+(.+?)\s+at\s+(?:max|maximum|full)\b/i.exec(text);
  if (atMax?.[1]) return { skill: cleanSkillName(atMax[1]), atMax: true };

  const atLeast = /requires?\s+(.+?)\s+at\s+(\d+)/i.exec(text);
  if (atLeast?.[1] && atLeast[2]) {
    return { skill: cleanSkillName(atLeast[1]), atLeast: parseInt(atLeast[2], 10) };
  }
  return null;
}

/** Trim the trailing punctuation and parentheticals a sentence leaves behind. */
function cleanSkillName(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/**
 * Read a per-stack stat bonus out of a sheet's prose.
 *
 * Sheets write these as "+1 STR per stack", "gains +1 STR each stack", or —
 * most often — as a total at the ceiling: "Requires Sangre Lanza at max
 * (+4 STR)". The total form is divided by the ceiling to get what one point is
 * worth, which is the only figure the tracker can apply while the counter is
 * still climbing.
 *
 * Same discipline as the gate parser: narrow shapes, anchored on a sign and a
 * stat name, so an ordinary sentence mentioning STR does not become a buff.
 */
export function grantFromText(
  text: string | undefined,
  max: number,
): { stat: StatKey; perStack: number } | null {
  if (!text) return null;

  const perStack = /\+\s*(\d+)\s*(STR|DEX|INT|WIS|AGI|CON)\b[^.]{0,24}?\bper\s+(?:stack|point|charge)/i.exec(text);
  if (perStack?.[1] && perStack[2]) {
    return { stat: perStack[2].toUpperCase() as StatKey, perStack: parseInt(perStack[1], 10) };
  }

  const each = /\bgains?\b[^.]{0,20}?\+\s*(\d+)\s*(STR|DEX|INT|WIS|AGI|CON)\b/i.exec(text);
  if (each?.[1] && each[2]) {
    return { stat: each[2].toUpperCase() as StatKey, perStack: parseInt(each[1], 10) };
  }

  // A total stated at the ceiling, e.g. "(+4 STR)" on a four-stack skill.
  const total = /\+\s*(\d+)\s*(STR|DEX|INT|WIS|AGI|CON)\b/i.exec(text);
  if (total?.[1] && total[2] && max > 0) {
    const amount = parseInt(total[1], 10);
    if (amount % max === 0) {
      return { stat: total[2].toUpperCase() as StatKey, perStack: amount / max };
    }
  }
  return null;
}

/**
 * Read the events that make a counter climb on its own out of a sheet's prose.
 *
 * "Gains a stack each time she lands or takes a hit" is the single most-missed
 * piece of bookkeeping in a live fight, and it is already written down — just
 * in a sentence rather than a column.
 */
export function growthFromText(text: string | undefined): ReactionTrigger[] | null {
  if (!text) return null;

  // Only sentences that are actually about accruing something.
  if (!/\b(gain|gains|gaining|accrue|accrues|build|builds|stack|stacks)\b/i.test(text)) {
    return null;
  }

  const out = new Set<ReactionTrigger>();
  // "when hit", "on being hit", "each time she takes damage"
  if (/\b(?:when|whenever|each time|every time|if|on)\b[^.]{0,32}?\b(?:is |are |being |gets? |she |he |they )?(?:hit|struck|damaged|takes? damage|takes? a hit)\b/i.test(text)) {
    out.add("hit");
  }
  // "on hit", "each time she lands a hit", "when dealing damage"
  if (/\b(?:when|whenever|each time|every time|on|upon)\b[^.]{0,32}?\b(?:lands?|deals?|dealing|connects?|strikes?|hitting|successful(?:ly)? hits?)\b/i.test(text)) {
    out.add("hitDealt");
  }
  return out.size ? [...out] : null;
}

/**
 * Read what arms a reaction out of a sheet's prose.
 *
 * Without this every reaction imported from a player sheet is inert: the
 * tracker knows how to raise them, but a reaction with no trigger is skipped
 * rather than guessed at, so none of them ever came up. The trigger is the
 * whole definition of a reaction and it was the one thing the importer dropped.
 */
export function triggerFromText(text: string | undefined): ReactionTrigger | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // Order matters: the specific readings have to win over the general one.
  if (/\ball(?:y|ies)\b[^.]{0,40}?\b(?:falls?|drops?|downed|goes down|reaches 0|knocked out|unconscious)\b/.test(t)) {
    return "allyDown";
  }
  if (/\b(?:you|this unit|self|they)?\s*(?:falls?|drops?|reaches?)\s*(?:to\s*)?0\s*hp\b|\bwhen (?:you are|this unit is) (?:downed|knocked out)\b/.test(t)) {
    return "selfDown";
  }
  if (/\ball(?:y|ies)\b[^.]{0,40}?\b(?:is |are |being )?(?:hit|struck|attacked|targeted|damaged)\b/.test(t)) {
    return "allyHit";
  }
  if (/\bphysical\b[^.]{0,24}?\b(?:hit|attack|damage)\b|\bhit by [^.]{0,16}physical\b/.test(t)) {
    return "physicalHit";
  }
  if (/\bmagic(?:al)?\b[^.]{0,24}?\b(?:hit|attack|damage)\b|\bhit by [^.]{0,16}magic/.test(t)) {
    return "magicHit";
  }
  if (/\b(?:when|whenever|if|upon|on)\b[^.]{0,32}?\b(?:is |are |being |you are |gets? )?(?:hit|struck|attacked|targeted)\b/.test(t)) {
    return "hit";
  }
  return null;
}

/**
 * Read a forced saving throw out of a sheet's prose: "DC 14 AGI check",
 * "AGI check DC 14", "forces a WIS save (DC 12)".
 */
export function dcFromText(
  text: string | undefined,
): { stat: StatKey; value: number } | null {
  if (!text) return null;
  const stats = "STR|DEX|INT|WIS|AGI|CON";

  const dcFirst = new RegExp(`\\bDC\\s*:?\\s*(\\d{1,2})\\b[^.]{0,20}?\\b(${stats})\\b`, "i").exec(text);
  if (dcFirst?.[1] && dcFirst[2]) {
    return { stat: dcFirst[2].toUpperCase() as StatKey, value: parseInt(dcFirst[1], 10) };
  }

  const statFirst = new RegExp(`\\b(${stats})\\b[^.]{0,24}?\\bDC\\s*:?\\s*(\\d{1,2})\\b`, "i").exec(text);
  if (statFirst?.[1] && statFirst[2]) {
    return { stat: statFirst[1].toUpperCase() as StatKey, value: parseInt(statFirst[2], 10) };
  }
  return null;
}

/**
 * Read a budget out of a sheet's prose. "Once per combat" and "once per round"
 * cannot be said with a per-phase gain rate, which refills three times as fast
 * as a round, so a skill saying either used to come in as an ordinary cooldown
 * and recharge far too quickly.
 */
export function refillFromText(text: string | undefined): RefillCadence | null {
  if (!text) return null;
  if (/\b(?:once|twice|\d+ times?)\s+per\s+(?:combat|encounter|fight|battle)\b/i.test(text)) {
    return "combat";
  }
  if (/\b(?:once|twice|\d+ times?)\s+per\s+round\b/i.test(text)) return "round";
  return null;
}

export function abilityFromSheetSkill(
  key: (typeof SHEET_SKILL_KEYS)[number],
  sk: SheetSkill,
): Ability {
  const mode = sk.mode ?? "cooldown";
  const parsedMax = parseInt(String(sk.maxVal ?? ""), 10);
  const max =
    (Number.isFinite(parsedMax) && parsedMax) ||
    (mode === "cooldown" || mode === "reaction" ? 2 : 1);
  const gainPerPhase = parseInt(String(sk.gainPerPhase ?? ""), 10) || 1;
  const phaseLock = parseInt(String(sk.phaseLock ?? ""), 10) || null;

  const ability: Ability = {
    id: gid(),
    name: key === "ult" ? `ULT: ${sk.name}` : sk.name,
    mode,
    max,
    cur: mode === "ammo" ? max : 0,
    gainPerPhase,
    effectText: sk.effect ?? "",
    ...(sk.dice?.trim() ? { dice: sk.dice.trim() } : {}),
  };

  // The gate is written in prose on the sheet; lift it into structure.
  const requires = requirementFromText(sk.cooldown) ?? requirementFromText(sk.effect);
  if (requires) ability.requires = requires;

  /*
   * The same treatment for what a counter is worth and what makes it climb.
   * Only counters get either: a cooldown that says "+2 STR" is describing a
   * one-off buff somebody applies, not a per-point rate.
   */
  if (mode === "stack" || mode === "charge") {
    const grants = grantFromText(sk.effect, max) ?? grantFromText(sk.flavor, max);
    if (grants) ability.grants = grants;
    const growsOn = growthFromText(sk.effect) ?? growthFromText(sk.flavor);
    if (growsOn) ability.growsOn = growsOn;
  }

  /*
   * A reaction is defined by what arms it. Imported without one it is inert —
   * the tracker will never raise it, because guessing a trigger would cry wolf
   * on every hit. The sheet says; read the sheet.
   */
  if (mode === "reaction") {
    const trigger = triggerFromText(sk.effect) ?? triggerFromText(sk.cooldown) ?? triggerFromText(sk.flavor);
    if (trigger) ability.trigger = trigger;
  }

  const dc = dcFromText(sk.effect) ?? dcFromText(sk.flavor);
  if (dc) {
    ability.dcStat = dc.stat;
    ability.dcValue = dc.value;
  }

  const refill = refillFromText(sk.cooldown) ?? refillFromText(sk.effect);
  if (refill) ability.refill = refill;
  if (phaseLock) {
    ability.phaseLock = phaseLock;
    ability.phaseLockType = sk.phaseLockType ?? "player";
  }
  return ability;
}

/**
 * Which stat a sheet swings with, when the sheet makes it plain.
 *
 * Derived rather than stored because there is no column for it, and asked of
 * the sheet's own words rather than of its numbers: a character built around a
 * stat that starts at zero and climbs looks like a caster on turn one and a
 * bruiser on turn four, and the higher-of-the-two guess flips with them.
 *
 * A skill that pays out STR is decisive — that is a kit built on STR. Failing
 * that, the prose is counted, and a tie leaves the question open rather than
 * guessing, because the automatic pick is a perfectly good answer for most
 * sheets and a wrong declaration is worse than none.
 */
export function preferredDamageStat(
  abilities: Ability[],
  skills: SheetSkills,
): DamageStat | undefined {
  for (const ab of abilities) {
    if (ab.grants?.stat === "STR") return "physical";
    if (ab.grants?.stat === "INT") return "magical";
  }

  const prose = Object.values(skills)
    .flatMap((sk) => [sk?.effect, sk?.flavor, sk?.name])
    .filter(Boolean)
    .join(" ");
  if (!prose) return undefined;

  const count = (re: RegExp) => (prose.match(re) ?? []).length;
  const physical = count(/\bSTR\b/gi) + count(/\bphysical\b/gi) + count(/\bmelee\b/gi);
  const magical = count(/\bINT\b/gi) + count(/\bmagical?\b/gi) + count(/\bspells?\b/gi);

  if (physical > magical) return "physical";
  if (magical > physical) return "magical";
  return undefined;
}

export function sheetDisplayName(sheet: CombatSheet): string {
  if (sheet.character_name) {
    return sheet.sheet_name
      ? `${sheet.character_name} (${sheet.sheet_name})`
      : sheet.character_name;
  }
  return sheet.name ?? "Unnamed";
}

export function combatantFromSheet(sheet: CombatSheet): Combatant {
  const stats = normaliseStats(sheet.stats);
  const skills: SheetSkills = sheet.skills ?? {};
  const abilities: Ability[] = [];
  for (const key of SHEET_SKILL_KEYS) {
    const sk = skills[key];
    if (!sk || !sk.name) continue;
    abilities.push(abilityFromSheetSkill(key, sk));
  }
  const hp = sheet.max_hp || 15;
  return baseCombatant({
    name: sheetDisplayName(sheet),
    role: sheet.role ?? "Player",
    type: sheet.type ?? "",
    hp,
    maxHp: hp,
    stats,
    abilities,
    sheetSkills: skills,
    notes: sheet.notes ?? "",
    player: sheet.player ?? "",
    portrait: sheet.portrait_url,
    damageStat: preferredDamageStat(abilities, skills),
  });
}

/* ── Generator → combatant ── */

/** Map a `combat_skills` row onto a tracker ability. */
export function abilityFromSkillRow(row: CombatSkillRow): Ability {
  const max = row.max_val || 2;
  const ability: Ability = {
    id: gid(),
    name: row.name,
    mode: row.mode,
    max,
    cur: row.mode === "ammo" ? max : 0,
    gainPerPhase: row.gain_per_phase || 1,
    effectText: row.effect ?? "",
    ...(row.dc_stat ? { dcStat: row.dc_stat } : {}),
    ...(row.dc_value ? { dcValue: row.dc_value } : {}),
  };

  /*
   * Enemy skills come out of the same pool and are written the same way, so
   * they get the same reading. A generated enemy whose reaction never fires is
   * as dead a feature as a player's.
   */
  if (row.mode === "reaction" && !ability.trigger) {
    const trigger = triggerFromText(row.effect ?? undefined);
    if (trigger) ability.trigger = trigger;
  }
  if (row.mode === "stack" || row.mode === "charge") {
    const grants = grantFromText(row.effect ?? undefined, max);
    if (grants) ability.grants = grants;
    const growsOn = growthFromText(row.effect ?? undefined);
    if (growsOn) ability.growsOn = growsOn;
  }
  if (!ability.dcValue) {
    const dc = dcFromText(row.effect ?? undefined);
    if (dc) {
      ability.dcStat = dc.stat;
      ability.dcValue = dc.value;
    }
  }
  const refill = refillFromText(row.effect ?? undefined);
  if (refill) ability.refill = refill;

  return ability;
}

export function combatantFromEnemy(
  enemy: GeneratedEnemy,
  index: number,
  skills: (CombatSkillRow | null)[] = [],
): Combatant {
  const cfg = TIER_CFG[enemy.tier];
  const label = archetypeLabel(enemy.archetype);
  const abilities = skills
    .slice(0, cfg.skills)
    .filter((s): s is CombatSkillRow => Boolean(s))
    .map(abilityFromSkillRow);

  return baseCombatant({
    name: `${label} ${cfg.label} #${index + 1}`,
    role: "Enemy",
    type: enemy.tier === "mook" ? "Normal" : "Elite",
    hp: cfg.hp,
    maxHp: cfg.hp,
    stats: enemy.stats,
    abilities,
    notes: `${label} ${cfg.label}`,
  });
}

/** Duplicate a combatant with a fresh identity, resetting per-phase state. */
export function duplicateCombatant(c: Combatant): Combatant {
  return {
    ...structuredClone(c),
    id: gid(),
    name: `${c.name} (copy)`,
    done: false,
    abilities: c.abilities.map((a) => ({ ...a, id: gid() })),
    tempShields: c.tempShields.map((s) => ({ ...s, id: gid() })),
    dots: c.dots.map((d) => ({ ...d, id: gid() })),
    hpRegens: c.hpRegens.map((r) => ({ ...r, id: gid() })),
    statuses: c.statuses.map((s) => ({ ...s, id: gid() })),
    tempMods: c.tempMods.map((m) => ({ ...m, id: gid() })),
  };
}
