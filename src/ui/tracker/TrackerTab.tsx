/**
 * The tracker: phase state, roster, and every action taken during live combat.
 *
 * Information architecture follows the round loop — current phase and the Next
 * Phase control are pinned and always reachable, then who still has to act,
 * then the combatants themselves. Setup affordances (add, initiative, session)
 * collapse away once the fight is running.
 */

import { useMemo, useState } from "react";
import type { Combatant, DamageType, Role, Stats } from "@/domain/types";
import { EMPTY_STATS, ENEMY_TYPE_HP, PHASES, STAT_KEYS } from "@/domain/constants";
import { healthBand, healthPercent } from "@/domain/rules";
import { rollInitiative } from "@/domain/phase";
import { createManualCombatant } from "@/domain/factory";
import { useStore, useStoreApi } from "@/state/store";
import type { SessionApi } from "@/persistence/useSession";
import { announce, useCopy } from "../hooks";
import { Badge, Button, ConfirmDialog, Disclosure, EmptyState, IconButton, useToast } from "../primitives";
import { CombatantCard } from "./CombatantCard";
import { EnemyPhasePanel, PostControls } from "./DiscordTools";
import { pendingCombatants } from "@/domain/report";
import { WarTable } from "../battlefield/WarTable";
import { playCue } from "@/fx/sound";
import "./tracker.css";

const BAND_TONE: Record<string, string> = {
  healthy: "var(--hp-healthy)",
  wounded: "var(--hp-wounded)",
  critical: "var(--hp-critical)",
  unconscious: "var(--hp-down)",
};

/* ── Session bar ── */

function SessionBar({ session }: { session: SessionApi }) {
  const [input, setInput] = useState("");
  const copy = useCopy();
  const toast = useToast();

  const statusLabel: Record<string, string> = {
    idle: "Not saving",
    saving: "Saving…",
    saved: "Saved",
    offline: "Offline — kept locally",
    error: "Save failed",
  };

  return (
    <div className="session panel">
      {session.code ? (
        <>
          <span className="eyebrow">Session</span>
          <code className="session__code tnum">{session.code}</code>
          <Button
            size="sm"
            onClick={async () => {
              const ok = await copy(session.code!);
              toast.push(ok ? "Session code copied" : "Could not copy", ok ? "ok" : "danger");
            }}
          >
            Copy
          </Button>
          <span className="session__status" data-status={session.status}>
            <span className="session__dot" aria-hidden="true" />
            {statusLabel[session.status]}
          </span>
          {session.status === "error" && (
            <Button size="sm" tone="danger" onClick={() => void session.saveNow()}>
              Retry
            </Button>
          )}
          <Button size="sm" onClick={session.leave}>
            Leave
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" tone="phase" onClick={() => void session.start()}>
            Start session
          </Button>
          <span className="session__or">or</span>
          <input
            className="session__input"
            value={input}
            placeholder="Session code"
            aria-label="Session code to resume"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void session.resume(input)}
          />
          <Button size="sm" onClick={() => void session.resume(input)}>
            Resume
          </Button>
        </>
      )}
      {session.message && <span className="session__msg">{session.message}</span>}
    </div>
  );
}

/* ── Initiative ── */

function InitiativeRoller() {
  const { dispatch } = useStoreApi();
  const { present } = useStore();
  const [count, setCount] = useState("");
  const [rolls, setRolls] = useState<number[] | null>(null);
  const [playerTotal, setPlayerTotal] = useState("");

  const enemyTotal = rolls?.reduce((a, b) => a + b, 0) ?? 0;
  const suggested = present.combatants.filter((c) => c.role === "Enemy").length;

  return (
    <section className="initiative panel" aria-labelledby="init-h">
      <h2 className="initiative__title display" id="init-h">
        Initiative
      </h2>
      <p className="initiative__lead">
        Roll for the enemy side, then enter the players' total. Players must
        <strong> beat </strong> the enemy total to act first — a tie goes to the enemies.
      </p>

      <div className="initiative__row">
        <input
          type="number"
          min={1}
          max={40}
          value={count}
          placeholder={suggested ? `${suggested} enemies` : "How many dice"}
          aria-label="Number of d20s to roll"
          onChange={(e) => setCount(e.target.value)}
        />
        <Button
          tone="phase"
          onClick={() => {
            const n = parseInt(count, 10) || suggested;
            if (!n) return;
            const r = rollInitiative(n);
            setRolls(r);
            setPlayerTotal("");
            announce(`Rolled ${n} dice. Enemy total ${r.reduce((a, b) => a + b, 0)}.`);
          }}
        >
          Roll {count ? `${count}d20` : "d20"}
        </Button>
      </div>

      {rolls && (
        <div className="initiative__result">
          <div className="initiative__dice" aria-hidden="true">
            {rolls.map((r, i) => (
              <span key={i} className="die tnum" data-crit={r === 20 ? "1" : r === 1 ? "fail" : undefined}>
                {r}
              </span>
            ))}
          </div>
          <p className="initiative__total tnum" aria-live="polite">
            Enemy total <strong>{enemyTotal}</strong>
          </p>
          <div className="initiative__row">
            <input
              type="number"
              value={playerTotal}
              placeholder="Player total"
              aria-label="Player initiative total"
              onChange={(e) => setPlayerTotal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const pt = parseInt(playerTotal, 10);
                if (Number.isNaN(pt)) return;
                dispatch({ type: "INITIATIVE_LOCKED", enemyFirst: pt <= enemyTotal });
              }}
            />
            <Button
              tone="phase"
              disabled={playerTotal === ""}
              onClick={() => {
                const pt = parseInt(playerTotal, 10);
                if (Number.isNaN(pt)) return;
                const enemyFirst = pt <= enemyTotal;
                dispatch({ type: "INITIATIVE_LOCKED", enemyFirst });
                playCue("phase");
                announce(enemyFirst ? "Enemies act first." : "Players act first.");
              }}
            >
              Lock initiative
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Phase bar ── */

function PhaseBar({
  focusMode,
  onToggleFocus,
}: {
  focusMode: boolean;
  onToggleFocus: () => void;
}) {
  const { present, past, future } = useStore();
  const { dispatch, undo, redo } = useStoreApi();
  const [confirmReset, setConfirmReset] = useState(false);

  // Scoped to the side whose phase it is, so this always agrees with the
  // Pending button beside it.
  const pending = pendingCombatants(present).length;

  return (
    <div className="phasebar" data-phase={present.phase}>
      <div className="phasebar__main">
        <div className="phasebar__meta">
          <span className="eyebrow">
            Round <span className="tnum">{present.round}</span>
            <span className="phasebar__sep">·</span>
            P<span className="tnum">{present.playerPhaseCount}</span>
            <span className="phasebar__sep">·</span>
            E<span className="tnum">{present.enemyPhaseCount}</span>
          </span>
          <h2 className="phasebar__phase display" aria-live="polite">
            {PHASES[present.phase]}
          </h2>
          <p className="phasebar__pending">
            {pending === 0 ? "All combatants have acted" : `${pending} still to act`}
          </p>
        </div>

        <div className="phasebar__actions">
          <IconButton label="Undo last action" disabled={!past.length} onClick={undo}>
            ↶
          </IconButton>
          <IconButton label="Redo" disabled={!future.length} onClick={redo}>
            ↷
          </IconButton>
          <PostControls state={present} />
          <Button size="sm" aria-pressed={focusMode} onClick={onToggleFocus}>
            {focusMode ? "Show all" : "Focus phase"}
          </Button>
          {present.locked && (
            <Button size="sm" onClick={() => setConfirmReset(true)}>
              Reset init
            </Button>
          )}
          <Button
            tone="phase"
            className="phasebar__next"
            onClick={() => {
              dispatch({ type: "PHASE_ADVANCED" });
              playCue("phase");
            }}
          >
            Next phase →
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: "INITIATIVE_RESET" });
          announce("Initiative reset to round one.");
        }}
        title="Reset initiative?"
        confirmLabel="Reset"
        body={
          <>
            This returns the encounter to <strong>round 1</strong>, clears both phase
            counters, and unlocks initiative. Combatant health, conditions, and
            abilities are left untouched. This can be undone.
          </>
        }
      />
    </div>
  );
}

/* ── Multi-target actions ── */

function MultiAction({ combatants }: { combatants: Combatant[] }) {
  const { dispatch } = useStoreApi();
  const [mode, setMode] = useState<"damage" | "heal" | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<DamageType>("physical");

  const toggle = (id: string) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const close = () => {
    setMode(null);
    setTargets([]);
    setAmount("");
  };

  if (!mode) {
    return (
      <div className="multi__triggers">
        <Button size="sm" tone="danger" block onClick={() => setMode("damage")}>
          Multi-strike
        </Button>
        <Button size="sm" tone="heal" block onClick={() => setMode("heal")}>
          Multi-mend
        </Button>
      </div>
    );
  }

  const apply = () => {
    const amt = parseInt(amount, 10);
    if (!amt || !targets.length) return;
    if (mode === "damage") {
      dispatch({ type: "DAMAGE_APPLIED", ids: targets, amount: amt, damageType: type });
      playCue("damage");
      announce(`${amt} ${type} damage applied to ${targets.length} combatants.`);
    } else {
      dispatch({ type: "HEAL_APPLIED", ids: targets, amount: amt });
      playCue("heal");
      announce(`${amt} healing applied to ${targets.length} combatants.`);
    }
    close();
  };

  return (
    <section className={`multi panel multi--${mode}`} aria-label={mode === "damage" ? "Multi-target damage" : "Multi-target heal"}>
      <header className="multi__head">
        <h3 className="display">{mode === "damage" ? "Multi-strike" : "Multi-mend"}</h3>
        <div className="multi__bulk">
          <Button size="sm" onClick={() => setTargets(combatants.map((c) => c.id))}>All</Button>
          <Button size="sm" onClick={() => setTargets(combatants.filter((c) => c.role === "Player").map((c) => c.id))}>Players</Button>
          <Button size="sm" onClick={() => setTargets(combatants.filter((c) => c.role === "Enemy").map((c) => c.id))}>Enemies</Button>
          <Button size="sm" onClick={() => setTargets([])}>None</Button>
        </div>
      </header>

      <div className="multi__targets">
        {combatants.map((c) => (
          <button
            key={c.id}
            type="button"
            className="multi__target"
            data-active={targets.includes(c.id) ? "1" : undefined}
            aria-pressed={targets.includes(c.id)}
            onClick={() => toggle(c.id)}
          >
            {c.name}
            <span className="multi__hp tnum">{c.hp}</span>
          </button>
        ))}
      </div>

      <div className="multi__row">
        <input
          type="number"
          value={amount}
          placeholder="Amount"
          aria-label="Amount"
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
        {mode === "damage" && (
          <select value={type} aria-label="Damage type" onChange={(e) => setType(e.target.value as DamageType)}>
            <option value="physical">Physical</option>
            <option value="magical">Magical</option>
            <option value="raw">True</option>
          </select>
        )}
        <Button tone={mode === "damage" ? "danger" : "heal"} disabled={!targets.length || !amount} onClick={apply}>
          Apply to {targets.length}
        </Button>
        <Button onClick={close}>Cancel</Button>
      </div>
    </section>
  );
}

/* ── Add combatant ── */

function AddCombatant() {
  const { dispatch } = useStoreApi();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Player");
  const [type, setType] = useState("Normal");
  const [maxHp, setMaxHp] = useState("15");
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS });

  const submit = () => {
    if (!name.trim()) return;
    const c = createManualCombatant({
      name: name.trim(),
      role,
      type,
      maxHp: parseInt(maxHp, 10) || 15,
      stats,
    });
    dispatch({ type: "COMBATANTS_ADDED", combatants: [c] });
    announce(`${c.name} added to the encounter.`);
    setName("");
    setStats({ ...EMPTY_STATS });
  };

  return (
    <div className="addform">
      <div className="addform__row">
        <input
          value={name}
          placeholder="Name"
          aria-label="Combatant name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <select
          value={role}
          aria-label="Side"
          onChange={(e) => {
            const r = e.target.value as Role;
            setRole(r);
            if (r === "Player") setMaxHp("15");
          }}
        >
          <option>Player</option>
          <option>Enemy</option>
        </select>
        {role === "Enemy" && (
          <select
            value={type}
            aria-label="Enemy tier"
            onChange={(e) => {
              setType(e.target.value);
              setMaxHp(String(ENEMY_TYPE_HP[e.target.value] ?? 10));
            }}
          >
            <option>Normal</option>
            <option>Elite</option>
            <option>Boss</option>
          </select>
        )}
        <input
          type="number"
          min={1}
          value={maxHp}
          aria-label="Maximum hit points"
          onChange={(e) => setMaxHp(e.target.value)}
        />
        <Button tone="phase" onClick={submit}>
          Add
        </Button>
      </div>

      <Disclosure label="Starting stats">
        <div className="addform__stats">
          {STAT_KEYS.map((k) => (
            <label key={k} className="addform__stat">
              <span>{k}</span>
              <input
                type="number"
                value={stats[k]}
                onChange={(e) => setStats({ ...stats, [k]: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

/* ── Compact chip for collapsed groups ── */

function CombatantChip({ c, onFocus }: { c: Combatant; onFocus: () => void }) {
  const band = healthBand(c.hp, c.maxHp);
  return (
    <button type="button" className="rosterchip" data-band={band} data-done={c.done ? "1" : undefined} onClick={onFocus}>
      <span className="rosterchip__name">{c.name}</span>
      <span className="rosterchip__hp tnum" style={{ color: BAND_TONE[band] }}>
        {c.hp}/{c.maxHp}
      </span>
      <span className="rosterchip__bar" aria-hidden="true">
        <span style={{ width: `${healthPercent(c.hp, c.maxHp)}%`, background: BAND_TONE[band] }} />
      </span>
      {c.done && <span aria-hidden="true">✓</span>}
    </button>
  );
}

/* ── Group ── */

function Group({
  title,
  members,
  all,
  compact,
  focusedId,
  onFocus,
  playerPhaseCount,
  enemyPhaseCount,
  tone,
}: {
  title: string;
  members: Combatant[];
  all: Combatant[];
  compact: boolean;
  focusedId: string | null;
  onFocus: (id: string) => void;
  playerPhaseCount: number;
  enemyPhaseCount: number;
  tone: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!members.length) return null;

  const pending = members.filter((m) => !m.done && m.hp > 0).length;

  return (
    <section className="group" aria-label={title}>
      <header className="group__head">
        <button
          type="button"
          className="group__toggle display"
          style={{ color: tone }}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          {title}
          <span className="group__count tnum">{members.length}</span>
        </button>
        {pending > 0 && <Badge tone="warn">{pending} to act</Badge>}
      </header>

      {collapsed ? (
        <div className="group__chips">
          {members.map((c) => (
            <CombatantChip key={c.id} c={c} onFocus={() => onFocus(c.id)} />
          ))}
        </div>
      ) : (
        members.map((c) => {
          const side = all.filter((x) => x.role === c.role);
          const idx = side.indexOf(c);
          return (
            <CombatantCard
              key={c.id}
              c={c}
              compact={compact}
              playerPhaseCount={playerPhaseCount}
              enemyPhaseCount={enemyPhaseCount}
              isFirst={idx === 0}
              isLast={idx === side.length - 1}
              focused={focusedId === c.id}
              onFocus={onFocus}
            />
          );
        })
      )}
    </section>
  );
}

/* ── Tab ── */

export function TrackerTab({ session }: { session: SessionApi }) {
  const { present, trash } = useStore();
  const { dispatch } = useStoreApi();
  const [compact, setCompact] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(true);

  const players = useMemo(() => present.combatants.filter((c) => c.role === "Player"), [present.combatants]);
  const enemies = useMemo(() => present.combatants.filter((c) => c.role === "Enemy"), [present.combatants]);

  const restoreLast = () => {
    const t = trash[0];
    if (!t) return;
    dispatch({ type: "COMBATANT_RESTORED", combatant: t.combatant, index: t.index });
    announce(`${t.combatant.name} restored.`);
  };

  // Enemy phase puts enemies on top; every other phase leads with players.
  const groups =
    present.phase === 1
      ? [
          { title: "Enemies", members: enemies, tone: "var(--violet)" },
          { title: "Players", members: players, tone: "var(--moonlit)" },
        ]
      : [
          { title: "Players", members: players, tone: "var(--moonlit)" },
          { title: "Enemies", members: enemies, tone: "var(--violet)" },
        ];

  const visibleGroups = focusMode
    ? groups.filter((g) => (present.phase === 1 ? g.title === "Enemies" : present.phase === 0 ? g.title === "Players" : true))
    : groups;

  return (
    <div className="tracker">
      <PhaseBar focusMode={focusMode} onToggleFocus={() => setFocusMode((v) => !v)} />

      <div className="tracker__body">
        {!present.locked && <InitiativeRoller />}

        {present.combatants.length > 0 && showTable && (
          <WarTable focusedId={focusedId} onSelect={setFocusedId} />
        )}

        <div className="tracker__toolbar">
          <Button size="sm" aria-pressed={compact} onClick={() => setCompact((v) => !v)}>
            {compact ? "Expanded cards" : "Compact cards"}
          </Button>
          <Button size="sm" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Hide war table" : "Show war table"}
          </Button>
          {trash.length > 0 && (
            <Button size="sm" onClick={restoreLast}>
              Restore {trash[0]!.combatant.name}
            </Button>
          )}
        </div>

        {present.phase === 1 && present.combatants.length > 0 && (
          <EnemyPhasePanel state={present} />
        )}

        {present.combatants.length > 0 && <MultiAction combatants={present.combatants} />}

        {/* The roster is the instrument. Setup affordances live below it so the
            combatants the GM is reading stay closest to the phase controls. */}
        {present.combatants.length === 0 ? (
          <EmptyState
            seal="戰"
            title="The table is empty"
            body="Add combatants by hand, pull approved sheets from the library, or roll a fresh pack of enemies from the generator."
          />
        ) : (
          visibleGroups.map((g) => (
            <Group
              key={g.title}
              title={g.title}
              members={g.members}
              all={present.combatants}
              compact={compact}
              focusedId={focusedId}
              onFocus={setFocusedId}
              playerPhaseCount={present.playerPhaseCount}
              enemyPhaseCount={present.enemyPhaseCount}
              tone={g.tone}
            />
          ))
        )}

        <div className="tracker__setup">
          <Disclosure label="Add a combatant" defaultOpen={present.combatants.length === 0}>
            <AddCombatant />
          </Disclosure>
          <SessionBar session={session} />
        </div>
      </div>
    </div>
  );
}
