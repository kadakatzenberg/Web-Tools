import type { Combatant, Stats } from "@/domain/types";
import { EMPTY_STATS } from "@/domain/constants";

let n = 0;
export const nextId = () => `t${++n}`;

export function stats(partial: Partial<Stats> = {}): Stats {
  return { ...EMPTY_STATS, ...partial };
}

export function makeCombatant(partial: Partial<Combatant> = {}): Combatant {
  return {
    id: partial.id ?? nextId(),
    name: partial.name ?? "Test",
    role: partial.role ?? "Player",
    type: partial.type ?? "",
    hp: partial.hp ?? 20,
    maxHp: partial.maxHp ?? 20,
    shield: partial.shield ?? 0,
    tempShields: partial.tempShields ?? [],
    dots: partial.dots ?? [],
    hpRegen: partial.hpRegen ?? 0,
    hpRegens: partial.hpRegens ?? [],
    stats: partial.stats ?? stats(),
    statuses: partial.statuses ?? [],
    abilities: partial.abilities ?? [],
    tempMods: partial.tempMods ?? [],
    position: partial.position ?? "Front",
    notes: partial.notes ?? "",
    sheetSkills: partial.sheetSkills ?? {},
    done: partial.done ?? false,
    player: partial.player ?? "",
    // Optional and additive fields are passed straight through, so a helper
    // that enumerates every key does not silently drop new ones.
    ...(partial.stacks ? { stacks: partial.stacks } : {}),
    ...(partial.portrait ? { portrait: partial.portrait } : {}),
    ...(partial.redirect ? { redirect: partial.redirect } : {}),
  };
}

/** Deterministic RNG for generator tests: cycles a fixed sequence. */
export function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}
