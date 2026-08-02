import { describe, it, expect } from "vitest";
import {
  betterStat,
  canTarget,
  damageWith,
  mendAmount,
  previewAction,
  statSource,
  withRolled,
} from "@/domain/action";
import { reduce } from "@/state/reducer";
import { makeCombatant, stats } from "./helpers";
import type { Ability } from "@/domain/types";

const ab = (over: Partial<Ability> = {}): Ability => ({
  id: "a1",
  name: "Skill",
  mode: "cooldown",
  max: 2,
  cur: 0,
  ...over,
});

describe("what an action is worth", () => {
  it("derives damage from the attacker rather than asking for it", () => {
    const c = makeCombatant({ stats: stats({ STR: 4, INT: 1 }) });
    expect(damageWith(c, "physical")).toBe(6); // 2 + STR
    expect(damageWith(c, "magical")).toBe(3); // 2 + INT
  });

  it("picks whichever stat the attacker actually hits harder with", () => {
    const brawler = makeCombatant({ stats: stats({ STR: 4, INT: 1 }) });
    const mage = makeCombatant({ stats: stats({ STR: 0, INT: 5 }) });
    expect(betterStat(brawler)).toBe("physical");
    expect(betterStat(mage)).toBe("magical");
  });

  it("breaks a tie towards physical, so a blank sheet still swings", () => {
    expect(betterStat(makeCombatant({ stats: stats() }))).toBe("physical");
  });

  it("counts temporary modifiers, so a buff shows up in the preview", () => {
    const c = makeCombatant({
      stats: stats({ STR: 2 }),
      tempMods: [{ id: "m", stat: "STR", val: 3, duration: 2, label: "Rally" }],
    });
    expect(damageWith(c, "physical")).toBe(7);
  });

  it("mends off the same well spell damage comes from", () => {
    const healer = makeCombatant({ stats: stats({ INT: 3 }) });
    expect(mendAmount(healer)).toBe(5);
    expect(statSource(healer, "magical")).toBe("2 + INT 3");
  });
});

describe("previewing a hit", () => {
  it("runs the derived figure through the target's resistance", () => {
    const actor = makeCombatant({ stats: stats({ STR: 4 }) });
    const target = makeCombatant({ hp: 12, maxHp: 12, stats: stats({ CON: 2 }) });

    const p = previewAction({ actor, target, kind: "attack" });
    expect(p.amount).toBe(6);
    expect(p.stat).toBe("physical");
    expect(p.source).toBe("2 + STR 4");
    expect(p.result!.breakdown.resisted).toBe(2);
    expect(p.result!.breakdown.toHp).toBe(4);
    expect(p.result!.hp).toBe(8);
  });

  it("amplifies against negative resistance rather than clamping it away", () => {
    const actor = makeCombatant({ stats: stats({ INT: 3 }) });
    const target = makeCombatant({ hp: 20, maxHp: 20, stats: stats({ WIS: -2 }) });

    const p = previewAction({ actor, target, kind: "attack" });
    expect(p.stat).toBe("magical");
    expect(p.result!.breakdown.amplified).toBe(2);
    expect(p.result!.breakdown.toHp).toBe(7);
  });

  it("spends shielding before hit points", () => {
    const actor = makeCombatant({ stats: stats({ STR: 3 }) });
    const target = makeCombatant({ hp: 10, maxHp: 10, shield: 4 });

    const p = previewAction({ actor, target, kind: "attack" });
    expect(p.result!.breakdown.absorbedByShield).toBe(4);
    expect(p.result!.breakdown.toHp).toBe(1);
  });

  it("asks for a roll only when the skill carries its own dice", () => {
    const actor = makeCombatant({ stats: stats({ STR: 4 }) });
    const target = makeCombatant();

    const plain = previewAction({ actor, target, kind: "skill", ability: ab() });
    expect(plain.needsRoll).toBe(false);
    expect(plain.amount).toBe(6);

    const rolled = previewAction({
      actor,
      target,
      kind: "skill",
      ability: ab({ name: "Volley", dice: "2d6" }),
    });
    expect(rolled.needsRoll).toBe(true);
    expect(rolled.diceNotation).toBe("2d6");
    expect(rolled.result).toBeUndefined();
  });

  it("carries a forced check through to the readout", () => {
    const actor = makeCombatant();
    const target = makeCombatant();
    const p = previewAction({
      actor,
      target,
      kind: "skill",
      ability: ab({ dcStat: "AGI", dcValue: 14 }),
    });
    expect(p.check).toEqual({ stat: "AGI", dc: 14 });
  });

  it("re-runs the pipeline once the table reports what it rolled", () => {
    const actor = makeCombatant({ stats: stats({ STR: 4 }) });
    const target = makeCombatant({ hp: 20, maxHp: 20, stats: stats({ CON: 1 }) });
    const plan = { actor, target, kind: "skill" as const, ability: ab({ dice: "2d6" }) };

    const base = previewAction(plan);
    const final = withRolled(plan, base, 9);

    expect(final.amount).toBe(9);
    expect(final.result!.breakdown.resisted).toBe(1);
    expect(final.result!.hp).toBe(12);
  });

  it("treats nonsense in the roll box as nothing rather than NaN", () => {
    const actor = makeCombatant();
    const target = makeCombatant({ hp: 10, maxHp: 10 });
    const plan = { actor, target, kind: "skill" as const, ability: ab({ dice: "2d6" }) };
    const final = withRolled(plan, previewAction(plan), Number.NaN);
    expect(final.amount).toBe(0);
    expect(final.result!.hp).toBe(10);
  });
});

describe("who may be aimed at", () => {
  it("refuses the actor themselves", () => {
    const c = makeCombatant();
    expect(canTarget(c, c)).toBe(false);
  });

  it("refuses the unconscious, who are out of the fight already", () => {
    const actor = makeCombatant();
    const down = makeCombatant({ hp: 0 });
    expect(canTarget(actor, down)).toBe(false);
  });

  it("allows anyone still standing, including an ally", () => {
    const actor = makeCombatant({ role: "Player" });
    const ally = makeCombatant({ role: "Player" });
    const foe = makeCombatant({ role: "Enemy" });
    expect(canTarget(actor, ally)).toBe(true);
    expect(canTarget(actor, foe)).toBe(true);
  });
});

describe("the log written by a resolved command", () => {
  const base = () => ({
    combatants: [
      makeCombatant({ id: "k", name: "Kada" }),
      makeCombatant({ id: "g", name: "Grunt", hp: 12, maxHp: 12 }),
    ],
    round: 1,
    phase: 0,
    playerPhaseCount: 0,
    enemyPhaseCount: 0,
    locked: false,
  });

  it("names the attacker when one is known", () => {
    const r = reduce(base() as never, {
      type: "DAMAGE_APPLIED",
      ids: ["g"],
      amount: 6,
      damageType: "physical",
      source: "Kada",
    });
    expect(r.log[0]!.text).toBe("Kada hit Grunt for 6 physical (6 to HP)");
  });

  it("keeps the old wording when damage is typed straight into a card", () => {
    const r = reduce(base() as never, {
      type: "DAMAGE_APPLIED",
      ids: ["g"],
      amount: 6,
      damageType: "physical",
    });
    expect(r.log[0]!.text).toBe("Grunt took 6 physical (6 to HP)");
  });

  it("records a miss without touching anything", () => {
    const state = base() as never;
    const r = reduce(state, {
      type: "ACTION_MISSED",
      actorId: "k",
      targetId: "g",
      label: "Sangre Lanza",
    });
    expect(r.state).toBe(state);
    expect(r.log[0]!.text).toBe("Kada's Sangre Lanza missed Grunt");
  });

  it("says who mended whom", () => {
    const hurt = { ...base() };
    hurt.combatants = [
      makeCombatant({ id: "k", name: "Kada" }),
      makeCombatant({ id: "g", name: "Grunt", hp: 4, maxHp: 12 }),
    ];
    const r = reduce(hurt as never, {
      type: "HEAL_APPLIED",
      ids: ["g"],
      amount: 5,
      source: "Kada",
    });
    expect(r.log[0]!.text).toBe("Kada mended Grunt for 5");
  });
});
