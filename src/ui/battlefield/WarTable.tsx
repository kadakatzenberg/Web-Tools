/**
 * The war table: a spatial read of the encounter built on the existing
 * Front / Back / Out positions.
 *
 * It complements the card list rather than replacing it — the table answers
 * "who is where and how badly hurt", the cards answer "what exactly can this
 * combatant do". Selecting a token focuses its card.
 *
 * Tokens are plain buttons in a grid, so the whole view is keyboard-operable
 * and screen-reader legible without a canvas fallback story.
 */

import { useState } from "react";
import type { Combatant, Position } from "@/domain/types";
import { POSITIONS } from "@/domain/constants";
import { healthBand, healthPercent } from "@/domain/rules";
import { useStore, useStoreApi } from "@/state/store";
import { announce } from "../hooks";
import "./battlefield.css";

const BAND_TONE: Record<string, string> = {
  healthy: "var(--hp-healthy)",
  wounded: "var(--hp-wounded)",
  critical: "var(--hp-critical)",
  unconscious: "var(--hp-down)",
};

const BAND_GLYPH: Record<string, string> = {
  healthy: "",
  wounded: "◐",
  critical: "◔",
  unconscious: "✕",
};

function Token({
  c,
  selected,
  onSelect,
}: {
  c: Combatant;
  selected: boolean;
  onSelect: () => void;
}) {
  const band = healthBand(c.hp, c.maxHp);
  const pct = healthPercent(c.hp, c.maxHp);
  const shields = c.shield + c.tempShields.reduce((a, s) => a + s.val, 0);

  const summary = [
    c.name,
    `${c.hp} of ${c.maxHp} hit points`,
    band !== "healthy" ? band : null,
    shields ? `${shields} shielding` : null,
    c.statuses.length ? `conditions: ${c.statuses.map((s) => s.name).join(", ")}` : null,
    c.done ? "has acted" : "still to act",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      className="token"
      data-side={c.role === "Player" ? "player" : "enemy"}
      data-band={band}
      data-done={c.done ? "1" : undefined}
      data-selected={selected ? "1" : undefined}
      aria-pressed={selected}
      aria-label={summary}
      title={summary}
      onClick={onSelect}
    >
      <span className="token__ring" aria-hidden="true">
        <span className="token__fill" style={{ height: `${pct}%`, background: BAND_TONE[band] }} />
        {BAND_GLYPH[band] && <span className="token__glyph">{BAND_GLYPH[band]}</span>}
      </span>

      <span className="token__name">{c.name}</span>

      <span className="token__meta">
        <span className="tnum" style={{ color: BAND_TONE[band] }}>
          {c.hp}
        </span>
        {shields > 0 && <span className="token__shield tnum">◈{shields}</span>}
        {c.done && (
          <span className="token__done" aria-hidden="true">
            ✓
          </span>
        )}
      </span>

      {c.statuses.length > 0 && (
        <span className="token__conditions" aria-hidden="true">
          {c.statuses.slice(0, 3).map((s) => (
            <span key={s.id} className="token__condition" title={s.name}>
              {s.name.slice(0, 2)}
            </span>
          ))}
          {c.statuses.length > 3 && <span className="token__condition">+{c.statuses.length - 3}</span>}
        </span>
      )}
    </button>
  );
}

function Lane({
  position,
  members,
  selectedId,
  onSelect,
  onDropTo,
}: {
  position: Position;
  members: Combatant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropTo: (position: Position) => void;
}) {
  const selectedHere = members.some((m) => m.id === selectedId);
  return (
    <div className="lane" data-position={position}>
      <div className="lane__label">
        <span className="eyebrow">{position}</span>
        <span className="lane__count tnum">{members.length}</span>
      </div>
      <div className="lane__slots">
        {members.length === 0 ? (
          <span className="lane__empty">—</span>
        ) : (
          members.map((c) => (
            <Token key={c.id} c={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} />
          ))
        )}
      </div>
      {selectedId && !selectedHere && (
        <button type="button" className="lane__move" onClick={() => onDropTo(position)}>
          Move here
        </button>
      )}
    </div>
  );
}

export function WarTable({
  focusedId,
  onSelect,
}: {
  focusedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { present } = useStore();
  const { dispatch } = useStoreApi();
  /* On a phone the card list is the working surface; the table is reference.
     Start it folded there so the roster is reachable without a long scroll. */
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  );

  const selected = present.combatants.find((c) => c.id === focusedId) ?? null;

  const move = (position: Position) => {
    if (!selected) return;
    dispatch({ type: "COMBATANT_POSITION_SET", id: selected.id, position });
    announce(`${selected.name} moved to ${position}.`);
  };

  const sideMembers = (role: "Player" | "Enemy", position: Position) =>
    present.combatants.filter((c) => c.role === role && c.position === position);

  return (
    <section className="wartable panel" aria-label="Battlefield overview">
      <header className="wartable__head">
        <h2 className="wartable__title display">War table</h2>
        <div className="wartable__tools">
          {selected && (
            <span className="wartable__selected">
              {selected.name}
              <button type="button" className="wartable__clear" onClick={() => onSelect(null)} aria-label="Clear selection">
                ✕
              </button>
            </span>
          )}
          <button
            type="button"
            className="wartable__collapse"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="wartable__field">
          <div className="wartable__side" data-side="enemy">
            <span className="wartable__sidelabel display">Enemies</span>
            <div className="wartable__lanes">
              {POSITIONS.map((p) => (
                <Lane
                  key={p}
                  position={p}
                  members={sideMembers("Enemy", p)}
                  selectedId={focusedId}
                  onSelect={onSelect}
                  onDropTo={move}
                />
              ))}
            </div>
          </div>

          <div className="wartable__divide" aria-hidden="true">
            <span />
          </div>

          <div className="wartable__side" data-side="player">
            <span className="wartable__sidelabel display">Players</span>
            <div className="wartable__lanes">
              {POSITIONS.map((p) => (
                <Lane
                  key={p}
                  position={p}
                  members={sideMembers("Player", p)}
                  selectedId={focusedId}
                  onSelect={onSelect}
                  onDropTo={move}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
