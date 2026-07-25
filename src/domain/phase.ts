/**
 * Phase and round progression.
 *
 * Phase order is fixed: Player (0) → Enemy (1) → Environment (2) → Player…
 *
 * Round bookkeeping is asymmetric and this asymmetry is load-bearing:
 *   - Entering the Enemy Phase increments the enemy phase counter only.
 *   - Entering the Player Phase increments the round *and* the player phase
 *     counter, and is the single point at which durations tick, DoTs resolve,
 *     regeneration applies, and cooldowns advance.
 *   - Entering the Environment Phase only clears per-phase "done" marks.
 *
 * Consequence: a full duration tick happens once per round, not once per phase.
 */

import type { Combatant, EncounterState, PhaseIndex } from "./types";
import { tickCombatant, type RoundTickEvent } from "./rules";

export const PHASE_COUNT = 3;

export function nextPhaseIndex(phase: PhaseIndex): PhaseIndex {
  return (((phase + 1) % PHASE_COUNT) as PhaseIndex);
}

export interface PhaseAdvanceResult {
  state: EncounterState;
  /** Populated only when the round boundary was crossed. */
  events: RoundTickEvent[];
  crossedRound: boolean;
}

function clearDone(combatants: Combatant[]): Combatant[] {
  return combatants.map((c) => (c.done ? { ...c, done: false } : c));
}

/** Advance the encounter by one phase, applying round processing when due. */
export function advancePhase(state: EncounterState): PhaseAdvanceResult {
  const next = nextPhaseIndex(state.phase);

  if (next === 0) {
    const events: RoundTickEvent[] = [];
    const combatants = state.combatants.map((c) => {
      const { next: n, event } = tickCombatant(c);
      events.push(event);
      return n;
    });
    return {
      state: {
        ...state,
        phase: next,
        round: state.round + 1,
        playerPhaseCount: state.playerPhaseCount + 1,
        combatants,
      },
      events,
      crossedRound: true,
    };
  }

  if (next === 1) {
    return {
      state: {
        ...state,
        phase: next,
        enemyPhaseCount: state.enemyPhaseCount + 1,
        combatants: clearDone(state.combatants),
      },
      events: [],
      crossedRound: false,
    };
  }

  return {
    state: { ...state, phase: next, combatants: clearDone(state.combatants) },
    events: [],
    crossedRound: false,
  };
}

/**
 * Resolve initiative. Players must *beat* the enemy total to act first —
 * a tie goes to the enemies.
 */
export function playersGoFirst(playerTotal: number, enemyTotal: number): boolean {
  return playerTotal > enemyTotal;
}

/** Lock initiative in, seeding the phase and the appropriate phase counter. */
export function lockInitiative(
  state: EncounterState,
  enemyFirst: boolean,
): EncounterState {
  return {
    ...state,
    phase: enemyFirst ? 1 : 0,
    playerPhaseCount: enemyFirst ? state.playerPhaseCount : 1,
    enemyPhaseCount: enemyFirst ? 1 : state.enemyPhaseCount,
    locked: true,
  };
}

/** Unlock initiative and reset all phase/round bookkeeping. */
export function resetInitiative(state: EncounterState): EncounterState {
  return {
    ...state,
    locked: false,
    phase: 0,
    round: 1,
    playerPhaseCount: 0,
    enemyPhaseCount: 0,
    combatants: clearDone(state.combatants),
  };
}

/** Roll `count` d20s using the supplied RNG (injectable for tests). */
export function rollInitiative(count: number, rng: () => number = Math.random): number[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, () => Math.ceil(rng() * 20) || 1);
}
