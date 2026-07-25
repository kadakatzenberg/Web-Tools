/**
 * Session lifecycle: start, resume, debounced autosave, and explicit status.
 *
 * v1 swallowed every save failure (`catch(e){}`), so a GM could lose an entire
 * fight without ever seeing a warning. Here every outcome is surfaced through
 * `status`, and the local mirror is written unconditionally so state survives
 * even when the network does not.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EncounterState } from "@/domain/types";
import { createSession, loadSession, saveSession } from "./repositories";
import { isOffline, SupabaseError } from "./supabase";
import {
  clearBackup,
  recallSessionCode,
  rememberSessionCode,
  writeBackup,
} from "./localBackup";

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error";

const SAVE_DEBOUNCE_MS = 2000;

function newCode(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

export interface SessionApi {
  code: string | null;
  status: SaveStatus;
  message: string;
  lastSavedAt: number | null;
  start: () => Promise<void>;
  resume: (code: string) => Promise<EncounterState | null>;
  leave: () => void;
  saveNow: () => Promise<void>;
}

export function useSession(
  state: EncounterState,
  revision: number,
  onLoaded: (state: EncounterState) => void,
): SessionApi {
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const codeRef = useRef<string | null>(null);
  codeRef.current = code;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<AbortController | null>(null);
  /** Suppresses the autosave that would otherwise fire right after a load. */
  const skipNextRef = useRef(false);
  const lastRevisionRef = useRef(revision);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage((m) => (m === msg ? "" : m)), 3500);
  }, []);

  const persist = useCallback(async () => {
    const c = codeRef.current;
    if (!c) return;
    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;
    setStatus("saving");
    try {
      await saveSession(c, stateRef.current, controller.signal);
      if (controller.signal.aborted) return;
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (e) {
      if (controller.signal.aborted) return;
      if (isOffline(e)) {
        setStatus("offline");
        setMessage("Offline — kept locally, will retry on the next change.");
      } else {
        setStatus("error");
        setMessage(
          e instanceof SupabaseError ? `Save failed: ${e.message}` : "Save failed.",
        );
      }
    }
  }, []);

  // Mirror locally on every revision, regardless of network state.
  useEffect(() => {
    writeBackup(state, codeRef.current);
  }, [state, revision]);

  // Debounced remote save.
  useEffect(() => {
    if (!code) return;
    if (revision === lastRevisionRef.current) return;
    lastRevisionRef.current = revision;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [revision, code, persist]);

  // Flush any pending save when the tab is hidden or closed.
  useEffect(() => {
    if (!code) return;
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void persist();
      }
      writeBackup(stateRef.current, codeRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [code, persist]);

  const start = useCallback(async () => {
    const c = newCode();
    setStatus("saving");
    try {
      await createSession(c, stateRef.current);
      skipNextRef.current = true;
      setCode(c);
      rememberSessionCode(c);
      setStatus("saved");
      setLastSavedAt(Date.now());
      flash(`Session ${c} started`);
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof SupabaseError ? `Could not start: ${e.message}` : "Could not start session.",
      );
    }
  }, [flash]);

  const resume = useCallback(
    async (input: string) => {
      const c = (input || "").trim().toUpperCase();
      if (!c) return null;
      setStatus("saving");
      try {
        const found = await loadSession(c);
        if (!found) {
          setStatus("error");
          setMessage(`No session found for ${c}`);
          return null;
        }
        skipNextRef.current = true;
        lastRevisionRef.current = revision;
        setCode(c);
        rememberSessionCode(c);
        onLoaded(found.state);
        setStatus("saved");
        setLastSavedAt(Date.now());
        flash(
          found.repaired
            ? `Session ${c} resumed — some damaged records were repaired`
            : `Session ${c} resumed`,
        );
        return found.state;
      } catch (e) {
        setStatus(isOffline(e) ? "offline" : "error");
        setMessage(
          e instanceof SupabaseError ? `Could not resume: ${e.message}` : "Could not resume.",
        );
        return null;
      }
    },
    [flash, onLoaded, revision],
  );

  const leave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    inflightRef.current?.abort();
    setCode(null);
    setStatus("idle");
    rememberSessionCode(null);
    clearBackup();
  }, []);

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await persist();
  }, [persist]);

  return { code, status, message, lastSavedAt, start, resume, leave, saveNow };
}

export { recallSessionCode };
