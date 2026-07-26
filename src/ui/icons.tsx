/**
 * The mark set.
 *
 * Drawn here rather than pulled from an icon library on purpose. A general
 * library gives you a rounded-stroke house style that belongs to no particular
 * product; these are cut from the same motifs as the rest of the interface —
 * brush strokes, blade edges, seal geometry, moon phases, cat-eye curves — so
 * the marks read as part of Hei Mao instead of decoration bolted onto it.
 *
 * Rules for anything added here:
 *   · 16×16 viewBox, drawn on the pixel grid.
 *   · `currentColor` only, so a mark inherits the meaning of its context.
 *   · Strokes at 1.5 with butt caps and mitre joins — cut, not rounded.
 *   · Marks are decorative by default (`aria-hidden`); the control that owns
 *     one carries the accessible name. Pass a `title` only for the rare mark
 *     that is the sole carrier of meaning.
 */

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Accessible name. Omit whenever the surrounding control is already labelled. */
  title?: string;
  size?: number;
}

function Mark({ title, size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* ── Combat ── */

/** A drawn blade. Damage. */
export const IconStrike = (p: IconProps) => (
  <Mark {...p}>
    <path d="M13.5 2.5 6 10l-1.5-1.5L12 1z" fill="currentColor" stroke="none" />
    <path d="M5.5 9.5 3 12l1 1 2.5-2.5" />
    <path d="m2 14 1.2-1.2" />
  </Mark>
);

/** A closed leaf over a stem. Healing. */
export const IconMend = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 14V7" />
    <path d="M8 7c0-3 2.2-5.2 5.5-5.5C13.8 4.8 11.4 7 8 7z" fill="currentColor" stroke="none" />
    <path d="M8 9.5C8 7.8 6.4 6.4 4 6.2 4.2 8.4 5.9 9.7 8 9.5z" fill="currentColor" stroke="none" />
  </Mark>
);

/** A layered ward plate. Shields. */
export const IconWard = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 1.6 13.2 3.4v4.3c0 3.2-2.1 5.6-5.2 6.7-3.1-1.1-5.2-3.5-5.2-6.7V3.4z" />
    <path d="M8 5v5" />
  </Mark>
);

/** A skull-less defeat mark: a broken ring. Unconscious or dead. */
export const IconDown = (p: IconProps) => (
  <Mark {...p}>
    <path d="M13 5.2a6 6 0 1 1-2.2-2.2" />
    <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
  </Mark>
);

/* ── Rank ── */

/** Player standing: an upward chevron pair. */
export const IconPlayer = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 9.5 8 4l5 5.5" />
    <path d="M3 13 8 7.5l5 5.5" opacity={0.45} />
  </Mark>
);

/** Standard enemy: a filled node. */
export const IconEnemy = (p: IconProps) => (
  <Mark {...p}>
    <circle cx="8" cy="8" r="3.4" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="6" opacity={0.4} />
  </Mark>
);

/** Elite: a faceted lozenge. */
export const IconElite = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 1.8 14.2 8 8 14.2 1.8 8z" />
    <path d="M8 5 11 8l-3 3-3-3z" fill="currentColor" stroke="none" />
  </Mark>
);

/** Boss: a sealed lozenge inside a ring. */
export const IconBoss = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 0.9 15.1 8 8 15.1 0.9 8z" opacity={0.5} />
    <path d="M8 3.4 12.6 8 8 12.6 3.4 8z" />
    <circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none" />
  </Mark>
);

/* ── Status ── */

/** Bound: a knotted cord. */
export const IconBound = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 4h10M3 12h10" />
    <path d="M5.5 4c0 2.7 5 5.3 5 8M10.5 4c0 2.7-5 5.3-5 8" />
  </Mark>
);

/** Prone: a figure laid flat under a ground rule. */
export const IconProne = (p: IconProps) => (
  <Mark {...p}>
    <path d="M2 12.5h12" />
    <path d="M3.5 9.5h7" />
    <circle cx="12.2" cy="9.5" r="1.6" fill="currentColor" stroke="none" />
  </Mark>
);

/** Stunned: struck sparks. */
export const IconStunned = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8.8 1.5 4.5 8.2h3.2L7 14.5l4.4-6.9H8.2z" fill="currentColor" stroke="none" />
  </Mark>
);

/** Sleep: a closed cat eye. */
export const IconSleep = (p: IconProps) => (
  <Mark {...p}>
    <path d="M1.8 8c2-2.8 4.1-4.2 6.2-4.2S12.2 5.2 14.2 8" opacity={0.45} />
    <path d="M2.6 8c1.9 2.4 3.7 3.6 5.4 3.6S11.5 10.4 13.4 8" />
    <path d="M5 10.6 4 12.4M8 11.6V13.6M11 10.6l1 1.8" />
  </Mark>
);

/** Silence: a struck-through wave. */
export const IconSilence = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 6.2v3.6h2.4L8.6 12V4L5.4 6.2z" fill="currentColor" stroke="none" />
    <path d="m10.6 6 3.2 4M13.8 6l-3.2 4" />
  </Mark>
);

/** Burn: a flame. */
export const IconBurn = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 14.4c2.5 0 4.2-1.7 4.2-4 0-3-2.6-4.3-3.1-8.8-2 1.6-2.7 3.4-2.7 5 0 .9-.5 1.3-1 1.3-.7 0-1.1-.6-1.2-1.6-.9 1.2-1.4 2.5-1.4 4 0 2.4 1.8 4.1 5.2 4.1z" />
  </Mark>
);

/** Advantage: two dice kept high. */
export const IconAdvantage = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 1.5 14 12H2z" />
    <path d="M5.6 9.5h4.8" opacity={0.5} />
  </Mark>
);

/** Disadvantage: the same form inverted. */
export const IconDisadvantage = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 14.5 2 4h12z" />
    <path d="M5.6 6.5h4.8" opacity={0.5} />
  </Mark>
);

/* ── Flow ── */

/** Advance: a brush stroke arrow. */
export const IconAdvance = (p: IconProps) => (
  <Mark {...p}>
    <path d="M2 8h11" />
    <path d="M9.5 4.2 13.6 8l-4.1 3.8" />
  </Mark>
);

/** Undo: a reversed ink loop. */
export const IconUndo = (p: IconProps) => (
  <Mark {...p}>
    <path d="M2.6 7.4h7.2a3.6 3.6 0 0 1 0 7.2H6" />
    <path d="M5.6 4 2.4 7.4l3.2 3.2" />
  </Mark>
);

/** Redo: the loop mirrored. */
export const IconRedo = (p: IconProps) => (
  <Mark {...p}>
    <path d="M13.4 7.4H6.2a3.6 3.6 0 0 0 0 7.2H10" />
    <path d="M10.4 4l3.2 3.4-3.2 3.2" />
  </Mark>
);

/** Round: a moon ring, a full cycle. */
export const IconRound = (p: IconProps) => (
  <Mark {...p}>
    <circle cx="8" cy="8" r="6" opacity={0.4} />
    <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
  </Mark>
);

/* ── Interface ── */

export const IconSearch = (p: IconProps) => (
  <Mark {...p}>
    <circle cx="7" cy="7" r="4.6" />
    <path d="m10.6 10.6 3.2 3.2" />
  </Mark>
);

export const IconLog = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 2.2h10v11.6H3z" />
    <path d="M5.4 5.4h5.2M5.4 8h5.2M5.4 10.6h3" />
  </Mark>
);

export const IconSound = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 6.2v3.6h2.4L8.6 12V4L5.4 6.2z" fill="currentColor" stroke="none" />
    <path d="M10.8 5.8a3 3 0 0 1 0 4.4" />
    <path d="M12.6 4a5.4 5.4 0 0 1 0 8" opacity={0.5} />
  </Mark>
);

export const IconMuted = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 6.2v3.6h2.4L8.6 12V4L5.4 6.2z" fill="currentColor" stroke="none" />
    <path d="m10.8 6.2 3.4 3.6M14.2 6.2l-3.4 3.6" />
  </Mark>
);

export const IconClose = (p: IconProps) => (
  <Mark {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Mark>
);

export const IconPlus = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 3v10M3 8h10" />
  </Mark>
);

export const IconMinus = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3 8h10" />
  </Mark>
);

export const IconUp = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3.4 10 8 5.4 12.6 10" />
  </Mark>
);

export const IconDown2 = (p: IconProps) => (
  <Mark {...p}>
    <path d="M3.4 6 8 10.6 12.6 6" />
  </Mark>
);

export const IconDuplicate = (p: IconProps) => (
  <Mark {...p}>
    <path d="M5.6 5.6h8v8h-8z" />
    <path d="M10.4 3.2H2.4v8" opacity={0.55} />
  </Mark>
);

export const IconCheck = (p: IconProps) => (
  <Mark {...p}>
    <path d="m3 8.4 3.4 3.4L13 4.6" />
  </Mark>
);

export const IconCopy = (p: IconProps) => (
  <Mark {...p}>
    <path d="M5.6 5.6h8v8h-8z" />
    <path d="M10.4 3.2H2.4v8" opacity={0.55} />
  </Mark>
);

export const IconTarget = (p: IconProps) => (
  <Mark {...p}>
    <circle cx="8" cy="8" r="5.8" opacity={0.45} />
    <circle cx="8" cy="8" r="2.6" />
    <path d="M8 0.8v2.4M8 12.8v2.4M0.8 8h2.4M12.8 8h2.4" />
  </Mark>
);

export const IconDice = (p: IconProps) => (
  <Mark {...p}>
    <path d="M8 1.4 14.2 5v6L8 14.6 1.8 11V5z" />
    <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
  </Mark>
);

/* ── Status registry ──────────────────────────────────────────────────────
 * Maps a condition name to its mark and polarity. Anything unlisted falls
 * back to a neutral mark, so a custom condition is never left without one.
 */

export type StatusPolarity = "harmful" | "helpful" | "neutral";

interface StatusMark {
  Icon: (p: IconProps) => JSX.Element;
  polarity: StatusPolarity;
}

const STATUS_MARKS: Record<string, StatusMark> = {
  bound: { Icon: IconBound, polarity: "harmful" },
  prone: { Icon: IconProne, polarity: "harmful" },
  stunned: { Icon: IconStunned, polarity: "harmful" },
  stun: { Icon: IconStunned, polarity: "harmful" },
  sleep: { Icon: IconSleep, polarity: "harmful" },
  asleep: { Icon: IconSleep, polarity: "harmful" },
  silenced: { Icon: IconSilence, polarity: "harmful" },
  silence: { Icon: IconSilence, polarity: "harmful" },
  burning: { Icon: IconBurn, polarity: "harmful" },
  burn: { Icon: IconBurn, polarity: "harmful" },
  blinded: { Icon: IconSleep, polarity: "harmful" },
  advantage: { Icon: IconAdvantage, polarity: "helpful" },
  disadvantage: { Icon: IconDisadvantage, polarity: "harmful" },
  shielded: { Icon: IconWard, polarity: "helpful" },
  regenerating: { Icon: IconMend, polarity: "helpful" },
};

const NEUTRAL: StatusMark = { Icon: IconTarget, polarity: "neutral" };

export function statusMark(name: string): StatusMark {
  return STATUS_MARKS[name.trim().toLowerCase()] ?? NEUTRAL;
}

/** The mark for a combatant's standing. */
export function rankMark(role: string, type: string | undefined, down: boolean) {
  if (down) return IconDown;
  if (role === "Player") return IconPlayer;
  if (type === "Boss") return IconBoss;
  if (type === "Elite") return IconElite;
  return IconEnemy;
}
