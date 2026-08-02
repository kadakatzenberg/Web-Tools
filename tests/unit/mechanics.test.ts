import { describe, it, expect } from "vitest";
import {
  applyDamage,
  applyHealing,
  armedReactions,
  damageTakenBonus,
  resolveRedirect,
  tickAbility,
  tickCombatant,
} from "@/domain/rules";
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

/* ── Reactions ── */

const reaction = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "Counter Hit",
  mode: "reaction" as const,
  max: 3,
  cur: 0,
  trigger: "hit" as const,
  ...over,
});

describe("armed reactions", () => {
  it("raises a reaction whose trigger the event satisfies", () => {
    const guard = makeCombatant({ id: "g", name: "Guard", role: "Player", abilities: [reaction()] });
    const armed = armedReactions([guard], { kind: "hit", targetId: "g", damageType: "physical" });
    expect(armed).toHaveLength(1);
    expect(armed[0]!.ability.name).toBe("Counter Hit");
  });

  it("does not raise one that is still on cooldown", () => {
    const guard = makeCombatant({ id: "g", role: "Player", abilities: [reaction({ cur: 2 })] });
    expect(armedReactions([guard], { kind: "hit", targetId: "g" })).toHaveLength(0);
  });

  it("never raises a reaction with no trigger set", () => {
    // Guessing here would cry wolf on every single hit.
    const guard = makeCombatant({ id: "g", role: "Player", abilities: [reaction({ trigger: undefined })] });
    expect(armedReactions([guard], { kind: "hit", targetId: "g" })).toHaveLength(0);
  });

  it("distinguishes an ally being hit from itself being hit", () => {
    const guard = makeCombatant({
      id: "g",
      role: "Player",
      abilities: [reaction({ id: "r2", name: "Intercept", trigger: "allyHit" })],
    });
    const friend = makeCombatant({ id: "f", role: "Player" });
    const foe = makeCombatant({ id: "e", role: "Enemy" });

    expect(armedReactions([guard, friend, foe], { kind: "hit", targetId: "f" })).toHaveLength(1);
    // Its own hit is not an ally's hit.
    expect(armedReactions([guard, friend, foe], { kind: "hit", targetId: "g" })).toHaveLength(0);
    // Nor is an enemy's.
    expect(armedReactions([guard, friend, foe], { kind: "hit", targetId: "e" })).toHaveLength(0);
  });

  it("matches on damage type where the trigger names one", () => {
    const guard = makeCombatant({
      id: "g",
      role: "Player",
      abilities: [reaction({ trigger: "magicHit" })],
    });
    expect(armedReactions([guard], { kind: "hit", targetId: "g", damageType: "magical" })).toHaveLength(1);
    expect(armedReactions([guard], { kind: "hit", targetId: "g", damageType: "physical" })).toHaveLength(0);
  });

  it("does not raise a reaction on an unconscious combatant", () => {
    const guard = makeCombatant({ id: "g", role: "Player", hp: 0, abilities: [reaction()] });
    expect(armedReactions([guard], { kind: "hit", targetId: "g" })).toHaveLength(0);
  });
});

/* ── Budgets ── */

describe("per-round and per-combat budgets", () => {
  it("refills a per-round budget on the round boundary", () => {
    // "Once per round, negate one hit entirely."
    const spent = { ...reaction({ mode: "passive" as const, max: 1, cur: 0, refill: "round" as const }) };
    expect(tickAbility(spent).cur).toBe(1);
  });

  it("never refills a per-combat budget", () => {
    // "Survive with 1 HP once per combat."
    const spent = { ...reaction({ mode: "passive" as const, max: 1, cur: 0, refill: "combat" as const }) };
    expect(tickAbility(spent).cur).toBe(0);
  });

  it("leaves an ordinary cooldown ticking as before", () => {
    expect(tickAbility(reaction({ cur: 2 })).cur).toBe(1);
  });
});

/* ── Redirection ── */

describe("redirected hits", () => {
  const guard = () => makeCombatant({ id: "g", name: "Guard", role: "Player", hp: 30, maxHp: 30, stats: stats({}) });
  const ward = (over = {}) =>
    makeCombatant({ id: "w", name: "Ward", role: "Player", hp: 20, maxHp: 20, stats: stats({}), ...over });

  it("lands the hit on whoever is covering", () => {
    const state = encounter([guard(), ward({ redirect: { toId: "g", duration: 1 } })]);
    const out = reduce(state, { type: "DAMAGE_APPLIED", ids: ["w"], amount: 5, damageType: "raw" });
    expect(out.state.combatants.find((c) => c.id === "w")!.hp).toBe(20);
    expect(out.state.combatants.find((c) => c.id === "g")!.hp).toBe(25);
    expect(out.log[0]!.text).toMatch(/Guard intercepts the hit meant for Ward/);
  });

  it("does not send hits to a body", () => {
    const state = encounter([
      makeCombatant({ id: "g", name: "Guard", role: "Player", hp: 0, maxHp: 30, stats: stats({}) }),
      ward({ redirect: { toId: "g", duration: 1 } }),
    ]);
    const out = reduce(state, { type: "DAMAGE_APPLIED", ids: ["w"], amount: 5, damageType: "raw" });
    expect(out.state.combatants.find((c) => c.id === "w")!.hp).toBe(15);
  });

  it("cancels a circular cover back to the original target", () => {
    // A covering B while B covers A is easy to set up by accident. It must not
    // hang, and the answer must not depend on where the walk started.
    const a = makeCombatant({ id: "a", role: "Player", stats: stats({}), redirect: { toId: "b", duration: 1 } });
    const b = makeCombatant({ id: "b", role: "Player", stats: stats({}), redirect: { toId: "a", duration: 1 } });
    expect(resolveRedirect([a, b], "a")).toBe("a");
    expect(resolveRedirect([a, b], "b")).toBe("b");

    // A chain feeding into a cycle resolves to its own origin, not to an
    // arbitrary member of the loop.
    const x = makeCombatant({ id: "x", role: "Player", stats: stats({}), redirect: { toId: "a", duration: 1 } });
    expect(resolveRedirect([x, a, b], "x")).toBe("x");
  });

  it("follows a chain of covers to the end", () => {
    const a = makeCombatant({ id: "a", role: "Player", stats: stats({}), redirect: { toId: "b", duration: 1 } });
    const b = makeCombatant({ id: "b", role: "Player", stats: stats({}), redirect: { toId: "c", duration: 1 } });
    const c = makeCombatant({ id: "c", role: "Player", stats: stats({}) });
    expect(resolveRedirect([a, b, c], "a")).toBe("c");
  });

  it("expires on the round boundary", () => {
    const c = makeCombatant({ id: "w", stats: stats({}), redirect: { toId: "g", duration: 1 } });
    expect(tickCombatant(c).next.redirect).toBeUndefined();
  });

  it("only strikes the guardian once when two wards share one", () => {
    const state = encounter([
      guard(),
      ward({ redirect: { toId: "g", duration: 2 } }),
      makeCombatant({ id: "w2", name: "Ward2", role: "Player", hp: 20, maxHp: 20, stats: stats({}), redirect: { toId: "g", duration: 2 } }),
    ]);
    const out = reduce(state, { type: "DAMAGE_APPLIED", ids: ["w", "w2"], amount: 5, damageType: "raw" });
    expect(out.state.combatants.find((c) => c.id === "g")!.hp).toBe(25);
  });

  it("refuses to point a combatant at itself", () => {
    const state = encounter([guard()]);
    const out = reduce(state, { type: "REDIRECT_SET", id: "g", toId: "g", duration: 2 });
    expect(out.state.combatants[0]!.redirect).toBeUndefined();
  });
});
