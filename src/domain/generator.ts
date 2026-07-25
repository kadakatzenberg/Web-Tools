/**
 * Enemy generation.
 *
 * Contract (unchanged from v1):
 *   - MOOK  : six stats summing to +3, heavy stat +2, 10 HP, 1 skill slot.
 *   - NORMAL: six stats summing to +5, heavy stat +3, 15 HP, 2 skill slots.
 *   - Every generated stat line must contain at least one negative value
 *     (the "guaranteed weakness" rule).
 *   - Stats never fall below -3. Non-heavy stats cap at +2 for an archetype
 *     roll, or +5 for a fully random roll.
 */

import type { ArchetypeKey, GeneratedEnemy, Stats, StatKey, Tier } from "./types";
import { ARCHETYPES, GEN_STAT_MIN, STAT_KEYS, TIER_CFG } from "./constants";

export type Rng = () => number;

function randInt(lo: number, hi: number, rng: Rng): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

/**
 * Deterministic, always-valid stat line used when random search fails.
 *
 * DIVERGENCE FROM v1 (documented in docs/MIGRATION.md): the original fallback
 * emitted `STR -1, everything else 0` plus the fixed heavy stat, which does not
 * respect the tier total and could produce an illegal stat block. This
 * construction guarantees both the exact total and at least one negative. The
 * path is unreachable for the shipped tier configurations — 400 random attempts
 * always succeed — so this changes no observable behaviour in practice.
 */
function deterministicFallback(
  keys: StatKey[],
  total: number,
  fixedKey: StatKey | null,
  fixedVal: number,
  otherMax: number,
): Stats {
  const vals = {} as Stats;
  for (const k of keys) vals[k] = 0;
  if (fixedKey) vals[fixedKey] = fixedVal;

  const open = keys.filter((k) => k !== fixedKey);
  // Seed the mandatory weakness on the last open slot.
  const weakKey = open[open.length - 1]!;
  vals[weakKey] = -1;

  let left = total - (fixedKey ? fixedVal : 0) + 1; // +1 offsets the -1 weakness
  for (const k of open) {
    if (k === weakKey) continue;
    if (left === 0) break;
    const step = Math.max(Math.min(left, otherMax), GEN_STAT_MIN);
    vals[k] = step;
    left -= step;
  }
  // Any residual lands on the weakness slot, which has the widest legal range.
  vals[weakKey] = Math.max(GEN_STAT_MIN, vals[weakKey] + left);
  return vals;
}

/**
 * Randomly distribute `total` points across `keys`, holding `fixedKey` at
 * `fixedVal`, with every other stat inside [-3, otherMax].
 *
 * Retries until the roll satisfies both the exact total and the
 * guaranteed-weakness rule.
 */
export function distributeStats(
  keys: StatKey[],
  total: number,
  fixedKey: StatKey | null = null,
  fixedVal: number | null = null,
  otherMax = 2,
  rng: Rng = Math.random,
): Stats {
  const fixed = fixedVal ?? 0;

  for (let attempt = 0; attempt < 400; attempt++) {
    const vals = {} as Stats;
    for (const k of keys) vals[k] = 0;
    if (fixedKey) vals[fixedKey] = fixed;

    const open = keys.filter((k) => k !== fixedKey);
    let left = total - (fixedKey ? fixed : 0);
    let ok = true;

    for (let i = 0; i < open.length; i++) {
      const k = open[i]!;
      const slotsLeft = open.length - i - 1;
      const lo = Math.max(GEN_STAT_MIN, left - slotsLeft * otherMax);
      const hi = Math.min(otherMax, left - slotsLeft * GEN_STAT_MIN);
      if (lo > hi) {
        ok = false;
        break;
      }
      const v = randInt(lo, hi, rng);
      vals[k] = v;
      left -= v;
    }
    if (!ok) continue;

    const all = STAT_KEYS.map((k) => vals[k]);
    if (!all.some((v) => v < 0)) continue;
    if (all.reduce((a, b) => a + b, 0) !== total) continue;
    return vals;
  }

  return deterministicFallback(keys, total, fixedKey, fixed, otherMax);
}

/** Roll a stat line for a tier/archetype pair. */
export function generateStats(
  tier: Tier,
  archKey: ArchetypeKey,
  rng: Rng = Math.random,
): Stats {
  const cfg = TIER_CFG[tier];
  if (archKey === "RND") {
    return distributeStats(STAT_KEYS, cfg.total, null, null, 5, rng);
  }
  const arch = ARCHETYPES.find((a) => a.key === archKey);
  return distributeStats(STAT_KEYS, cfg.total, arch?.stat ?? null, cfg.heavy, 2, rng);
}

export function archetypeLabel(key: ArchetypeKey): string {
  return ARCHETYPES.find((a) => a.key === key)?.label ?? String(key);
}

export function makeEnemy(
  tier: Tier,
  archetype: ArchetypeKey,
  id: string,
  rng: Rng = Math.random,
): GeneratedEnemy {
  return { id, tier, archetype, stats: generateStats(tier, archetype, rng) };
}

/** Skill slot count for a tier. */
export function skillSlotsFor(tier: Tier): number {
  return TIER_CFG[tier].skills;
}
