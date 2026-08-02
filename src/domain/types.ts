/**
 * Domain models for Hei Mao Combat.
 *
 * These shapes are deliberately compatible with the v1 single-file app and with
 * the records already stored in Supabase `combat_sessions.state`. Fields that
 * v1 wrote are kept under their original names; anything added by v2 is
 * optional so that a legacy record deserialises without a migration step.
 */

export type StatKey = "STR" | "DEX" | "INT" | "WIS" | "AGI" | "CON";

/**
 * What a temporary modifier can move.
 *
 * The six stats, plus two flat damage channels the skill pool needs and the
 * stats cannot express. "Reduce all incoming damage by 1" is not a CON buff —
 * CON also drives resistance ordering and stat checks — so overloading CON for
 * it would silently change three other things.
 */
export type ModTarget = StatKey | "dmgTaken" | "dmgDealt";

export type Stats = Record<StatKey, number>;

/**
 * v1 used "raw" from the combatant damage selector and "true" from the DoT
 * selector for the same concept (damage that ignores resistance). Both strings
 * are preserved on the wire; `resistanceFor` treats anything that is not
 * physical/magical as unresisted.
 */
export type DamageType = "physical" | "magical" | "raw" | "true";

export type Role = "Player" | "Enemy";

export type Position = "Front" | "Back" | "Out";

export type AbilityMode =
  | "cooldown"
  | "ammo"
  | "charge"
  | "passive"
  | "stack"
  | "reaction";

export type PhaseLockType = "player" | "enemy";

/**
 * What makes a reaction fire.
 *
 * Reactions used to be modelled as cooldowns, which says when they are
 * *available* but nothing about when they go off — and every one of the
 * fourteen reaction skills is defined by its trigger, not its timer.
 */
export type ReactionTrigger =
  | "hit"
  | "physicalHit"
  | "magicHit"
  | "allyHit"
  | "allyDown"
  | "selfDown";

/** When a limited-use skill gets its uses back. */
export type RefillCadence = "round" | "combat";

export interface Ability {
  id: string;
  name: string;
  mode: AbilityMode;
  /** Cooldown length, ammo capacity, charge requirement, or stack ceiling. */
  max: number;
  /** Cooldown remaining, ammo held, charge accrued, or stacks held. */
  cur: number;
  gainPerPhase?: number;
  effectText?: string;
  /**
   * The saving throw this skill forces, when it forces one. A quarter of the
   * skill pool branches on a stat check; carrying the stat and the DC lets the
   * tracker build the roll instead of the GM reciting it from the sheet.
   */
  dcStat?: StatKey;
  dcValue?: number;
  /** For reactions: the event that arms this against firing. */
  trigger?: ReactionTrigger;
  /**
   * For skills with a budget rather than a cooldown. "Once per round" and
   * "once per combat" cannot be said with `gainPerPhase`, which refills per
   * phase — three times as fast as a round.
   */
  refill?: RefillCadence;
  charging?: boolean;
  phaseLock?: number;
  phaseLockType?: PhaseLockType;
  /**
   * Tupper notation this skill rolls, without braces — e.g. `1d4` or `2d6!`.
   * Optional and additive; abilities written before this field parse unchanged.
   */
  dice?: string;
}

export interface TempShield {
  id: string;
  val: number;
  duration: number;
  label?: string;
}

export interface Dot {
  id: string;
  name: string;
  dmg: number;
  type: DamageType;
  permanent: boolean;
  duration: number | null;
}

export interface Regen {
  id: string;
  val: number;
  permanent: boolean;
  duration: number | null;
}

export interface StatusEffect {
  id: string;
  name: string;
  duration: number;
}

export interface TempMod {
  id: string;
  /** A stat, or one of the flat damage channels. */
  stat: ModTarget;
  val: number;
  duration: number;
  label: string;
}

/**
 * A counter carried by the combatant it was inflicted on.
 *
 * Distinct from an ability in stack mode, which counts on the unit that owns
 * the skill. A third of the stack skills in the pool read "On hit, *target*
 * gains 1 stack" — Vulnerability, Hit Stack True Damage, Ally Damage Stack,
 * WIS Check Stack, True Damage Stack — so the counter has to live on the
 * victim. Those five were previously unrepresentable.
 *
 * Stacks do not expire on a timer; they reset when they hit their ceiling, or
 * when something clears them.
 */
export interface StackMark {
  id: string;
  name: string;
  count: number;
  /** Ceiling at which the stack triggers and resets. 0 = no ceiling. */
  max: number;
  /** Optional flat bonus to damage this combatant takes, per stack. */
  perStackDamage?: number;
}

export interface SheetSkill {
  name: string;
  flavor?: string;
  effect?: string;
  cooldown?: string;
  phaseLock?: number | string;
  phaseLockType?: PhaseLockType;
  mode?: AbilityMode;
  maxVal?: number;
  gainPerPhase?: number;
  /** Tupper notation this skill rolls, without braces. */
  dice?: string;
}

export interface SheetSkills {
  s1?: SheetSkill;
  s2?: SheetSkill;
  ult?: SheetSkill;
}

export interface Combatant {
  id: string;
  name: string;
  role: Role;
  /** Enemy tier label ("Normal" | "Elite" | "Boss"); empty string for players. */
  type: string;
  hp: number;
  maxHp: number;
  shield: number;
  tempShields: TempShield[];
  dots: Dot[];
  /** Legacy scalar regen from v1. Superseded by `hpRegens`, still honoured. */
  hpRegen: number;
  hpRegens: Regen[];
  stats: Stats;
  statuses: StatusEffect[];
  abilities: Ability[];
  tempMods: TempMod[];
  /** Counters inflicted on this combatant. Optional and additive. */
  stacks?: StackMark[];
  /**
   * Attacks aimed at this combatant land on someone else instead — the model
   * behind Aggro Transfer and Ally Hit Intercept. Ticks down with everything
   * else on the round boundary.
   */
  redirect?: { toId: string; duration: number };
  position: Position;
  notes: string;
  sheetSkills: SheetSkills;
  done: boolean;
  /**
   * Discord handle of the person playing this combatant, carried over from
   * their library sheet. Optional and additive — records written before this
   * field existed parse unchanged.
   */
  player?: string;
  /**
   * Absolute URL of a portrait, resolved from the character library when the
   * combatant is pulled from a sheet, or set by hand on the card.
   *
   * Stored on the combatant rather than looked up at render time on purpose:
   * an encounter saved today must still show the right faces if the library
   * row is renamed or deleted, and the tracker must not need the network to
   * draw a roster. Optional and additive.
   */
  portrait?: string;
}

/** 0 = Player Phase, 1 = Enemy Phase, 2 = Environment Phase. */
export type PhaseIndex = 0 | 1 | 2;

export interface EncounterState {
  combatants: Combatant[];
  phase: PhaseIndex;
  round: number;
  locked: boolean;
  playerPhaseCount: number;
  enemyPhaseCount: number;
}

/* ── Library ── */

export interface CombatSheet {
  id: string;
  character_name: string;
  sheet_name: string;
  name?: string;
  player?: string;
  role: Role;
  type?: string;
  max_hp: number;
  stats: Stats;
  skills: SheetSkills;
  notes?: string;
  approved?: boolean;
  updated_at?: string;
  /** Joined from `entries` at fetch time; not a column on `combat_sheets`. */
  portrait_url?: string;
}

/** A row from `combat_skills`, used to populate generated enemies. */
export interface CombatSkillRow {
  id: number | string;
  name: string;
  mode: AbilityMode;
  max_val?: number | null;
  gain_per_phase?: number | null;
  effect?: string | null;
  /** The saving throw this skill forces, where it forces one. */
  dc_stat?: StatKey | null;
  dc_value?: number | null;
}

/* ── Generator ── */

export type Tier = "mook" | "normal";

export type ArchetypeKey = StatKey | "RND";

export interface GeneratedEnemy {
  id: string;
  tier: Tier;
  archetype: ArchetypeKey;
  stats: Stats;
}

/* ── Derived ── */

export interface DerivedStats {
  ac: number;
  hit: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalResist: number;
  magicalResist: number;
}

export type HealthBand = "healthy" | "wounded" | "critical" | "unconscious";
