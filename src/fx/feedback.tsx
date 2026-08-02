/**
 * Combat impact feedback: floating numbers, panel impulse, and hitstop.
 *
 * The rule this layer obeys: feedback is transient and never occludes the
 * value it describes. Numbers rise *beside* the health readout, the readout
 * itself is never covered, and every effect self-cleans on a timer so nothing
 * accumulates across a long fight.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrefersReducedMotion } from "@/ui/hooks";
import "./feedback.css";

export type FeedbackKind =
  | "physical"
  | "magical"
  | "true"
  | "heal"
  | "shield"
  | "shieldBreak"
  | "resist";

export interface FloatingMark {
  id: number;
  targetId: string;
  text: string;
  kind: FeedbackKind;
}

interface FeedbackApi {
  /** Emit a floating mark anchored to a combatant. */
  mark: (targetId: string, text: string, kind: FeedbackKind) => void;
  /** Brief global time-stop for weighty hits. */
  hitstop: (ms?: number) => void;
  marksFor: (targetId: string) => FloatingMark[];
}

const Ctx = createContext<FeedbackApi | null>(null);

let seq = 0;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [marks, setMarks] = useState<FloatingMark[]>([]);
  const reduced = usePrefersReducedMotion();
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mark = useCallback<FeedbackApi["mark"]>((targetId, text, kind) => {
    const id = ++seq;
    setMarks((m) => [...m, { id, targetId, text, kind }].slice(-24));
    setTimeout(() => setMarks((m) => m.filter((x) => x.id !== id)), 1100);
  }, []);

  const hitstop = useCallback(
    (ms = 55) => {
      if (reduced) return;
      const root = document.documentElement;
      root.dataset.hitstop = "1";
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => {
        delete root.dataset.hitstop;
      }, ms);
    },
    [reduced],
  );

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      delete document.documentElement.dataset.hitstop;
    },
    [],
  );

  const marksFor = useCallback(
    (targetId: string) => marks.filter((m) => m.targetId === targetId),
    [marks],
  );

  const api = useMemo(() => ({ mark, hitstop, marksFor }), [mark, hitstop, marksFor]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFeedback(): FeedbackApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return v;
}

/**
 * Renders the floating marks currently anchored to one combatant.
 *
 * `as` exists for one reason: the war table's tokens are buttons, and a button
 * may only contain phrasing content. Rendering a div inside one produces markup
 * browsers silently re-parent, which moves the marks somewhere else entirely.
 */
export function FloatingMarks({
  targetId,
  as: Tag = "div",
}: {
  targetId: string;
  as?: "div" | "span";
}) {
  const { marksFor } = useFeedback();
  const marks = marksFor(targetId);
  if (!marks.length) return null;
  return (
    <Tag className="floats" aria-hidden="true">
      {marks.map((m, i) => (
        <span
          key={m.id}
          className={`float float--${m.kind}`}
          style={{ ["--i" as string]: String(i) }}
        >
          {m.text}
        </span>
      ))}
    </Tag>
  );
}

/**
 * Adds an impact class to an element for one animation cycle whenever `signal`
 * changes to a new non-null value.
 */
export function useImpact<T extends HTMLElement>(
  signal: unknown,
  className = "is-impact",
  ms = 420,
) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.classList.remove(className);
    // Force a reflow so the animation restarts on repeated hits.
    void el.offsetWidth;
    el.classList.add(className);
    const t = setTimeout(() => el.classList.remove(className), ms);
    return () => clearTimeout(t);
  }, [signal, className, ms]);
  return ref;
}
