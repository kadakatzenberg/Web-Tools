/**
 * The tracker: phase state, roster, and every action taken during live combat.
 *
 * Information architecture follows the round loop — current phase and the Next
 * Phase control are pinned and always reachable, then who still has to act,
 * then the combatants themselves. Setup affordances (add, initiative, session)
 * collapse away once the fight is running.
 */

import { useCallback, useMemo, useState } from "react";
import type { Combatant, DamageType, Role, Stats } from "@/domain/types";
import { EMPTY_STATS, ENEMY_TYPE_HP, PHASES, STATUS_OPTIONS, STAT_KEYS } from "@/domain/constants";
import { healthBand, healthPercent } from "@/domain/rules";
import { rollInitiative } from "@/domain/phase";
import { createManualCombatant } from "@/domain/factory";
import { useStore, useStoreApi } from "@/state/store";
import type { SessionApi } from "@/persistence/useSession";
import { announce, useCopy, useMediaQuery } from "../hooks";
import { Badge, Button, ConfirmDialog, Disclosure, EmptyState, IconButton, NumberInput, useToast } from "../primitives";
import { CombatantCard } from "./CombatantCard";
import { OrderRail } from "./OrderRail";
import { RoundHerald } from "./RoundHerald";
import { EventLogPanel } from "../EventLog";
import { IconAdvance, IconRedo, IconUndo } from "../icons";
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
          {/* The round as a struck coin. It is the largest figure on the screen
              because it is the one piece of state that orients everything else. */}
          <div className="phasebar__round" aria-hidden="true">
            <span className="phasebar__round-label">Round</span>
            <span className="phasebar__round-value">{present.round}</span>
          </div>

          <div className="phasebar__names">
            <h2 className="phasebar__phase" aria-live="polite">
              {PHASES[present.phase]}
            </h2>
            <p className="phasebar__pending">
              {pending === 0 ? "All combatants have acted" : `${pending} still to act`}
              <span className="phasebar__sep">·</span>
              <span className="phasebar__counts">
                P{present.playerPhaseCount} E{present.enemyPhaseCount}
              </span>
            </p>
            <span className="sr-only">
              Round {present.round}, {PHASES[present.phase]}.
            </span>
          </div>
        </div>

        <div className="phasebar__actions">
          <IconButton label="Undo last action" disabled={!past.length} onClick={undo}>
            <IconUndo size={15} />
          </IconButton>
          <IconButton label="Redo" disabled={!future.length} onClick={redo}>
            <IconRedo size={15} />
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
            Next phase
            <IconAdvance size={15} />
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
  const toast = useToast();
  const [mode, setMode] = useState<"damage" | "heal" | "condition" | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<DamageType>("physical");
  const [condition, setCondition] = useState<string>("Prone");
  const [customCondition, setCustomCondition] = useState("");
  const [duration, setDuration] = useState("1");
  const [asDot, setAsDot] = useState(false);

  const toggle = (id: string) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  /**
   * Selection is held by id, so a combatant removed while this panel is open
   * used to stay selected: the button still read "Apply to 2" with one target
   * left on the table, and the dispatch went to an id that no longer existed.
   * Intersect with the live roster instead of trusting the stored list.
   */
  const live = useMemo(() => {
    const present = new Set(combatants.map((c) => c.id));
    return targets.filter((id) => present.has(id));
  }, [targets, combatants]);

  const close = () => {
    setMode(null);
    setTargets([]);
    setAmount("");
    setDuration("1");
    setCustomCondition("");
    setAsDot(false);
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
        <Button size="sm" block onClick={() => setMode("condition")}>
          Multi-affect
        </Button>
      </div>
    );
  }

  const apply = () => {
    // Each of these used to return silently, so a click on Apply with one
    // field unfilled looked identical to the app being frozen.
    if (!live.length) {
      toast.push("Pick at least one target first.", "warn");
      return;
    }

    if (mode === "condition") {
      const name = condition === "Custom" ? customCondition.trim() : condition;
      const rounds = parseInt(duration, 10);
      if (!name) {
        toast.push("Name the condition first.", "warn");
        return;
      }
      if (!rounds || rounds < 1) {
        toast.push("A condition needs a duration of at least one round.", "warn");
        return;
      }
      if (asDot) {
        const dmg = parseInt(amount, 10);
        if (!dmg) {
          toast.push("Set the damage per round first.", "warn");
          return;
        }
        dispatch({
          type: "DOT_ADDED_MANY",
          ids: live,
          dot: { name, dmg, type, permanent: false, duration: rounds },
        });
        announce(`${name} applied to ${live.length} combatants for ${rounds} rounds.`);
      } else {
        dispatch({
          type: "STATUS_ADDED_MANY",
          ids: live,
          status: { name, duration: rounds },
        });
        announce(`${name} applied to ${live.length} combatants.`);
      }
      close();
      return;
    }

    const amt = parseInt(amount, 10);
    if (!amt) {
      toast.push(
        mode === "damage" ? "Enter an untaxed damage amount first." : "Enter an amount to heal first.",
        "warn",
      );
      return;
    }
    if (mode === "damage") {
      dispatch({ type: "DAMAGE_APPLIED", ids: live, amount: amt, damageType: type });
      playCue("damage");
      announce(`${amt} ${type} damage applied to ${live.length} combatants.`);
    } else {
      dispatch({ type: "HEAL_APPLIED", ids: live, amount: amt });
      playCue("heal");
      announce(`${amt} healing applied to ${live.length} combatants.`);
    }
    close();
  };

  return (
    <section className={`multi panel multi--${mode}`} aria-label={
        mode === "damage"
          ? "Multi-target damage"
          : mode === "heal"
            ? "Multi-target heal"
            : "Multi-target condition"
      }>
      <header className="multi__head">
        <h3 className="display">
          {mode === "damage" ? "Multi-strike" : mode === "heal" ? "Multi-mend" : "Multi-affect"}
        </h3>
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
        {mode === "condition" ? (
          <>
            <select
              value={condition}
              aria-label="Condition to apply"
              onChange={(e) => setCondition(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            {condition === "Custom" && (
              <input
                value={customCondition}
                placeholder="Name"
                aria-label="Custom condition name to apply"
                onChange={(e) => setCustomCondition(e.target.value)}
              />
            )}
            <input
              type="number"
              min={1}
              value={duration}
              placeholder="Rounds"
              aria-label="Duration in rounds to apply"
              onChange={(e) => setDuration(e.target.value)}
            />
            <label className="multi__check">
              <input
                type="checkbox"
                checked={asDot}
                onChange={(e) => setAsDot(e.target.checked)}
              />
              Damage over time
            </label>
            {asDot && (
              <>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  placeholder="Per round"
                  aria-label="Damage per round to apply"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <select
                  value={type}
                  aria-label="Damage type to apply"
                  onChange={(e) => setType(e.target.value as DamageType)}
                >
                  <option value="physical">Physical</option>
                  <option value="magical">Magical</option>
                  <option value="true">True</option>
                </select>
              </>
            )}
          </>
        ) : (
          <>
            <input
              type="number"
              value={amount}
              placeholder={mode === "damage" ? "Untaxed" : "Amount"}
              aria-label={
                mode === "damage" ? "Untaxed damage to apply" : "Healing amount to apply"
              }
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            {mode === "damage" && (
              <select value={type} aria-label="Damage type to apply" onChange={(e) => setType(e.target.value as DamageType)}>
                <option value="physical">Physical</option>
                <option value="magical">Magical</option>
                <option value="raw">True</option>
              </select>
            )}
          </>
        )}
        <Button
          tone={mode === "damage" ? "danger" : mode === "heal" ? "heal" : "phase"}
          disabled={!live.length}
          onClick={apply}
        >
          Apply to {live.length}
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
            // Switching to Enemy reveals a tier select defaulting to Normal, so
            // the HP has to follow it. Leaving it at 15 showed "Normal" beside
            // the Elite hit-point total.
            setMaxHp(r === "Player" ? "15" : String(ENEMY_TYPE_HP[type] ?? 10));
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
              <NumberInput
                value={stats[k]}
                onChange={(n) => setStats({ ...stats, [k]: n })}
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
        <span style={{ width: `${healthPercent(c.hp, c.maxHp)}%`, backgroundColor: BAND_TONE[band] }} />
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
        <div className="roster">
          {members.map((c) => {
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
          })}
        </div>
      )}
    </section>
  );
}

/* ── Tab ── */

export function TrackerTab({ session }: { session: SessionApi; logOpen?: boolean }) {
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

  /** Selecting in the rail focuses the card and brings it into view. */
  const selectFromRail = useCallback((id: string) => {
    setFocusedId(id);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-combatant="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  const populated = present.combatants.length > 0;

  /**
   * The activity rail only exists on a wide screen. Below that the enemy roll
   * block moves back into the main column rather than disappearing — hiding the
   * rail with CSS alone silently removed the feature on every tablet and phone.
   * Rendered in exactly one place either way, so there is no duplicate DOM for
   * a screen reader to walk twice.
   */
  const hasContextRail = useMediaQuery("(min-width: 1181px)");
  const showRolls = present.phase === 1 && populated;

  return (
    <div className="tracker">
      <RoundHerald round={present.round} />

      <div className="workspace">
        {/* ── The Order ──
            Read-only standing of every combatant, pinned so the state of the
            fight is legible no matter how far down the roster you have
            scrolled. */}
        <aside className="workspace__rail">
          <OrderRail state={present} focusedId={focusedId} onSelect={selectFromRail} />
        </aside>

        <div className="workspace__main">
          <PhaseBar focusMode={focusMode} onToggleFocus={() => setFocusMode((v) => !v)} />

          <div className="tracker__body">
            {!present.locked && <InitiativeRoller />}

            {populated && showTable && (
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

            {showRolls && !hasContextRail && <EnemyPhasePanel state={present} />}

            {populated && <MultiAction combatants={present.combatants} />}

            {!populated ? (
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

            {/* Setup lives beneath the roster: it is touched once per encounter,
                the roster is touched every round. */}
            <div className="tracker__setup">
              <Disclosure label="Add a combatant" defaultOpen={!populated}>
                <AddCombatant />
              </Disclosure>
              <SessionBar session={session} />
            </div>
          </div>
        </div>

        {/* ── Activity ──
            The enemy roll block when it is the enemies' phase, the combat log
            otherwise. Both used to be buried: the rolls pushed the roster down
            the page, and the log was hidden behind a toggle most GMs never
            found. */}
        {hasContextRail && (
        <aside className="workspace__context" aria-label="Activity">
          {showRolls ? (
            <div className="context__scroll">
              <EnemyPhasePanel state={present} />
            </div>
          ) : (
            <EventLogPanel />
          )}
        </aside>
        )}
      </div>
    </div>
  );
}
