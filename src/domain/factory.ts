/**
 * Construction of combatants from every source the app supports:
 * the manual add form, the character library, and the enemy generator.
 *
 * The field-by-field defaults here are ported verbatim from v1 so that a
 * combatant built in v2 serialises to the same shape already stored in
 * `combat_sessions.state`.
 */

import type {
  Ability,
  Combatant,
  CombatSheet,
  CombatSkillRow,
  GeneratedEnemy,
  Position,
  Role,
  SheetSkill,
  SheetSkills,
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
  if (phaseLock) {
    ability.phaseLock = phaseLock;
    ability.phaseLockType = sk.phaseLockType ?? "player";
  }
  return ability;
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
  });
}

/* ── Generator → combatant ── */

/** Map a `combat_skills` row onto a tracker ability. */
export function abilityFromSkillRow(row: CombatSkillRow): Ability {
  const max = row.max_val || 2;
  return {
    id: gid(),
    name: row.name,
    mode: row.mode,
    max,
    cur: row.mode === "ammo" ? max : 0,
    gainPerPhase: row.gain_per_phase || 1,
    effectText: row.effect ?? "",
  };
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
