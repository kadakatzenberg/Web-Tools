/**
 * Enemy generator: roll a stat line to tier, pick or roll skills, add a pack.
 *
 * The tier contract (total, heavy stat, HP, slot count) and the
 * guaranteed-weakness rule live in `@/domain/generator` and are unit-tested;
 * this component is presentation and batching only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArchetypeKey, CombatSkillRow, GeneratedEnemy, Tier } from "@/domain/types";
import { ARCHETYPES, GEN_MAX_QTY, SKILL_MODE_LABELS, SKILL_MODE_MAP, SKILL_MODE_OPTIONS, STAT_KEYS, TIER_CFG } from "@/domain/constants";
import { archetypeLabel, makeEnemy, skillSlotsFor } from "@/domain/generator";
import { deriveStats } from "@/domain/rules";
import { combatantFromEnemy, gid } from "@/domain/factory";
import { fetchSkills } from "@/persistence/repositories";
import { SupabaseError } from "@/persistence/supabase";
import { useStoreApi } from "@/state/store";
import { announce } from "../hooks";
import { Badge, Button, EmptyState, ErrorPanel, useToast } from "../primitives";
import "./generator.css";

const ARCH_TONE: Record<string, string> = {
  STR: "#ff9d90",
  DEX: "#f5d98a",
  INT: "#cbb8f5",
  WIS: "#7fe0c0",
  AGI: "#8fbdf0",
  CON: "#9fe8c6",
  RND: "#b0aebb",
};

function SkillSlot({
  index,
  skills,
  value,
  onChange,
}: {
  index: number;
  skills: CombatSkillRow[];
  value: CombatSkillRow | null;
  onChange: (v: CombatSkillRow | null) => void;
}) {
  const [mode, setMode] = useState<string>("Full Random");
  const [picking, setPicking] = useState(false);

  const pool = useMemo(
    () => (mode === "Full Random" ? skills : skills.filter((s) => s.mode === SKILL_MODE_MAP[mode])),
    [mode, skills],
  );

  const roll = useCallback(
    (from: CombatSkillRow[]) => {
      if (!from.length) return;
      onChange(from[Math.floor(Math.random() * from.length)]!);
    },
    [onChange],
  );

  return (
    <div className="slot">
      <div className="slot__head">
        <span className="eyebrow">Skill slot {index + 1}</span>
        {value && (
          <button type="button" className="slot__clear" onClick={() => onChange(null)} aria-label="Clear slot">
            ✕
          </button>
        )}
      </div>

      <div className="slot__controls">
        <select
          value={mode}
          aria-label={`Skill slot ${index + 1} mode`}
          onChange={(e) => {
            const m = e.target.value;
            setMode(m);
            setPicking(false);
            onChange(null);
            if (m !== "Manual") {
              const next = m === "Full Random" ? skills : skills.filter((s) => s.mode === SKILL_MODE_MAP[m]);
              roll(next);
            }
          }}
        >
          {SKILL_MODE_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>

        {mode !== "Manual" && (
          <Button size="sm" disabled={!pool.length} onClick={() => roll(pool)}>
            Reroll
          </Button>
        )}
        {mode === "Manual" && (
          <Button size="sm" onClick={() => setPicking((p) => !p)}>
            {picking ? "Close" : "Pick"}
          </Button>
        )}
      </div>

      {mode === "Manual" && picking && (
        <ul className="slot__list">
          {skills.map((s) => (
            <li key={String(s.id)}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setPicking(false);
                }}
              >
                <Badge tone="neutral">{SKILL_MODE_LABELS[s.mode]}</Badge>
                <span>{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && (
        <div className="slot__chosen">
          <div className="slot__chosen-head">
            <Badge tone="neutral">{SKILL_MODE_LABELS[value.mode]}</Badge>
            <strong>{value.name}</strong>
            {value.max_val != null && (
              <span className="slot__meta tnum">
                {value.mode === "ammo"
                  ? `${value.max_val} ammo`
                  : value.mode === "charge"
                    ? `${value.max_val} charge, +${value.gain_per_phase || 1}/round`
                    : `CD ${value.max_val}`}
              </span>
            )}
          </div>
          {value.effect && <p className="slot__effect">{value.effect}</p>}
        </div>
      )}

      {!value && pool.length === 0 && mode !== "Manual" && (
        <p className="slot__empty">No skills of that kind in the library.</p>
      )}
    </div>
  );
}

export function GeneratorTab({ onAdded }: { onAdded: () => void }) {
  const { dispatch } = useStoreApi();
  const toast = useToast();

  const [tier, setTier] = useState<Tier>("mook");
  const [archetype, setArchetype] = useState<ArchetypeKey>("RND");
  const [enemy, setEnemy] = useState<GeneratedEnemy | null>(null);
  const [qty, setQty] = useState("1");
  const [skills, setSkills] = useState<CombatSkillRow[]>([]);
  const [slots, setSlots] = useState<(CombatSkillRow | null)[]>([null, null]);
  const [error, setError] = useState("");
  const [loadingSkills, setLoadingSkills] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setSkills(await fetchSkills(ctrl.signal));
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof SupabaseError ? e.message : "Could not load the skill list.");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoadingSkills(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const cfg = TIER_CFG[tier];
  const slotCount = enemy ? skillSlotsFor(enemy.tier) : cfg.skills;

  const generate = () => {
    const e = makeEnemy(tier, archetype, gid());
    setEnemy(e);
    setSlots([null, null]);
    setQty("1");
    announce(`Generated a ${archetypeLabel(archetype)} ${TIER_CFG[tier].label}.`);
  };

  const addToTracker = () => {
    if (!enemy) return;
    const n = Math.max(1, Math.min(GEN_MAX_QTY, parseInt(qty, 10) || 1));
    const chosen = slots.slice(0, slotCount);
    const batch = Array.from({ length: n }, (_, i) => combatantFromEnemy(enemy, i, chosen));
    dispatch({ type: "COMBATANTS_ADDED", combatants: batch });
    const label = `${archetypeLabel(enemy.archetype)} ${TIER_CFG[enemy.tier].label}`;
    toast.push(`${n}× ${label} added`, "ok");
    announce(`${n} ${label} added to the tracker.`);
    onAdded();
  };

  const derived = enemy ? deriveStats(enemy.stats) : null;

  return (
    <div className="generator">
      <header className="generator__head">
        <h1 className="generator__title display">Enemy generator</h1>
        <p className="generator__lead">
          Every roll respects the tier contract: an exact stat total, a pinned heavy
          stat, and at least one genuine weakness.
        </p>
      </header>

      {error && <ErrorPanel error={error} />}

      <fieldset className="generator__group">
        <legend className="eyebrow">Tier</legend>
        <div className="tier-grid">
          {(Object.keys(TIER_CFG) as Tier[]).map((t) => {
            const c = TIER_CFG[t];
            return (
              <button
                key={t}
                type="button"
                className="tier"
                data-active={tier === t ? "1" : undefined}
                aria-pressed={tier === t}
                onClick={() => {
                  setTier(t);
                  setEnemy(null);
                }}
              >
                <span className="tier__name display">{c.label}</span>
                <span className="tier__meta">
                  <span>Total <strong className="tnum">+{c.total}</strong></span>
                  <span>HP <strong className="tnum">{c.hp}</strong></span>
                  <span>Heavy <strong className="tnum">+{c.heavy}</strong></span>
                  <span>Skills <strong className="tnum">{c.skills}</strong></span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="generator__group">
        <legend className="eyebrow">Archetype</legend>
        <div className="arch-grid">
          {ARCHETYPES.map((a) => (
            <button
              key={a.key}
              type="button"
              className="arch"
              data-active={archetype === a.key ? "1" : undefined}
              aria-pressed={archetype === a.key}
              style={{ ["--tone" as string]: ARCH_TONE[a.key] }}
              onClick={() => {
                setArchetype(a.key);
                setEnemy(null);
              }}
            >
              <span className="arch__name">{a.label}</span>
              <span className="arch__hint">{a.stat ? `+${cfg.heavy} ${a.stat}` : "all random"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <Button tone="phase" block onClick={generate}>
        Generate {cfg.label}
      </Button>

      {!enemy ? (
        <EmptyState
          seal="敵"
          title="Nothing rolled yet"
          body="Choose a tier and an archetype, then generate. Reroll until the shape of the fight feels right."
        />
      ) : (
        <article className="rolled panel">
          <header className="rolled__head">
            <div className="rolled__tags">
              <Badge tone="danger">{TIER_CFG[enemy.tier].label}</Badge>
              <Badge tone="neutral">{archetypeLabel(enemy.archetype)}</Badge>
              <Badge tone="info">HP {TIER_CFG[enemy.tier].hp}</Badge>
              {derived && <Badge tone="info">AC {derived.ac}</Badge>}
            </div>
            <div className="rolled__actions">
              <Button size="sm" onClick={() => setEnemy(makeEnemy(enemy.tier, enemy.archetype, gid()))}>
                Reroll
              </Button>
              <Button size="sm" onClick={() => setEnemy(null)}>
                Discard
              </Button>
            </div>
          </header>

          <div className="rolled__stats">
            {STAT_KEYS.map((k) => {
              const v = enemy.stats[k];
              const heavy = ARCHETYPES.find((a) => a.key === enemy.archetype)?.stat === k;
              return (
                <div key={k} className="rolled__stat" data-heavy={heavy ? "1" : undefined} data-sign={v > 0 ? "pos" : v < 0 ? "neg" : "zero"}>
                  <span>{k}</span>
                  <strong className="tnum">{v > 0 ? `+${v}` : v}</strong>
                </div>
              );
            })}
          </div>

          {derived && (
            <dl className="rolled__derived">
              <div><dt>Hit</dt><dd className="tnum">{derived.hit >= 0 ? `+${derived.hit}` : derived.hit}</dd></div>
              <div><dt>Phys</dt><dd className="tnum">+{derived.physicalDamage}</dd></div>
              <div><dt>Mag</dt><dd className="tnum">+{derived.magicalDamage}</dd></div>
              <div><dt>P.Res</dt><dd className="tnum">{derived.physicalResist}</dd></div>
              <div><dt>M.Res</dt><dd className="tnum">{derived.magicalResist}</dd></div>
            </dl>
          )}

          <div className="rolled__slots">
            <p className="eyebrow">
              Skills — {slotCount} slot{slotCount === 1 ? "" : "s"}
              {loadingSkills && <span className="rolled__loading"> loading…</span>}
            </p>
            {Array.from({ length: slotCount }, (_, i) => (
              <SkillSlot
                key={i}
                index={i}
                skills={skills}
                value={slots[i] ?? null}
                onChange={(v) => setSlots((prev) => { const n = [...prev]; n[i] = v; return n; })}
              />
            ))}
          </div>

          <div className="rolled__add">
            <label className="field__label" htmlFor="gen-qty">Quantity</label>
            <input
              id="gen-qty"
              type="number"
              min={1}
              max={GEN_MAX_QTY}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <Button tone="phase" onClick={addToTracker}>
              Add {parseInt(qty, 10) > 1 ? `${parseInt(qty, 10)}×` : ""} to tracker
            </Button>
          </div>
          <p className="rolled__note">
            Each copy rolls its own identity but shares this stat line. Maximum {GEN_MAX_QTY} per batch.
          </p>
        </article>
      )}
    </div>
  );
}
