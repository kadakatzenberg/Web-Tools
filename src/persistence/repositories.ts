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

/* ── entries: the character library ── */

/**
 * Normalise a character name for matching between the two tables.
 *
 * `combat_sheets.character_name` and `entries.name` are maintained by hand and
 * do not agree exactly. Case and spacing drift, and several library entries
 * carry a second identity after a slash — "Liam Wilkin/Yuma Hanami" is the same
 * character as the sheet's "Liam Wilkin".
 */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Every name a library entry can be found under: the whole name, plus each
 * side of a slashed dual identity.
 */
export function entryKeys(name: string): string[] {
  const keys = [nameKey(name)];
  if (name.includes("/")) {
    for (const part of name.split("/")) {
      const k = nameKey(part);
      if (k && !keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

/**
 * Character name → portrait URL, from the library.
 *
 * Best-effort by design. Portraits are decoration on an operational tool: if
 * this request fails, is blocked, or the table is unreadable, the tracker must
 * still open with everything else intact. Callers get an empty map and the rank
 * marks stand in.
 */
export async function fetchPortraits(signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const rows = await request<{ name?: unknown; portrait_url?: unknown }[]>({
      path: "entries?select=name,portrait_url&portrait_url=not.is.null",
      signal,
    });
    for (const row of rows ?? []) {
      if (typeof row?.name !== "string" || typeof row?.portrait_url !== "string") continue;
      const url = row.portrait_url.trim();
      if (!url) continue;
      for (const key of entryKeys(row.name)) {
        // First writer wins, so a full "A/B" name never displaces a dedicated
        // entry that already claimed one of its halves.
        if (!out.has(key)) out.set(key, url);
      }
    }
  } catch {
    /* Portraits are optional; the roster is not. */
  }
  return out;
}

/* ── combat_sheets ── */

export async function fetchSheets(signal?: AbortSignal): Promise<{
  sheets: CombatSheet[];
  skipped: number;
}> {
  const [rows, portraits] = await Promise.all([
    request<unknown[]>({
      path: "combat_sheets?approved=eq.true&order=character_name.asc,sheet_name.asc",
      signal,
    }),
    fetchPortraits(signal),
  ]);

  const parsed = parseSheets(rows ?? []);
  return {
    ...parsed,
    sheets: parsed.sheets.map((s) => {
      const url = portraits.get(nameKey(s.character_name));
      return url ? { ...s, portrait_url: url } : s;
    }),
  };
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
  const rows = await request<unknown[]>({ path: "combat_skills?select=*&order=id.asc", signal });
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
