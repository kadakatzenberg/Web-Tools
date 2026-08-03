import { describe, it, expect } from "vitest";
import {
  abilityMods,
  allMods,
  deriveStats,
  grownAbilities,
  type CombatEvent,
} from "@/domain/rules";
import { betterStat, damageWith } from "@/domain/action";
import {
  abilityFromSheetSkill,
  grantFromText,
  growthFromText,
  preferredDamageStat,
} from "@/domain/factory";
import { reduce } from "@/state/reducer";
import { parseEncounterState } from "@/domain/schema";
import { makeCombatant, stats } from "./helpers";
import type { Ability, Combatant } from "@/domain/types";

const lanza = (over: Partial<Ability> = {}): Ability => ({
  id: "sl",
  name: "Sangre Lanza",
  mode: "stack",
  max: 4,
  cur: 0,
  grants: { stat: "STR", perStack: 1 },
  growsOn: ["hitDealt", "hit"],
  ...over,
});

/* ── What a counter is worth ── */

describe("a counter that raises its owner's stats", () => {
  it("is worth nothing while it is empty", () => {
    expect(abilityMods([lanza({ cur: 0 })])).toEqual([]);
  });

  it("pays out one point per stack held", () => {
    const mods = abilityMods([lanza({ cur: 3 })]);
    expect(mods).toHaveLength(1);
    expect(mods[0]!.stat).toBe("STR");
    expect(mods[0]!.val).toBe(3);
    expect(mods[0]!.label).toBe("Sangre Lanza");
  });

  it("reaches the damage the tracker actually deals", () => {
    const dawn = makeCombatant({ stats: stats({ STR: 1 }), abilities: [lanza({ cur: 3 })] });
    // 2 + STR 1 + 3 stacks.
    expect(damageWith(dawn, "physical")).toBe(6);
  });

  it("stacks on top of ordinary temporary modifiers rather than replacing them", () => {
    const c = makeCombatant({
      stats: stats({ STR: 2 }),
      abilities: [lanza({ cur: 2 })],
      tempMods: [{ id: "m", stat: "STR", val: 1, duration: 2, label: "Rally" }],
    });
    expect(deriveStats(c.stats, allMods(c)).physicalDamage).toBe(7);
  });

  it("never ticks away, because it is derived rather than stored", () => {
    const c = makeCombatant({ abilities: [lanza({ cur: 2 })] });
    // Nothing granted is in the persisted array, so the round tick cannot see it.
    expect(c.tempMods).toEqual([]);
    expect(allMods(c)).toHaveLength(1);
  });
});

/* ── What makes it climb ── */

describe("a counter that builds on its own", () => {
  const dawn = (over: Partial<Combatant> = {}) =>
    makeCombatant({ id: "d", name: "Dawn", abilities: [lanza({ cur: 1 })], ...over });

  it("climbs when its owner lands a hit", () => {
    const d = dawn();
    const foe = makeCombatant({ id: "f", role: "Enemy" });
    const event: CombatEvent = { kind: "hit", targetId: "f", sourceId: "d" };
    expect(grownAbilities(d, event, foe)).toEqual([
      { ability: d.abilities[0], from: 1, to: 2 },
    ]);
  });

  it("climbs when its owner takes one", () => {
    const d = dawn();
    const event: CombatEvent = { kind: "hit", targetId: "d", sourceId: "f" };
    expect(grownAbilities(d, event, d)).toHaveLength(1);
  });

  it("counts a killing blow as a blow landed", () => {
    const d = dawn();
    const foe = makeCombatant({ id: "f", role: "Enemy", hp: 0 });
    expect(grownAbilities(d, { kind: "down", targetId: "f", sourceId: "d" }, foe)).toHaveLength(1);
  });

  it("ignores a hit between two other people", () => {
    const d = dawn();
    const b = makeCombatant({ id: "b", role: "Enemy" });
    expect(grownAbilities(d, { kind: "hit", targetId: "b", sourceId: "a" }, b)).toEqual([]);
  });

  it("stops at the ceiling instead of running past it", () => {
    const d = dawn({ abilities: [lanza({ cur: 4 })] });
    const foe = makeCombatant({ id: "f", role: "Enemy" });
    expect(grownAbilities(d, { kind: "hit", targetId: "f", sourceId: "d" }, foe)).toEqual([]);
  });

  it("leaves a skill that was never told to build alone", () => {
    const d = dawn({ abilities: [lanza({ growsOn: undefined })] });
    const foe = makeCombatant({ id: "f", role: "Enemy" });
    expect(grownAbilities(d, { kind: "hit", targetId: "f", sourceId: "d" }, foe)).toEqual([]);
  });
});

/* ── Through the reducer, which is where it has to actually happen ── */

describe("growth on a real hit", () => {
  const encounter = (combatants: Combatant[]) =>
    ({
      combatants,
      round: 1,
      phase: 0,
      playerPhaseCount: 0,
      enemyPhaseCount: 0,
      locked: false,
    }) as never;

  it("builds the attacker's counter and the victim's in one dispatch", () => {
    const dawn = makeCombatant({ id: "d", name: "Dawn", abilities: [lanza({ cur: 0 })] });
    const foe = makeCombatant({
      id: "f",
      name: "Foe",
      role: "Enemy",
      hp: 20,
      maxHp: 20,
      abilities: [lanza({ id: "rage", name: "Rage", growsOn: ["hit"], cur: 0 })],
    });

    const r = reduce(encounter([dawn, foe]), {
      type: "DAMAGE_APPLIED",
      ids: ["f"],
      amount: 5,
      damageType: "physical",
      sourceId: "d",
    });

    expect(r.state.combatants[0]!.abilities[0]!.cur).toBe(1); // Dawn landed it
    expect(r.state.combatants[1]!.abilities[0]!.cur).toBe(1); // Foe took it
    expect(r.log.some((l) => l.text === "Dawn: Sangre Lanza 1/4")).toBe(true);
  });

  it("still builds the victim's counter when nobody claimed the hit", () => {
    const foe = makeCombatant({
      id: "f",
      name: "Foe",
      hp: 20,
      maxHp: 20,
      abilities: [lanza({ growsOn: ["hit"], cur: 0 })],
    });
    const r = reduce(encounter([foe]), {
      type: "DAMAGE_APPLIED",
      ids: ["f"],
      amount: 4,
      damageType: "physical",
    });
    expect(r.state.combatants[0]!.abilities[0]!.cur).toBe(1);
  });

  it("is undone with the hit that caused it, being one command", () => {
    const dawn = makeCombatant({ id: "d", name: "Dawn", abilities: [lanza({ cur: 2 })] });
    const foe = makeCombatant({ id: "f", name: "Foe", role: "Enemy", hp: 20, maxHp: 20 });
    const before = encounter([dawn, foe]);
    const after = reduce(before, {
      type: "DAMAGE_APPLIED",
      ids: ["f"],
      amount: 5,
      damageType: "physical",
      sourceId: "d",
    });
    expect(after.state).not.toBe(before);
    expect((before as unknown as { combatants: Combatant[] }).combatants[0]!.abilities[0]!.cur).toBe(2);
  });
});

/* ── Which stat a combatant swings with ── */

describe("the damage stat a sheet declares", () => {
  it("takes the sheet at its word over the higher number", () => {
    const dawn = makeCombatant({
      stats: stats({ STR: 0, INT: 4 }),
      damageStat: "physical",
    });
    expect(betterStat(dawn)).toBe("physical");
  });

  it("falls back to whichever is higher when nothing is declared", () => {
    expect(betterStat(makeCombatant({ stats: stats({ STR: 0, INT: 4 }) }))).toBe("magical");
  });

  it("survives a save and reload", () => {
    const c = makeCombatant({ damageStat: "physical" });
    const { state: parsed } = parseEncounterState({
      combatants: [c],
      round: 1,
      phase: 0,
      playerPhaseCount: 0,
      enemyPhaseCount: 0,
      locked: false,
    });
    expect(parsed.combatants[0]!.damageStat).toBe("physical");
  });

  it("is read off a kit built on a stat", () => {
    const abilities = [lanza()];
    expect(preferredDamageStat(abilities, {})).toBe("physical");
    expect(preferredDamageStat([lanza({ grants: { stat: "INT", perStack: 1 } })], {})).toBe(
      "magical",
    );
  });

  it("falls back to counting the prose, and abstains on a tie", () => {
    expect(
      preferredDamageStat([], { s1: { name: "Cleave", effect: "A heavy STR strike, physical." } }),
    ).toBe("physical");
    expect(
      preferredDamageStat([], { s1: { name: "Bolt", effect: "An INT spell dealing magical damage." } }),
    ).toBe("magical");
    expect(preferredDamageStat([], { s1: { name: "Shove", effect: "Pushes the target back." } })).toBeUndefined();
  });
});

/* ── Lifting all of this out of the sheets ── */

describe("reading automation out of a sheet's own prose", () => {
  it("divides a total stated at the ceiling into what one point is worth", () => {
    expect(grantFromText("Requires Sangre Lanza at max (+4 STR).", 4)).toEqual({
      stat: "STR",
      perStack: 1,
    });
  });

  it("reads a rate written as a rate", () => {
    expect(grantFromText("+2 INT per stack", 3)).toEqual({ stat: "INT", perStack: 2 });
  });

  it("does not turn a total that will not divide into a fractional buff", () => {
    expect(grantFromText("(+3 STR)", 4)).toBeNull();
  });

  it("finds both directions of a build", () => {
    expect(growthFromText("Gains a stack each time she lands a hit or is hit.")).toEqual(
      expect.arrayContaining(["hitDealt", "hit"]),
    );
  });

  it("reads a one-sided build", () => {
    expect(growthFromText("Gains 1 stack whenever this unit is hit.")).toEqual(["hit"]);
  });

  it("does not invent a build out of an ordinary sentence", () => {
    for (const s of [
      "Deals 4 physical damage to one target.",
      "The target is knocked prone until the end of the round.",
      "",
      undefined,
    ]) {
      expect(growthFromText(s)).toBeNull();
    }
  });

  it("wires a sheet skill up end to end", () => {
    const ability = abilityFromSheetSkill("s1", {
      name: "Sangre Lanza",
      mode: "stack",
      maxVal: 4,
      effect: "Gains a stack each time she lands a hit or is hit (+4 STR at max).",
    });
    expect(ability.grants).toEqual({ stat: "STR", perStack: 1 });
    expect(ability.growsOn).toEqual(expect.arrayContaining(["hitDealt", "hit"]));
  });

  it("leaves cooldown skills out of it, where a bonus means something else", () => {
    const ability = abilityFromSheetSkill("s2", {
      name: "War Cry",
      mode: "cooldown",
      maxVal: 2,
      effect: "Grants +2 STR to an ally for two rounds.",
    });
    expect(ability.grants).toBeUndefined();
  });
});

/* ── The rest of what a sheet already says ── */

describe("reading the rest of a sheet's prose", () => {
  it("arms a reaction, which was previously imported inert", () => {
    const ability = abilityFromSheetSkill("s2", {
      name: "Riposte",
      mode: "reaction",
      effect: "When this unit is hit, strike back for 3 physical.",
    });
    expect(ability.trigger).toBe("hit");
  });

  it("tells apart the reactions that key off somebody else", () => {
    const cases: [string, string][] = [
      ["When an ally is hit, intercept the blow.", "allyHit"],
      ["When an ally falls, revive them at 1 HP.", "allyDown"],
      ["When you drop to 0 HP, return with 5 HP instead.", "selfDown"],
      ["When hit by a magical attack, halve the damage.", "magicHit"],
      ["When struck by a physical attack, reflect 2.", "physicalHit"],
    ];
    for (const [text, expected] of cases) {
      expect(
        abilityFromSheetSkill("s1", { name: "R", mode: "reaction", effect: text }).trigger,
      ).toBe(expected);
    }
  });

  it("leaves a reaction unarmed rather than guessing", () => {
    const ability = abilityFromSheetSkill("s1", {
      name: "Vanish",
      mode: "reaction",
      effect: "Step out of sight until the end of the round.",
    });
    expect(ability.trigger).toBeUndefined();
  });

  it("lifts a forced check off the sheet, either way round", () => {
    expect(
      abilityFromSheetSkill("s1", {
        name: "Quake",
        effect: "All enemies make a DC 14 AGI check or fall prone.",
      }),
    ).toMatchObject({ dcStat: "AGI", dcValue: 14 });

    expect(
      abilityFromSheetSkill("s1", {
        name: "Wail",
        effect: "Target makes a WIS save, DC 12.",
      }),
    ).toMatchObject({ dcStat: "WIS", dcValue: 12 });
  });

  it("reads a budget that a per-phase rate cannot express", () => {
    expect(
      abilityFromSheetSkill("ult", {
        name: "Last Stand",
        mode: "passive",
        cooldown: "Once per combat",
      }).refill,
    ).toBe("combat");

    expect(
      abilityFromSheetSkill("s1", {
        name: "Parry",
        mode: "passive",
        cooldown: "Once per round",
      }).refill,
    ).toBe("round");
  });

  it("adds nothing to a skill whose text says none of this", () => {
    const ability = abilityFromSheetSkill("s1", {
      name: "Slash",
      effect: "Deals 4 physical damage to one target.",
    });
    expect(ability.trigger).toBeUndefined();
    expect(ability.dcValue).toBeUndefined();
    expect(ability.refill).toBeUndefined();
    expect(ability.grants).toBeUndefined();
    expect(ability.growsOn).toBeUndefined();
  });
});
