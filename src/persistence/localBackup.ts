/**
 * Emergency local backup.
 *
 * The encounter is mirrored to localStorage on every change so that a dropped
 * connection, a closed tab, or a crashed browser never costs a live session.
 * This is a safety net, not the source of truth — the Supabase session record
 * still wins when both exist.
 */

import type { EncounterState } from "@/domain/types";
import { parseEncounterState } from "@/domain/schema";

const KEY = "heimao.encounter.backup.v2";
const CODE_KEY = "heimao.session.code.v2";

export interface Backup {
  state: EncounterState;
  savedAt: number;
  sessionCode: string | null;
}

function available(): boolean {
  try {
    const probe = "__heimao_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    // Private-mode Safari and storage-blocked contexts throw here.
    return false;
  }
}

const enabled = typeof window !== "undefined" && available();

export function writeBackup(state: EncounterState, sessionCode: string | null): void {
  if (!enabled) return;
  // An empty encounter carries no information and must never destroy a
  // recoverable snapshot from a previous session.
  if (!state.combatants.length && !sessionCode) return;
  try {
    const payload: Backup = { state, savedAt: Date.now(), sessionCode };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded — a failed backup must never break the encounter.
  }
}

export function readBackup(): Backup | null {
  if (!enabled) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown; savedAt?: number; sessionCode?: string };
    const { state } = parseEncounterState(parsed.state);
    if (!state.combatants.length) return null;
    return {
      state,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      sessionCode: parsed.sessionCode ?? null,
    };
  } catch {
    return null;
  }
}

export function clearBackup(): void {
  if (!enabled) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing recoverable to do */
  }
}

export function rememberSessionCode(code: string | null): void {
  if (!enabled) return;
  try {
    if (code) window.localStorage.setItem(CODE_KEY, code);
    else window.localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing recoverable to do */
  }
}

export function recallSessionCode(): string | null {
  if (!enabled) return null;
  try {
    return window.localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

/* ── Import / export ── */

export function exportEncounter(state: EncounterState): string {
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importEncounter(text: string): EncounterState {
  const parsed = JSON.parse(text) as { state?: unknown };
  const source = parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
  const { state } = parseEncounterState(source);
  return state;
}
