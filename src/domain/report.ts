/**
 * Discord-facing output.
 *
 * These formats are lifted from how the table actually plays, not invented:
 * party lines carry exact HP and shield, enemy lines carry a *condition word*
 * and never a number. That split is deliberate GM practice — the rules say to
 * track enemy HP mechanically and describe only condition in play — so the tool
 * should make the correct thing the easy thing.
 */

import type { Combatant, EncounterState } from "./types";
import { PHASES } from "./constants";
import { deriveStats } from "./rules";

/**
 * Condition vocabulary used at the table. Deliberately coarse: the party should
 * never be able to read an exact enemy HP total off a status post.
 */
export type EnemyCondition = "Fresh" | "Hurt" | "Badly Hurt" | "DEAD";

export function enemyCondition(hp: number, maxHp: number): EnemyCondition {
  if (hp <= 0) return "DEAD";
  if (hp >= maxHp) return "Fresh";
  const pct = (hp / maxHp) * 100;
  if (pct > 50) return "Hurt";
  return "Badly Hurt";
}

/** `PLAYER PHASE 3` — the header posted at the top of each phase. */
export function formatPhaseAnnouncement(state: EncounterState, mention = false): string {
  const name = PHASES[state.phase]?.toUpperCase() ?? "PHASE";
  const n = state.phase === 1 ? state.enemyPhaseCount : state.playerPhaseCount;
  const head = state.phase === 2 ? `${name} — Round ${state.round}` : `${name} ${n}`;
  return mention ? `${head} @here` : head;
}

/**
 * The status block: party with numbers, enemies with condition words.
 * Downed party members are marked rather than silently listed at 0.
 */
export function formatStatusPost(state: EncounterState): string {
  const players = state.combatants.filter((c) => c.role === "Player");
  const enemies = state.combatants.filter((c) => c.role === "Enemy");
  const lines: string[] = [];

  if (players.length) {
    lines.push("PARTY");
    for (const c of players) {
      const shields = c.shield + c.tempShields.reduce((a, s) => a + s.val, 0);
      const bits = [`${c.name}: ${c.hp}/${c.maxHp}`];
      bits.push(`Shield: ${shields}`);
      const conditions = c.statuses.map((s) => `${s.name} ${s.duration}r`);
      if (c.tempMods.length) {
        conditions.push(...c.tempMods.map((m) => `${m.stat} ${m.val > 0 ? "+" : ""}${m.val}`));
      }
      if (c.hp <= 0) conditions.unshift("DOWN");
      lines.push(bits.join(" | ") + (conditions.length ? ` | ${conditions.join(", ")}` : ""));
    }
  }

  if (enemies.length) {
    if (lines.length) lines.push("");
    lines.push("ENEMIES");
    for (const c of enemies) {
      const cond = enemyCondition(c.hp, c.maxHp);
      const extra: string[] = [];
      const shields = c.shield + c.tempShields.reduce((a, s) => a + s.val, 0);
      if (shields > 0 && cond !== "DEAD") extra.push("Shielded");
      if (cond !== "DEAD") extra.push(...c.statuses.map((s) => s.name));
      lines.push(`${c.name}: ${cond}${extra.length ? ` (${extra.join(", ")})` : ""}`);
    }
  }

  return lines.join("\n");
}

/**
 * Who still owes an action this phase. Downed combatants are excluded — they
 * are not pending, they are out.
 */
export function pendingCombatants(state: EncounterState): Combatant[] {
  const side: Combatant["role"] = state.phase === 1 ? "Enemy" : "Player";
  return state.combatants.filter((c) => c.role === side && !c.done && c.hp > 0);
}

/** `Pending — @alice @bob`, using the player handle where one is known. */
export function formatPendingPost(state: EncounterState): string {
  const pending = pendingCombatants(state);
  if (!pending.length) return "All combatants have acted.";
  const names = pending.map((c) => {
    const handle = c.player?.trim();
    if (!handle) return c.name;
    return handle.startsWith("@") ? handle : `@${handle}`;
  });
  return `Pending — ${names.join(" ")}`;
}

/* ── Enemy phase roll blocks ── */

export interface EnemyRoll {
  combatantId: string;
  /** Blank means the GM has not chosen a target yet. */
  target: string;
}

/**
 * The enemy phase block, in the format the rules specify:
 *
 *     ENEMY NAME — Target
 *     {{1d20+bonus}}
 *
 * The bonus is the enemy's hit bonus (DEX × 2) including temporary modifiers,
 * so the GM never has to look it up mid-phase.
 */
export function formatEnemyPhaseBlock(
  state: EncounterState,
  rolls: EnemyRoll[],
): string {
  const byId = new Map(state.combatants.map((c) => [c.id, c]));
  const lines: string[] = [];

  for (const roll of rolls) {
    const c = byId.get(roll.combatantId);
    if (!c || c.hp <= 0) continue;
    const hit = deriveStats(c.stats, c.tempMods).hit;
    const sign = hit >= 0 ? `+${hit}` : `${hit}`;
    const target = roll.target.trim() || "—";
    lines.push(`${c.name.toUpperCase()} — ${target}`);
    lines.push(`{{1d20${hit === 0 ? "" : sign}}}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/** Living enemies, in roster order — the candidates for an enemy phase. */
export function livingEnemies(state: EncounterState): Combatant[] {
  return state.combatants.filter((c) => c.role === "Enemy" && c.hp > 0);
}

/** Living players, the candidate targets. */
export function livingPlayers(state: EncounterState): Combatant[] {
  return state.combatants.filter((c) => c.role === "Player" && c.hp > 0);
}

/**
 * Assign each enemy a random living player, weighted toward the Front.
 * Front-line combatants are twice as likely to be picked, which matches how
 * these fights actually run — the things in front get hit.
 */
export function rollTargets(
  state: EncounterState,
  rng: () => number = Math.random,
): EnemyRoll[] {
  const players = livingPlayers(state);
  if (!players.length) return livingEnemies(state).map((e) => ({ combatantId: e.id, target: "" }));

  const pool: Combatant[] = [];
  for (const p of players) {
    pool.push(p);
    if (p.position === "Front") pool.push(p);
  }

  return livingEnemies(state).map((e) => ({
    combatantId: e.id,
    target: pool[Math.floor(rng() * pool.length)]?.name ?? players[0]!.name,
  }));
}
