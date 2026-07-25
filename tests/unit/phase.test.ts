import { describe, expect, it } from "vitest";
import {
  advancePhase,
  lockInitiative,
  playersGoFirst,
  resetInitiative,
  rollInitiative,
} from "@/domain/phase";
import type { EncounterState } from "@/domain/types";
import { makeCombatant, seededRng } from "./helpers";

function encounter(partial: Partial<EncounterState> = {}): EncounterState {
  return {
    combatants: partial.combatants ?? [],
    phase: partial.phase ?? 0,
    round: partial.round ?? 1,
    locked: partial.locked ?? true,
    playerPhaseCount: partial.playerPhaseCount ?? 1,
    enemyPhaseCount: partial.enemyPhaseCount ?? 0,
  };
}

describe("initiative", () => {
  it("gives players the first phase when they beat the enemy total", () => {
    expect(playersGoFirst(15, 14)).toBe(true);
  });

  it("gives enemies the first phase on a tie", () => {
    expect(playersGoFirst(14, 14)).toBe(false);
  });

  it("gives enemies the first phase when they win", () => {
    expect(playersGoFirst(10, 14)).toBe(false);
  });

  it("seeds the player phase counter for a player-first start", () => {
    const s = lockInitiative(encounter({ locked: false, playerPhaseCount: 0 }), false);
    expect(s.phase).toBe(0);
    expect(s.playerPhaseCount).toBe(1);
    expect(s.enemyPhaseCount).toBe(0);
    expect(s.locked).toBe(true);
  });

  it("seeds the enemy phase counter for an enemy-first start", () => {
    const s = lockInitiative(encounter({ locked: false, playerPhaseCount: 0 }), true);
    expect(s.phase).toBe(1);
    expect(s.enemyPhaseCount).toBe(1);
    expect(s.playerPhaseCount).toBe(0);
  });

  it("resets all counters when initiative is re-rolled", () => {
    const s = resetInitiative(
      encounter({ phase: 2, round: 7, playerPhaseCount: 4, enemyPhaseCount: 3 }),
    );
    expect(s).toMatchObject({
      locked: false,
      phase: 0,
      round: 1,
      playerPhaseCount: 0,
      enemyPhaseCount: 0,
    });
  });

  it("rolls d20s inside the legal range", () => {
    const rolls = rollInitiative(50, seededRng(7));
    expect(rolls).toHaveLength(50);
    for (const r of rolls) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });
});

describe("phase advancement", () => {
  it("cycles Player → Enemy → Environment → Player", () => {
    let s = encounter({ phase: 0 });
    s = advancePhase(s).state;
    expect(s.phase).toBe(1);
    s = advancePhase(s).state;
    expect(s.phase).toBe(2);
    s = advancePhase(s).state;
    expect(s.phase).toBe(0);
  });

  it("increments the enemy phase counter on entering the enemy phase", () => {
    const s = advancePhase(encounter({ phase: 0, enemyPhaseCount: 2 })).state;
    expect(s.enemyPhaseCount).toBe(3);
  });

  it("does not increment the round on entering the enemy phase", () => {
    const s = advancePhase(encounter({ phase: 0, round: 3 })).state;
    expect(s.round).toBe(3);
  });

  it("does not touch counters on entering the environment phase", () => {
    const before = encounter({ phase: 1, round: 3, playerPhaseCount: 2, enemyPhaseCount: 2 });
    const s = advancePhase(before).state;
    expect(s.round).toBe(3);
    expect(s.playerPhaseCount).toBe(2);
    expect(s.enemyPhaseCount).toBe(2);
  });

  it("increments round and player phase count on entering the player phase", () => {
    const s = advancePhase(
      encounter({ phase: 2, round: 3, playerPhaseCount: 2 }),
    ).state;
    expect(s.round).toBe(4);
    expect(s.playerPhaseCount).toBe(3);
  });

  it("runs the full duration tick only on the round boundary", () => {
    const combatant = makeCombatant({
      statuses: [{ id: "s", name: "Prone", duration: 1 }],
      abilities: [
        { id: "a", name: "Strike", mode: "cooldown", max: 2, cur: 2, gainPerPhase: 1 },
      ],
    });

    // Player → Enemy: no tick.
    const toEnemy = advancePhase(encounter({ phase: 0, combatants: [combatant] }));
    expect(toEnemy.crossedRound).toBe(false);
    expect(toEnemy.state.combatants[0]!.statuses).toHaveLength(1);
    expect(toEnemy.state.combatants[0]!.abilities[0]!.cur).toBe(2);

    // Environment → Player: tick.
    const toPlayer = advancePhase(encounter({ phase: 2, combatants: [combatant] }));
    expect(toPlayer.crossedRound).toBe(true);
    expect(toPlayer.state.combatants[0]!.statuses).toHaveLength(0);
    expect(toPlayer.state.combatants[0]!.abilities[0]!.cur).toBe(1);
  });

  it("clears done marks on every phase change", () => {
    const c = makeCombatant({ done: true });
    expect(advancePhase(encounter({ phase: 0, combatants: [c] })).state.combatants[0]!.done)
      .toBe(false);
    expect(advancePhase(encounter({ phase: 1, combatants: [c] })).state.combatants[0]!.done)
      .toBe(false);
    expect(advancePhase(encounter({ phase: 2, combatants: [c] })).state.combatants[0]!.done)
      .toBe(false);
  });

  it("emits round events only when the round boundary is crossed", () => {
    const c = makeCombatant({
      hp: 10,
      dots: [{ id: "d", name: "Bleed", dmg: 3, type: "true", permanent: true, duration: null }],
    });
    expect(advancePhase(encounter({ phase: 0, combatants: [c] })).events).toHaveLength(0);
    const round = advancePhase(encounter({ phase: 2, combatants: [c] }));
    expect(round.events).toHaveLength(1);
    expect(round.events[0]!.dotDamage).toBe(3);
  });

  it("completes three phases per round", () => {
    let s = encounter({ phase: 0, round: 1 });
    for (let i = 0; i < 3; i++) s = advancePhase(s).state;
    expect(s.round).toBe(2);
    expect(s.phase).toBe(0);
  });
});
