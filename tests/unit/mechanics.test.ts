import { describe, it, expect } from "vitest";
import { applyDamage, applyHealing, damageTakenBonus } from "@/domain/rules";
import { reduce } from "@/state/reducer";
import { parseEncounterState } from "@/domain/schema";
import { makeCombatant, stats } from "./helpers";
import type { EncounterState } from "@/domain/types";

const encounter = (c: ReturnType<typeof makeCombatant>[]): EncounterState =>
  parseEncounterState({ combatants: c, round: 1, phase: 0, locked: true }).state;

/* ── Overheal ── */

describe("overheal converts to a temporary shield", () => {
  it("wards the overflow instead of discarding it", () => {
    // Twelve skills in the pool end with this sentence; the tracker used to
    // clamp at max HP and throw the excess away.
    const c = makeCombatant({ hp: 18, maxHp: 20, tempShields: [] });
    const r = applyHealing(c, 6, { overheal: true });

    expect(r.hp).toBe(20);
    expect(r.healed).toBe(2);
    expect(r.warded).toBe(4);
    expect(r.tempShields).toHaveLength(1);
    expect(r.tempShields[0]!.val).toBe(4);
    // Duration follows the existing magnitude rule: 3–4 → 2 rounds.
    expect(r.tempShields[0]!.duration).toBe(2);
  });

  it("does nothing extra when the heal fits", () => {
    const c = makeCombatant({ hp: 10, maxHp: 20, tempShields: [] });
    const r = applyHealing(c, 5, { overheal: true });
    expect(r.hp).toBe(15);
    expect(r.warded).toBe(0);
    expect(r.tempShields).toHaveLength(0);
  });

  it("honours a cap for the skills that bound the conversion", () => {
    // "Any excess converts to temporary shield, capped at 3."
    const c = makeCombatant({ hp: 19, maxHp: 20, tempShields: [] });
    const r = applyHealing(c, 20, { overheal: true, wardCap: 3 });
    expect(r.healed).toBe(1);
    expect(r.warded).toBe(3);
  });

  it("discards the overflow when overheal is off", () => {
    const c = makeCombatant({ hp: 18, maxHp: 20, tempShields: [] });
    const r = applyHealing(c, 6);
    expect(r.hp).toBe(20);
    expect(r.warded).toBe(0);
    expect(r.tempShields).toHaveLength(0);
  });

  it("adds the ward on top of shields already held", () => {
    const c = makeCombatant({
      hp: 19,
      maxHp: 20,
      tempShields: [{ id: "t1", val: 2, duration: 3, label: "Ward" }],
    });
    const r = applyHealing(c, 5, { overheal: true });
    expect(r.tempShields.map((s) => s.val)).toEqual([2, 4]);
  });

  it("routes through the reducer and logs the ward separately", () => {
    const c = makeCombatant({ id: "a", name: "Mender", hp: 18, maxHp: 20, tempShields: [] });
    const out = reduce(encounter([c]), {
      type: "HEAL_APPLIED",
      ids: ["a"],
      amount: 6,
      overheal: true,
    });
    expect(out.state.combatants[0]!.tempShields[0]!.val).toBe(4);
    expect(out.log.map((l) => l.kind)).toEqual(["heal", "shield"]);
  });
});

/* ── Flat damage modifiers ── */

describe("flat damage modifiers", () => {
  it("adds vulnerability after resistance, not before", () => {
    // CON must not be able to eat a Vulnerability stack — that is the opposite
    // of what the stack is for.
    const c = makeCombatant({
      hp: 30,
      maxHp: 30,
      stats: stats({ CON: 2 }),
      tempMods: [{ id: "m", stat: "dmgTaken", val: 3, duration: 2, label: "Exposed" }],
    });
    const r = applyDamage(c, 10, "physical");
    expect(r.breakdown.toHp).toBe(11); // 10 - 2 CON + 3
    expect(r.hp).toBe(19);
  });

  it("lets a negative modifier reduce incoming damage", () => {
    // "Reduce all incoming damage by 1."
    const c = makeCombatant({
      hp: 30,
      maxHp: 30,
      stats: stats({}),
      tempMods: [{ id: "m", stat: "dmgTaken", val: -1, duration: 2, label: "Guard" }],
    });
    expect(applyDamage(c, 6, "raw").breakdown.toHp).toBe(5);
  });

  it("never drives a hit below zero", () => {
    const c = makeCombatant({
      hp: 30,
      maxHp: 30,
      stats: stats({}),
      tempMods: [{ id: "m", stat: "dmgTaken", val: -50, duration: 2, label: "Fortress" }],
    });
    expect(applyDamage(c, 4, "raw").breakdown.toHp).toBe(0);
  });
});

/* ── Target-side stacks ── */

describe("stacks carried by the target", () => {
  it("counts up and feeds damage taken", () => {
    const c = makeCombatant({
      hp: 30,
      maxHp: 30,
      stats: stats({}),
      stacks: [{ id: "s", name: "Vulnerability", count: 2, max: 3, perStackDamage: 1 }],
    });
    expect(damageTakenBonus(c)).toBe(2);
    expect(applyDamage(c, 5, "raw").breakdown.toHp).toBe(7);
  });

  it("creates, increments, and resets at the ceiling", () => {
    const c = makeCombatant({ id: "a", name: "Hound", stats: stats({}) });
    let state = encounter([c]);

    state = reduce(state, {
      type: "STACK_ADJUSTED",
      id: "a",
      name: "Vulnerability",
      delta: 1,
      max: 3,
      perStackDamage: 1,
    }).state;
    expect(state.combatants[0]!.stacks?.[0]).toMatchObject({ count: 1, max: 3 });

    state = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "Vulnerability", delta: 1 }).state;
    expect(state.combatants[0]!.stacks?.[0]!.count).toBe(2);

    // Third application hits the ceiling: the skill triggers and stacks reset.
    const out = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "Vulnerability", delta: 1 });
    expect(out.state.combatants[0]!.stacks).toHaveLength(0);
    expect(out.log[0]!.text).toMatch(/reached 3 and reset/);
  });

  it("drops the stack when decremented to nothing", () => {
    const c = makeCombatant({ id: "a", name: "Hound", stats: stats({}) });
    let state = encounter([c]);
    state = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "Bleed", delta: 1, max: 0 }).state;
    state = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "Bleed", delta: -1 }).state;
    expect(state.combatants[0]!.stacks).toHaveLength(0);
  });

  it("matches an existing stack regardless of case", () => {
    const c = makeCombatant({ id: "a", name: "Hound", stats: stats({}) });
    let state = encounter([c]);
    state = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "Vulnerability", delta: 1, max: 4 }).state;
    state = reduce(state, { type: "STACK_ADJUSTED", id: "a", name: "vulnerability", delta: 1 }).state;
    expect(state.combatants[0]!.stacks).toHaveLength(1);
    expect(state.combatants[0]!.stacks?.[0]!.count).toBe(2);
  });

  it("survives a save and load round trip", () => {
    const c = makeCombatant({
      id: "a",
      stats: stats({}),
      stacks: [{ id: "s", name: "Vulnerability", count: 2, max: 3, perStackDamage: 1 }],
    });
    const { state } = parseEncounterState({ combatants: [c], round: 2, phase: 1 });
    expect(state.combatants[0]!.stacks?.[0]).toMatchObject({
      name: "Vulnerability",
      count: 2,
      perStackDamage: 1,
    });
  });
});
