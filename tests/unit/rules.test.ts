import { describe, expect, it } from "vitest";
import {
  abilityFillPercent,
  applyDamage,
  applyHeal,
  deriveStats,
  healthBand,
  isAbilityReady,
  isPhaseLocked,
  tempShieldDuration,
  tickAbility,
  tickCombatant,
} from "@/domain/rules";
import type { Ability } from "@/domain/types";
import { makeCombatant, stats } from "./helpers";

describe("derived stats", () => {
  it("computes the six derived combat values", () => {
    const d = deriveStats(stats({ STR: 3, DEX: 2, INT: 1, WIS: 4, AGI: 2, CON: 5 }));
    expect(d.ac).toBe(14); // 10 + AGI*2
    expect(d.hit).toBe(4); // DEX*2
    expect(d.physicalDamage).toBe(5); // 2 + STR
    expect(d.magicalDamage).toBe(3); // 2 + INT
    expect(d.physicalResist).toBe(5); // CON
    expect(d.magicalResist).toBe(4); // WIS
  });

  it("folds temporary modifiers into derived values", () => {
    const d = deriveStats(stats({ AGI: 1, STR: 1 }), [
      { id: "m1", stat: "AGI", val: 2, duration: 2, label: "haste" },
      { id: "m2", stat: "STR", val: -1, duration: 2, label: "weaken" },
    ]);
    expect(d.ac).toBe(16); // 10 + (1+2)*2
    expect(d.physicalDamage).toBe(2); // 2 + (1-1)
  });
});

describe("damage pipeline", () => {
  it("applies physical resistance from CON", () => {
    const c = makeCombatant({ hp: 20, stats: stats({ CON: 3 }) });
    expect(applyDamage(c, 10, "physical").hp).toBe(13);
  });

  it("applies magical resistance from WIS", () => {
    const c = makeCombatant({ hp: 20, stats: stats({ WIS: 4 }) });
    expect(applyDamage(c, 10, "magical").hp).toBe(14);
  });

  it("ignores resistance for true and raw damage", () => {
    const c = makeCombatant({ hp: 20, stats: stats({ CON: 5, WIS: 5 }) });
    expect(applyDamage(c, 10, "raw").hp).toBe(10);
    expect(applyDamage(c, 10, "true").hp).toBe(10);
  });

  it("does not amplify damage for negative CON (v1 behaviour preserved)", () => {
    const c = makeCombatant({ hp: 20, stats: stats({ CON: -3 }) });
    // Resistance clamps at 0, so a negative CON grants no resistance
    // but also does not increase the hit.
    expect(applyDamage(c, 10, "physical").hp).toBe(10);
  });

  it("routes resistance through temporary CON modifiers", () => {
    const c = makeCombatant({
      hp: 20,
      stats: stats({ CON: 1 }),
      tempMods: [{ id: "m", stat: "CON", val: 3, duration: 2, label: "guard" }],
    });
    expect(applyDamage(c, 10, "physical").hp).toBe(14); // tax 4
  });

  it("absorbs with temporary shields in order before the normal shield", () => {
    const c = makeCombatant({
      hp: 20,
      shield: 5,
      tempShields: [
        { id: "a", val: 2, duration: 3 },
        { id: "b", val: 3, duration: 2 },
      ],
    });
    const r = applyDamage(c, 6, "raw");
    expect(r.tempShields).toHaveLength(0); // both consumed
    expect(r.shield).toBe(4); // 1 spilled into the normal shield
    expect(r.hp).toBe(20); // HP untouched
  });

  it("spills through every layer into HP in the correct order", () => {
    const c = makeCombatant({
      hp: 20,
      stats: stats({ CON: 2 }),
      shield: 3,
      tempShields: [{ id: "a", val: 4, duration: 3 }],
    });
    // 20 incoming - 2 resist = 18 → 4 temp → 3 shield → 11 to HP
    const r = applyDamage(c, 20, "physical");
    expect(r.breakdown.resisted).toBe(2);
    expect(r.breakdown.absorbedByTemp).toBe(4);
    expect(r.breakdown.absorbedByShield).toBe(3);
    expect(r.breakdown.toHp).toBe(11);
    expect(r.hp).toBe(9);
    expect(r.shield).toBe(0);
    expect(r.tempShields).toHaveLength(0);
  });

  it("partially depletes a temporary shield and keeps it", () => {
    const c = makeCombatant({ hp: 20, tempShields: [{ id: "a", val: 5, duration: 3 }] });
    const r = applyDamage(c, 2, "raw");
    expect(r.tempShields).toEqual([{ id: "a", val: 3, duration: 3 }]);
    expect(r.hp).toBe(20);
  });

  it("clamps HP at zero and never goes negative", () => {
    const c = makeCombatant({ hp: 4, maxHp: 20 });
    expect(applyDamage(c, 999, "raw").hp).toBe(0);
  });

  it("is a no-op for zero or negative amounts", () => {
    const c = makeCombatant({ hp: 20, shield: 3 });
    expect(applyDamage(c, 0, "raw").hp).toBe(20);
    expect(applyDamage(c, -5, "raw").shield).toBe(3);
  });

  it("does not mutate the input combatant", () => {
    const c = makeCombatant({ hp: 20, tempShields: [{ id: "a", val: 4, duration: 2 }] });
    applyDamage(c, 10, "raw");
    expect(c.hp).toBe(20);
    expect(c.tempShields[0]!.val).toBe(4);
  });
});

describe("healing", () => {
  it("clamps healing at maxHp", () => {
    expect(applyHeal({ hp: 18, maxHp: 20 }, 10)).toBe(20);
  });

  it("heals from zero", () => {
    expect(applyHeal({ hp: 0, maxHp: 20 }, 5)).toBe(5);
  });

  it("ignores negative healing", () => {
    expect(applyHeal({ hp: 10, maxHp: 20 }, -5)).toBe(10);
  });
});

describe("temporary shield duration", () => {
  it("derives duration from magnitude", () => {
    expect(tempShieldDuration(1)).toBe(3);
    expect(tempShieldDuration(2)).toBe(3);
    expect(tempShieldDuration(3)).toBe(2);
    expect(tempShieldDuration(4)).toBe(2);
    expect(tempShieldDuration(5)).toBe(1);
    expect(tempShieldDuration(6)).toBe(1);
  });
});

describe("health bands", () => {
  it("bands unconscious, critical, wounded, healthy", () => {
    expect(healthBand(0, 20)).toBe("unconscious");
    expect(healthBand(-3, 20)).toBe("unconscious");
    expect(healthBand(5, 20)).toBe("critical"); // 25%
    expect(healthBand(6, 20)).toBe("wounded"); // 30%
    expect(healthBand(10, 20)).toBe("wounded"); // 50%
    expect(healthBand(11, 20)).toBe("healthy");
  });
});

/* ── Abilities ── */

function ability(partial: Partial<Ability> = {}): Ability {
  return {
    id: "a1",
    name: "Skill",
    mode: "cooldown",
    max: 2,
    cur: 0,
    gainPerPhase: 1,
    ...partial,
  };
}

describe("ability readiness", () => {
  it("readies a cooldown at zero", () => {
    expect(isAbilityReady(ability({ mode: "cooldown", cur: 0 }))).toBe(true);
    expect(isAbilityReady(ability({ mode: "cooldown", cur: 1 }))).toBe(false);
  });

  it("readies ammo while rounds remain", () => {
    expect(isAbilityReady(ability({ mode: "ammo", cur: 1, max: 3 }))).toBe(true);
    expect(isAbilityReady(ability({ mode: "ammo", cur: 0, max: 3 }))).toBe(false);
  });

  it("readies a charge only when full", () => {
    expect(isAbilityReady(ability({ mode: "charge", cur: 3, max: 3 }))).toBe(true);
    expect(isAbilityReady(ability({ mode: "charge", cur: 2, max: 3 }))).toBe(false);
  });

  it("readies a reaction at zero", () => {
    expect(isAbilityReady(ability({ mode: "reaction", cur: 0 }))).toBe(true);
    expect(isAbilityReady(ability({ mode: "reaction", cur: 2 }))).toBe(false);
  });

  it("never readies passive or stack modes", () => {
    expect(isAbilityReady(ability({ mode: "passive" }))).toBe(false);
    expect(isAbilityReady(ability({ mode: "stack", cur: 3, max: 3 }))).toBe(false);
  });
});

describe("ability ticking", () => {
  it("reduces cooldown by one per round, floored at zero", () => {
    expect(tickAbility(ability({ mode: "cooldown", cur: 2 })).cur).toBe(1);
    expect(tickAbility(ability({ mode: "cooldown", cur: 0 })).cur).toBe(0);
  });

  it("reduces reaction cooldown by one per round", () => {
    expect(tickAbility(ability({ mode: "reaction", cur: 3, max: 2 })).cur).toBe(2);
  });

  it("accrues charge only while charging", () => {
    const charging = ability({ mode: "charge", cur: 1, max: 3, gainPerPhase: 1, charging: true });
    expect(tickAbility(charging).cur).toBe(2);
    const idle = ability({ mode: "charge", cur: 1, max: 3, charging: false });
    expect(tickAbility(idle).cur).toBe(1);
  });

  it("caps charge accumulation at max", () => {
    const a = ability({ mode: "charge", cur: 2, max: 3, gainPerPhase: 5, charging: true });
    expect(tickAbility(a).cur).toBe(3);
  });

  it("leaves ammo, passive, and stack untouched on a round tick", () => {
    expect(tickAbility(ability({ mode: "ammo", cur: 2, max: 3 })).cur).toBe(2);
    expect(tickAbility(ability({ mode: "stack", cur: 2, max: 3 })).cur).toBe(2);
    expect(tickAbility(ability({ mode: "passive", cur: 0 })).cur).toBe(0);
  });
});

describe("phase locks", () => {
  it("locks against the player phase counter by default", () => {
    const a = ability({ phaseLock: 3, phaseLockType: "player" });
    expect(isPhaseLocked(a, 2, 9)).toBe(true);
    expect(isPhaseLocked(a, 3, 0)).toBe(false);
  });

  it("locks against the enemy phase counter when configured", () => {
    const a = ability({ phaseLock: 2, phaseLockType: "enemy" });
    expect(isPhaseLocked(a, 9, 1)).toBe(true);
    expect(isPhaseLocked(a, 0, 2)).toBe(false);
  });

  it("is unlocked when no phase lock is set", () => {
    expect(isPhaseLocked(ability(), 0, 0)).toBe(false);
  });
});

describe("ability fill percent", () => {
  it("fills forwards for ammo, charge, and stack", () => {
    expect(abilityFillPercent(ability({ mode: "ammo", cur: 1, max: 4 }))).toBe(25);
    expect(abilityFillPercent(ability({ mode: "charge", cur: 3, max: 4 }))).toBe(75);
  });

  it("fills as a cooldown drains", () => {
    expect(abilityFillPercent(ability({ mode: "cooldown", cur: 2, max: 4 }))).toBe(50);
    expect(abilityFillPercent(ability({ mode: "cooldown", cur: 0, max: 4 }))).toBe(100);
  });
});

/* ── Round processing ── */

describe("round tick", () => {
  it("applies damage over time through the full damage pipeline", () => {
    const c = makeCombatant({
      hp: 20,
      stats: stats({ CON: 2 }),
      dots: [{ id: "d", name: "Bleed", dmg: 5, type: "physical", permanent: true, duration: null }],
    });
    // 5 - 2 resist = 3
    expect(tickCombatant(c).next.hp).toBe(17);
  });

  it("routes damage over time through shields", () => {
    const c = makeCombatant({
      hp: 20,
      shield: 4,
      dots: [{ id: "d", name: "Burn", dmg: 3, type: "true", permanent: true, duration: null }],
    });
    const { next } = tickCombatant(c);
    expect(next.shield).toBe(1);
    expect(next.hp).toBe(20);
  });

  it("resolves multiple DoTs sequentially against shared shields", () => {
    const c = makeCombatant({
      hp: 20,
      shield: 5,
      dots: [
        { id: "d1", name: "A", dmg: 3, type: "true", permanent: true, duration: null },
        { id: "d2", name: "B", dmg: 4, type: "true", permanent: true, duration: null },
      ],
    });
    const { next } = tickCombatant(c);
    expect(next.shield).toBe(0);
    expect(next.hp).toBe(18); // 2 spilled
  });

  it("expires a finite DoT after its duration", () => {
    const c = makeCombatant({
      dots: [{ id: "d", name: "Poison", dmg: 1, type: "true", permanent: false, duration: 1 }],
    });
    expect(tickCombatant(c).next.dots).toHaveLength(0);
  });

  it("keeps a permanent DoT forever", () => {
    const c = makeCombatant({
      dots: [{ id: "d", name: "Curse", dmg: 1, type: "true", permanent: true, duration: null }],
    });
    expect(tickCombatant(c).next.dots).toHaveLength(1);
  });

  it("applies regeneration and clamps at maxHp", () => {
    const c = makeCombatant({
      hp: 18,
      maxHp: 20,
      hpRegens: [{ id: "r", val: 5, permanent: true, duration: null }],
    });
    expect(tickCombatant(c).next.hp).toBe(20);
  });

  it("promotes a legacy scalar hpRegen to a permanent regen", () => {
    const c = makeCombatant({ hp: 10, maxHp: 20, hpRegen: 3, hpRegens: [] });
    const { next } = tickCombatant(c);
    expect(next.hp).toBe(13);
    expect(next.hpRegens).toHaveLength(1);
    expect(next.hpRegens[0]!.permanent).toBe(true);
  });

  it("prefers the modern regen list over the legacy scalar", () => {
    const c = makeCombatant({
      hp: 10,
      maxHp: 20,
      hpRegen: 99,
      hpRegens: [{ id: "r", val: 2, permanent: true, duration: null }],
    });
    expect(tickCombatant(c).next.hp).toBe(12);
  });

  it("expires a finite regeneration", () => {
    const c = makeCombatant({
      hp: 10,
      hpRegens: [{ id: "r", val: 2, permanent: false, duration: 1 }],
    });
    const { next } = tickCombatant(c);
    expect(next.hp).toBe(12); // still applies on its final round
    expect(next.hpRegens).toHaveLength(0);
  });

  it("resolves DoTs before regeneration", () => {
    const c = makeCombatant({
      hp: 10,
      maxHp: 20,
      dots: [{ id: "d", name: "Bleed", dmg: 4, type: "true", permanent: true, duration: null }],
      hpRegens: [{ id: "r", val: 4, permanent: true, duration: null }],
    });
    expect(tickCombatant(c).next.hp).toBe(10); // -4 then +4
  });

  it("expires statuses, modifiers, and temporary shields together", () => {
    const c = makeCombatant({
      statuses: [
        { id: "s1", name: "Prone", duration: 1 },
        { id: "s2", name: "Stunned", duration: 3 },
      ],
      tempMods: [{ id: "m1", stat: "STR", val: 2, duration: 1, label: "rage" }],
      tempShields: [{ id: "t1", val: 3, duration: 1 }],
    });
    const { next, event } = tickCombatant(c);
    expect(next.statuses).toHaveLength(1);
    expect(next.statuses[0]!.name).toBe("Stunned");
    expect(next.statuses[0]!.duration).toBe(2);
    expect(next.tempMods).toHaveLength(0);
    expect(next.tempShields).toHaveLength(0);
    expect(event.expiredStatuses).toEqual(["Prone"]);
    expect(event.expiredMods).toEqual(["rage"]);
  });

  it("clears the per-phase done flag", () => {
    expect(tickCombatant(makeCombatant({ done: true })).next.done).toBe(false);
  });

  it("reports a death caused by damage over time", () => {
    const c = makeCombatant({
      hp: 2,
      dots: [{ id: "d", name: "Bleed", dmg: 5, type: "true", permanent: true, duration: null }],
    });
    const { next, event } = tickCombatant(c);
    expect(next.hp).toBe(0);
    expect(event.died).toBe(true);
  });

  it("does not report death for an already downed combatant", () => {
    const c = makeCombatant({
      hp: 0,
      dots: [{ id: "d", name: "Bleed", dmg: 5, type: "true", permanent: true, duration: null }],
    });
    expect(tickCombatant(c).event.died).toBe(false);
  });
});
