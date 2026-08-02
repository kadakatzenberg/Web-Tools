/**
 * Resolving one action from one combatant onto another.
 *
 * The division of labour here is the whole point. Dice are rolled in Discord,
 * by the people at the table, exactly as they always have been. This module
 * never rolls anything. What it does is everything either side of the roll:
 * work out the damage a hit is worth from the attacker's own stats, push it
 * through resistance and shields, and say what actually landed.
 *
 * So the table's job shrinks to one word. Hit, or miss.
 *
 * A skill that carries its own dice notation is the exception: there the number
 * genuinely comes off a die, so the tool asks for it instead of inventing one.
 */

import type { Ability, Combatant, DamageType } from "./types";
import { applyDamage, deriveStats, type DamageResult } from "./rules";

/** What a combatant can do to another on the table. */
export type ActionKind = "attack" | "skill";

/**
 * Which of a combatant's two damage stats an action uses.
 *
 * Hei Mao derives damage rather than rolling it: physical is 2 + STR, magical
 * is 2 + INT. A basic attack takes whichever of the two is better, because that
 * is what anyone would do, and says which so the choice is never hidden.
 */
export type DamageStat = "physical" | "magical";

export interface ActionPlan {
  actor: Combatant;
  target: Combatant;
  kind: ActionKind;
  /** Present when the action is a skill rather than a basic attack. */
  ability?: Ability;
  /** Overrides the automatic pick. */
  forceStat?: DamageStat;
}

export interface ActionPreview {
  /** The stat this action is paid out of. */
  stat: DamageStat;
  /** Damage before the target's resistance. */
  amount: number;
  /** How that number was arrived at, for the readout. */
  source: string;
  /** The damage type sent into the pipeline. */
  damageType: DamageType;
  /** Whether the number has to come off a die instead. */
  needsRoll: boolean;
  /** The notation to paste, when a roll is needed. */
  diceNotation?: string;
  /** Full outcome against this target, when the amount is already known. */
  result?: DamageResult;
  /** The saving throw this action forces, if any. */
  check?: { stat: string; dc: number };
}

/** Damage a combatant deals with each stat, modifiers included. */
export function damageWith(c: Combatant, stat: DamageStat): number {
  const d = deriveStats(c.stats, c.tempMods);
  return stat === "magical" ? d.magicalDamage : d.physicalDamage;
}

/** Which stat this combatant hits harder with. Ties go to physical. */
export function betterStat(c: Combatant): DamageStat {
  return damageWith(c, "magical") > damageWith(c, "physical") ? "magical" : "physical";
}

/**
 * What would happen if this action connected.
 *
 * Pure and side-effect free, so the same call drives the preview the table
 * reads and the numbers that get committed. Nothing can drift between what was
 * shown and what was applied.
 */
export function previewAction(plan: ActionPlan): ActionPreview {
  const { actor, target, ability, forceStat } = plan;

  const stat = forceStat ?? betterStat(actor);
  const damageType: DamageType = stat === "magical" ? "magical" : "physical";

  const check =
    ability?.dcStat && ability.dcValue
      ? { stat: ability.dcStat, dc: ability.dcValue }
      : undefined;

  // A skill with its own notation is rolled at the table, not derived here.
  const dice = ability?.dice?.trim();
  if (dice) {
    return {
      stat,
      amount: 0,
      source: `${ability!.name} rolls ${dice}`,
      damageType,
      needsRoll: true,
      diceNotation: dice,
      check,
    };
  }

  const amount = damageWith(actor, stat);
  return {
    stat,
    amount,
    source: statSource(actor, stat),
    damageType,
    needsRoll: false,
    result: applyDamage(target, amount, damageType),
    check,
  };
}

/**
 * The same preview with a rolled number substituted in, for skills that carry
 * dice. Kept separate so the caller cannot forget to re-run the pipeline after
 * the table reports what it rolled.
 */
export function withRolled(
  plan: ActionPlan,
  preview: ActionPreview,
  rolled: number,
): ActionPreview {
  const amount = Math.max(0, Math.trunc(rolled) || 0);
  return {
    ...preview,
    amount,
    result: applyDamage(plan.target, amount, preview.damageType),
  };
}

/**
 * What a combatant mends for.
 *
 * Healing in Hei Mao comes off the same well as spell damage, so it is derived
 * the same way and shown the same way. The figure is stated in the readout
 * rather than assumed, because a skill that heals for something else is edited
 * on the card, where the exception belongs.
 */
export function mendAmount(c: Combatant): number {
  return damageWith(c, "magical");
}

/** How a derived figure was arrived at, for the readout. */
export function statSource(c: Combatant, stat: DamageStat): string {
  return stat === "magical" ? `2 + INT ${c.stats.INT ?? 0}` : `2 + STR ${c.stats.STR ?? 0}`;
}

/** Whether an action from this combatant onto that one is legal. */
export function canTarget(actor: Combatant, target: Combatant): boolean {
  if (actor.id === target.id) return false;
  // The unconscious are out of the fight rather than off the table; hitting
  // them again is almost always a misclick.
  return target.hp > 0;
}
