/**
 * Tupper dice notation.
 *
 * The bot accepts far more than `1d20+n`, and several of its features map
 * directly onto rules the tracker already models but has never expressed:
 *
 *   - Advantage and Disadvantage are existing status conditions. They are
 *     `2d20kh1` and `2d20kl1`, and until now the tracker emitted a flat d20
 *     regardless of whether a combatant had either.
 *   - Crit and fumble highlighting (`cs` / `cf`) costs nothing mathematically
 *     and makes a natural 20 or 1 obvious in the Discord message, which the
 *     session logs show mattering a great deal.
 *
 * Everything here builds strings only. No dice are ever rolled in the tracker —
 * the bot remains the single source of randomness, so nobody has to trust the
 * tool over the roll everyone watched happen.
 */

import type { Combatant } from "./types";

export type RollSwing = "normal" | "advantage" | "disadvantage";

/**
 * Advantage and Disadvantage cancel each other out, which is the near-universal
 * tabletop convention and means holding both is the same as holding neither.
 */
export function swingFor(c: Pick<Combatant, "statuses">): RollSwing {
  let adv = false;
  let dis = false;
  for (const s of c.statuses ?? []) {
    const name = s.name.trim().toLowerCase();
    if (name === "advantage") adv = true;
    if (name === "disadvantage") dis = true;
  }
  if (adv && dis) return "normal";
  if (adv) return "advantage";
  if (dis) return "disadvantage";
  return "normal";
}

export const SWING_LABEL: Record<RollSwing, string> = {
  normal: "",
  advantage: "ADV",
  disadvantage: "DIS",
};

/** The dice term for a d20 check under a given swing. */
export function d20Term(swing: RollSwing): string {
  if (swing === "advantage") return "2d20kh1";
  if (swing === "disadvantage") return "2d20kl1";
  return "1d20";
}

export interface D20Options {
  bonus?: number;
  swing?: RollSwing;
  /**
   * Append `cs` and `cf=1` so the bot highlights natural 20s and 1s.
   * Purely cosmetic — it changes no arithmetic.
   */
  flagCrits?: boolean;
}

/**
 * Build a complete d20 roll.
 *
 * Die modifiers attach to the dice term and arithmetic follows, which is the
 * order the notation expects: `2d20kh1cscf=1+4`.
 */
export function d20Roll({ bonus = 0, swing = "normal", flagCrits = false }: D20Options = {}): string {
  const parts = [d20Term(swing)];
  if (flagCrits) parts.push("cs", "cf=1");
  if (bonus > 0) parts.push(`+${bonus}`);
  else if (bonus < 0) parts.push(`${bonus}`);
  return `{{${parts.join("")}}}`;
}

/* ── Saving throws ── */

export interface CheckOptions {
  stat: string;
  dc: number;
  /** The checking combatant's effective modifier for that stat. */
  bonus?: number;
  swing?: RollSwing;
}

/**
 * A stat check against a difficulty, ready to paste.
 *
 * A quarter of the skill pool branches on one of these, and the branch is
 * always worth more than the number — "fail: DoT 3 for 3 phases, pass: DoT 1
 * for 1 phase" is two different rounds. Naming the stat and the DC beside the
 * roll is what stops the table having to look the skill back up mid-fight.
 *
 * The tracker still never rolls. It only writes the notation.
 */
export function checkRoll({ stat, dc, bonus = 0, swing = "normal" }: CheckOptions): string {
  const parts = [d20Term(swing)];
  if (bonus > 0) parts.push(`+${bonus}`);
  else if (bonus < 0) parts.push(`${bonus}`);
  return `${stat} check, DC ${dc} — {{${parts.join("")}}}`;
}

/**
 * A "throws it at nobody in particular" roll: one die, and a legend mapping
 * each face to a combatant. Taken from how the table already handles
 * indiscriminate attacks.
 */
export function scatterRoll(targets: string[]): string {
  if (!targets.length) return "";
  const faces = targets.length;
  const legend = targets.map((name, i) => `${i + 1}: ${name}`).join(". ");
  return `{{1d${faces}}} — ${legend}.`;
}

/* ── Free-form notation on a skill ── */

/**
 * Loose sanity check for author-supplied notation.
 *
 * Deliberately permissive: the bot's grammar is large and evolving, and a
 * rejected-but-valid string is worse than a passed-through odd one. This only
 * catches the mistakes that would obviously fail — empty input, stray braces,
 * or something with no dice term and no number in it at all.
 */
export function looksLikeDice(input: string): boolean {
  const s = input.trim();
  if (!s || s.length > 120) return false;
  // Notation never contains braces or whitespace — every documented form is
  // written compactly. Rejecting spaces is what keeps prose out.
  if (/[{}\s]/.test(s)) return false;
  // It must open with an actual dice term: NdM, d%, or dF.
  if (!/^\d*d(\d+|%|F)/i.test(s)) return false;
  return /^[0-9a-zA-Z+\-*/.<>=!%]+$/.test(s);
}

/** Wrap author-supplied notation for pasting, tolerating existing braces. */
export function wrapDice(input: string): string {
  const s = input.trim().replace(/^\{+|\}+$/g, "").trim();
  return s ? `{{${s}}}` : "";
}
