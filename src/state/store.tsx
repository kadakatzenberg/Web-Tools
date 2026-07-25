/**
 * Encounter store: reducer + bounded undo/redo history + combat log.
 *
 * Undo is implemented as full-state snapshots rather than inverse commands.
 * An encounter is at most a few dozen small plain objects, so a snapshot costs
 * far less than the correctness risk of hand-writing an inverse for each of the
 * thirty-odd commands. History is bounded so memory stays flat in a long session.
 *
 * State and dispatch are exposed through separate contexts so that components
 * which only dispatch never re-render when the encounter changes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { Combatant, EncounterState } from "@/domain/types";
import { type Command, NON_UNDOABLE, commandLabel } from "./actions";
import { reduce, type LogEntry } from "./reducer";

const HISTORY_LIMIT = 60;
const LOG_LIMIT = 300;
const TRASH_LIMIT = 10;

export const EMPTY_ENCOUNTER: EncounterState = {
  combatants: [],
  phase: 0,
  round: 1,
  locked: false,
  playerPhaseCount: 0,
  enemyPhaseCount: 0,
};

interface HistoryEntry {
  state: EncounterState;
  label: string;
}

export interface StoreState {
  present: EncounterState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  log: LogEntry[];
  /** Recently removed combatants, newest first, for one-click restore. */
  trash: { combatant: Combatant; index: number }[];
  /** Bumped whenever the encounter changes in a way that should be persisted. */
  revision: number;
}

type StoreAction =
  | { type: "command"; cmd: Command }
  | { type: "undo" }
  | { type: "redo" };

function initial(state: EncounterState): StoreState {
  return { present: state, past: [], future: [], log: [], trash: [], revision: 0 };
}

function storeReducer(s: StoreState, action: StoreAction): StoreState {
  if (action.type === "undo") {
    const prev = s.past[s.past.length - 1];
    if (!prev) return s;
    return {
      ...s,
      present: prev.state,
      past: s.past.slice(0, -1),
      future: [{ state: s.present, label: prev.label }, ...s.future].slice(0, HISTORY_LIMIT),
      revision: s.revision + 1,
    };
  }

  if (action.type === "redo") {
    const next = s.future[0];
    if (!next) return s;
    return {
      ...s,
      present: next.state,
      past: [...s.past, { state: s.present, label: next.label }].slice(-HISTORY_LIMIT),
      future: s.future.slice(1),
      revision: s.revision + 1,
    };
  }

  const { cmd } = action;
  const { state: nextState, log } = reduce(s.present, cmd);

  // A command that changed nothing must not pollute the undo stack.
  if (nextState === s.present && log.length === 0) return s;

  const undoable = !NON_UNDOABLE.has(cmd.type);

  let trash = s.trash;
  if (cmd.type === "COMBATANT_REMOVED") {
    const idx = s.present.combatants.findIndex((c) => c.id === cmd.id);
    const combatant = s.present.combatants[idx];
    if (combatant) trash = [{ combatant, index: idx }, ...s.trash].slice(0, TRASH_LIMIT);
  }
  if (cmd.type === "COMBATANT_RESTORED") {
    trash = s.trash.filter((t) => t.combatant.id !== cmd.combatant.id);
  }

  return {
    present: nextState,
    past: undoable
      ? [...s.past, { state: s.present, label: commandLabel(cmd) }].slice(-HISTORY_LIMIT)
      : s.past,
    future: undoable ? [] : s.future,
    log: log.length ? [...log.reverse(), ...s.log].slice(0, LOG_LIMIT) : s.log,
    trash,
    revision: s.revision + 1,
  };
}

export interface StoreApi {
  dispatch: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
}

const StateCtx = createContext<StoreState | null>(null);
const ApiCtx = createContext<StoreApi | null>(null);

export function EncounterProvider({
  children,
  initialState = EMPTY_ENCOUNTER,
}: {
  children: ReactNode;
  initialState?: EncounterState;
}) {
  const [state, rawDispatch] = useReducer(storeReducer, initialState, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const api = useMemo<StoreApi>(
    () => ({
      dispatch: (cmd: Command) => rawDispatch({ type: "command", cmd }),
      undo: () => rawDispatch({ type: "undo" }),
      redo: () => rawDispatch({ type: "redo" }),
    }),
    [],
  );

  return (
    <StateCtx.Provider value={state}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useStore(): StoreState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("useStore must be used inside <EncounterProvider>");
  return v;
}

export function useStoreApi(): StoreApi {
  const v = useContext(ApiCtx);
  if (!v) throw new Error("useStoreApi must be used inside <EncounterProvider>");
  return v;
}

/** Convenience: the encounter itself. */
export function useEncounter(): EncounterState {
  return useStore().present;
}

/** Select a single combatant without subscribing to unrelated changes. */
export function useCombatant(id: string): Combatant | undefined {
  const { present } = useStore();
  return present.combatants.find((c) => c.id === id);
}

export function useCanUndo(): { undo: boolean; redo: boolean; undoLabel?: string } {
  const s = useStore();
  const last = s.past[s.past.length - 1];
  return {
    undo: s.past.length > 0,
    redo: s.future.length > 0,
    undoLabel: last?.label,
  };
}

/** Stable dispatcher for a single combatant's commands. */
export function useCombatantDispatch(id: string) {
  const { dispatch } = useStoreApi();
  return useCallback(
    (cmd: Omit<Extract<Command, { id: string }>, "id">) =>
      dispatch({ ...cmd, id } as Command),
    [dispatch, id],
  );
}
