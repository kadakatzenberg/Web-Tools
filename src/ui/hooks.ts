/**
 * Cross-cutting UI hooks: accessibility plumbing, input handling, and
 * capability detection.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ── Media / capability ── */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function useIsCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/**
 * Rough device-capability tier, used to scale expensive effects down rather
 * than off. Conservative on purpose: a wrong guess should cost fidelity, never
 * usability.
 */
export function useQualityTier(): "high" | "low" {
  return useMemo(() => {
    if (typeof navigator === "undefined") return "high";
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
    const coarse =
      typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (cores <= 4 && (mem <= 4 || coarse)) return "low";
    return "high";
  }, []);
}

/** True while the document is visible; drives animation pausing. */
export function useIsVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/* ── Announcements ── */

let announcerNode: HTMLElement | null = null;

function ensureAnnouncer(): HTMLElement {
  if (announcerNode?.isConnected) return announcerNode;
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  el.className = "sr-only";
  document.body.appendChild(el);
  announcerNode = el;
  return el;
}

/**
 * Announce a combat state change to assistive technology.
 * Text is cleared first so repeated identical messages are still spoken.
 */
export function announce(message: string): void {
  if (typeof document === "undefined" || !message) return;
  const el = ensureAnnouncer();
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = message;
  }, 30);
}

/* ── Focus management ── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap focus inside a dialog and restore it to the opener on close.
 * Also wires Escape to `onClose`.
 */
export function useFocusTrap(
  active: boolean,
  onClose?: () => void,
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [active, onClose]);

  return ref;
}

/** Prevent background scroll while an overlay is open. */
export function useScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/** Close a non-modal surface on Escape, without trapping focus inside it. */
export function useEscapeKey(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

/* ── Keyboard ── */

export interface Hotkey {
  combo: string;
  handler: (e: KeyboardEvent) => void;
  /** Allow firing while a text field has focus. Defaults to false. */
  allowInInput?: boolean;
}

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}

function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
  );
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboOf(e);
      for (const hk of ref.current) {
        if (hk.combo !== combo) continue;
        if (!hk.allowInInput && isTextEntry(e.target)) continue;
        e.preventDefault();
        hk.handler(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/* ── Misc ── */

/** Debounce a rapidly-changing value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A latch that flips true for `ms` whenever `signal` changes. */
export function usePulse(signal: unknown, ms = 420): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [signal, ms]);
  return on;
}

/** Copy text with a graceful fallback for insecure contexts. */
export function useCopy(): (text: string) => Promise<boolean> {
  return useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);
}

/** Stable id for label/control association. */
let idSeq = 0;
export function useId(prefix = "hm"): string {
  return useMemo(() => `${prefix}-${++idSeq}`, [prefix]);
}
