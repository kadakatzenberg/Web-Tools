/**
 * The encounter reducer.
 *
 * Pure: `(EncounterState, Command) -> { state, log }`. All combat maths is
 * delegated to `@/domain/rules`; this layer only routes commands and keeps the
 * roster consistent.
 */

import type { Combatant, EncounterState } from "@/domain/types";
import { applyDamage, applyHealing, clamp } from "@/domain/rules";
import { advancePhase, lockInitiative, resetInitiative } from "@/domain/phase";
import { duplicateCombatant, gid } from "@/domain/factory";
import type { Command } from "./actions";

export interface LogEntry {
  id: string;
  at: number;
  round: number;
  phase: number;
  text: string;
  kind: "damage" | "heal" | "status" | "flow" | "roster" | "ability" | "shield";
  combatantIds: string[];
}

export interface ReduceResult {
  state: EncounterState;
  log: LogEntry[];
}

let logSeq = 0;
function entry(
  state: EncounterState,
  kind: LogEntry["kind"],
  text: string,
  combatantIds: string[] = [],
): LogEntry {
  return {
    id: `l${++logSeq}`,
    at: Date.now(),
    round: state.round,
    phase: state.phase,
    text,
    kind,
    combatantIds,
  };
}

/** Replace one combatant by id, leaving the array identity intact when absent. */
function mapOne(
  state: EncounterState,
  id: string,
  fn: (c: Combatant) => Combatant,
): Combatant[] {
  let touched = false;
  const next = state.combatants.map((c) => {
    if (c.id !== id) return c;
    touched = true;
    return fn(c);
  });
  return touched ? next : state.combatants;
}

function nameOf(state: EncounterState, id: string): string {
  return state.combatants.find((c) => c.id === id)?.name ?? "combatant";
}

export function reduce(state: EncounterState, cmd: Command): ReduceResult {
  switch (cmd.type) {
    /* ── roster ── */

    case "COMBATANTS_ADDED": {
      if (!cmd.combatants.length) return { state, log: [] };
      const text =
        cmd.combatants.length === 1
          ? `${cmd.combatants[0]!.name} joined the encounter`
          : `${cmd.combatants.length} combatants joined the encounter`;
      return {
        state: { ...state, combatants: [...state.combatants, ...cmd.combatants] },
        log: [entry(state, "roster", text, cmd.combatants.map((c) => c.id))],
      };
    }

    case "COMBATANT_REMOVED": {
      const name = nameOf(state, cmd.id);
      return {
        state: { ...state, combatants: state.combatants.filter((c) => c.id !== cmd.id) },
        log: [entry(state, "roster", `${name} left the encounter`, [cmd.id])],
      };
    }

    case "COMBATANT_RESTORED": {
      const next = state.combatants.slice();
      next.splice(clamp(cmd.index, 0, next.length), 0, cmd.combatant);
      return {
        state: { ...state, combatants: next },
        log: [entry(state, "roster", `${cmd.combatant.name} restored`, [cmd.combatant.id])],
      };
    }

    case "COMBATANT_DUPLICATED": {
      const src = state.combatants.find((c) => c.id === cmd.id);
      if (!src) return { state, log: [] };
      const copy = duplicateCombatant(src);
      const idx = state.combatants.indexOf(src);
      const next = state.combatants.slice();
      next.splice(idx + 1, 0, copy);
      return {
        state: { ...state, combatants: next },
        log: [entry(state, "roster", `${src.name} duplicated`, [copy.id])],
      };
    }

    case "COMBATANT_RENAMED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({ ...c, name: cmd.name || c.name })),
        },
        log: [],
      };

    /**
     * Reordering swaps within the combatant's own side. v1 swapped across the
     * flat array, which let a player trade places with an enemy and silently
     * reshuffle the opposing group; see docs/MIGRATION.md.
     */
    case "COMBATANT_MOVED": {
      const all = state.combatants;
      const subject = all.find((c) => c.id === cmd.id);
      if (!subject) return { state, log: [] };
      const sameSide = all.filter((c) => c.role === subject.role);
      const localIdx = sameSide.indexOf(subject);
      const targetIdx = localIdx + cmd.direction;
      if (targetIdx < 0 || targetIdx >= sameSide.length) return { state, log: [] };

      const partner = sameSide[targetIdx]!;
      const i = all.indexOf(subject);
      const j = all.indexOf(partner);
      const next = all.slice();
      next[i] = partner;
      next[j] = subject;
      return { state: { ...state, combatants: next }, log: [] };
    }

    case "COMBATANT_POSITION_SET":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({ ...c, position: cmd.position })),
        },
        log: [
          entry(state, "roster", `${nameOf(state, cmd.id)} moved to ${cmd.position}`, [cmd.id]),
        ],
      };

    case "COMBATANT_DONE_TOGGLED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            done: cmd.done ?? !c.done,
          })),
        },
        log: [],
      };

    case "COMBATANT_STATS_SET":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({ ...c, stats: { ...cmd.stats } })),
        },
        log: [],
      };

    case "COMBATANT_NOTES_SET":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({ ...c, notes: cmd.notes })),
        },
        log: [],
      };

    case "COMBATANT_MAXHP_SET": {
      const maxHp = Math.max(1, Math.trunc(cmd.maxHp) || 1);
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            maxHp,
            hp: clamp(c.hp, 0, maxHp),
          })),
        },
        log: [],
      };
    }

    /**
     * A portrait set by hand, for anyone the character library does not cover.
     * Only http(s) is accepted — the value goes straight into an <img src>, and
     * an encounter file is something people share.
     */
    case "COMBATANT_PORTRAIT_SET": {
      const raw = cmd.portrait.trim();
      const portrait = /^https?:\/\//i.test(raw) ? raw : undefined;
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => {
            const next = { ...c };
            if (portrait) next.portrait = portrait;
            else delete next.portrait;
            return next;
          }),
        },
        log: [],
      };
    }

    /* ── health ── */

    case "DAMAGE_APPLIED": {
      if (!cmd.amount || !cmd.ids.length) return { state, log: [] };
      const ids = new Set(cmd.ids);
      const log: LogEntry[] = [];
      const combatants = state.combatants.map((c) => {
        if (!ids.has(c.id)) return c;
        const res = applyDamage(c, cmd.amount, cmd.damageType);
        const b = res.breakdown;
        const bits: string[] = [`${b.toHp} to HP`];
        if (b.resisted) bits.unshift(`${b.resisted} resisted`);
        if (b.amplified) bits.unshift(`+${b.amplified} exposed`);
        if (b.absorbedByTemp) bits.unshift(`${b.absorbedByTemp} on temp shield`);
        if (b.absorbedByShield) bits.unshift(`${b.absorbedByShield} on shield`);
        log.push(
          entry(
            state,
            "damage",
            `${c.name} took ${cmd.amount} ${cmd.damageType} (${bits.join(", ")})`,
            [c.id],
          ),
        );
        if (c.hp > 0 && res.hp <= 0) {
          log.push(entry(state, "damage", `${c.name} is unconscious`, [c.id]));
        }
        return { ...c, hp: res.hp, shield: res.shield, tempShields: res.tempShields };
      });
      return { state: { ...state, combatants }, log };
    }

    case "HEAL_APPLIED": {
      if (!cmd.amount || !cmd.ids.length) return { state, log: [] };
      const ids = new Set(cmd.ids);
      const log: LogEntry[] = [];
      const combatants = state.combatants.map((c) => {
        if (!ids.has(c.id)) return c;
        const r = applyHealing(c, cmd.amount, {
          overheal: cmd.overheal,
          wardCap: cmd.wardCap,
        });
        if (r.healed > 0) {
          log.push(entry(state, "heal", `${c.name} healed ${r.healed}`, [c.id]));
        }
        if (r.warded > 0) {
          // Logged separately: a ward is a different thing from a heal, and a
          // GM reading back the round needs to see where the shield came from.
          log.push(
            entry(state, "shield", `${c.name} warded ${r.warded} from overheal`, [c.id]),
          );
        }
        return { ...c, hp: r.hp, tempShields: r.tempShields };
      });
      return { state: { ...state, combatants }, log };
    }

    /* ── stacks inflicted on a combatant ── */

    /**
     * Increment, create, or decrement a named stack. Reaching the ceiling
     * resets it to zero, which is how every "at max stacks" skill in the pool
     * is written — the trigger itself stays the GM's call, because what happens
     * at max differs per skill.
     */
    case "STACK_ADJUSTED": {
      const name = cmd.name.trim();
      if (!name || !cmd.delta) return { state, log: [] };
      const log: LogEntry[] = [];
      const combatants = mapOne(state, cmd.id, (c) => {
        const stacks = [...(c.stacks ?? [])];
        const i = stacks.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
        const existing = i >= 0 ? stacks[i]! : null;
        const max = cmd.max ?? existing?.max ?? 0;
        const next = (existing?.count ?? 0) + cmd.delta;

        if (next <= 0) {
          if (i >= 0) stacks.splice(i, 1);
          log.push(entry(state, "status", `${c.name} loses ${name}`, [c.id]));
          return { ...c, stacks };
        }

        const capped = max > 0 && next >= max;
        const count = capped ? 0 : next;
        const mark = {
          id: existing?.id ?? gid(),
          name,
          count,
          max,
          ...(cmd.perStackDamage ?? existing?.perStackDamage
            ? { perStackDamage: cmd.perStackDamage ?? existing?.perStackDamage }
            : {}),
        };

        if (capped) {
          log.push(entry(state, "status", `${c.name}: ${name} reached ${max} and reset`, [c.id]));
          stacks.splice(i >= 0 ? i : stacks.length, i >= 0 ? 1 : 0);
        } else {
          log.push(entry(state, "status", `${c.name}: ${name} ${count}${max ? `/${max}` : ""}`, [c.id]));
          if (i >= 0) stacks[i] = mark;
          else stacks.push(mark);
        }
        return { ...c, stacks };
      });
      return { state: { ...state, combatants }, log };
    }

    case "STACK_CLEARED": {
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            stacks: (c.stacks ?? []).filter((s) => s.id !== cmd.stackId),
          })),
        },
        log: [],
      };
    }

    case "FULL_HEAL_APPLIED": {
      const ids = new Set(cmd.ids);
      const log: LogEntry[] = [];
      const combatants = state.combatants.map((c) => {
        if (!ids.has(c.id) || c.hp === c.maxHp) return c;
        log.push(entry(state, "heal", `${c.name} restored to full`, [c.id]));
        return { ...c, hp: c.maxHp };
      });
      return { state: { ...state, combatants }, log };
    }

    /* ── shields ── */

    case "SHIELD_ADJUSTED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            shield: clamp(c.shield + cmd.delta, 0, 20),
          })),
        },
        log: [],
      };

    case "TEMP_SHIELD_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            tempShields: [...c.tempShields, cmd.shield],
          })),
        },
        log: [
          entry(
            state,
            "shield",
            `${nameOf(state, cmd.id)} gained a ${cmd.shield.val} temp shield`,
            [cmd.id],
          ),
        ],
      };

    case "TEMP_SHIELD_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            tempShields: c.tempShields.filter((s) => s.id !== cmd.shieldId),
          })),
        },
        log: [],
      };

    /* ── conditions ── */

    case "STATUS_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            statuses: [...c.statuses, cmd.status],
          })),
        },
        log: [
          entry(state, "status", `${nameOf(state, cmd.id)} is ${cmd.status.name}`, [cmd.id]),
        ],
      };

    case "STATUS_ADDED_MANY": {
      if (!cmd.ids.length) return { state, log: [] };
      const ids = new Set(cmd.ids);
      const log: LogEntry[] = [];
      const combatants = state.combatants.map((c) => {
        if (!ids.has(c.id)) return c;
        log.push(entry(state, "status", `${c.name} is ${cmd.status.name}`, [c.id]));
        return {
          ...c,
          statuses: [...c.statuses, { ...cmd.status, id: gid() }],
        };
      });
      return { state: { ...state, combatants }, log };
    }

    case "DOT_ADDED_MANY": {
      if (!cmd.ids.length) return { state, log: [] };
      const ids = new Set(cmd.ids);
      const log: LogEntry[] = [];
      const combatants = state.combatants.map((c) => {
        if (!ids.has(c.id)) return c;
        log.push(entry(state, "status", `${c.name} afflicted: ${cmd.dot.name}`, [c.id]));
        return { ...c, dots: [...c.dots, { ...cmd.dot, id: gid() }] };
      });
      return { state: { ...state, combatants }, log };
    }

    case "STATUS_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            statuses: c.statuses.filter((s) => s.id !== cmd.statusId),
          })),
        },
        log: [],
      };

    case "DOT_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({ ...c, dots: [...c.dots, cmd.dot] })),
        },
        log: [
          entry(state, "status", `${nameOf(state, cmd.id)} afflicted: ${cmd.dot.name}`, [cmd.id]),
        ],
      };

    case "DOT_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            dots: c.dots.filter((d) => d.id !== cmd.dotId),
          })),
        },
        log: [],
      };

    /**
     * Adding a regen clears the legacy scalar, matching v1 — the modern list
     * takes precedence and leaving the scalar set would double-count.
     */
    case "REGEN_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            hpRegens: [...c.hpRegens, cmd.regen],
            hpRegen: 0,
          })),
        },
        log: [],
      };

    case "REGEN_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            hpRegens: c.hpRegens.filter((r) => r.id !== cmd.regenId),
            hpRegen: 0,
          })),
        },
        log: [],
      };

    case "TEMP_MOD_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            tempMods: [...c.tempMods, cmd.mod],
          })),
        },
        log: [],
      };

    case "TEMP_MOD_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            tempMods: c.tempMods.filter((m) => m.id !== cmd.modId),
          })),
        },
        log: [],
      };

    /* ── abilities ── */

    case "ABILITY_ADDED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            abilities: [...c.abilities, cmd.ability],
          })),
        },
        log: [],
      };

    case "ABILITY_UPDATED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            abilities: c.abilities.map((a) => (a.id === cmd.ability.id ? cmd.ability : a)),
          })),
        },
        log: [],
      };

    case "ABILITY_REMOVED":
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            abilities: c.abilities.filter((a) => a.id !== cmd.abilityId),
          })),
        },
        log: [],
      };

    case "ABILITY_USED": {
      const c0 = state.combatants.find((c) => c.id === cmd.id);
      const ab = c0?.abilities.find((a) => a.id === cmd.abilityId);
      return {
        state: {
          ...state,
          combatants: mapOne(state, cmd.id, (c) => ({
            ...c,
            done: cmd.marksDone ? true : c.done,
            abilities: c.abilities.map((a) =>
              a.id === cmd.abilityId ? { ...a, ...cmd.patch } : a,
            ),
          })),
        },
        log: ab
          ? [entry(state, "ability", `${c0!.name} used ${ab.name}`, [cmd.id])]
          : [],
      };
    }

    /* ── flow ── */

    case "PHASE_ADVANCED": {
      const res = advancePhase(state);
      const log: LogEntry[] = [];
      if (res.crossedRound) {
        log.push(entry(res.state, "flow", `Round ${res.state.round} begins`));
        for (const ev of res.events) {
          const who = res.state.combatants.find((c) => c.id === ev.combatantId)?.name ?? "";
          if (ev.dotDamage > 0) {
            log.push(
              entry(res.state, "damage", `${who} lost ${ev.dotDamage} to ongoing damage`, [
                ev.combatantId,
              ]),
            );
          }
          if (ev.regenHealed > 0) {
            log.push(
              entry(res.state, "heal", `${who} regenerated ${ev.regenHealed}`, [ev.combatantId]),
            );
          }
          for (const s of ev.expiredStatuses) {
            log.push(entry(res.state, "status", `${who}: ${s} expired`, [ev.combatantId]));
          }
          if (ev.died) {
            log.push(entry(res.state, "damage", `${who} is unconscious`, [ev.combatantId]));
          }
        }
      } else {
        const names = ["Player Phase", "Enemy Phase", "Environment Phase"];
        log.push(entry(res.state, "flow", `${names[res.state.phase]} begins`));
      }
      return { state: res.state, log };
    }

    case "INITIATIVE_LOCKED": {
      const next = lockInitiative(state, cmd.enemyFirst);
      return {
        state: next,
        log: [
          entry(
            next,
            "flow",
            cmd.enemyFirst ? "Enemies seize the initiative" : "Players take the initiative",
          ),
        ],
      };
    }

    case "INITIATIVE_RESET":
      return {
        state: resetInitiative(state),
        log: [entry(state, "flow", "Initiative reset")],
      };

    /* ── wholesale ── */

    case "ENCOUNTER_LOADED":
      return { state: cmd.state, log: [entry(cmd.state, "flow", "Session loaded")] };

    case "ENCOUNTER_CLEARED":
      return {
        state: {
          combatants: [],
          phase: 0,
          round: 1,
          locked: false,
          playerPhaseCount: 0,
          enemyPhaseCount: 0,
        },
        log: [entry(state, "flow", "Encounter cleared")],
      };
  }
}
