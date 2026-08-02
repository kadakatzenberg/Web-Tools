/**
 * The Order — the standing rail of every combatant in the fight.
 *
 * This is the surface a GM reads when they need the state of the encounter in
 * one glance, so it answers four questions and nothing else: whose phase is it,
 * who has yet to act, how badly is everyone hurt, and what is holding them.
 *
 * Everything here is a summary. No control on this rail changes a combatant's
 * health or conditions — selecting a unit takes you to its card, which is where
 * mutation lives. Keeping the rail read-only is what lets it stay this dense
 * without becoming dangerous to skim with a cursor.
 */

import { memo, useMemo } from "react";
import type { Combatant, EncounterState } from "@/domain/types";
import { healthBand, healthPercent } from "@/domain/rules";
import { statusMark, IconCheck, IconDown } from "../icons";
import { Portrait } from "../Portrait";
import "./orderrail.css";

/** Which side the given phase belongs to. Phase 2 is the environment's. */
function actingSide(phase: number): "Player" | "Enemy" | null {
  if (phase === 0) return "Player";
  if (phase === 1) return "Enemy";
  return null;
}

function rankOf(c: Combatant): string {
  if (c.hp <= 0) return "down";
  if (c.role === "Player") return "player";
  if (c.type === "Boss") return "boss";
  if (c.type === "Elite") return "elite";
  return "normal";
}

const RANK_LABEL: Record<string, string> = {
  player: "Player",
  boss: "Boss",
  elite: "Elite",
  normal: "Enemy",
  down: "Down",
};

const BAND_LABEL: Record<string, string> = {
  healthy: "Steady",
  wounded: "Wounded",
  critical: "Critical",
  unconscious: "Down",
};

/* ── One unit ── */

const Unit = memo(function Unit({
  c,
  active,
  focused,
  onSelect,
}: {
  c: Combatant;
  /** True while this combatant's side holds the phase and it has yet to act. */
  active: boolean;
  focused: boolean;
  onSelect: (id: string) => void;
}) {
  const band = healthBand(c.hp, c.maxHp);
  const pct = healthPercent(c.hp, c.maxHp);
  const rank = rankOf(c);
  const down = c.hp <= 0;

  // Two marks is the useful ceiling in a 272px rail; the rest become a count.
  const shown = c.statuses.slice(0, 2);
  const extra = c.statuses.length - shown.length;

  return (
    <li>
      <button
        type="button"
        className="unit"
        data-rank={rank}
        data-band={band}
        data-active={active ? "1" : undefined}
        data-focused={focused ? "1" : undefined}
        data-done={c.done && !down ? "1" : undefined}
        onClick={() => onSelect(c.id)}
        aria-current={focused ? "true" : undefined}
      >
        {/* The face when there is one, the rank mark when there is not. */}
        <Portrait c={c} size={36} className="unit__mark" />

        <span className="unit__body">
          <span className="unit__top">
            <span className="unit__name">{c.name}</span>
            <span className="unit__hp tnum" aria-hidden="true">
              {down ? "—" : c.hp}
            </span>
          </span>

          <span className="unit__track" aria-hidden="true">
            <span className="unit__fill" style={{ width: `${pct}%` }} />
          </span>

          <span className="unit__meta">
            <span className="unit__rank">{RANK_LABEL[rank]}</span>
            {c.statuses.length > 0 && (
              <span className="unit__statuses">
                {shown.map((s) => {
                  const { Icon, polarity } = statusMark(s.name);
                  return (
                    <span key={s.id} className="unit__status" data-polarity={polarity}>
                      <Icon size={11} />
                    </span>
                  );
                })}
                {extra > 0 && <span className="unit__more tnum">+{extra}</span>}
              </span>
            )}
            {down ? (
              <span className="unit__state" data-state="down">
                <IconDown size={11} />
              </span>
            ) : (
              c.done && (
                <span className="unit__state" data-state="done">
                  <IconCheck size={11} />
                </span>
              )
            )}
          </span>
        </span>

        {/* One sentence for a screen reader instead of a pile of fragments. */}
        <span className="sr-only">
          {c.name}, {RANK_LABEL[rank]}.{" "}
          {down
            ? "Down."
            : `${c.hp} of ${c.maxHp} hit points, ${BAND_LABEL[band]}.${
                c.done ? " Has acted." : active ? " Still to act." : ""
              }`}
          {c.statuses.length > 0 &&
            ` Affected by ${c.statuses.map((s) => s.name).join(", ")}.`}
        </span>
      </button>
    </li>
  );
});

/* ── A side ── */

function Side({
  title,
  members,
  holdsPhase,
  focusedId,
  onSelect,
}: {
  title: string;
  members: Combatant[];
  holdsPhase: boolean;
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!members.length) return null;
  const pending = members.filter((m) => !m.done && m.hp > 0).length;

  return (
    <section className="orderrail__side" data-holds={holdsPhase ? "1" : undefined}>
      <h3 className="orderrail__sidehead">
        <span className="orderrail__sidename">{title}</span>
        {holdsPhase && (
          <span className="orderrail__acting">
            {pending > 0 ? `${pending} to act` : "all acted"}
          </span>
        )}
        {!holdsPhase && <span className="orderrail__count tnum">{members.length}</span>}
      </h3>
      <ul className="orderrail__units">
        {members.map((c) => (
          <Unit
            key={c.id}
            c={c}
            active={holdsPhase && !c.done && c.hp > 0}
            focused={focusedId === c.id}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}

/* ── The rail ── */

export const OrderRail = memo(function OrderRail({
  state,
  focusedId,
  onSelect,
}: {
  state: EncounterState;
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  const side = actingSide(state.phase);

  const { players, enemies } = useMemo(
    () => ({
      players: state.combatants.filter((c) => c.role === "Player"),
      enemies: state.combatants.filter((c) => c.role === "Enemy"),
    }),
    [state.combatants],
  );

  // The side holding the phase leads, so the units that matter now are always
  // at the top of the rail rather than wherever the roster happens to put them.
  const order =
    side === "Enemy"
      ? [
          { title: "Enemies", members: enemies, holds: true },
          { title: "Players", members: players, holds: false },
        ]
      : [
          { title: "Players", members: players, holds: side === "Player" },
          { title: "Enemies", members: enemies, holds: false },
        ];

  if (!state.combatants.length) {
    return (
      <nav className="orderrail" aria-label="Combat order">
        <p className="orderrail__empty">
          No one has taken the field. Combatants appear here as you add them.
        </p>
      </nav>
    );
  }

  return (
    <nav className="orderrail" aria-label="Combat order">
      {order.map((g) => (
        <Side
          key={g.title}
          title={g.title}
          members={g.members}
          holdsPhase={g.holds}
          focusedId={focusedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
});
