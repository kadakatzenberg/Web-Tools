/**
 * Domain models for Hei Mao Combat.
 *
 * These shapes are deliberately compatible with the v1 single-file app and with
 * the records already stored in Supabase `combat_sessions.state`. Fields that
 * v1 wrote are kept under their original names; anything added by v2 is
 * optional so that a legacy record deserialises without a migration step.
 */

export type StatKey = "STR" | "DEX" | "INT" | "WIS" | "AGI" | "CON";

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
  stat: StatKey;
  val: number;
  duration: number;
  label: string;
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
}

/** A row from `combat_skills`, used to populate generated enemies. */
export interface CombatSkillRow {
  id: number | string;
  name: string;
  mode: AbilityMode;
  max_val?: number | null;
  gain_per_phase?: number | null;
  effect?: string | null;
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
