/**
 * The command window.
 *
 * Old turn-based console RPGs got one thing exactly right: the whole fight ran
 * through a small box of verbs. Pick a fighter, pick a verb, pick a target,
 * done. Everything the game knew about strength and armour stayed inside the
 * game, where it belonged.
 *
 * That is the shape here. Click a token, choose Attack or Skill or Mend, drag
 * the line onto a target, and answer the only question the table can actually
 * answer: did it land. The damage comes from the attacker's own stats, the
 * resistance and shields come from the target's, and both are shown in full so
 * nothing is taken on faith. Dice are still rolled in Discord — a skill that
 * carries notation asks for the number instead of inventing one.
 *
 * The cards below are untouched and remain the place to correct anything, which
 * is why this window is allowed to be fast rather than exhaustive.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { Ability, Combatant } from "@/domain/types";
import {
  betterStat,
  canTarget,
  damageWith,
  mendAmount,
  previewAction,
  statSource,
  withRolled,
  type ActionPreview,
} from "@/domain/action";
import {
  applyHealing,
  isAbilityReadyWith,
  isAmmoEmpty,
  isPhaseLocked,
  requirementState,
  resolveRedirect,
  type CombatEvent,
} from "@/domain/rules";
import { useStoreApi } from "@/state/store";
import { useFeedback } from "@/fx/feedback";
import { playCue } from "@/fx/sound";
import { announce } from "../hooks";
import "./commandflow.css";

/* ── The state machine ── */

export type Verb = "attack" | "skill" | "mend" | "move";

export type Flow =
  /** A fighter is chosen; the verbs are showing. */
  | { stage: "command"; actorId: string }
  /** Choosing which skill, one level in from the verbs. */
  | { stage: "skills"; actorId: string }
  /** A verb is chosen; the line is out, looking for a target. */
  | { stage: "target"; actorId: string; verb: Verb; abilityId?: string }
  /** Target locked; everything is computed and waiting on hit or miss. */
  | {
      stage: "resolve";
      actorId: string;
      targetId: string;
      verb: Verb;
      abilityId?: string;
      /** Typed in only when the skill carries its own dice. */
      rolled?: string;
    }
  | null;

const VERB_LABEL: Record<Verb, string> = {
  attack: "Attack",
  skill: "Skill",
  mend: "Mend",
  move: "Move",
};

/** Whether this combatant may be aimed at with this verb. */
export function isLegalTarget(verb: Verb, actor: Combatant, target: Combatant): boolean {
  // Mending reaches everyone, including yourself and the unconscious — pulling
  // someone back up is most of the reason a healer acts at all.
  if (verb === "mend") return true;
  if (verb === "attack" || verb === "skill") return canTarget(actor, target);
  return false;
}

/** Which skills the window offers, and what to say about the ones it greys out. */
export function skillOptions(
  actor: Combatant,
  playerPhaseCount: number,
  enemyPhaseCount: number,
): { ab: Ability; ready: boolean; note: string }[] {
  return actor.abilities.map((ab) => {
    const req = requirementState(ab, actor.abilities);
    const locked = isPhaseLocked(ab, playerPhaseCount, enemyPhaseCount);
    const gated = req.gated && !req.met;
    const empty = isAmmoEmpty(ab);
    const ready = !locked && !gated && !empty && isAbilityReadyWith(ab, actor.abilities);

    const note = locked
      ? `Opens on ${ab.phaseLockType === "enemy" ? "enemy" : "player"} phase ${ab.phaseLock}`
      : gated
        ? req.label
        : empty
          ? "Spent"
          : ready
            ? ab.dice
              ? `Rolls ${ab.dice}`
              : "Ready"
            : `${ab.cur}/${ab.max}`;

    return { ab, ready, note };
  });
}

/**
 * What using a skill costs its owner.
 *
 * Deliberately the same patches the card's own buttons send, so casting from
 * the table and casting from the card leave the sheet in identical states.
 */
function spendPatch(ab: Ability): { patch: Partial<Ability>; marksDone: boolean } {
  switch (ab.mode) {
    case "cooldown":
      return { patch: { cur: ab.max }, marksDone: true };
    case "reaction":
      return { patch: { cur: ab.max }, marksDone: false };
    case "ammo":
      return { patch: { cur: Math.max(0, ab.cur - 1) }, marksDone: true };
    case "charge":
      return { patch: { charging: false, cur: 0 }, marksDone: true };
    case "passive":
      return { patch: ab.refill ? { cur: Math.max(0, ab.cur - 1) } : {}, marksDone: true };
    default:
      // Stack skills keep their counter under the player's hand: only they know
      // what their own skill consumes.
      return { patch: {}, marksDone: true };
  }
}

/* ── Menu furniture ── */

function MenuItem({
  label,
  note,
  disabled,
  submenu,
  tone,
  primary,
  onPick,
}: {
  label: string;
  note?: string;
  disabled?: boolean;
  submenu?: boolean;
  tone?: "attack" | "mend" | "quiet";
  /** The one thing this window exists to do, and where focus lands. */
  primary?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="cmdi"
      data-tone={tone}
      data-autofocus={primary ? "1" : undefined}
      disabled={disabled}
      onMouseEnter={() => !disabled && playCue("cursor")}
      onFocus={() => !disabled && playCue("cursor")}
      onClick={onPick}
    >
      <span className="cmdi__cursor" aria-hidden="true">
        ▶
      </span>
      <span className="cmdi__label">{label}</span>
      {note && <span className="cmdi__note">{note}</span>}
      {submenu && (
        <span className="cmdi__more" aria-hidden="true">
          ▸
        </span>
      )}
    </button>
  );
}

/**
 * A menu you can drive with the arrow keys.
 *
 * The window is modelled on machines whose only input was a d-pad, and a GM
 * running a fight with one hand on the keyboard should not have to tab through
 * six verbs to reach Cancel. Arrows in any direction step through the enabled
 * items and wrap, which is what a wrapping grid of commands ought to do.
 */
function Menu({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(".cmdi:not(:disabled)") ?? [],
    );
    if (!items.length) return;
    e.preventDefault();

    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : back
            ? at <= 0
              ? items.length - 1
              : at - 1
            : at === -1 || at === items.length - 1
              ? 0
              : at + 1;
    items[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className={wide ? "cmdwin__menu cmdwin__menu--wide" : "cmdwin__menu"}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/* ── The window ── */

export function CommandFlow({
  flow,
  setFlow,
  combatants,
  playerPhaseCount,
  enemyPhaseCount,
  onEvent,
}: {
  flow: Flow;
  setFlow: (f: Flow) => void;
  combatants: Combatant[];
  playerPhaseCount: number;
  enemyPhaseCount: number;
  onEvent?: (e: CombatEvent) => void;
}) {
  const { dispatch } = useStoreApi();
  const { mark, hitstop } = useFeedback();
  const winRef = useRef<HTMLElement>(null);

  const byId = (id: string) => combatants.find((c) => c.id === id) ?? null;
  const actor = flow ? byId(flow.actorId) : null;

  /**
   * A combatant removed mid-command used to leave the window pointing at an id
   * that no longer existed, with buttons that dispatched into nothing.
   */
  useEffect(() => {
    if (!flow) return;
    const gone =
      !combatants.some((c) => c.id === flow.actorId) ||
      (flow.stage === "resolve" && !combatants.some((c) => c.id === flow.targetId));
    if (gone) setFlow(null);
  }, [flow, combatants, setFlow]);

  /**
   * Once a target is locked, the answer is one keystroke away rather than four
   * tabs. The rolled total takes precedence when a skill needs one, because it
   * has to be filled in before the verdict means anything.
   */
  useEffect(() => {
    if (flow?.stage !== "resolve") return;
    winRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [flow?.stage]);

  if (!flow || !actor) return null;

  const close = () => {
    playCue("cancel");
    setFlow(null);
  };

  const back = () => {
    playCue("cancel");
    if (flow.stage === "skills") setFlow({ stage: "command", actorId: flow.actorId });
    else if (flow.stage === "target")
      setFlow(
        flow.verb === "skill"
          ? { stage: "skills", actorId: flow.actorId }
          : { stage: "command", actorId: flow.actorId },
      );
    else if (flow.stage === "resolve")
      setFlow({
        stage: "target",
        actorId: flow.actorId,
        verb: flow.verb,
        abilityId: flow.abilityId,
      });
    else setFlow(null);
  };

  /* ── Stage: the verbs ── */

  if (flow.stage === "command") {
    const ready = skillOptions(actor, playerPhaseCount, enemyPhaseCount).filter((s) => s.ready);
    const stat = betterStat(actor);
    return (
      <Window actor={actor} trail={[]} onClose={close}>
        <Menu label={`Commands for ${actor.name}`}>
          <MenuItem
            label="Attack"
            tone="attack"
            /* The number, not the formula. Someone choosing a verb wants to
               know what it is worth; the working is one screen further in. */
            note={`${damageWith(actor, stat)} ${stat}`}
            onPick={() => {
              playCue("confirm");
              setFlow({ stage: "target", actorId: actor.id, verb: "attack" });
            }}
          />
          <MenuItem
            label="Skill"
            submenu
            note={ready.length ? `${ready.length} ready` : "none ready"}
            disabled={!actor.abilities.length}
            onPick={() => {
              playCue("confirm");
              setFlow({ stage: "skills", actorId: actor.id });
            }}
          />
          <MenuItem
            label="Mend"
            tone="mend"
            note={`heals ${mendAmount(actor)}`}
            onPick={() => {
              playCue("confirm");
              setFlow({ stage: "target", actorId: actor.id, verb: "mend" });
            }}
          />
          <MenuItem
            label={actor.done ? "Undo acted" : "Mark acted"}
            tone="quiet"
            onPick={() => {
              dispatch({ type: "COMBATANT_DONE_TOGGLED", id: actor.id });
              playCue("confirm");
              setFlow(null);
            }}
          />
          <MenuItem
            label="Move"
            tone="quiet"
            note="drag, or pick a band"
            onPick={() => {
              playCue("confirm");
              setFlow({ stage: "target", actorId: actor.id, verb: "move" });
            }}
          />
          <MenuItem label="Cancel" tone="quiet" onPick={close} />
        </Menu>
      </Window>
    );
  }

  /* ── Stage: which skill ── */

  if (flow.stage === "skills") {
    const options = skillOptions(actor, playerPhaseCount, enemyPhaseCount);
    return (
      <Window actor={actor} trail={["Skill"]} onClose={close}>
        <Menu label={`Skills for ${actor.name}`}>
          {options.map(({ ab, ready, note }) => (
            <MenuItem
              key={ab.id}
              label={ab.name}
              note={note}
              disabled={!ready}
              onPick={() => {
                playCue("confirm");
                setFlow({ stage: "target", actorId: actor.id, verb: "skill", abilityId: ab.id });
              }}
            />
          ))}
          <MenuItem label="Back" tone="quiet" onPick={back} />
        </Menu>
      </Window>
    );
  }

  /* ── Stage: aiming ── */

  if (flow.stage === "target") {
    const ability = flow.abilityId
      ? actor.abilities.find((a) => a.id === flow.abilityId)
      : undefined;
    const verbLabel = ability ? ability.name : VERB_LABEL[flow.verb];
    const legal = combatants.filter((c) => isLegalTarget(flow.verb, actor, c)).length;

    return (
      <Window actor={actor} trail={[verbLabel]} onClose={close}>
        <p className="cmdwin__prompt">
          {flow.verb === "move" ? (
            <>
              Drag <strong>{actor.name}</strong> to another band, or use the band buttons on
              the table.
            </>
          ) : legal === 0 ? (
            <>Nothing on the table can be targeted with this.</>
          ) : (
            <>
              Aim the line at a target. <span className="cmdwin__count tnum">{legal}</span>{" "}
              available.
            </>
          )}
        </p>
        <Menu label="Aiming" wide>
          <MenuItem label="Back" tone="quiet" onPick={back} />
          <MenuItem label="Cancel" tone="quiet" onPick={close} />
        </Menu>
      </Window>
    );
  }

  /* ── Stage: hit or miss ── */

  const aimedAt = byId(flow.targetId);
  if (!aimedAt) return null;

  // Cover is resolved before anything is computed, so the numbers on screen
  // belong to whoever will actually eat the hit rather than whoever was aimed
  // at. The reducer resolves the same chain when the damage lands.
  const victimId = resolveRedirect(combatants, aimedAt.id);
  const victim = byId(victimId) ?? aimedAt;
  const intercepted = victim.id !== aimedAt.id;

  const ability = flow.abilityId
    ? actor.abilities.find((a) => a.id === flow.abilityId)
    : undefined;

  /**
   * Pay for the action. A basic attack costs the actor's turn; a skill costs
   * whatever its own mode says, which is why a reaction fired from here does
   * not mark its owner as having acted.
   */
  const spendSkill = () => {
    if (!ability) {
      dispatch({ type: "COMBATANT_DONE_TOGGLED", id: actor.id, done: true });
      return;
    }
    const { patch, marksDone } = spendPatch(ability);
    dispatch({ type: "ABILITY_USED", id: actor.id, abilityId: ability.id, patch, marksDone });
  };

  /* Mending: there is no roll to miss with, so it simply lands. */
  if (flow.verb === "mend") {
    const amount = mendAmount(actor);
    const outcome = applyHealing(victim, amount, { overheal: true });

    const doMend = () => {
      dispatch({
        type: "HEAL_APPLIED",
        ids: [victim.id],
        amount,
        overheal: true,
        source: actor.name,
      });
      if (outcome.healed > 0) mark(victim.id, `+${outcome.healed}`, "heal");
      if (outcome.warded > 0) mark(victim.id, `◈ ${outcome.warded}`, "shield");
      playCue("heal");
      spendSkill();
      announce(
        `${actor.name} mends ${victim.name} for ${outcome.healed}. ${outcome.hp} of ${victim.maxHp} hit points.`,
      );
      setFlow(null);
    };

    return (
      <Window
        actor={actor}
        boxRef={winRef}
        trail={[ability?.name ?? "Mend", victim.name]}
        onClose={close}
      >
        <dl className="cmdwin__ledger">
          <Row term="Mends for" detail={statSource(actor, "magical")}>
            {amount}
          </Row>
          <Row term="Restored">{outcome.healed}</Row>
          {outcome.warded > 0 && <Row term="Warded as shield">{outcome.warded}</Row>}
          <Row term={`${victim.name} ends on`}>
            {outcome.hp}/{victim.maxHp}
          </Row>
        </dl>
        <Menu label="Confirm the mend" wide>
          <MenuItem label="Mend" tone="mend" primary onPick={doMend} />
          <MenuItem label="Back" tone="quiet" onPick={back} />
        </Menu>
      </Window>
    );
  }

  /* Attacking, with or without a skill behind it. */
  const base = previewAction({ actor, target: victim, kind: ability ? "skill" : "attack", ability });
  const rolled = flow.rolled !== undefined ? parseInt(flow.rolled, 10) : NaN;
  const hasRoll = !base.needsRoll || (!Number.isNaN(rolled) && rolled > 0);
  const preview: ActionPreview =
    base.needsRoll && hasRoll ? withRolled({ actor, target: victim, kind: "skill", ability }, base, rolled) : base;
  const b = preview.result?.breakdown;

  const land = () => {
    if (!preview.result || !b) return;

    if (b.toHp > 0) {
      mark(victim.id, `−${b.toHp}`, preview.damageType === "magical" ? "magical" : "physical");
      hitstop(b.toHp >= victim.maxHp * 0.25 ? 70 : 45);
      playCue("damage");
    }
    if (b.resisted > 0) mark(victim.id, `${b.resisted} resisted`, "resist");
    if (b.amplified > 0) mark(victim.id, `+${b.amplified} exposed`, "true");
    if (b.absorbedByTemp + b.absorbedByShield > 0) {
      mark(victim.id, `◈ ${b.absorbedByTemp + b.absorbedByShield}`, "shield");
      playCue(b.brokeShield ? "shieldBreak" : "shieldHit");
    }

    dispatch({
      type: "DAMAGE_APPLIED",
      ids: [aimedAt.id],
      amount: preview.amount,
      damageType: preview.damageType,
      source: ability ? `${actor.name}'s ${ability.name}` : actor.name,
    });
    spendSkill();

    const died = victim.hp > 0 && preview.result.hp <= 0;
    if (died) playCue("defeated");
    onEvent?.({ kind: died ? "down" : "hit", targetId: victim.id, damageType: preview.damageType });

    announce(
      `${actor.name} hits ${victim.name} for ${b.toHp}. ${preview.result.hp} of ${victim.maxHp} hit points remaining.${died ? " Unconscious." : ""}`,
    );
    setFlow(null);
  };

  const whiff = () => {
    playCue("cancel");
    mark(victim.id, "MISS", "resist");
    // A miss still costs the action, and still spends the skill that was thrown.
    spendSkill();
    dispatch({
      type: "ACTION_MISSED",
      actorId: actor.id,
      targetId: victim.id,
      label: ability?.name,
    });
    announce(`${actor.name} misses ${victim.name}.`);
    setFlow(null);
  };

  return (
    <Window
      actor={actor}
      boxRef={winRef}
      trail={[ability?.name ?? "Attack", aimedAt.name]}
      onClose={close}
      tone="attack"
    >
      {intercepted && (
        <p className="cmdwin__note">
          <strong>{victim.name}</strong> is covering {aimedAt.name} and takes this instead.
        </p>
      )}

      {preview.needsRoll ? (
        <div className="cmdwin__roll">
          <label className="cmdwin__rolllabel" htmlFor="cmd-roll">
            {ability!.name} rolls <code>{preview.diceNotation}</code> in Discord. Enter the
            total.
          </label>
          <input
            id="cmd-roll"
            data-autofocus="1"
            className="cmdwin__rollinput tnum"
            type="number"
            min={0}
            inputMode="numeric"
            value={flow.rolled ?? ""}
            placeholder="Rolled"
            onChange={(e) => setFlow({ ...flow, rolled: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasRoll) land();
            }}
          />
        </div>
      ) : null}

      <dl className="cmdwin__ledger">
        {hasRoll ? (
          <>
            <Row term="Damage" detail={preview.needsRoll ? "rolled" : preview.source}>
              {preview.amount}
            </Row>
            {b && b.resisted > 0 && (
              <Row term={`${preview.damageType === "magical" ? "WIS" : "CON"} resists`}>
                −{b.resisted}
              </Row>
            )}
            {b && b.amplified > 0 && <Row term="Exposed, so amplified">+{b.amplified}</Row>}
            {b && b.absorbedByTemp + b.absorbedByShield > 0 && (
              <Row term="Absorbed by shielding">{b.absorbedByTemp + b.absorbedByShield}</Row>
            )}
            <Row term="Reaches hit points" strong>
              {b?.toHp ?? 0}
            </Row>
            <Row term={`${victim.name} ends on`}>
              {preview.result?.hp ?? victim.hp}/{victim.maxHp}
            </Row>
          </>
        ) : (
          <Row term="Waiting on">the rolled total</Row>
        )}
      </dl>

      {/* The save this skill forces. Stated here because the moment it matters
          is the moment the skill is cast, and the check itself is rolled and
          entered on the target's own card. */}
      {preview.check && (
        <p className="cmdwin__note">
          Forces a <strong>{preview.check.stat}</strong> check at DC{" "}
          <strong>{preview.check.dc}</strong> on {victim.name}.
        </p>
      )}

      <div className="cmdwin__verdict">
        <button
          type="button"
          className="verdict verdict--hit"
          data-autofocus="1"
          disabled={!hasRoll}
          onClick={land}
        >
          Hit
        </button>
        <button type="button" className="verdict verdict--miss" onClick={whiff}>
          Miss
        </button>
        <button type="button" className="verdict verdict--back" onClick={back}>
          Back
        </button>
      </div>
    </Window>
  );
}

/* ── Shell ── */

function Window({
  actor,
  trail,
  tone,
  boxRef,
  onClose,
  children,
}: {
  actor: Combatant;
  trail: string[];
  tone?: "attack";
  boxRef?: Ref<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="cmdwin"
      ref={boxRef}
      data-tone={tone}
      aria-label={`Command window: ${actor.name}`}
    >
      <header className="cmdwin__head">
        <span className="cmdwin__who">{actor.name}</span>
        {trail.map((t) => (
          <span key={t} className="cmdwin__crumb">
            <span aria-hidden="true">›</span> {t}
          </span>
        ))}
        <button
          type="button"
          className="cmdwin__close"
          onClick={onClose}
          aria-label="Close command window"
        >
          ✕
        </button>
      </header>
      {children}
    </section>
  );
}

function Row({
  term,
  detail,
  strong,
  children,
}: {
  term: string;
  detail?: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="cmdrow" data-strong={strong ? "1" : undefined}>
      <dt className="cmdrow__term">
        {term}
        {detail && <span className="cmdrow__detail">{detail}</span>}
      </dt>
      <dd className="cmdrow__value tnum">{children}</dd>
    </div>
  );
}
