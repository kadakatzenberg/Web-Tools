import { describe, it, expect } from "vitest";
import { requirementFromText, abilityFromSheetSkill } from "@/domain/factory";
import { requirementState, isAbilityReadyWith, phasesUntilReady } from "@/domain/rules";
import type { Ability } from "@/domain/types";

const ab = (over: Partial<Ability> = {}): Ability => ({
  id: "x",
  name: "Skill",
  mode: "cooldown",
  max: 2,
  cur: 0,
  ...over,
});

describe("reading a prerequisite out of sheet prose", () => {
  it("lifts Dawn's gate out of her cooldown field", () => {
    // The exact string on the sheet in Supabase.
    expect(requirementFromText("Requires Sangre Lanza at max (+4 STR).")).toEqual({
      skill: "Sangre Lanza",
      atMax: true,
    });
  });

  it("reads a numeric threshold", () => {
    expect(requirementFromText("Requires Focus at 3 stacks")).toEqual({
      skill: "Focus",
      atLeast: 3,
    });
  });

  it("does not invent a gate out of an ordinary sentence", () => {
    for (const s of [
      "STR resets to 0 after using Ult.",
      "3 Ally Phases CD",
      "Once per combat.",
      "",
      undefined,
    ]) {
      expect(requirementFromText(s), String(s)).toBeNull();
    }
  });

  it("attaches the gate when a sheet skill is imported", () => {
    const built = abilityFromSheetSkill("ult", {
      name: "Sueño Imposible",
      mode: "stack",
      maxVal: 1,
      cooldown: "Requires Sangre Lanza at max (+4 STR).",
      effect: "Deals 2d3+STR dmg to one target.",
    } as never);
    expect(built.requires).toEqual({ skill: "Sangre Lanza", atMax: true });
  });
});

describe("gated abilities", () => {
  const sangre = (cur: number) => ab({ id: "s1", name: "Sangre Lanza", mode: "stack", max: 4, cur });
  const ult = ab({
    id: "ult",
    name: "ULT: Sueño Imposible",
    mode: "charge",
    max: 1,
    cur: 0,
    requires: { skill: "Sangre Lanza", atMax: true },
  });

  it("explains what is missing rather than going quietly dead", () => {
    const r = requirementState(ult, [sangre(2), ult]);
    expect(r.gated).toBe(true);
    expect(r.met).toBe(false);
    expect(r.label).toBe("Needs Sangre Lanza at 4/4 — currently 2");
  });

  it("readies the moment the prerequisite is satisfied", () => {
    // No separate Charge press: the ult becomes available when the stack fills.
    expect(isAbilityReadyWith(ult, [sangre(3), ult])).toBe(false);
    expect(isAbilityReadyWith(ult, [sangre(4), ult])).toBe(true);
  });

  it("says so when the sibling skill is missing entirely", () => {
    const r = requirementState(ult, [ult]);
    expect(r.met).toBe(false);
    expect(r.label).toMatch(/does not have/);
  });

  it("matches a sibling whose name carries the ULT prefix", () => {
    const gated = ab({ name: "Follow-up", requires: { skill: "Sueño Imposible", atMax: true } });
    const target = ab({ id: "u", name: "ULT: Sueño Imposible", mode: "charge", max: 1, cur: 1 });
    expect(requirementState(gated, [target, gated]).met).toBe(true);
  });

  it("leaves an ungated ability exactly as it was", () => {
    const plain = ab({ mode: "cooldown", cur: 0 });
    expect(requirementState(plain, [plain]).gated).toBe(false);
    expect(isAbilityReadyWith(plain, [plain])).toBe(true);
  });
});

describe("reporting readiness in phases", () => {
  it("counts the Next Phase presses, not the rounds", () => {
    // A 2-round cooldown at the top of a round is six presses away. Reporting
    // "2 left" meant the control sat unchanged through five of them.
    const cd = ab({ mode: "cooldown", max: 2, cur: 2 });
    expect(phasesUntilReady(cd, 0)).toBe(6);
    expect(phasesUntilReady(cd, 1)).toBe(5);
    expect(phasesUntilReady(cd, 2)).toBe(4);
  });

  it("counts a one-round charge down to the next boundary", () => {
    const charge = ab({ mode: "charge", max: 1, cur: 0, charging: true, gainPerPhase: 1 });
    expect(phasesUntilReady(charge, 0)).toBe(3);
    expect(phasesUntilReady(charge, 1)).toBe(2);
    expect(phasesUntilReady(charge, 2)).toBe(1);
  });

  it("reports zero for anything already usable", () => {
    expect(phasesUntilReady(ab({ mode: "cooldown", cur: 0 }), 1)).toBe(0);
    expect(phasesUntilReady(ab({ mode: "ammo", max: 2, cur: 1 }), 1)).toBe(0);
    // An idle charge is not waiting on anything — it is waiting on the player.
    expect(phasesUntilReady(ab({ mode: "charge", max: 2, cur: 0 }), 1)).toBe(0);
  });
});
