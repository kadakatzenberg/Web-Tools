import type { AbilityMode, ArchetypeKey, Position, StatKey, Tier } from "./types";

export const PHASES = ["Player Phase", "Enemy Phase", "Environment Phase"] as const;

export const STAT_KEYS: StatKey[] = ["STR", "DEX", "INT", "WIS", "AGI", "CON"];

export const EMPTY_STATS: Record<StatKey, number> = {
  STR: 0,
  DEX: 0,
  INT: 0,
  WIS: 0,
  AGI: 0,
  CON: 0,
};

export const POSITIONS: Position[] = ["Front", "Back", "Out"];

export const STATUS_OPTIONS = [
  "Prone",
  "Stunned",
  "Sleeping",
  "Bound",
  "Disadvantage",
  "Advantage",
  "Custom",
] as const;

export const SKILL_MODES: AbilityMode[] = [
  "cooldown",
  "ammo",
  "charge",
  "passive",
  "stack",
  "reaction",
];

export const SKILL_MODE_LABELS: Record<AbilityMode, string> = {
  cooldown: "Cooldown",
  ammo: "Ammo",
  charge: "Charge",
  passive: "Passive",
  stack: "Stack",
  reaction: "Reaction",
};

/** Tier configuration — values are load-bearing for the generator's contract. */
export const TIER_CFG: Record<
  Tier,
  { label: string; total: number; heavy: number; hp: number; skills: number }
> = {
  mook: { label: "MOOK", total: 3, heavy: 2, hp: 10, skills: 1 },
  normal: { label: "NORMAL", total: 5, heavy: 3, hp: 15, skills: 2 },
};

export const ARCHETYPES: { key: ArchetypeKey; label: string; stat: StatKey | null }[] = [
  { key: "STR", label: "STR Heavy", stat: "STR" },
  { key: "DEX", label: "DEX Heavy", stat: "DEX" },
  { key: "INT", label: "INT Heavy", stat: "INT" },
  { key: "WIS", label: "WIS Heavy", stat: "WIS" },
  { key: "AGI", label: "AGI Heavy", stat: "AGI" },
  { key: "CON", label: "CON Heavy", stat: "CON" },
  { key: "RND", label: "Random", stat: null },
];

export const SKILL_MODE_OPTIONS = [
  "Full Random",
  "Random Cooldown",
  "Random Ammo",
  "Random Charge",
  "Random Passive",
  "Random Stack",
  "Random Reaction",
  "Manual",
] as const;

export const SKILL_MODE_MAP: Record<string, AbilityMode> = {
  "Random Cooldown": "cooldown",
  "Random Ammo": "ammo",
  "Random Charge": "charge",
  "Random Passive": "passive",
  "Random Stack": "stack",
  "Random Reaction": "reaction",
};

/** Enemy HP presets from the manual "Add Combatant" form. */
export const ENEMY_TYPE_HP: Record<string, number> = {
  Normal: 10,
  Elite: 15,
  Boss: 30,
};

/** Generator stat floor. Rolled stats never go below this. */
export const GEN_STAT_MIN = -3;

/** Maximum enemies addable from the generator in one batch. */
export const GEN_MAX_QTY = 20;

/**
 * Target-side stacks that exist in the skill pool, as presets.
 *
 * Every one of these is written "on hit, *target* gains 1 stack", so the
 * counter belongs to the combatant it was inflicted on. Ceilings and per-stack
 * damage come straight from the skill text; anything not listed here can still
 * be typed by hand.
 */
export const STACK_PRESETS: { name: string; max: number; perStackDamage?: number }[] = [
  // "Each stack increases all damage target receives by 1."
  { name: "Vulnerability", max: 3, perStackDamage: 1 },
  // "All allies deal +1 damage per stack to that target."
  { name: "Ally Damage", max: 3, perStackDamage: 1 },
  // "At max stacks, hit the target once as true damage and stacks reset."
  { name: "True Damage", max: 3 },
  // "At max stacks, that player makes a WIS check (DC 11)."
  { name: "WIS Check", max: 3 },
  { name: "CON Check", max: 3 },
];
