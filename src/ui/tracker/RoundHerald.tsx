/**
 * The round herald.
 *
 * A single struck banner when the round number changes. This is the strongest
 * motion in the application and it is spent on exactly one event, because a new
 * round is the only moment where the whole table's state moves at once —
 * durations tick, damage-over-time resolves, everyone's acted flag clears.
 *
 * Constraints it lives under:
 *   · It never blocks a pointer. The GM can keep working straight through it.
 *   · It never occludes the phase strip or the Order rail.
 *   · It is decorative only. The round is announced to assistive technology by
 *     the phase strip, which is live; this element is hidden from it entirely
 *     so nothing is read out twice.
 *   · Under reduced motion it does not render at all.
 */

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks";
import "./herald.css";

export function RoundHerald({ round }: { round: number }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const previous = useRef(round);

  useEffect(() => {
    if (round === previous.current) return;
    const advanced = round > previous.current;
    previous.current = round;
    // Only an advance is worth a herald. Undo and initiative reset move the
    // counter backwards, and celebrating that would be a lie about what
    // just happened.
    if (!advanced || reduced) return;

    setShown(round);
    const t = setTimeout(() => setShown(null), 1500);
    return () => clearTimeout(t);
  }, [round, reduced]);

  if (shown == null) return null;

  return (
    <div className="herald" aria-hidden="true">
      <div className="herald__rule" />
      <div className="herald__plate">
        <span className="herald__label">Round</span>
        <span className="herald__number tnum">{shown}</span>
      </div>
      <div className="herald__rule" />
    </div>
  );
}
