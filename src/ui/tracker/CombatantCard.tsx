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
  ModTarget,
  StatKey,
} from "@/domain/types";
import {
  abilityFillPercent,
  applyDamage,
  applyHealing as healPreview,
  deriveStats,
  effectiveStats,
  healthBand,
  healthPercent,
  isAbilityReady,
  isAmmoEmpty,
  isPhaseLocked,
  tempShieldDuration,
} from "@/domain/rules";
import { POSITIONS, SKILL_MODES, SKILL_MODE_LABELS, STACK_PRESETS, STAT_KEYS, STATUS_OPTIONS } from "@/domain/constants";
import { gid } from "@/domain/factory";
import { checkRoll, d20Roll, looksLikeDice, swingFor, wrapDice } from "@/domain/dice";
import { useStoreApi } from "@/state/store";
import { announce, useCopy, useId } from "../hooks";
import { Badge, Button, DetailTabs, IconButton, Meter, Modal, NumberInput, useToast } from "../primitives";
import { IconCheck, IconClose, IconDice, IconDuplicate, IconMinus, IconPlus, IconTarget, IconWard, statusMark } from "../icons";
import { Portrait } from "../Portrait";
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

  const copy = useCopy();
  const toast = useToast();

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

      {/* The saving throw this skill forces, shown on the caster's chip so the
          GM can read it off while casting and set it on the target's card. */}
      {ab.dcStat && ab.dcValue ? (
        <p className="ability__dc">
          <span className="ability__dc-mark" aria-hidden="true">
            <IconTarget size={11} />
          </span>
          Forces a <strong>{ab.dcStat}</strong> check, DC <strong>{ab.dcValue}</strong>
        </p>
      ) : null}

      {ab.dice && (
        <button
          type="button"
          className="ability__dice"
          title={`Copy ${wrapDice(ab.dice)} for Discord`}
          onClick={async () => {
            const ok = await copy(wrapDice(ab.dice!));
            toast.push(ok ? `${wrapDice(ab.dice!)} copied` : "Could not copy", ok ? "ok" : "danger");
          }}
        >
          🎲 {wrapDice(ab.dice)}
        </button>
      )}

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
            <>
              {/* Stack abilities had no way to be used at all — the +/- controls
                  only moved the counter. Cast spends the action and marks the
                  combatant as acted, leaving the stack count under manual
                  control since only the player knows what their skill consumes. */}
              <Button size="sm" tone="heal" onClick={() => patch({}, true)}>
                Cast
              </Button>
              <Button size="sm" onClick={() => patch({ cur: 0 })}>
                Reset
              </Button>
            </>
          )}

          {ab.mode === "passive" && (
            <Button size="sm" onClick={() => patch({}, true)}>
              Invoke
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
  const [dice, setDice] = useState(ab.dice ?? "");
  const diceValid = !dice.trim() || looksLikeDice(dice);

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
            disabled={!diceValid}
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
                  dice: dice.trim(),
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

      <label className="field__label" htmlFor="ab-dice">Dice</label>
      <input
        id="ab-dice"
        value={dice}
        placeholder="1d4"
        aria-invalid={diceValid ? undefined : "true"}
        onChange={(e) => setDice(e.target.value)}
      />
      <p className={diceValid ? "field__hint" : "field__error"}>
        {diceValid
          ? "Tupper notation without braces. Adds a copy button to the ability."
          : "That does not look like dice notation. Leave out the braces."}
      </p>

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
  const [dice, setDice] = useState("");
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
      ...(dice.trim() && looksLikeDice(dice) ? { dice: dice.trim() } : {}),
      ...(phaseLock ? { phaseLock, phaseLockType: lockType } : {}),
    };
    dispatch({ type: "ABILITY_ADDED", id: combatantId, ability });
    setName("");
    setEffect("");
    setDice("");
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
          value={dice}
          onChange={(e) => setDice(e.target.value)}
          aria-label="Dice notation"
          placeholder="Dice e.g. 1d4"
        />
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
  const [ward, setWard] = useState(true);
  const [checkStat, setCheckStat] = useState<StatKey>("CON");
  const [checkDc, setCheckDc] = useState("");
  const [editing, setEditing] = useState<Ability | null>(null);
  const [statusName, setStatusName] = useState<string>("Prone");
  const [statusCustom, setStatusCustom] = useState("");
  // Pre-filled: one round is by far the most common, and a blank field made
  // Apply do nothing at all until you noticed you had to fill it in.
  const [statusDur, setStatusDur] = useState("1");
  const [draftStats, setDraftStats] = useState(c.stats);
  const [editStats, setEditStats] = useState(false);

  const band = healthBand(c.hp, c.maxHp);
  const pct = healthPercent(c.hp, c.maxHp);
  const derived = deriveStats(c.stats, c.tempMods);
  const eff = effectiveStats(c.stats, c.tempMods);
  const isPlayer = c.role === "Player";
  const headingId = useId("cbt");

  const cardRef = useImpact<HTMLElement>(c.hp);
  const copy = useCopy();
  const toast = useToast();
  const swing = swingFor(c);
  const attackRoll = d20Roll({ bonus: derived.hit, swing, flagCrits: true });

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
    // Never swallow a click. Before, an empty or zero field made Strike a
    // no-op with no explanation, which reads exactly like the app is broken.
    if (!amount) {
      toast.push("Enter an untaxed damage amount first.", "warn");
      return;
    }
    const preview = applyDamage(c, amount, dmgType);
    const b = preview.breakdown;

    if (b.toHp > 0) {
      mark(c.id, `−${b.toHp}`, dmgType === "magical" ? "magical" : dmgType === "physical" ? "physical" : "true");
      hitstop(b.toHp >= c.maxHp * 0.25 ? 70 : 45);
      playCue("damage");
    }
    if (b.resisted > 0) mark(c.id, `${b.resisted} resisted`, "resist");
    if (b.amplified > 0) mark(c.id, `+${b.amplified} exposed`, "true");
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

  const applyHealingTo = () => {
    const amount = parseInt(heal, 10);
    if (!amount) {
      toast.push("Enter an amount to heal first.", "warn");
      return;
    }
    const r = healPreview(c, amount, { overheal: ward });
    if (r.healed > 0) {
      mark(c.id, `+${r.healed}`, "heal");
      playCue("heal");
    }
    if (r.warded > 0) {
      mark(c.id, `◈ ${r.warded}`, "shield");
      playCue("shieldHit");
    }
    dispatch({ type: "HEAL_APPLIED", ids: [c.id], amount, overheal: ward });
    announce(
      `${c.name} healed to ${r.hp} of ${c.maxHp}.${
        r.warded > 0 ? ` ${r.warded} overheal warded.` : ""
      }`,
    );
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
    if (!name) {
      toast.push("Name the condition first.", "warn");
      return;
    }
    if (!duration || duration < 1) {
      toast.push("A condition needs a duration of at least one round.", "warn");
      return;
    }
    dispatch({ type: "STATUS_ADDED", id: c.id, status: { id: gid(), name, duration } });
    announce(`${c.name} is now ${name} for ${duration} rounds.`);
    setStatusDur("1");
    setStatusCustom("");
  };

  const rank = c.hp <= 0
    ? "down"
    : isPlayer
      ? "player"
      : c.type === "Boss"
        ? "boss"
        : c.type === "Elite"
          ? "elite"
          : "normal";

  return (
    <article
      ref={cardRef}
      className="card"
      data-rank={rank}
      data-combatant={c.id}
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

        {/* The emblem slot: the character's portrait when the library has one,
            otherwise the rank mark. Standing is carried by the frame keyline
            either way, so a boss stays distinguishable from a mook in greyscale
            and at a glance. */}
        <Portrait c={c} size={34} className="card__emblem" />

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
            <span className="card__rank" data-rank={rank}>
              {isPlayer ? "Player" : c.type || "Enemy"}
            </span>
            <span className="card__dot" aria-hidden="true" />
            <span className="card__pos">{c.position}</span>
            {BAND_LABEL[band] && (
              <Badge tone={band === "unconscious" ? "danger" : band === "critical" ? "danger" : "warn"} glyph={BAND_GLYPH[band]}>
                {BAND_LABEL[band]}
              </Badge>
            )}
            {c.done && <Badge tone="ok" glyph="✓">Acted</Badge>}
            {swing === "advantage" && (
              <Badge tone="ok" glyph="▲">Advantage</Badge>
            )}
            {swing === "disadvantage" && (
              <Badge tone="danger" glyph="▼">Disadvantage</Badge>
            )}
          </div>
        </div>

        <div className="card__head-actions">
          {/* Acted is a toggle, not a sentence. The text form ate a third of the
              header and pushed every name into an ellipsis. */}
          <IconButton
            label={c.done ? `Mark ${c.name} as still to act` : `Mark ${c.name} as acted`}
            className="card__acted"
            tone={c.done ? "phase" : "ghost"}
            aria-pressed={c.done}
            onClick={() => dispatch({ type: "COMBATANT_DONE_TOGGLED", id: c.id })}
          >
            <IconCheck size={14} />
          </IconButton>
          <IconButton
            label={`Duplicate ${c.name}`}
            onClick={() => dispatch({ type: "COMBATANT_DUPLICATED", id: c.id })}
          >
            <IconDuplicate size={14} />
          </IconButton>
          <IconButton
            label={`Remove ${c.name}`}
            tone="danger"
            onClick={() => {
              dispatch({ type: "COMBATANT_REMOVED", id: c.id });
              announce(`${c.name} removed. Undo is available.`);
            }}
          >
            <IconClose size={14} />
          </IconButton>
        </div>
      </header>

      {/* ── Health ── */}
      <div className="card__health">
        <div className="card__hp-row">
          <span className="card__hp tnum" style={{ color: BAND_TONE[band] }}>
            {c.hp}
            <span className="card__hp-sep">/</span>
            <span className="card__hp-max">{c.maxHp}</span>
          </span>
          <span className="card__hp-pct tnum" aria-hidden="true">
            {Math.round(pct)}%
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
                placeholder="Untaxed"
                title="Damage before resistance — the tracker applies CON or WIS for you"
                aria-label={`Untaxed damage to ${c.name}`}
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
                onKeyDown={(e) => e.key === "Enter" && applyHealingTo()}
              />
              <Button tone="heal" onClick={applyHealingTo}>
                Mend
              </Button>
              {/* Twelve skills in the pool end with "Overheal converts to
                  temporary shield", so this defaults on — but it stays visible
                  and switchable, because it is a rule the tracker used to
                  ignore entirely. */}
              <IconButton
                label={ward ? "Overheal becomes a ward (on)" : "Overheal is discarded (off)"}
                className="card__ward-toggle"
                aria-pressed={ward}
                tone={ward ? "shield" : "ghost"}
                onClick={() => setWard((v) => !v)}
              >
                <IconWard size={14} />
              </IconButton>
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

            <div className="action-group">
              <Button
                size="sm"
                title={`Copy ${attackRoll} — hit bonus and any Advantage or Disadvantage already applied`}
                onClick={async () => {
                  const ok = await copy(attackRoll);
                  toast.push(ok ? `${attackRoll} copied` : "Could not copy", ok ? "ok" : "danger");
                }}
              >
                <IconDice size={14} /> Attack roll
              </Button>

              {/* A quarter of the skill pool forces a stat check. Building the
                  roll here means the DC and the target's own modifier are on
                  the same line, rather than being reassembled from the sheet
                  mid-fight. */}
              <select
                className="card__check"
                value={checkStat}
                aria-label={`Stat check for ${c.name}`}
                onChange={(e) => setCheckStat(e.target.value as StatKey)}
              >
                {STAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="card__dc"
                value={checkDc}
                placeholder="DC"
                aria-label={`Check difficulty for ${c.name}`}
                onChange={(e) => setCheckDc(e.target.value)}
              />
              <Button
                size="sm"
                title="Copy this combatant's saving throw, with their modifier and any swing applied"
                onClick={async () => {
                  const dc = parseInt(checkDc, 10);
                  if (!dc) {
                    toast.push("Set a DC for the check first.", "warn");
                    return;
                  }
                  const text = checkRoll({
                    stat: checkStat,
                    dc,
                    bonus: eff[checkStat] ?? 0,
                    swing,
                  });
                  const ok = await copy(text);
                  toast.push(ok ? `${checkStat} DC ${dc} copied` : "Could not copy", ok ? "ok" : "danger");
                }}
              >
                Check
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

          {/* ── Stacks ── */}
          {(c.stacks?.length ?? 0) > 0 && (
            <ul className="chips" aria-label={`${c.name} stacks`}>
              {c.stacks!.map((st) => (
                <li key={st.id} className="chip chip--stack">
                  <span className="chip__lead tnum">
                    {st.count}
                    {st.max > 0 && <span className="chip__of">/{st.max}</span>}
                  </span>
                  <span>{st.name}</span>
                  {st.perStackDamage ? (
                    <span className="chip__meta tnum">+{st.perStackDamage * st.count} taken</span>
                  ) : null}
                  <IconButton
                    label={`Add a ${st.name} stack to ${c.name}`}
                    onClick={() =>
                      dispatch({ type: "STACK_ADJUSTED", id: c.id, name: st.name, delta: 1 })
                    }
                  >
                    <IconPlus size={11} />
                  </IconButton>
                  <IconButton
                    label={`Remove a ${st.name} stack from ${c.name}`}
                    onClick={() =>
                      dispatch({ type: "STACK_ADJUSTED", id: c.id, name: st.name, delta: -1 })
                    }
                  >
                    <IconMinus size={11} />
                  </IconButton>
                  <IconButton
                    label={`Clear ${st.name} from ${c.name}`}
                    onClick={() =>
                      dispatch({ type: "STACK_CLEARED", id: c.id, stackId: st.id })
                    }
                  >
                    <IconClose size={11} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          {/* ── Statuses ── */}
          {c.statuses.length > 0 && (
            <ul className="chips" aria-label={`${c.name} conditions`}>
              {c.statuses.map((s) => {
                const { Icon, polarity } = statusMark(s.name);
                return (
                <li key={s.id} className="chip chip--status" data-polarity={polarity}>
                  <span className="chip__icon" aria-hidden="true">
                    <Icon size={12} />
                  </span>
                  <span>{s.name}</span>
                  {/* Duration doubles as severity: the closer to expiry, the
                      quieter it gets, so what is about to lapse is visible
                      without reading every number. */}
                  <span className="chip__meta tnum" data-soon={s.duration <= 1 ? "1" : undefined}>
                    {s.duration}r
                  </span>
                  <IconButton
                    label={`Remove ${s.name}`}
                    onClick={() => dispatch({ type: "STATUS_REMOVED", id: c.id, statusId: s.id })}
                  >
                    <IconClose size={11} />
                  </IconButton>
                </li>
                );
              })}
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
            <DetailTabs
              label={`${c.name} details`}
              tabs={[
                {
                  id: "stats",
                  label: "Stats",
                  content: () => (
                    <>
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

                    {/* For anyone the character library does not cover, or to
                        override what it resolved. Clearing the field removes
                        the portrait and the rank mark takes over again. */}
                    <label className="maxhp">
                      <span>Portrait</span>
                      <input
                        type="url"
                        inputMode="url"
                        value={c.portrait ?? ""}
                        placeholder="Image URL — blank to clear"
                        aria-label={`Portrait URL for ${c.name}`}
                        onChange={(e) =>
                          dispatch({
                            type: "COMBATANT_PORTRAIT_SET",
                            id: c.id,
                            portrait: e.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="maxhp">
                      <span>Max HP</span>
                      <NumberInput
                        value={c.maxHp}
                        aria-label={`Maximum hit points for ${c.name}`}
                        onChange={(n) => {
                          if (n > 0) dispatch({ type: "COMBATANT_MAXHP_SET", id: c.id, maxHp: n });
                        }}
                      />
                    </label>

                    {editStats ? (
                      <div className="stat-edit">
                        {STAT_KEYS.map((k) => (
                          <label key={k} className="stat-edit__field">
                            <span>{k}</span>
                            <NumberInput
                              value={draftStats[k]}
                              onChange={(n) => setDraftStats({ ...draftStats, [k as StatKey]: n })}
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
                    </>
                  ),
                },
                { id: "effects", label: "Effects", content: () => <OngoingEditor c={c} /> },
                { id: "skills", label: "Skills", content: () => <AddAbility combatantId={c.id} /> },
                {
                  id: "notes",
                  label: "Notes",
                  content: () => (
                    <textarea
                      value={c.notes}
                      aria-label={`${c.name} notes`}
                      placeholder={"Notes…\n* bullet points"}
                      onChange={(e) =>
                        dispatch({ type: "COMBATANT_NOTES_SET", id: c.id, notes: e.target.value })
                      }
                    />
                  ),
                },
              ]}
            />
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
  const toast = useToast();
  const [val, setVal] = useState("");
  const [label, setLabel] = useState("");

  const addTemp = () => {
    const v = parseInt(val, 10);
    if (!v || v < 1) {
      toast.push("Enter a temporary shield value of at least 1.", "warn");
      return;
    }
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
  const toast = useToast();
  const [dotName, setDotName] = useState("");
  const [dotDmg, setDotDmg] = useState("");
  const [dotType, setDotType] = useState<DamageType>("physical");
  const [dotPerm, setDotPerm] = useState(false);
  const [dotDur, setDotDur] = useState("");

  const [regVal, setRegVal] = useState("");
  const [regPerm, setRegPerm] = useState(false);
  const [regDur, setRegDur] = useState("");

  const [stackName, setStackName] = useState("");
  const [stackMax, setStackMax] = useState("");
  const [stackDmg, setStackDmg] = useState("");

  const [modStat, setModStat] = useState<ModTarget>("STR");
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
              if (!d) {
                toast.push("Set the damage per round first.", "warn");
                return;
              }
              if (!dotPerm && !dur) {
                toast.push("Give the effect a duration, or mark it permanent.", "warn");
                return;
              }
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
              if (!v) {
                toast.push("Set the hit points regained per round first.", "warn");
                return;
              }
              if (!regPerm && !dur) {
                toast.push("Give the regeneration a duration, or mark it permanent.", "warn");
                return;
              }
              dispatch({ type: "REGEN_ADDED", id: c.id, regen: { id: gid(), val: v, permanent: regPerm, duration: regPerm ? null : dur } });
              setRegVal(""); setRegDur(""); setRegPerm(false);
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      {/* ── Stacks ── */}
      <fieldset className="ongoing__set">
        <legend className="eyebrow">Stacks</legend>
        <p className="ongoing__hint">
          Counters this combatant is carrying. A third of the stack skills read
          “on hit, <em>target</em> gains 1 stack”, so the count belongs here
          rather than on the attacker's skill.
        </p>
        <div className="ongoing__row">
          <input
            value={stackName}
            placeholder="Name"
            aria-label="Stack name"
            list="hm-stack-presets"
            onChange={(e) => setStackName(e.target.value)}
          />
          <datalist id="hm-stack-presets">
            {STACK_PRESETS.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
          <input
            type="number"
            min={0}
            value={stackMax}
            placeholder="Max"
            aria-label="Stack ceiling"
            onChange={(e) => setStackMax(e.target.value)}
          />
          <input
            type="number"
            min={0}
            value={stackDmg}
            placeholder="+dmg each"
            aria-label="Damage taken per stack"
            onChange={(e) => setStackDmg(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => {
              const name = stackName.trim();
              if (!name) {
                toast.push("Name the stack first.", "warn");
                return;
              }
              const preset = STACK_PRESETS.find(
                (p) => p.name.toLowerCase() === name.toLowerCase(),
              );
              dispatch({
                type: "STACK_ADJUSTED",
                id: c.id,
                name,
                delta: 1,
                max: parseInt(stackMax, 10) || preset?.max || 0,
                perStackDamage: parseInt(stackDmg, 10) || preset?.perStackDamage || undefined,
              });
              setStackName("");
              setStackMax("");
              setStackDmg("");
            }}
          >
            Apply
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
          <select
            value={modStat}
            aria-label="Modifier stat"
            onChange={(e) => setModStat(e.target.value as ModTarget)}
          >
            {STAT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            {/* Flat damage channels. "Reduce all incoming damage by 1" is not a
                CON buff, and expressing it as one would quietly change
                resistance and stat checks too. */}
            <option value="dmgTaken">Damage taken</option>
            <option value="dmgDealt">Damage dealt</option>
          </select>
          {/* Signed, so deliberately not type="number": the browser reports a
              lone "-" as an empty string and the minus is lost. A debuff like
              STR −2 is the whole point of this control. */}
          <input
            type="text"
            inputMode="numeric"
            value={modVal}
            placeholder="Value"
            aria-label="Modifier value"
            onChange={(e) => {
              if (/^-?\d*$/.test(e.target.value)) setModVal(e.target.value);
            }}
          />
          <input type="number" min={1} value={modDur} placeholder="Rounds" aria-label="Modifier duration" onChange={(e) => setModDur(e.target.value)} />
          <input value={modLabel} placeholder="Label" aria-label="Modifier label" onChange={(e) => setModLabel(e.target.value)} />
          <Button
            size="sm"
            onClick={() => {
              const v = parseInt(modVal, 10);
              const dur = parseInt(modDur, 10);
              if (!v) {
                toast.push("A modifier needs a non-zero value.", "warn");
                return;
              }
              if (!dur) {
                toast.push("A modifier needs a duration in rounds.", "warn");
                return;
              }
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
