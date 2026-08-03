/**
 * The complete set of encounter mutations, expressed as explicit commands.
 *
 * Every state change flows through one of these so that undo/redo, the combat
 * log, and persistence all observe the same stream. UI-only concerns (which
 * panel is open, which tab is active) deliberately live outside this union.
 */

import type {
  Ability,
  Combatant,
  DamageStat,
  DamageType,
  Dot,
  EncounterState,
  Position,
  Regen,
  StatusEffect,
  Stats,
  TempMod,
  TempShield,
} from "@/domain/types";

export type Command =
  /* roster */
  | { type: "COMBATANTS_ADDED"; combatants: Combatant[] }
  | { type: "COMBATANT_REMOVED"; id: string }
  | { type: "COMBATANT_RESTORED"; combatant: Combatant; index: number }
  | { type: "COMBATANT_DUPLICATED"; id: string }
  | { type: "COMBATANT_RENAMED"; id: string; name: string }
  | { type: "COMBATANT_MOVED"; id: string; direction: -1 | 1 }
  | { type: "COMBATANT_POSITION_SET"; id: string; position: Position }
  | { type: "COMBATANT_DONE_TOGGLED"; id: string; done?: boolean }
  | { type: "COMBATANT_STATS_SET"; id: string; stats: Stats }
  | { type: "COMBATANT_NOTES_SET"; id: string; notes: string }
  | { type: "COMBATANT_MAXHP_SET"; id: string; maxHp: number }
  | { type: "COMBATANT_PORTRAIT_SET"; id: string; portrait: string }
  /** Which stat this combatant swings with; unset returns to the automatic pick. */
  | { type: "COMBATANT_DAMAGE_STAT_SET"; id: string; damageStat?: DamageStat }
  /* health */
  | {
      type: "DAMAGE_APPLIED";
      ids: string[];
      amount: number;
      damageType: DamageType;
      /**
       * Who dealt it, for the log only. Damage typed into a card has no author
       * the tool can know about; damage resolved from the war table does, and a
       * log that reads "Kada hit Grunt" beats one that reads "Grunt took 6".
       */
      source?: string;
      /**
       * The attacker's id, for the mechanics. Separate from `source` because
       * that is a label — it may name the skill as well as the caster — while
       * this has to resolve to a combatant so the skills that accrue on landing
       * a blow can find their owner.
       */
      sourceId?: string;
    }
  | {
      type: "HEAL_APPLIED";
      ids: string[];
      amount: number;
      /** Convert the overflow into a temporary shield. */
      overheal?: boolean;
      /** Bound that conversion, for the skills that cap it. */
      wardCap?: number;
      /** Who healed it, for the log only. */
      source?: string;
    }
  /**
   * A recorded miss. Changes nothing — the cost of a missed action is spent by
   * the commands beside it — but a combat log with the misses cut out is not a
   * record of the fight.
   */
  | { type: "ACTION_MISSED"; actorId: string; targetId: string; label?: string }
  | { type: "FULL_HEAL_APPLIED"; ids: string[] }
  /* shields */
  | { type: "SHIELD_ADJUSTED"; id: string; delta: number }
  | { type: "TEMP_SHIELD_ADDED"; id: string; shield: TempShield }
  | { type: "TEMP_SHIELD_REMOVED"; id: string; shieldId: string }
  /* conditions */
  | { type: "STATUS_ADDED"; id: string; status: StatusEffect }
  | { type: "STATUS_ADDED_MANY"; ids: string[]; status: Omit<StatusEffect, "id"> }
  | { type: "DOT_ADDED_MANY"; ids: string[]; dot: Omit<Dot, "id"> }
  | { type: "STATUS_REMOVED"; id: string; statusId: string }
  | { type: "DOT_ADDED"; id: string; dot: Dot }
  | { type: "DOT_REMOVED"; id: string; dotId: string }
  | { type: "REGEN_ADDED"; id: string; regen: Regen }
  | { type: "REGEN_REMOVED"; id: string; regenId: string }
  | { type: "TEMP_MOD_ADDED"; id: string; mod: TempMod }
  | { type: "TEMP_MOD_REMOVED"; id: string; modId: string }
  /* stacks inflicted on a combatant */
  | { type: "STACK_ADJUSTED"; id: string; name: string; delta: number; max?: number; perStackDamage?: number }
  | { type: "STACK_CLEARED"; id: string; stackId: string }
  /* redirection */
  | { type: "REDIRECT_SET"; id: string; toId: string; duration: number }
  | { type: "REDIRECT_CLEARED"; id: string }
  /* abilities */
  | { type: "ABILITY_ADDED"; id: string; ability: Ability }
  | { type: "ABILITY_UPDATED"; id: string; ability: Ability }
  | { type: "ABILITY_REMOVED"; id: string; abilityId: string }
  | {
      type: "ABILITY_USED";
      id: string;
      abilityId: string;
      patch: Partial<Ability>;
      marksDone: boolean;
    }
  /* flow */
  | { type: "PHASE_ADVANCED" }
  | { type: "INITIATIVE_LOCKED"; enemyFirst: boolean }
  | { type: "INITIATIVE_RESET" }
  /* wholesale */
  | { type: "ENCOUNTER_LOADED"; state: EncounterState }
  | { type: "ENCOUNTER_CLEARED" };

/** Commands that must not create an undo entry. */
export const NON_UNDOABLE: ReadonlySet<Command["type"]> = new Set([
  "ENCOUNTER_LOADED",
  // Nothing to put back, so an undo entry for it would only ever be a wasted
  // press between the user and the change they actually meant to reverse.
  "ACTION_MISSED",
]);

/** Human-readable label for the undo affordance. */
export function commandLabel(cmd: Command): string {
  switch (cmd.type) {
    case "COMBATANTS_ADDED":
      return cmd.combatants.length === 1
        ? `add ${cmd.combatants[0]!.name}`
        : `add ${cmd.combatants.length} combatants`;
    case "COMBATANT_REMOVED":
      return "remove combatant";
    case "COMBATANT_RESTORED":
      return "restore combatant";
    case "COMBATANT_DUPLICATED":
      return "duplicate combatant";
    case "COMBATANT_RENAMED":
      return "rename";
    case "COMBATANT_MOVED":
      return "reorder";
    case "COMBATANT_POSITION_SET":
      return `move to ${cmd.position}`;
    case "COMBATANT_DONE_TOGGLED":
      return "toggle done";
    case "COMBATANT_STATS_SET":
      return "edit stats";
    case "COMBATANT_NOTES_SET":
      return "edit notes";
    case "COMBATANT_MAXHP_SET":
      return "edit max HP";
    case "COMBATANT_PORTRAIT_SET":
      return cmd.portrait ? "set portrait" : "remove portrait";
    case "COMBATANT_DAMAGE_STAT_SET":
      return cmd.damageStat ? `swing with ${cmd.damageStat}` : "swing automatically";
    case "DAMAGE_APPLIED":
      return `${cmd.amount} ${cmd.damageType} damage`;
    case "HEAL_APPLIED":
      return `heal ${cmd.amount}`;
    case "ACTION_MISSED":
      return "record a miss";
    case "STACK_ADJUSTED":
      return cmd.delta >= 0 ? `add ${cmd.name} stack` : `remove ${cmd.name} stack`;
    case "STACK_CLEARED":
      return "clear stacks";
    case "REDIRECT_SET":
      return "redirect attacks";
    case "REDIRECT_CLEARED":
      return "clear redirect";
    case "FULL_HEAL_APPLIED":
      return "full heal";
    case "SHIELD_ADJUSTED":
      return "adjust shield";
    case "TEMP_SHIELD_ADDED":
      return "add temp shield";
    case "TEMP_SHIELD_REMOVED":
      return "remove temp shield";
    case "STATUS_ADDED":
      return `add ${cmd.status.name}`;
    case "STATUS_ADDED_MANY":
      return `${cmd.status.name} on ${cmd.ids.length}`;
    case "DOT_ADDED_MANY":
      return `${cmd.dot.name} on ${cmd.ids.length}`;
    case "STATUS_REMOVED":
      return "remove status";
    case "DOT_ADDED":
      return "add DoT";
    case "DOT_REMOVED":
      return "remove DoT";
    case "REGEN_ADDED":
      return "add regen";
    case "REGEN_REMOVED":
      return "remove regen";
    case "TEMP_MOD_ADDED":
      return "add modifier";
    case "TEMP_MOD_REMOVED":
      return "remove modifier";
    case "ABILITY_ADDED":
      return "add ability";
    case "ABILITY_UPDATED":
      return "edit ability";
    case "ABILITY_REMOVED":
      return "remove ability";
    case "ABILITY_USED":
      return "use ability";
    case "PHASE_ADVANCED":
      return "advance phase";
    case "INITIATIVE_LOCKED":
      return "lock initiative";
    case "INITIATIVE_RESET":
      return "reset initiative";
    case "ENCOUNTER_LOADED":
      return "load session";
    case "ENCOUNTER_CLEARED":
      return "clear encounter";
  }
}
