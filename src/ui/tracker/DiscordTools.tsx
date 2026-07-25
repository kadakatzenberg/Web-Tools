/**
 * Tools for the half of a session that happens in Discord rather than in the
 * tracker.
 *
 * Every format here was taken from real session logs. The three things a GM
 * types over and over — the phase header, the party/enemy status block, and the
 * "who still owes me an action" list — are all derivable from state the tracker
 * already holds, and the enemy phase roll block is specified exactly in the
 * rules. None of it needed to be manual.
 */

import { useEffect, useMemo, useState } from "react";
import type { EncounterState } from "@/domain/types";
import {
  formatEnemyPhaseBlock,
  formatPendingPost,
  formatPhaseAnnouncement,
  formatStatusPost,
  livingEnemies,
  livingPlayers,
  pendingCombatants,
  rollTargets,
  type EnemyRoll,
} from "@/domain/report";
import { deriveStats } from "@/domain/rules";
import { useCopy } from "../hooks";
import { Button, useToast } from "../primitives";
import "./discord.css";

/* ── Copy cluster ── */

export function PostControls({ state }: { state: EncounterState }) {
  const copy = useCopy();
  const toast = useToast();
  const pending = pendingCombatants(state).length;

  const post = async (label: string, text: string) => {
    const ok = await copy(text);
    toast.push(ok ? `${label} copied` : "Could not copy to clipboard", ok ? "ok" : "danger");
  };

  return (
    <div className="post" role="group" aria-label="Copy for Discord">
      <span className="post__label eyebrow">Post</span>
      <Button
        size="sm"
        onClick={() => post("Phase header", formatPhaseAnnouncement(state, true))}
        title="Phase header with @here"
      >
        Phase
      </Button>
      <Button size="sm" onClick={() => post("Status", formatStatusPost(state))}>
        Status
      </Button>
      <Button
        size="sm"
        disabled={!pending}
        onClick={() => post("Pending list", formatPendingPost(state))}
        title={pending ? `${pending} still to act` : "Everyone has acted"}
      >
        Pending{pending ? ` (${pending})` : ""}
      </Button>
    </div>
  );
}

/* ── Enemy phase ── */

export function EnemyPhasePanel({ state }: { state: EncounterState }) {
  const copy = useCopy();
  const toast = useToast();
  const enemies = useMemo(() => livingEnemies(state), [state]);
  const players = useMemo(() => livingPlayers(state), [state]);
  const [rolls, setRolls] = useState<EnemyRoll[]>([]);

  // Keep one row per living enemy as the roster changes mid-phase.
  useEffect(() => {
    setRolls((prev) => {
      const byId = new Map(prev.map((r) => [r.combatantId, r]));
      return enemies.map((e) => byId.get(e.id) ?? { combatantId: e.id, target: "" });
    });
  }, [enemies]);

  if (!enemies.length) return null;

  const block = formatEnemyPhaseBlock(state, rolls);
  const assigned = rolls.filter((r) => r.target.trim()).length;

  const setTarget = (id: string, target: string) =>
    setRolls((prev) => prev.map((r) => (r.combatantId === id ? { ...r, target } : r)));

  return (
    <section className="enemyphase panel" aria-labelledby="ep-h">
      <header className="enemyphase__head">
        <h3 className="enemyphase__title display" id="ep-h">
          Enemy phase rolls
        </h3>
        <div className="enemyphase__actions">
          <Button
            size="sm"
            disabled={!players.length}
            onClick={() => setRolls(rollTargets(state))}
            title="Assign a random target to each enemy, weighted toward the Front"
          >
            Roll targets
          </Button>
          <Button size="sm" onClick={() => setRolls(rolls.map((r) => ({ ...r, target: "" })))}>
            Clear
          </Button>
          <Button
            size="sm"
            tone="danger"
            disabled={!assigned}
            onClick={async () => {
              const ok = await copy(block);
              toast.push(ok ? "Roll block copied" : "Could not copy", ok ? "ok" : "danger");
            }}
          >
            Copy {assigned ? `${assigned} roll${assigned === 1 ? "" : "s"}` : "block"}
          </Button>
        </div>
      </header>

      <p className="enemyphase__lead">
        Pick a target for each enemy, then paste the block straight into Discord. Hit
        bonuses come from each enemy's DEX, including temporary modifiers.
      </p>

      <ul className="enemyphase__list">
        {enemies.map((e) => {
          const hit = deriveStats(e.stats, e.tempMods).hit;
          const row = rolls.find((r) => r.combatantId === e.id);
          return (
            <li key={e.id} className="enemyphase__row">
              <span className="enemyphase__name">{e.name}</span>
              <span className="enemyphase__bonus tnum" title="Hit bonus (DEX × 2)">
                {hit >= 0 ? `+${hit}` : hit}
              </span>
              <select
                aria-label={`Target for ${e.name}`}
                value={row?.target ?? ""}
                onChange={(ev) => setTarget(e.id, ev.target.value)}
              >
                <option value="">— no target —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                    {p.position === "Front" ? " (Front)" : p.position === "Back" ? " (Back)" : ""}
                  </option>
                ))}
                <option value="everyone">everyone</option>
              </select>
            </li>
          );
        })}
      </ul>

      {assigned > 0 && (
        <pre className="enemyphase__preview" aria-label="Roll block preview">
          {block}
        </pre>
      )}
    </section>
  );
}
