/**
 * The combatant card: the primary instrument during live combat.
 *
 * Layout priority, top to bottom: identity and health → immediate actions
 * (damage / heal / shield) → abilities → conditions → editing. Anything the GM
 * touches every round is reachable without opening a disclosure; anything
 * touched once per encounter is behind one.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  Ability,
  AbilityMode,
  Combatant,
  DamageType,
  StatKey,
} from "@/domain/types";
import {
  abilityFillPercent,
  applyDamage,
  deriveStats,
  effectiveStats,
  healthBand,
  healthPercent,
  isAbilityReady,
  isAmmoEmpty,
  isPhaseLocked,
  tempShieldDuration,
} from "@/domain/rules";
import { POSITIONS, SKILL_MODES, SKILL_MODE_LABELS, STAT_KEYS, STATUS_OPTIONS } from "@/domain/constants";
import { gid } from "@/domain/factory";
import { useStoreApi } from "@/state/store";
import { announce, useId } from "../hooks";
import { Badge, Button, Disclosure, IconButton, Meter, Modal } from "../primitives";
import { FloatingMarks, useFeedback, useImpact } from "@/fx/feedback";
import { playCue } from "@/fx/sound";
import "./tracker.css";

const BAND_TONE: Record<string, string> = {
  healthy: "var(--hp-healthy)",
  wounded: "var(--hp-wounded)",
  critical: "var(--hp-critical)",
  unconscious: "var(--hp-down)",
};

/** Glyphs so health state is never signalled by colour alone. */
const BAND_GLYPH: Record<string, string> = {
  healthy: "",
  wounded: "◐",
  critical: "◔",
  unconscious: "✕",
};

const BAND_LABEL: Record<string, string> = {
  healthy: "",
  wounded: "Wounded",
  critical: "Critical",
  unconscious: "Unconscious",
};

const MODE_TONE: Record<AbilityMode, string> = {
  cooldown: "var(--moonlit)",
  ammo: "var(--candle)",
  charge: "var(--jade)",
  passive: "var(--violet)",
  stack: "#f0762e",
  reaction: "#f2506e",
};

const DMG_TONE: Record<string, string> = {
  physical: "#ff9d90",
  magical: "#cbb8f5",
  raw: "var(--candle)",
  true: "var(--candle)",
};

/* ── Ability ── */

const AbilityChip = memo(function AbilityChip({
  ab,
  combatantId,
  playerPhaseCount,
  enemyPhaseCount,
  onEdit,
}: {
  ab: Ability;
  combatantId: string;
  playerPhaseCount: number;
  enemyPhaseCount: number;
  onEdit: (ab: Ability) => void;
}) {
  const { dispatch } = useStoreApi();
  const locked = isPhaseLocked(ab, playerPhaseCount, enemyPhaseCount);
  const ready = isAbilityReady(ab);
  const empty = isAmmoEmpty(ab);
  const tone = MODE_TONE[ab.mode];

  const isCharge = ab.mode === "charge";
  const chargeReady = isCharge && ab.cur >= ab.max;
  const chargeActive = isCharge && !!ab.charging && ab.cur < ab.max;
  const chargeIdle = isCharge && !ab.charging && ab.cur === 0;

  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current && !locked) {
      playCue(chargeReady ? "chargeComplete" : "abilityReady");
    }
    wasReady.current = ready;
  }, [ready, locked, chargeReady]);

  const patch = useCallback(
    (p: Partial<Ability>, marksDone = false) =>
      dispatch({
        type: "ABILITY_USED",
        id: combatantId,
        abilityId: ab.id,
        patch: p,
        marksDone,
      }),
    [dispatch, combatantId, ab.id],
  );

  const clampCur = (v: number) => Math.max(0, Math.min(ab.max, v));

  // State word carries the meaning; colour only reinforces it.
  const stateWord = locked
    ? "Locked"
    : ab.mode === "cooldown" || ab.mode === "reaction"
      ? ab.cur === 0
        ? "Ready"
        : `${ab.cur} left`
      : ab.mode === "passive"
        ? "Passive"
        : `${ab.cur}/${ab.max}`;

  return (
    <div
      className="ability"
      data-ready={ready && !locked ? "1" : undefined}
      data-locked={locked ? "1" : undefined}
      data-empty={empty ? "1" : undefined}
      style={{ ["--tone" as string]: tone }}
    >
      <div className="ability__head">
        <span className="ability__name" title={ab.name}>
          {ab.name}
        </span>
        <span className="ability__mode" style={{ color: tone }}>
          {SKILL_MODE_LABELS[ab.mode]}
        </span>
        <IconButton label={`Edit ${ab.name}`} onClick={() => onEdit(ab)}>
          ✎
        </IconButton>
        <IconButton
          label={`Remove ${ab.name}`}
          tone="danger"
          onClick={() =>
            dispatch({ type: "ABILITY_REMOVED", id: combatantId, abilityId: ab.id })
          }
        >
          ✕
        </IconButton>
      </div>

      {ab.effectText && <p className="ability__effect">{ab.effectText}</p>}

      <div className="ability__status">
        <span className="ability__state tnum">{stateWord}</span>
        {locked && (
          <span className="ability__lock">
            🔒 {ab.phaseLockType === "enemy" ? "enemy" : "player"} phase {ab.phaseLock}
          </span>
        )}
      </div>

      {ab.mode !== "passive" && !locked && (
        <Meter
          value={abilityFillPercent(ab)}
          max={100}
          tone={ready ? tone : "var(--metal-600)"}
          label={`${ab.name} readiness`}
          compact
        />
      )}

      {!locked && (
        <div className="ability__controls">
          {ab.mode !== "passive" && (
            <>
              <IconButton
                label={`Decrease ${ab.name}`}
                onClick={() => patch({ cur: clampCur(ab.cur - 1) })}
              >
                −
              </IconButton>
              <IconButton
                label={`Increase ${ab.name}`}
                onClick={() => patch({ cur: clampCur(ab.cur + 1) })}
              >
                +
              </IconButton>
            </>
          )}

          {ab.mode === "cooldown" && (
            <Button size="sm" tone="heal" disabled={!ready} onClick={() => patch({ cur: ab.max }, true)}>
              Use
            </Button>
          )}

          {ab.mode === "reaction" && (
            <Button
              size="sm"
              tone="danger"
              disabled={!ready}
              /* Reaction spends max+1 so it misses the current round's tick. */
              onClick={() => patch({ cur: ab.max + 1 })}
            >
              React
            </Button>
          )}

          {ab.mode === "ammo" && (
            <Button
              size="sm"
              tone="phase"
              disabled={empty}
              onClick={() => patch({ cur: clampCur(ab.cur - 1) }, true)}
            >
              Fire
            </Button>
          )}

          {chargeIdle && (
            <Button size="sm" tone="phase" onClick={() => patch({ charging: true }, true)}>
              Charge
            </Button>
          )}
          {chargeActive && (
            <Button size="sm" onClick={() => patch({ charging: false, cur: 0 })}>
              Cancel
            </Button>
          )}
          {chargeReady && (
            <Button size="sm" tone="heal" onClick={() => patch({ charging: false, cur: 0 }, true)}>
              Fire
            </Button>
          )}

          {ab.mode === "stack" && (
            <Button size="sm" onClick={() => patch({ cur: 0 })}>
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

/* ── Ability editor ── */

function AbilityEditor({
  ab,
  combatantId,
  onClose,
}: {
  ab: Ability;
  combatantId: string;
  onClose: () => void;
}) {
  const { dispatch } = useStoreApi();
  const [name, setName] = useState(ab.name);
  const [effect, setEffect] = useState(ab.effectText ?? "");
  const [max, setMax] = useState(String(ab.max));
  const [gain, setGain] = useState(String(ab.gainPerPhase ?? 1));

  const capacityLabel =
    ab.mode === "ammo" ? "Ammo capacity" : ab.mode === "charge" ? "Charge required" : ab.mode === "stack" ? "Stack ceiling" : "Cooldown length";

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit ability"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="heal"
            onClick={() => {
              dispatch({
                type: "ABILITY_UPDATED",
                id: combatantId,
                ability: {
                  ...ab,
                  name: name.trim() || ab.name,
                  effectText: effect,
                  max: Math.max(0, parseInt(max, 10) || 0),
                  gainPerPhase: Math.max(1, parseInt(gain, 10) || 1),
                },
              });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="field__label" htmlFor="ab-name">Name</label>
      <input id="ab-name" value={name} onChange={(e) => setName(e.target.value)} />

      {ab.mode !== "passive" && (
        <>
          <label className="field__label" htmlFor="ab-max">{capacityLabel}</label>
          <input id="ab-max" type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} />
        </>
      )}

      {ab.mode === "charge" && (
        <>
          <label className="field__label" htmlFor="ab-gain">Charge gained per round</label>
          <input id="ab-gain" type="number" min={1} value={gain} onChange={(e) => setGain(e.target.value)} />
        </>
      )}

      <label className="field__label" htmlFor="ab-effect">Effect</label>
      <textarea id="ab-effect" value={effect} onChange={(e) => setEffect(e.target.value)} />
    </Modal>
  );
}

/* ── Add ability ── */

function AddAbility({ combatantId }: { combatantId: string }) {
  const { dispatch } = useStoreApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<AbilityMode>("cooldown");
  const [max, setMax] = useState("2");
  const [gain, setGain] = useState("1");
  const [effect, setEffect] = useState("");
  const [lock, setLock] = useState("");
  const [lockType, setLockType] = useState<"player" | "enemy">("player");

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Ability
      </Button>
    );
  }

  const submit = () => {
    if (!name.trim()) return;
    const mx = Math.max(0, parseInt(max, 10) || 2);
    const phaseLock = parseInt(lock, 10) || null;
    const ability: Ability = {
      id: gid(),
      name: name.trim(),
      mode,
      max: mx,
      cur: mode === "ammo" ? mx : 0,
      gainPerPhase: Math.max(1, parseInt(gain, 10) || 1),
      effectText: effect,
      ...(phaseLock ? { phaseLock, phaseLockType: lockType } : {}),
    };
    dispatch({ type: "ABILITY_ADDED", id: combatantId, ability });
    setName("");
    setEffect("");
    setLock("");
    setOpen(false);
  };

  return (
    <div className="add-ability">
      <div className="add-ability__row">
        <input
          value={name}
          placeholder="Ability name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="Ability name"
          autoFocus
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as AbilityMode)}
          aria-label="Ability mode"
        >
          {SKILL_MODES.map((m) => (
            <option key={m} value={m}>
              {SKILL_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      <div className="add-ability__row">
        {mode !== "passive" && (
          <input
            type="number"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            aria-label="Capacity or cooldown"
            placeholder="Max"
          />
        )}
        {mode === "charge" && (
          <input
            type="number"
            min={1}
            value={gain}
            onChange={(e) => setGain(e.target.value)}
            aria-label="Charge per round"
            placeholder="Gain"
          />
        )}
        <input
          type="number"
          min={1}
          value={lock}
          onChange={(e) => setLock(e.target.value)}
          aria-label="Phase lock"
          placeholder="Phase lock"
        />
        {lock && (
          <select
            value={lockType}
            onChange={(e) => setLockType(e.target.value as "player" | "enemy")}
            aria-label="Phase lock type"
          >
            <option value="player">Player phase</option>
            <option value="enemy">Enemy phase</option>
          </select>
        )}
      </div>

      <textarea
        value={effect}
        onChange={(e) => setEffect(e.target.value)}
        placeholder="Effect (optional)"
        aria-label="Ability effect"
      />

      <div className="add-ability__row">
        <Button size="sm" tone="phase" onClick={submit}>
          Add
        </Button>
        <Button size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Card ── */

export interface CardProps {
  c: Combatant;
  playerPhaseCount: number;
  enemyPhaseCount: number;
  compact: boolean;
  isFirst: boolean;
  isLast: boolean;
  focused: boolean;
  onFocus: (id: string) => void;
}

export const CombatantCard = memo(function CombatantCard({
  c,
  playerPhaseCount,
  enemyPhaseCount,
  compact,
  isFirst,
  isLast,
  focused,
  onFocus,
}: CardProps) {
  const { dispatch } = useStoreApi();
  const { mark, hitstop } = useFeedback();

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(c.name);
  const [dmg, setDmg] = useState("");
  const [dmgType, setDmgType] = useState<DamageType>("physical");
  const [heal, setHeal] = useState("");
  const [editing, setEditing] = useState<Ability | null>(null);
  const [statusName, setStatusName] = useState<string>("Prone");
  const [statusCustom, setStatusCustom] = useState("");
  const [statusDur, setStatusDur] = useState("");
  const [draftStats, setDraftStats] = useState(c.stats);
  const [editStats, setEditStats] = useState(false);

  const band = healthBand(c.hp, c.maxHp);
  const pct = healthPercent(c.hp, c.maxHp);
  const derived = deriveStats(c.stats, c.tempMods);
  const eff = effectiveStats(c.stats, c.tempMods);
  const isPlayer = c.role === "Player";
  const headingId = useId("cbt");

  const cardRef = useImpact<HTMLElement>(c.hp);

  useEffect(() => {
    if (!focused) return;
    const el = cardRef.current;
    if (!el) return;
    // Only pull the card into view when the selection came from somewhere else
    // (war table, command palette). If focus is already inside this card the GM
    // is looking straight at it, and scrolling would move the control out from
    // under the pointer between mousedown and mouseup — which silently
    // cancels the click.
    if (el.contains(document.activeElement)) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused, cardRef]);

  const applyDmg = () => {
    const amount = parseInt(dmg, 10);
    if (!amount) return;
    const preview = applyDamage(c, amount, dmgType);
    const b = preview.breakdown;

    if (b.toHp > 0) {
      mark(c.id, `−${b.toHp}`, dmgType === "magical" ? "magical" : dmgType === "physical" ? "physical" : "true");
      hitstop(b.toHp >= c.maxHp * 0.25 ? 70 : 45);
      playCue("damage");
    }
    if (b.resisted > 0) mark(c.id, `${b.resisted} resisted`, "resist");
    if (b.absorbedByTemp + b.absorbedByShield > 0) {
      mark(c.id, `◈ ${b.absorbedByTemp + b.absorbedByShield}`, "shield");
      playCue(b.brokeShield ? "shieldBreak" : "shieldHit");
    }
    if (b.brokeShield || b.brokeTempShieldIds.length) mark(c.id, "SHIELD BROKEN", "shieldBreak");

    dispatch({ type: "DAMAGE_APPLIED", ids: [c.id], amount, damageType: dmgType });

    const died = c.hp > 0 && preview.hp <= 0;
    if (died) playCue("defeated");
    announce(
      `${c.name} took ${amount} ${dmgType} damage. ${preview.hp} of ${c.maxHp} hit points remaining.${died ? " Unconscious." : ""}`,
    );
    setDmg("");
  };

  const applyHealing = () => {
    const amount = parseInt(heal, 10);
    if (!amount) return;
    const next = Math.min(c.maxHp, c.hp + amount);
    if (next !== c.hp) {
      mark(c.id, `+${next - c.hp}`, "heal");
      playCue("heal");
    }
    dispatch({ type: "HEAL_APPLIED", ids: [c.id], amount });
    announce(`${c.name} healed to ${next} of ${c.maxHp}.`);
    setHeal("");
  };

  const commitName = () => {
    const name = draftName.trim();
    if (name && name !== c.name) dispatch({ type: "COMBATANT_RENAMED", id: c.id, name });
    setRenaming(false);
  };

  const addStatus = () => {
    const name = statusName === "Custom" ? statusCustom.trim() : statusName;
    const duration = parseInt(statusDur, 10);
    if (!name || !duration) return;
    dispatch({ type: "STATUS_ADDED", id: c.id, status: { id: gid(), name, duration } });
    announce(`${c.name} is now ${name} for ${duration} rounds.`);
    setStatusDur("");
    setStatusCustom("");
  };

  return (
    <article
      ref={cardRef}
      className="card"
      data-side={isPlayer ? "player" : "enemy"}
      data-band={band}
      data-done={c.done ? "1" : undefined}
      data-focused={focused ? "1" : undefined}
      aria-labelledby={headingId}
      onFocusCapture={() => onFocus(c.id)}
    >
      <FloatingMarks targetId={c.id} />

      {/* ── Identity ── */}
      <header className="card__head">
        <div className="card__order">
          <IconButton
            label={`Move ${c.name} earlier`}
            disabled={isFirst}
            onClick={() => dispatch({ type: "COMBATANT_MOVED", id: c.id, direction: -1 })}
          >
            ▲
          </IconButton>
          <IconButton
            label={`Move ${c.name} later`}
            disabled={isLast}
            onClick={() => dispatch({ type: "COMBATANT_MOVED", id: c.id, direction: 1 })}
          >
            ▼
          </IconButton>
        </div>

        <div className="card__identity">
          {renaming ? (
            <div className="card__rename">
              <input
                value={draftName}
                autoFocus
                aria-label={`Rename ${c.name}`}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setDraftName(c.name);
                    setRenaming(false);
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="card__name display"
              id={headingId}
              onClick={() => {
                setDraftName(c.name);
                setRenaming(true);
              }}
              title="Click to rename"
            >
              {c.name}
            </button>
          )}

          <div className="card__tags">
            <Badge tone={isPlayer ? "player" : "enemy"}>{isPlayer ? "Player" : c.type || "Enemy"}</Badge>
            <Badge tone="neutral" glyph={c.position === "Out" ? "⤫" : c.position === "Back" ? "◂" : "▸"}>
              {c.position}
            </Badge>
            {BAND_LABEL[band] && (
              <Badge tone={band === "unconscious" ? "danger" : band === "critical" ? "danger" : "warn"} glyph={BAND_GLYPH[band]}>
                {BAND_LABEL[band]}
              </Badge>
            )}
            {c.done && <Badge tone="ok" glyph="✓">Acted</Badge>}
          </div>
        </div>

        <div className="card__head-actions">
          <Button
            size="sm"
            tone={c.done ? "phase" : "neutral"}
            aria-pressed={c.done}
            onClick={() => dispatch({ type: "COMBATANT_DONE_TOGGLED", id: c.id })}
          >
            {c.done ? "✓ Acted" : "Mark acted"}
          </Button>
          <IconButton
            label={`Duplicate ${c.name}`}
            onClick={() => dispatch({ type: "COMBATANT_DUPLICATED", id: c.id })}
          >
            ⧉
          </IconButton>
          <IconButton
            label={`Remove ${c.name}`}
            tone="danger"
            onClick={() => {
              dispatch({ type: "COMBATANT_REMOVED", id: c.id });
              announce(`${c.name} removed. Undo is available.`);
            }}
          >
            ✕
          </IconButton>
        </div>
      </header>

      {/* ── Health ── */}
      <div className="card__health">
        <div className="card__hp-row">
          <span className="eyebrow">Health</span>
          <span className="card__hp tnum" style={{ color: BAND_TONE[band] }}>
            {c.hp}
            <span className="card__hp-sep">/</span>
            {c.maxHp}
          </span>
        </div>
        <Meter
          value={c.hp}
          max={c.maxHp}
          tone={BAND_TONE[band]!}
          label={`${c.name} health: ${c.hp} of ${c.maxHp}`}
        />
        {pct <= 25 && c.hp > 0 && <div className="card__pulse" aria-hidden="true" />}
      </div>

      {/* ── Positions ── */}
      <div className="card__positions" role="group" aria-label={`${c.name} position`}>
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            className="pos-btn"
            data-active={c.position === p ? "1" : undefined}
            aria-pressed={c.position === p}
            onClick={() => dispatch({ type: "COMBATANT_POSITION_SET", id: c.id, position: p })}
          >
            {p}
          </button>
        ))}
      </div>

      {!compact && (
        <>
          {/* ── Immediate actions ── */}
          <div className="card__actions">
            <div className="action-group">
              <input
                type="number"
                value={dmg}
                placeholder="Damage"
                aria-label={`Damage to ${c.name}`}
                onChange={(e) => setDmg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyDmg()}
              />
              <select
                value={dmgType}
                aria-label="Damage type"
                onChange={(e) => setDmgType(e.target.value as DamageType)}
                style={{ color: DMG_TONE[dmgType] }}
              >
                <option value="physical">Physical</option>
                <option value="magical">Magical</option>
                <option value="raw">True</option>
              </select>
              <Button tone="danger" onClick={applyDmg}>
                Strike
              </Button>
            </div>

            <div className="action-group">
              <input
                type="number"
                value={heal}
                placeholder="Heal"
                aria-label={`Heal ${c.name}`}
                onChange={(e) => setHeal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyHealing()}
              />
              <Button tone="heal" onClick={applyHealing}>
                Mend
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (c.hp < c.maxHp) {
                    mark(c.id, `+${c.maxHp - c.hp}`, "heal");
                    playCue("heal");
                  }
                  dispatch({ type: "FULL_HEAL_APPLIED", ids: [c.id] });
                  announce(`${c.name} restored to full health.`);
                }}
              >
                Full
              </Button>
            </div>
          </div>

          {/* ── Shields ── */}
          <ShieldRow c={c} />

          {/* ── Abilities ── */}
          {c.abilities.length > 0 && (
            <div className="card__abilities">
              {c.abilities.map((ab) => (
                <AbilityChip
                  key={ab.id}
                  ab={ab}
                  combatantId={c.id}
                  playerPhaseCount={playerPhaseCount}
                  enemyPhaseCount={enemyPhaseCount}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}

          {/* ── Statuses ── */}
          {c.statuses.length > 0 && (
            <ul className="chips" aria-label={`${c.name} conditions`}>
              {c.statuses.map((s) => (
                <li key={s.id} className="chip chip--status">
                  <span>{s.name}</span>
                  <span className="chip__meta tnum">{s.duration}r</span>
                  <IconButton
                    label={`Remove ${s.name}`}
                    onClick={() => dispatch({ type: "STATUS_REMOVED", id: c.id, statusId: s.id })}
                  >
                    ✕
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          {(c.dots.length > 0 || c.hpRegens.length > 0 || c.hpRegen > 0) && (
            <ul className="chips" aria-label={`${c.name} ongoing effects`}>
              {c.dots.map((d) => (
                <li key={d.id} className="chip chip--dot">
                  <span className="chip__lead tnum" style={{ color: DMG_TONE[d.type] }}>
                    −{d.dmg}
                  </span>
                  <span>{d.name}</span>
                  <span className="chip__meta">{d.type}</span>
                  <span className="chip__meta tnum">{d.permanent ? "∞" : `${d.duration}r`}</span>
                  <IconButton label={`Remove ${d.name}`} onClick={() => dispatch({ type: "DOT_REMOVED", id: c.id, dotId: d.id })}>
                    ✕
                  </IconButton>
                </li>
              ))}
              {(c.hpRegens.length ? c.hpRegens : c.hpRegen > 0 ? [{ id: "legacy", val: c.hpRegen, permanent: true, duration: null }] : []).map((r) => (
                <li key={r.id} className="chip chip--regen">
                  <span className="chip__lead tnum">+{r.val}</span>
                  <span>regen</span>
                  <span className="chip__meta tnum">{r.permanent ? "∞" : `${r.duration}r`}</span>
                  <IconButton label="Remove regeneration" onClick={() => dispatch({ type: "REGEN_REMOVED", id: c.id, regenId: r.id })}>
                    ✕
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          {/* ── Add condition ── */}
          <div className="card__status-add">
            <select value={statusName} onChange={(e) => setStatusName(e.target.value)} aria-label="Condition">
              {STATUS_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            {statusName === "Custom" && (
              <input
                value={statusCustom}
                placeholder="Name"
                aria-label="Custom condition name"
                onChange={(e) => setStatusCustom(e.target.value)}
              />
            )}
            <input
              type="number"
              min={1}
              value={statusDur}
              placeholder="Rounds"
              aria-label="Condition duration in rounds"
              onChange={(e) => setStatusDur(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStatus()}
            />
            <Button size="sm" onClick={addStatus}>
              Apply
            </Button>
          </div>

          {/* ── Progressive disclosure ── */}
          <div className="card__more">
            <Disclosure label="Stats" count={undefined}>
              <div className="stat-grid" role="list">
                {STAT_KEYS.map((k) => {
                  const base = c.stats[k] ?? 0;
                  const total = eff[k];
                  const delta = total - base;
                  return (
                    <div key={k} className="stat" role="listitem">
                      <span className="stat__key">{k}</span>
                      <span className="stat__val tnum" data-sign={total > 0 ? "pos" : total < 0 ? "neg" : "zero"}>
                        {total > 0 ? `+${total}` : total}
                      </span>
                      {delta !== 0 && (
                        <span className="stat__delta tnum">
                          {delta > 0 ? `+${delta}` : delta} tmp
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <dl className="derived">
                <div><dt>AC</dt><dd className="tnum">{derived.ac}</dd></div>
                <div><dt>Hit</dt><dd className="tnum">{derived.hit >= 0 ? `+${derived.hit}` : derived.hit}</dd></div>
                <div><dt>Phys</dt><dd className="tnum">{derived.physicalDamage >= 0 ? `+${derived.physicalDamage}` : derived.physicalDamage}</dd></div>
                <div><dt>Mag</dt><dd className="tnum">{derived.magicalDamage >= 0 ? `+${derived.magicalDamage}` : derived.magicalDamage}</dd></div>
                <div><dt>P.Res</dt><dd className="tnum">{derived.physicalResist}</dd></div>
                <div><dt>M.Res</dt><dd className="tnum">{derived.magicalResist}</dd></div>
              </dl>

              {editStats ? (
                <div className="stat-edit">
                  {STAT_KEYS.map((k) => (
                    <label key={k} className="stat-edit__field">
                      <span>{k}</span>
                      <input
                        type="number"
                        value={draftStats[k]}
                        onChange={(e) =>
                          setDraftStats({ ...draftStats, [k as StatKey]: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </label>
                  ))}
                  <div className="stat-edit__actions">
                    <Button size="sm" tone="heal" onClick={() => { dispatch({ type: "COMBATANT_STATS_SET", id: c.id, stats: draftStats }); setEditStats(false); }}>
                      Save
                    </Button>
                    <Button size="sm" onClick={() => { setDraftStats(c.stats); setEditStats(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" onClick={() => { setDraftStats(c.stats); setEditStats(true); }}>
                  Edit stats
                </Button>
              )}
            </Disclosure>

            <Disclosure label="Effects">
              <OngoingEditor c={c} />
            </Disclosure>

            <Disclosure label="Abilities">
              <AddAbility combatantId={c.id} />
            </Disclosure>

            <Disclosure label="Notes">
              <textarea
                value={c.notes}
                aria-label={`${c.name} notes`}
                placeholder={"Notes…\n* bullet points"}
                onChange={(e) => dispatch({ type: "COMBATANT_NOTES_SET", id: c.id, notes: e.target.value })}
              />
            </Disclosure>
          </div>
        </>
      )}

      {editing && (
        <AbilityEditor ab={editing} combatantId={c.id} onClose={() => setEditing(null)} />
      )}
    </article>
  );
});

/* ── Shields ── */

function ShieldRow({ c }: { c: Combatant }) {
  const { dispatch } = useStoreApi();
  const [val, setVal] = useState("");
  const [label, setLabel] = useState("");

  const addTemp = () => {
    const v = parseInt(val, 10);
    if (!v || v < 1) return;
    dispatch({
      type: "TEMP_SHIELD_ADDED",
      id: c.id,
      shield: { id: gid(), val: v, duration: tempShieldDuration(v), label: label.trim() },
    });
    setVal("");
    setLabel("");
  };

  return (
    <div className="shields">
      <div className="shields__normal">
        <span className="eyebrow">Shield</span>
        <IconButton label="Decrease shield" onClick={() => dispatch({ type: "SHIELD_ADJUSTED", id: c.id, delta: -1 })}>
          −
        </IconButton>
        <span className="shields__val tnum">{c.shield}</span>
        <IconButton label="Increase shield" onClick={() => dispatch({ type: "SHIELD_ADJUSTED", id: c.id, delta: 1 })}>
          +
        </IconButton>
      </div>

      {c.tempShields.map((s) => (
        <span key={s.id} className="chip chip--temp">
          <span className="chip__lead tnum">◈ {s.val}</span>
          {s.label && <span>{s.label}</span>}
          <span className="chip__meta tnum">{s.duration}r</span>
          <IconButton
            label="Remove temporary shield"
            onClick={() => dispatch({ type: "TEMP_SHIELD_REMOVED", id: c.id, shieldId: s.id })}
          >
            ✕
          </IconButton>
        </span>
      ))}

      <div className="shields__add">
        <input
          type="number"
          min={1}
          max={6}
          value={val}
          placeholder="Temp"
          aria-label="Temporary shield value"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTemp()}
        />
        <input
          value={label}
          placeholder="Source"
          aria-label="Temporary shield source"
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button size="sm" tone="shield" onClick={addTemp}>
          Ward
        </Button>
      </div>
      {val && (
        <p className="shields__hint">
          Lasts {tempShieldDuration(parseInt(val, 10) || 1)} round
          {tempShieldDuration(parseInt(val, 10) || 1) === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

/* ── DoT / regen / modifier editor ── */

function OngoingEditor({ c }: { c: Combatant }) {
  const { dispatch } = useStoreApi();
  const [dotName, setDotName] = useState("");
  const [dotDmg, setDotDmg] = useState("");
  const [dotType, setDotType] = useState<DamageType>("physical");
  const [dotPerm, setDotPerm] = useState(false);
  const [dotDur, setDotDur] = useState("");

  const [regVal, setRegVal] = useState("");
  const [regPerm, setRegPerm] = useState(false);
  const [regDur, setRegDur] = useState("");

  const [modStat, setModStat] = useState<StatKey>("STR");
  const [modVal, setModVal] = useState("");
  const [modDur, setModDur] = useState("");
  const [modLabel, setModLabel] = useState("");

  return (
    <div className="ongoing">
      <fieldset className="ongoing__set">
        <legend className="eyebrow">Damage over time</legend>
        <div className="ongoing__row">
          <input value={dotName} placeholder="Name" aria-label="DoT name" onChange={(e) => setDotName(e.target.value)} />
          <input type="number" min={1} value={dotDmg} placeholder="Per round" aria-label="DoT damage per round" onChange={(e) => setDotDmg(e.target.value)} />
          <select value={dotType} aria-label="DoT damage type" onChange={(e) => setDotType(e.target.value as DamageType)}>
            <option value="physical">Physical</option>
            <option value="magical">Magical</option>
            <option value="true">True</option>
          </select>
        </div>
        <div className="ongoing__row">
          <label className="ongoing__check">
            <input type="checkbox" checked={dotPerm} onChange={(e) => setDotPerm(e.target.checked)} />
            Permanent
          </label>
          {!dotPerm && (
            <input type="number" min={1} value={dotDur} placeholder="Rounds" aria-label="DoT duration" onChange={(e) => setDotDur(e.target.value)} />
          )}
          <Button
            size="sm"
            tone="danger"
            onClick={() => {
              const d = parseInt(dotDmg, 10);
              const dur = parseInt(dotDur, 10);
              if (!d || (!dotPerm && !dur)) return;
              dispatch({
                type: "DOT_ADDED",
                id: c.id,
                dot: { id: gid(), name: dotName.trim() || "DoT", dmg: d, type: dotType, permanent: dotPerm, duration: dotPerm ? null : dur },
              });
              setDotName(""); setDotDmg(""); setDotDur(""); setDotPerm(false);
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      <fieldset className="ongoing__set">
        <legend className="eyebrow">Regeneration</legend>
        <div className="ongoing__row">
          <input type="number" min={1} value={regVal} placeholder="HP per round" aria-label="Regeneration per round" onChange={(e) => setRegVal(e.target.value)} />
          <label className="ongoing__check">
            <input type="checkbox" checked={regPerm} onChange={(e) => setRegPerm(e.target.checked)} />
            Permanent
          </label>
          {!regPerm && (
            <input type="number" min={1} value={regDur} placeholder="Rounds" aria-label="Regeneration duration" onChange={(e) => setRegDur(e.target.value)} />
          )}
          <Button
            size="sm"
            tone="heal"
            onClick={() => {
              const v = parseInt(regVal, 10);
              const dur = parseInt(regDur, 10);
              if (!v || (!regPerm && !dur)) return;
              dispatch({ type: "REGEN_ADDED", id: c.id, regen: { id: gid(), val: v, permanent: regPerm, duration: regPerm ? null : dur } });
              setRegVal(""); setRegDur(""); setRegPerm(false);
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      <fieldset className="ongoing__set">
        <legend className="eyebrow">Temporary modifiers</legend>
        {c.tempMods.length > 0 && (
          <ul className="chips">
            {c.tempMods.map((m) => (
              <li key={m.id} className="chip chip--mod">
                <span>{m.label}</span>
                <span className="chip__meta tnum">{m.duration}r</span>
                <IconButton label={`Remove ${m.label}`} onClick={() => dispatch({ type: "TEMP_MOD_REMOVED", id: c.id, modId: m.id })}>
                  ✕
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <div className="ongoing__row">
          <select value={modStat} aria-label="Modifier stat" onChange={(e) => setModStat(e.target.value as StatKey)}>
            {STAT_KEYS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input type="number" value={modVal} placeholder="Value" aria-label="Modifier value" onChange={(e) => setModVal(e.target.value)} />
          <input type="number" min={1} value={modDur} placeholder="Rounds" aria-label="Modifier duration" onChange={(e) => setModDur(e.target.value)} />
          <input value={modLabel} placeholder="Label" aria-label="Modifier label" onChange={(e) => setModLabel(e.target.value)} />
          <Button
            size="sm"
            onClick={() => {
              const v = parseInt(modVal, 10);
              const dur = parseInt(modDur, 10);
              if (!v || !dur) return;
              dispatch({
                type: "TEMP_MOD_ADDED",
                id: c.id,
                mod: { id: gid(), stat: modStat, val: v, duration: dur, label: modLabel.trim() || `${modStat} ${v > 0 ? "+" : ""}${v}` },
              });
              setModVal(""); setModDur(""); setModLabel("");
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
