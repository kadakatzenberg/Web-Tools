/**
 * The war table.
 *
 * Layout is mirrored around a central front line, so the two sides genuinely
 * face each other:
 *
 *     enemy  BACK      │ out
 *     enemy  FRONT     │
 *     ─────────────────┼─────   ← the front line
 *     player FRONT     │
 *     player BACK      │ out
 *
 * Distance from the centre line means the same thing on both sides: Front is
 * engaged, Back is held in reserve, Out is off the field entirely.
 *
 * Combatants can be dragged between bands, or moved by click/keyboard for
 * anyone not using a pointer. Drag never becomes the only route to an action.
 *
 * Clicking a token opens the command window (see `CommandFlow`), which is where
 * a whole action is given and resolved. This module owns the parts of that flow
 * the table itself has to draw: which token is acting, which may be aimed at,
 * and the line running between them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Combatant, Position, Role } from "@/domain/types";
import { healthBand, healthPercent, type CombatEvent } from "@/domain/rules";
import { useStore, useStoreApi } from "@/state/store";
import { FloatingMarks } from "@/fx/feedback";
import { playCue } from "@/fx/sound";
import { announce } from "../hooks";
import { CommandFlow, isLegalTarget, type Flow } from "./CommandFlow";
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

/** Rows top-to-bottom: enemies recede upward, players recede downward. */
const ROWS: { side: Role; position: Position }[] = [
  { side: "Enemy", position: "Back" },
  { side: "Enemy", position: "Front" },
  { side: "Player", position: "Front" },
  { side: "Player", position: "Back" },
];

interface DragState {
  id: string;
  side: Role;
  name: string;
  x: number;
  y: number;
  over: { side: Role; position: Position } | null;
}

function summarise(c: Combatant): string {
  const band = healthBand(c.hp, c.maxHp);
  const shields = c.shield + c.tempShields.reduce((a, s) => a + s.val, 0);
  return [
    c.name,
    `${c.hp} of ${c.maxHp} hit points`,
    band !== "healthy" ? band : null,
    shields ? `${shields} shielding` : null,
    c.statuses.length ? `conditions: ${c.statuses.map((s) => s.name).join(", ")}` : null,
    c.position,
    c.done ? "has acted" : "still to act",
  ]
    .filter(Boolean)
    .join(", ");
}

/** What this token is to the command currently being given. */
type AimRole = "actor" | "legal" | "illegal" | null;

function Token({
  c,
  selected,
  dragging,
  aim,
  onSelect,
  onDragStart,
}: {
  c: Combatant;
  selected: boolean;
  dragging: boolean;
  aim: AimRole;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent, c: Combatant) => void;
}) {
  const band = healthBand(c.hp, c.maxHp);
  const pct = healthPercent(c.hp, c.maxHp);
  const shields = c.shield + c.tempShields.reduce((a, s) => a + s.val, 0);

  return (
    <button
      type="button"
      className="tok"
      data-token={c.id}
      data-side={c.role === "Player" ? "player" : "enemy"}
      data-band={band}
      data-done={c.done ? "1" : undefined}
      data-selected={selected ? "1" : undefined}
      data-dragging={dragging ? "1" : undefined}
      data-aim={aim ?? undefined}
      aria-pressed={selected}
      aria-label={
        aim === "legal" ? `Target ${summarise(c)}` : aim === "actor" ? `Acting: ${summarise(c)}` : summarise(c)
      }
      title={
        aim === "legal"
          ? `Aim at ${c.name}`
          : `${summarise(c)}. Click for commands, drag to reposition.`
      }
      onPointerDown={(e) => onDragStart(e, c)}
      onClick={onSelect}
    >
      {/* The vessel keeps its health fill behind the face: on the table the
          token has to answer "how hurt is this one" as fast as "who is this
          one", and a portrait alone answers only the second. */}
      <span className="tok__vessel" aria-hidden="true">
        {c.portrait && (
          <img className="tok__face" src={c.portrait} alt="" loading="lazy" decoding="async" draggable={false} />
        )}
        <span
          className="tok__fill"
          style={{ height: `${pct}%`, backgroundColor: BAND_TONE[band] }}
        />
        {BAND_GLYPH[band] && <span className="tok__glyph">{BAND_GLYPH[band]}</span>}
      </span>

      <span className="tok__body">
        <span className="tok__name">{c.name}</span>
        <span className="tok__meta">
          <span className="tnum" style={{ color: BAND_TONE[band] }}>
            {c.hp}/{c.maxHp}
          </span>
          {shields > 0 && <span className="tok__shield tnum">◈{shields}</span>}
          {c.done && (
            <span className="tok__done" aria-hidden="true">
              ✓
            </span>
          )}
          {c.statuses.slice(0, 2).map((s) => (
            <span key={s.id} className="tok__cond" title={s.name}>
              {s.name.slice(0, 3)}
            </span>
          ))}
          {c.statuses.length > 2 && (
            <span className="tok__cond">+{c.statuses.length - 2}</span>
          )}
        </span>
      </span>

      {/* Damage lands where the eye already is. Resolving from the table and
          then having to look elsewhere for the number defeats the point. */}
      <FloatingMarks targetId={c.id} as="span" />
    </button>
  );
}

function Band({
  side,
  position,
  members,
  selected,
  drag,
  aimOf,
  onSelect,
  onDragStart,
  onMoveHere,
  variant,
}: {
  side: Role;
  position: Position;
  members: Combatant[];
  selected: Combatant | null;
  drag: DragState | null;
  aimOf: (c: Combatant) => AimRole;
  onSelect: (id: string) => void;
  onDragStart: (e: React.PointerEvent, c: Combatant) => void;
  onMoveHere: () => void;
  variant: "row" | "out";
}) {
  const canAccept =
    (drag?.side ?? selected?.role) === side &&
    !members.some((m) => m.id === (drag?.id ?? selected?.id));
  const isOver = drag?.over?.side === side && drag.over.position === position;

  return (
    <div
      className={`band band--${variant}`}
      data-side={side === "Player" ? "player" : "enemy"}
      data-position={position}
      data-drop={`${side}:${position}`}
      data-accept={drag && canAccept ? "1" : undefined}
      data-over={isOver ? "1" : undefined}
    >
      <span className="band__label">{position}</span>

      <div className="band__slots">
        {members.map((c) => (
          <Token
            key={c.id}
            c={c}
            selected={selected?.id === c.id}
            dragging={drag?.id === c.id}
            aim={aimOf(c)}
            onSelect={() => onSelect(c.id)}
            onDragStart={onDragStart}
          />
        ))}
      </div>

      {/* Overlay, never appended: a selection must not change the table's height. */}
      {selected && !drag && canAccept && (
        <button type="button" className="band__move" onClick={onMoveHere}>
          Move {selected.name} to {position}
        </button>
      )}
    </div>
  );
}

export function WarTable({
  focusedId,
  onSelect,
  onEvent,
}: {
  focusedId: string | null;
  onSelect: (id: string | null) => void;
  /** Raised when a command lands, so armed reactions can be offered. */
  onEvent?: (e: CombatEvent) => void;
}) {
  const { present } = useStore();
  const { dispatch } = useStoreApi();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [aim, setAim] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const wtRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const pending = useRef<{
    id: string;
    side: Role;
    name: string;
    x: number;
    y: number;
    pointerId: number;
    node: HTMLElement;
    holdTimer: number | null;
    engaged: boolean;
  } | null>(null);

  const selected = present.combatants.find((c) => c.id === focusedId) ?? null;

  const move = useCallback(
    (id: string, position: Position, name: string) => {
      dispatch({ type: "COMBATANT_POSITION_SET", id, position });
      announce(`${name} moved to ${position}.`);
    },
    [dispatch],
  );

  /** Resolve the drop band sitting under a screen point. */
  const bandAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const target = el?.closest<HTMLElement>("[data-drop]");
    if (!target) return null;
    const raw = target.dataset.drop!;
    const [side, position] = raw.split(":") as [Role, Position];
    return { side, position };
  };

  const finish = useCallback(() => {
    const p = pending.current;
    const d = dragRef.current;
    if (p) {
      if (p.holdTimer) window.clearTimeout(p.holdTimer);
      try {
        p.node.releasePointerCapture(p.pointerId);
      } catch {
        /* capture may already be gone */
      }
    }
    if (d?.over && d.over.side === d.side) {
      const current = present.combatants.find((c) => c.id === d.id);
      if (current && current.position !== d.over.position) {
        move(d.id, d.over.position, d.name);
      }
    }
    pending.current = null;
    setDrag(null);
  }, [move, present.combatants]);

  const onDragStart = useCallback((e: React.PointerEvent, c: Combatant) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const node = e.currentTarget as HTMLElement;
    const touch = e.pointerType !== "mouse";

    pending.current = {
      id: c.id,
      side: c.role,
      name: c.name,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      node,
      holdTimer: null,
      engaged: false,
    };

    const engage = () => {
      const p = pending.current;
      if (!p || p.engaged) return;
      p.engaged = true;
      try {
        p.node.setPointerCapture(p.pointerId);
      } catch {
        /* not fatal — pointermove still fires on the document */
      }
      setDrag({ id: p.id, side: p.side, name: p.name, x: p.x, y: p.y, over: null });
    };

    // Touch waits for a short hold so the table can still be scrolled by swipe.
    // A mouse engages as soon as the pointer travels far enough to mean it.
    if (touch) {
      pending.current.holdTimer = window.setTimeout(engage, 220);
    }
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;

      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;

      if (!p.engaged) {
        const far = Math.hypot(dx, dy) > 6;
        if (!far) return;
        if (e.pointerType !== "mouse") {
          // Moved before the hold completed — treat it as a scroll, not a drag.
          if (p.holdTimer) window.clearTimeout(p.holdTimer);
          pending.current = null;
          return;
        }
        p.engaged = true;
        try {
          p.node.setPointerCapture(p.pointerId);
        } catch {
          /* not fatal */
        }
      }

      e.preventDefault();
      setDrag((d) =>
        d
          ? { ...d, x: e.clientX, y: e.clientY, over: bandAt(e.clientX, e.clientY) }
          : {
              id: p.id,
              side: p.side,
              name: p.name,
              x: e.clientX,
              y: e.clientY,
              over: bandAt(e.clientX, e.clientY),
            },
      );
    };

    const onUp = () => finish();
    const onCancel = () => {
      const p = pending.current;
      if (p?.holdTimer) window.clearTimeout(p.holdTimer);
      pending.current = null;
      setDrag(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onCancel();
      setFlow(null);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  /* ── Giving a command ── */

  const actor = flow ? present.combatants.find((c) => c.id === flow.actorId) ?? null : null;
  /** Aiming is the only mode that changes what a click on a token means. */
  const aiming = flow?.stage === "target" && flow.verb !== "move" ? flow : null;

  const aimOf = useCallback(
    (c: Combatant): AimRole => {
      if (!flow) return null;
      if (c.id === flow.actorId) return "actor";
      if (!aiming || !actor) return null;
      return isLegalTarget(aiming.verb, actor, c) ? "legal" : "illegal";
    },
    [flow, aiming, actor],
  );

  const onTokenClick = useCallback(
    (id: string) => {
      // Mid-aim, a token is a target and nothing else. Clicking an illegal one
      // must not quietly become "start a new command with this fighter".
      if (aiming && actor) {
        const t = present.combatants.find((c) => c.id === id);
        if (!t || !isLegalTarget(aiming.verb, actor, t)) return;
        playCue("confirm");
        setFlow({
          stage: "resolve",
          actorId: aiming.actorId,
          targetId: id,
          verb: aiming.verb,
          abilityId: aiming.abilityId,
        });
        return;
      }

      // Clicking the fighter whose window is already open puts it away.
      if (flow?.stage === "command" && flow.actorId === id) {
        playCue("cancel");
        setFlow(null);
        onSelect(null);
        return;
      }

      onSelect(id);
      setFlow({ stage: "command", actorId: id });
    },
    [aiming, actor, flow, present.combatants, onSelect],
  );

  /**
   * The line. Both ends are measured against the table itself, so it survives
   * the page scrolling underneath it, and both are re-read on every move rather
   * than captured once — the window below the grid changes height as the
   * command narrows, and a captured origin would drift away from its token.
   */
  useEffect(() => {
    if (!flow || collapsed) {
      setAim(null);
      return;
    }

    const anchor = (id: string) => {
      const box = wtRef.current;
      const el = box?.querySelector<HTMLElement>(`[data-token="${CSS.escape(id)}"]`);
      if (!box || !el) return null;
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
    };

    if (flow.stage === "resolve") {
      const from = anchor(flow.actorId);
      const to = anchor(flow.targetId);
      setAim(from && to ? { x1: from.x, y1: from.y, x2: to.x, y2: to.y } : null);
      return;
    }

    if (!aiming) {
      setAim(null);
      return;
    }

    const from = anchor(flow.actorId);
    setAim(from ? { x1: from.x, y1: from.y, x2: from.x, y2: from.y } : null);

    const onMove = (e: PointerEvent) => {
      const box = wtRef.current;
      const start = anchor(flow.actorId);
      if (!box || !start) return;
      const b = box.getBoundingClientRect();
      setAim({ x1: start.x, y1: start.y, x2: e.clientX - b.left, y2: e.clientY - b.top });
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [flow, aiming, collapsed, present.combatants]);

  const membersOf = (side: Role, position: Position) =>
    present.combatants.filter((c) => c.role === side && c.position === position);

  const bandProps = {
    selected,
    drag,
    aimOf,
    onSelect: onTokenClick,
    onDragStart,
  };

  return (
    <section
      className="wartable panel"
      aria-label="Battlefield overview"
      data-dragging={drag ? "1" : undefined}
      data-aiming={aiming ? "1" : undefined}
      data-moving={flow?.stage === "target" && flow.verb === "move" ? "1" : undefined}
    >
      <header className="wartable__head">
        <h2 className="wartable__title display">War table</h2>
        <div className="wartable__tools">
          {selected && (
            <span className="wartable__selected">
              {selected.name}
              <button
                type="button"
                className="wartable__clear"
                onClick={() => onSelect(null)}
                aria-label="Clear selection"
              >
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
        <>
          <div className="wt" ref={wtRef}>
            {ROWS.map((r) => (
              <Band
                key={`${r.side}-${r.position}`}
                side={r.side}
                position={r.position}
                members={membersOf(r.side, r.position)}
                variant="row"
                onMoveHere={() => selected && move(selected.id, r.position, selected.name)}
                {...bandProps}
              />
            ))}

            <Band
              side="Enemy"
              position="Out"
              members={membersOf("Enemy", "Out")}
              variant="out"
              onMoveHere={() => selected && move(selected.id, "Out", selected.name)}
              {...bandProps}
            />
            <Band
              side="Player"
              position="Out"
              members={membersOf("Player", "Out")}
              variant="out"
              onMoveHere={() => selected && move(selected.id, "Out", selected.name)}
              {...bandProps}
            />

            <div className="wt__line" aria-hidden="true">
              <span className="wt__mark" />
            </div>

            <span className="wt__flank wt__flank--enemy display" aria-hidden="true">
              Enemies
            </span>
            <span className="wt__flank wt__flank--player display" aria-hidden="true">
              Players
            </span>

            {/* The line of intent. Drawn over the bands but never over the
                tokens' own text, and never interactive — it is a statement
                about what is about to happen, not a control. */}
            {aim && (
              <svg className="wt__aim" aria-hidden="true">
                <line
                  className="wt__aimline"
                  x1={aim.x1}
                  y1={aim.y1}
                  x2={aim.x2}
                  y2={aim.y2}
                />
                <circle className="wt__aimhead" cx={aim.x2} cy={aim.y2} r={5} />
              </svg>
            )}
          </div>

          <CommandFlow
            flow={flow}
            setFlow={setFlow}
            combatants={present.combatants}
            playerPhaseCount={present.playerPhaseCount}
            enemyPhaseCount={present.enemyPhaseCount}
            onEvent={onEvent}
          />

          <p className="wartable__hint">
            {aiming
              ? "Pick a target on the table, then answer hit or miss."
              : flow
                ? "Escape closes the command window."
                : "Click a combatant for commands, or drag them to another band. Front and Back are measured from the centre line."}
          </p>
        </>
      )}

      {drag && (
        <div
          className="dragghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {drag.name}
        </div>
      )}
    </section>
  );
}
