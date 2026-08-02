/**
 * Runtime validation and legacy normalisation.
 *
 * Records written by v1 are not uniformly shaped: `stats` and `skills` on a
 * combat sheet are sometimes JSON strings rather than objects, collection
 * fields are frequently absent, and `hpRegen` predates `hpRegens`. Everything
 * here is written to accept those records and repair them rather than reject
 * them — a malformed row must never crash the app or destroy stored data.
 */

import { z } from "zod";
import type { Combatant, CombatSheet, EncounterState } from "./types";
import { EMPTY_STATS, STAT_KEYS } from "./constants";
import { normaliseStats } from "./factory";

/** Parse a value that may already be an object or may be a JSON string. */
export function looseJson(input: unknown): unknown {
  if (typeof input !== "string") return input ?? {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

const num = (fallback = 0) =>
  z.coerce.number().catch(fallback).transform((v) => (Number.isFinite(v) ? v : fallback));

const statsSchema = z
  .unknown()
  .transform((v) => normaliseStats(looseJson(v)))
  .pipe(z.record(z.string(), z.number()))
  .transform((v) => {
    const out = { ...EMPTY_STATS };
    for (const k of STAT_KEYS) out[k] = v[k] ?? 0;
    return out;
  });

const abilityModeSchema = z
  .enum(["cooldown", "ammo", "charge", "passive", "stack", "reaction"])
  .catch("cooldown");

const damageTypeSchema = z
  .enum(["physical", "magical", "raw", "true"])
  .catch("physical");

const positionSchema = z.enum(["Front", "Back", "Out"]).catch("Front");
const roleSchema = z.enum(["Player", "Enemy"]).catch("Player");

const idSchema = z
  .unknown()
  .transform((v) =>
    typeof v === "string" && v.length
      ? v
      : Math.random().toString(36).slice(2, 9),
  );

const abilitySchema = z
  .object({
    id: idSchema,
    name: z.unknown().transform((v) => (typeof v === "string" ? v : "Ability")),
    mode: abilityModeSchema,
    max: num(1),
    cur: num(0),
    gainPerPhase: num(1).optional(),
    effectText: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    charging: z.coerce.boolean().catch(false).optional(),
    phaseLock: z.coerce.number().nullish().transform((v) => (v ? Number(v) : undefined)),
    phaseLockType: z.enum(["player", "enemy"]).catch("player").optional(),
    dice: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
  })
  .passthrough();

const tempShieldSchema = z.object({
  id: idSchema,
  val: num(0),
  duration: num(1),
  label: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
});

const dotSchema = z.object({
  id: idSchema,
  name: z.unknown().transform((v) => (typeof v === "string" ? v : "DoT")),
  dmg: num(0),
  type: damageTypeSchema,
  permanent: z.coerce.boolean().catch(false),
  duration: z.coerce.number().nullable().catch(null),
});

const regenSchema = z.object({
  id: idSchema,
  val: num(0),
  permanent: z.coerce.boolean().catch(false),
  duration: z.coerce.number().nullable().catch(null),
});

const statusSchema = z.object({
  id: idSchema,
  name: z.unknown().transform((v) => (typeof v === "string" ? v : "Status")),
  duration: num(1),
});

const tempModSchema = z.object({
  id: idSchema,
  stat: z.enum(["STR", "DEX", "INT", "WIS", "AGI", "CON"]).catch("STR"),
  val: num(0),
  duration: num(1),
  label: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
});

/** Drop entries that fail validation rather than failing the whole record. */
function lenientArray<T>(schema: z.ZodType<T>) {
  return z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((arr) => {
      const out: T[] = [];
      for (const item of arr) {
        const parsed = schema.safeParse(item);
        if (parsed.success) out.push(parsed.data);
      }
      return out;
    });
}

export const combatantSchema = z
  .object({
    id: idSchema,
    name: z.unknown().transform((v) => (typeof v === "string" && v ? v : "Unnamed")),
    role: roleSchema,
    type: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
    hp: num(0),
    maxHp: num(1),
    shield: num(0),
    tempShields: lenientArray(tempShieldSchema),
    dots: lenientArray(dotSchema),
    hpRegen: num(0),
    hpRegens: lenientArray(regenSchema),
    stats: statsSchema,
    statuses: lenientArray(statusSchema),
    abilities: lenientArray(abilitySchema),
    tempMods: lenientArray(tempModSchema),
    position: positionSchema,
    notes: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
    sheetSkills: z.unknown().transform((v) => (looseJson(v) ?? {}) as object),
    done: z.coerce.boolean().catch(false),
    player: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    /**
     * Only http(s) survives parsing. A persisted encounter is loaded straight
     * into an <img src>, so a `javascript:` or `data:` URL smuggled into a
     * shared session file would otherwise be handed to the browser verbatim.
     */
    portrait: z
      .unknown()
      .transform((v) => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : undefined))
      .optional(),
  })
  .transform((c) => {
    // maxHp must be positive or every percentage calculation divides by zero.
    const maxHp = c.maxHp > 0 ? c.maxHp : Math.max(1, c.hp);
    return { ...c, maxHp, hp: Math.min(c.hp, maxHp) } as Combatant;
  });

export const encounterStateSchema = z
  .object({
    combatants: lenientArray(combatantSchema),
    phase: z.coerce.number().catch(0).transform((v) => (([0, 1, 2] as number[]).includes(v) ? v : 0)),
    round: num(1),
    locked: z.coerce.boolean().catch(false),
    playerPhaseCount: num(0),
    enemyPhaseCount: num(0),
  })
  .transform((s) => ({ ...s, round: s.round < 1 ? 1 : s.round }) as EncounterState);

/** Parse a stored session payload, falling back to an empty encounter. */
export function parseEncounterState(input: unknown): {
  state: EncounterState;
  repaired: boolean;
} {
  const empty: EncounterState = {
    combatants: [],
    phase: 0,
    round: 1,
    locked: false,
    playerPhaseCount: 0,
    enemyPhaseCount: 0,
  };
  if (!input || typeof input !== "object") return { state: empty, repaired: true };

  const parsed = encounterStateSchema.safeParse(input);
  if (!parsed.success) return { state: empty, repaired: true };

  const raw = input as { combatants?: unknown };
  const inputCount = Array.isArray(raw.combatants) ? raw.combatants.length : 0;
  return {
    state: parsed.data,
    repaired: parsed.data.combatants.length !== inputCount,
  };
}

/* ── Library ── */

const sheetSkillSchema = z
  .object({
    name: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
    flavor: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    effect: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    cooldown: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    phaseLock: z.unknown().optional(),
    phaseLockType: z.enum(["player", "enemy"]).catch("player").optional(),
    mode: abilityModeSchema.optional(),
    maxVal: z.coerce.number().catch(1).optional(),
    gainPerPhase: z.coerce.number().catch(1).optional(),
    dice: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
  })
  .passthrough();

const sheetSkillsSchema = z.unknown().transform((v) => {
  const obj = looseJson(v) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ["s1", "s2", "ult"]) {
    const parsed = sheetSkillSchema.safeParse(obj?.[key] ?? {});
    if (parsed.success && parsed.data.name) out[key] = parsed.data;
  }
  return out;
});

export const combatSheetSchema = z
  .object({
    id: z.unknown().transform((v) => (v == null ? "" : String(v))),
    character_name: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
    sheet_name: z.unknown().transform((v) => (typeof v === "string" ? v : "")),
    name: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    player: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    role: roleSchema,
    type: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    max_hp: num(15),
    stats: statsSchema,
    skills: sheetSkillsSchema,
    notes: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
    approved: z.coerce.boolean().catch(true).optional(),
    updated_at: z.unknown().transform((v) => (typeof v === "string" ? v : "")).optional(),
  })
  .transform((s) => ({ ...s, max_hp: s.max_hp > 0 ? s.max_hp : 15 }) as CombatSheet);

/** Parse a list of sheets, discarding only the rows that cannot be repaired. */
export function parseSheets(input: unknown): { sheets: CombatSheet[]; skipped: number } {
  if (!Array.isArray(input)) return { sheets: [], skipped: 0 };
  const sheets: CombatSheet[] = [];
  let skipped = 0;
  for (const row of input) {
    const parsed = combatSheetSchema.safeParse(row);
    if (parsed.success) sheets.push(parsed.data);
    else skipped++;
  }
  return { sheets, skipped };
}

export const combatSkillRowSchema = z.object({
  id: z.union([z.number(), z.string()]).catch(0),
  name: z.unknown().transform((v) => (typeof v === "string" ? v : "Skill")),
  mode: abilityModeSchema,
  max_val: z.coerce.number().nullish().catch(null),
  gain_per_phase: z.coerce.number().nullish().catch(null),
  effect: z.unknown().transform((v) => (typeof v === "string" ? v : "")).nullish(),
});

export function parseSkillRows(input: unknown) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const row of input) {
    const parsed = combatSkillRowSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
