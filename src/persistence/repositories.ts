/**
 * Typed repositories for the three Supabase tables the app uses.
 *
 * Table shapes are unchanged from v1 — no migration is required to run this
 * build against the existing database. Every read is validated and repaired by
 * `@/domain/schema` before it reaches the UI.
 */

import type { CombatSheet, CombatSkillRow, EncounterState } from "@/domain/types";
import { parseEncounterState, parseSheets, parseSkillRows } from "@/domain/schema";
import { request } from "./supabase";

/* ── combat_sheets ── */

export async function fetchSheets(signal?: AbortSignal): Promise<{
  sheets: CombatSheet[];
  skipped: number;
}> {
  const rows = await request<unknown[]>({
    path: "combat_sheets?approved=eq.true&order=character_name.asc,sheet_name.asc",
    signal,
  });
  return parseSheets(rows ?? []);
}

export interface SheetPayload {
  character_name: string;
  sheet_name: string;
  name: string;
  player: string;
  role: string;
  type: string;
  max_hp: number;
  stats: Record<string, number>;
  skills: unknown;
  notes: string;
  /** Legacy column retained for insert compatibility; see docs/SECURITY.md. */
  password?: string;
  approved: boolean;
  updated_at: string;
}

export async function createSheet(id: string, payload: SheetPayload): Promise<void> {
  await request({
    method: "POST",
    path: "combat_sheets",
    body: { ...payload, id },
    prefer: "return=minimal",
    retries: 1,
  });
}

export async function updateSheet(id: string, payload: SheetPayload): Promise<void> {
  await request({
    method: "PATCH",
    path: `combat_sheets?id=eq.${encodeURIComponent(id)}`,
    body: payload,
    prefer: "return=minimal",
    retries: 1,
  });
}

/* ── combat_skills ── */

export async function fetchSkills(signal?: AbortSignal): Promise<CombatSkillRow[]> {
  const rows = await request<unknown[]>({ path: "combat_skills?order=id.asc", signal });
  return parseSkillRows(rows ?? []) as CombatSkillRow[];
}

/* ── combat_sessions ── */

export async function createSession(
  code: string,
  state: EncounterState,
): Promise<void> {
  await request({
    method: "POST",
    path: "combat_sessions",
    body: { code, state, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
    retries: 1,
  });
}

export async function saveSession(
  code: string,
  state: EncounterState,
  signal?: AbortSignal,
): Promise<void> {
  await request({
    method: "PATCH",
    path: `combat_sessions?code=eq.${encodeURIComponent(code)}`,
    body: { state, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
    signal,
    retries: 1,
  });
}

export async function loadSession(code: string): Promise<{
  state: EncounterState;
  repaired: boolean;
} | null> {
  const rows = await request<{ state?: unknown }[]>({
    path: `combat_sessions?code=eq.${encodeURIComponent(code)}`,
  });
  const row = rows?.[0];
  if (!row) return null;
  return parseEncounterState(row.state);
}
