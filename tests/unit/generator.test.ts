import { describe, expect, it } from "vitest";
import { distributeStats, generateStats, skillSlotsFor } from "@/domain/generator";
import { STAT_KEYS, TIER_CFG } from "@/domain/constants";
import type { ArchetypeKey, Tier } from "@/domain/types";
import { combatantFromEnemy } from "@/domain/factory";
import { seededRng } from "./helpers";

const sum = (s: Record<string, number>) =>
  STAT_KEYS.reduce((a, k) => a + (s[k] ?? 0), 0);

const TIERS: Tier[] = ["mook", "normal"];
const ARCHES: ArchetypeKey[] = ["STR", "DEX", "INT", "WIS", "AGI", "CON", "RND"];

describe("stat distribution", () => {
  it("always hits the exact tier total", () => {
    const rng = seededRng(11);
    for (const tier of TIERS) {
      for (const arch of ARCHES) {
        for (let i = 0; i < 60; i++) {
          expect(sum(generateStats(tier, arch, rng))).toBe(TIER_CFG[tier].total);
        }
      }
    }
  });

  it("always includes at least one negative stat", () => {
    const rng = seededRng(23);
    for (const tier of TIERS) {
      for (const arch of ARCHES) {
        for (let i = 0; i < 60; i++) {
          const s = generateStats(tier, arch, rng);
          expect(STAT_KEYS.some((k) => s[k] < 0)).toBe(true);
        }
      }
    }
  });

  it("never rolls a stat below the floor of -3", () => {
    const rng = seededRng(31);
    for (const tier of TIERS) {
      for (const arch of ARCHES) {
        for (let i = 0; i < 60; i++) {
          const s = generateStats(tier, arch, rng);
          for (const k of STAT_KEYS) expect(s[k]).toBeGreaterThanOrEqual(-3);
        }
      }
    }
  });

  it("pins the heavy stat to the tier's heavy value", () => {
    const rng = seededRng(43);
    for (const tier of TIERS) {
      for (const arch of ARCHES) {
        if (arch === "RND") continue;
        for (let i = 0; i < 40; i++) {
          const s = generateStats(tier, arch, rng);
          expect(s[arch as keyof typeof s]).toBe(TIER_CFG[tier].heavy);
        }
      }
    }
  });

  it("caps non-heavy stats at +2 for archetype rolls", () => {
    const rng = seededRng(57);
    for (const tier of TIERS) {
      for (const arch of ARCHES) {
        if (arch === "RND") continue;
        for (let i = 0; i < 40; i++) {
          const s = generateStats(tier, arch, rng);
          for (const k of STAT_KEYS) {
            if (k === arch) continue;
            expect(s[k]).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it("allows a wider spread for fully random rolls", () => {
    const rng = seededRng(67);
    for (let i = 0; i < 60; i++) {
      const s = generateStats("normal", "RND", rng);
      for (const k of STAT_KEYS) expect(s[k]).toBeLessThanOrEqual(5);
    }
  });

  it("produces a valid line even when random search is starved", () => {
    // An RNG pinned to zero drives every roll to its low bound, which
    // exercises the deterministic fallback path.
    const s = distributeStats(STAT_KEYS, 5, "STR", 3, 2, () => 0);
    expect(sum(s)).toBe(5);
    expect(STAT_KEYS.some((k) => s[k] < 0)).toBe(true);
    expect(s.STR).toBe(3);
  });
});

describe("tier configuration", () => {
  it("uses the documented tier contract", () => {
    expect(TIER_CFG.mook).toMatchObject({ total: 3, heavy: 2, hp: 10, skills: 1 });
    expect(TIER_CFG.normal).toMatchObject({ total: 5, heavy: 3, hp: 15, skills: 2 });
  });

  it("exposes one skill slot for mooks and two for normals", () => {
    expect(skillSlotsFor("mook")).toBe(1);
    expect(skillSlotsFor("normal")).toBe(2);
  });
});

describe("generated combatants", () => {
  it("builds a mook with the tier HP and an Enemy role", () => {
    const c = combatantFromEnemy(
      { id: "e", tier: "mook", archetype: "STR", stats: generateStats("mook", "STR", seededRng(3)) },
      0,
    );
    expect(c.role).toBe("Enemy");
    expect(c.type).toBe("Normal");
    expect(c.hp).toBe(10);
    expect(c.maxHp).toBe(10);
    expect(c.position).toBe("Front");
    expect(c.name).toBe("STR Heavy MOOK #1");
  });

  it("labels a normal-tier enemy as Elite with 15 HP", () => {
    const c = combatantFromEnemy(
      { id: "e", tier: "normal", archetype: "RND", stats: generateStats("normal", "RND", seededRng(5)) },
      2,
    );
    expect(c.type).toBe("Elite");
    expect(c.maxHp).toBe(15);
    expect(c.name).toBe("Random NORMAL #3");
  });

  it("attaches only as many skills as the tier allows", () => {
    const rows = [
      { id: 1, name: "Slash", mode: "cooldown" as const, max_val: 3, gain_per_phase: 1, effect: "x" },
      { id: 2, name: "Volley", mode: "ammo" as const, max_val: 4, gain_per_phase: 1, effect: "y" },
    ];
    const mook = combatantFromEnemy(
      { id: "e", tier: "mook", archetype: "STR", stats: generateStats("mook", "STR", seededRng(9)) },
      0,
      rows,
    );
    expect(mook.abilities).toHaveLength(1); // mook has 1 slot

    const normal = combatantFromEnemy(
      { id: "e", tier: "normal", archetype: "STR", stats: generateStats("normal", "STR", seededRng(9)) },
      0,
      rows,
    );
    expect(normal.abilities).toHaveLength(2);
    expect(normal.abilities[1]!.cur).toBe(4); // ammo enters play loaded
  });
});
