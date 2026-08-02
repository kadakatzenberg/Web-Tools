/**
 * Character library: approved combat sheets, grouped by character.
 *
 * The "admin" gate below is a workflow guard, not authentication — see
 * docs/SECURITY.md. It is retained because it prevents accidental edits during
 * a live session, and it is labelled honestly in the UI rather than claiming to
 * secure anything.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CombatSheet, Role, SheetSkill, Stats } from "@/domain/types";
import { EMPTY_STATS, SKILL_MODES, SKILL_MODE_LABELS, STAT_KEYS } from "@/domain/constants";
import { deriveStats } from "@/domain/rules";
import { combatantFromSheet } from "@/domain/factory";
import { createSheet, fetchSheets, updateSheet } from "@/persistence/repositories";
import { SupabaseError } from "@/persistence/supabase";
import { useStoreApi } from "@/state/store";
import { announce, useDebounced } from "../hooks";
import { Portrait } from "../Portrait";
import { Badge, Button, Disclosure, EmptyState, ErrorPanel, Modal, NumberInput, useToast } from "../primitives";
import "./library.css";

/** Non-cryptographic checksum, ported from v1 so existing rows still match. */
function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString();
}
const GUARD = checksum("heimao-mortal-combat");

const SKILL_KEYS = ["s1", "s2", "ult"] as const;
const SKILL_LABEL = { s1: "S1", s2: "S2", ult: "Ultimate" } as const;
const SKILL_TONE = { s1: "var(--moonlit)", s2: "var(--violet)", ult: "var(--candle)" } as const;

function emptySkill(): SheetSkill {
  return { name: "", flavor: "", effect: "", cooldown: "", mode: "cooldown", maxVal: 2, gainPerPhase: 1 };
}

/* ── Sheet detail ── */

function SheetDetail({ sheet, onClose }: { sheet: CombatSheet; onClose: () => void }) {
  const d = deriveStats(sheet.stats);
  return (
    <Modal open onClose={onClose} title={sheet.character_name || sheet.name || "Sheet"} width={560}>
      <div className="sheet__ident">
        <Portrait
          c={{ role: sheet.role, type: sheet.type ?? "", hp: 1, portrait: sheet.portrait_url }}
          size={72}
        />
        <div>
          {sheet.sheet_name && <p className="sheet__variant">{sheet.sheet_name}</p>}
          {sheet.player && <p className="sheet__player">Player: {sheet.player}</p>}
        </div>
      </div>

      <div className="sheet__stats">
        {STAT_KEYS.map((k) => (
          <div key={k} className="sheet__stat">
            <span>{k}</span>
            <strong className="tnum" data-sign={sheet.stats[k] > 0 ? "pos" : sheet.stats[k] < 0 ? "neg" : "zero"}>
              {sheet.stats[k] > 0 ? `+${sheet.stats[k]}` : sheet.stats[k]}
            </strong>
          </div>
        ))}
      </div>

      <dl className="sheet__derived">
        <div><dt>AC</dt><dd className="tnum">{d.ac}</dd></div>
        <div><dt>Hit</dt><dd className="tnum">{d.hit >= 0 ? `+${d.hit}` : d.hit}</dd></div>
        <div><dt>Phys</dt><dd className="tnum">+{d.physicalDamage}</dd></div>
        <div><dt>Mag</dt><dd className="tnum">+{d.magicalDamage}</dd></div>
        <div><dt>HP</dt><dd className="tnum">{sheet.max_hp}</dd></div>
      </dl>

      {SKILL_KEYS.map((key) => {
        const sk = sheet.skills[key];
        if (!sk?.name) return null;
        return (
          <div key={key} className="sheet__skill" style={{ ["--tone" as string]: SKILL_TONE[key] }}>
            <div className="sheet__skill-head">
              <strong>{SKILL_LABEL[key]}: {sk.name}</strong>
              <Badge tone="neutral">{SKILL_MODE_LABELS[sk.mode ?? "cooldown"]}</Badge>
            </div>
            {sk.flavor && <p className="sheet__flavor">“{sk.flavor}”</p>}
            {sk.effect && <p className="sheet__effect">{sk.effect}</p>}
          </div>
        );
      })}

      {sheet.notes && <p className="sheet__notes">{sheet.notes}</p>}
    </Modal>
  );
}

/* ── Editor ── */

function SheetEditor({
  editing,
  existing,
  onClose,
  onSaved,
}: {
  editing: CombatSheet | null;
  existing: CombatSheet[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [characterName, setCharacterName] = useState(editing?.character_name ?? "");
  const [sheetName, setSheetName] = useState(editing?.sheet_name ?? "");
  const [player, setPlayer] = useState(editing?.player ?? "");
  const [role, setRole] = useState<Role>(editing?.role ?? "Player");
  const [maxHp, setMaxHp] = useState(String(editing?.max_hp ?? 15));
  const [stats, setStats] = useState<Stats>(editing?.stats ?? { ...EMPTY_STATS });
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [skills, setSkills] = useState<Record<string, SheetSkill>>(() => ({
    s1: editing?.skills.s1 ?? emptySkill(),
    s2: editing?.skills.s2 ?? emptySkill(),
    ult: editing?.skills.ult ?? { ...emptySkill(), maxVal: 1 },
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const knownNames = useMemo(
    () => [...new Set(existing.map((s) => s.character_name).filter(Boolean))],
    [existing],
  );

  const statTotal = STAT_KEYS.reduce((a, k) => a + stats[k], 0);
  const hasWeakness = STAT_KEYS.some((k) => stats[k] < 0);

  const save = async () => {
    if (!characterName.trim() || !sheetName.trim()) {
      setError("Character name and sheet name are both required.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      character_name: characterName.trim(),
      sheet_name: sheetName.trim(),
      name: `${characterName.trim()}, ${sheetName.trim()}`,
      player: player.trim(),
      role,
      type: editing?.type ?? "Normal",
      max_hp: parseInt(maxHp, 10) || 15,
      stats,
      skills,
      notes,
      // Written only so inserts keep working against the existing schema, which
      // may declare this column NOT NULL. It is not a credential and nothing
      // reads it — docs/SECURITY.md covers dropping it server-side.
      password: GUARD,
      approved: true,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing) await updateSheet(editing.id, payload);
      else {
        const id =
          `${payload.character_name}-${payload.sheet_name}`
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "") || `sheet-${Date.now()}`;
        await createSheet(id, payload);
      }
      toast.push(editing ? "Sheet updated" : "Sheet published", "ok");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof SupabaseError ? e.message : "Could not save the sheet.");
    } finally {
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <Modal open onClose={onClose} title="Editing is guarded" width={440}>
        <p className="editor__guard-note">
          This passphrase stops accidental edits during a session. It is checked in
          your browser, so it will not keep out anyone who wants in. Real access is set
          by the database's own policies.
        </p>
        <label className="field__label" htmlFor="guard-pw">Passphrase</label>
        <input
          id="guard-pw"
          type="password"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (checksum(pw) === GUARD) setUnlocked(true);
            else setPwErr("That passphrase does not match.");
          }}
          aria-invalid={pwErr ? "true" : undefined}
        />
        {pwErr && <p className="field__error" role="alert">{pwErr}</p>}
        <Button
          tone="phase"
          onClick={() => {
            if (checksum(pw) === GUARD) setUnlocked(true);
            else setPwErr("That passphrase does not match.");
          }}
        >
          Unlock editing
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit sheet" : "New combat sheet"}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="heal" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : editing ? "Save changes" : "Publish"}
          </Button>
        </>
      }
    >
      {error && <ErrorPanel error={error} />}

      <div className="editor__row">
        <div className="field">
          <label className="field__label" htmlFor="ed-char">Character name *</label>
          <input id="ed-char" list="known-characters" value={characterName} onChange={(e) => setCharacterName(e.target.value)} />
          <datalist id="known-characters">
            {knownNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ed-sheet">Sheet name *</label>
          <input id="ed-sheet" value={sheetName} placeholder="e.g. Sakura Speed" onChange={(e) => setSheetName(e.target.value)} />
        </div>
      </div>

      <div className="editor__row">
        <div className="field">
          <label className="field__label" htmlFor="ed-player">Player</label>
          <input id="ed-player" value={player} onChange={(e) => setPlayer(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ed-role">Role</label>
          <select id="ed-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option>Player</option>
            <option>Enemy</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="ed-hp">Max HP</label>
          <input id="ed-hp" type="number" min={1} value={maxHp} onChange={(e) => setMaxHp(e.target.value)} />
        </div>
      </div>

      <div className="editor__statbar">
        <span>Total <strong className="tnum" data-ok={statTotal === 5 ? "1" : undefined}>{statTotal}</strong> / 5</span>
        <span>Weakness <strong data-ok={hasWeakness ? "1" : undefined}>{hasWeakness ? "✓" : "✗"}</strong></span>
      </div>

      <div className="editor__stats">
        {STAT_KEYS.map((k) => (
          <label key={k} className="editor__stat">
            <span>{k}</span>
            <NumberInput
              value={stats[k]}
              onChange={(n) => setStats({ ...stats, [k]: n })}
            />
          </label>
        ))}
      </div>

      {SKILL_KEYS.map((key) => (
        <Disclosure key={key} label={SKILL_LABEL[key]} defaultOpen={Boolean(skills[key]?.name)}>
          <div className="editor__skill">
            <input
              value={skills[key]?.name ?? ""}
              placeholder="Skill name"
              aria-label={`${SKILL_LABEL[key]} name`}
              onChange={(e) => setSkills({ ...skills, [key]: { ...skills[key]!, name: e.target.value } })}
            />
            <div className="editor__row">
              <select
                value={skills[key]?.mode ?? "cooldown"}
                aria-label={`${SKILL_LABEL[key]} mode`}
                onChange={(e) => setSkills({ ...skills, [key]: { ...skills[key]!, mode: e.target.value as SheetSkill["mode"] } })}
              >
                {SKILL_MODES.map((m) => (
                  <option key={m} value={m}>{SKILL_MODE_LABELS[m]}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={skills[key]?.maxVal ?? 1}
                aria-label={`${SKILL_LABEL[key]} capacity`}
                onChange={(e) => setSkills({ ...skills, [key]: { ...skills[key]!, maxVal: parseInt(e.target.value, 10) || 1 } })}
              />
              <input
                type="number"
                min={1}
                value={String(skills[key]?.phaseLock ?? "")}
                placeholder="Phase lock"
                aria-label={`${SKILL_LABEL[key]} phase lock`}
                onChange={(e) => setSkills({ ...skills, [key]: { ...skills[key]!, phaseLock: e.target.value } })}
              />
            </div>
            <textarea
              value={skills[key]?.effect ?? ""}
              placeholder="Effect"
              aria-label={`${SKILL_LABEL[key]} effect`}
              onChange={(e) => setSkills({ ...skills, [key]: { ...skills[key]!, effect: e.target.value } })}
            />
          </div>
        </Disclosure>
      ))}

      <div className="field">
        <label className="field__label" htmlFor="ed-notes">Notes</label>
        <textarea id="ed-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ── Tab ── */

export function LibraryTab({ onAdded }: { onAdded: () => void }) {
  const { dispatch } = useStoreApi();
  const toast = useToast();
  const [sheets, setSheets] = useState<CombatSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<CombatSheet | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CombatSheet | null>(null);

  const query = useDebounced(search, 180);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const { sheets: rows, skipped } = await fetchSheets(signal);
      setSheets(rows);
      if (skipped > 0) {
        toast.push(`${skipped} damaged sheet${skipped === 1 ? "" : "s"} skipped`, "warn");
      }
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof SupabaseError ? e.message : "Could not load the library.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sheets.filter(
          (s) =>
            (s.character_name || s.name || "").toLowerCase().includes(q) ||
            (s.sheet_name || "").toLowerCase().includes(q) ||
            (s.player || "").toLowerCase().includes(q),
        )
      : sheets;
    const map = new Map<string, CombatSheet[]>();
    for (const s of filtered) {
      const key = s.character_name || s.name || "Unknown";
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()];
  }, [sheets, query]);

  const add = (sheet: CombatSheet) => {
    const c = combatantFromSheet(sheet);
    dispatch({ type: "COMBATANTS_ADDED", combatants: [c] });
    toast.push(`${c.name} added to the tracker`, "ok");
    announce(`${c.name} added to the tracker.`);
    onAdded();
  };

  return (
    <div className="library">
      <header className="library__head">
        <div>
          <h1 className="library__title display">Combat library</h1>
          <p className="library__count">
            {loading ? "Loading…" : `${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button
          tone="phase"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          New sheet
        </Button>
      </header>

      <input
        className="library__search"
        value={search}
        placeholder="Search by character, sheet, or player…"
        aria-label="Search the library"
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <ErrorPanel error={error} onRetry={() => void load()} />}

      {loading && (
        <div className="library__skeletons" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <EmptyState
          seal="册"
          title={sheets.length === 0 ? "No sheets published yet" : "Nothing matches that search"}
          body={
            sheets.length === 0
              ? "Publish a combat sheet and it will be available to every session from here."
              : "Try a character name, a sheet variant, or the player's name."
          }
        />
      )}

      {grouped.map(([character, list]) => (
        <section key={character} className="charblock">
          <h2 className="charblock__name display">
            {/* One portrait per character, on the heading rather than on each
                sheet: the variants below are the same person. */}
            <Portrait
              c={{
                role: list[0]?.role ?? "Player",
                type: list[0]?.type ?? "",
                hp: 1,
                portrait: list.find((s) => s.portrait_url)?.portrait_url,
              }}
              size={40}
              className="charblock__face"
            />
            {character}
            {list[0]?.player && <span className="charblock__player">· {list[0].player}</span>}
          </h2>
          {list.map((sheet) => (
            <article key={sheet.id} className="sheetcard">
              <div className="sheetcard__main">
                <div className="sheetcard__tags">
                  <Badge tone={sheet.role === "Player" ? "player" : "enemy"}>{sheet.role}</Badge>
                  {sheet.sheet_name && <Badge tone="neutral">{sheet.sheet_name}</Badge>}
                  <Badge tone="info">HP {sheet.max_hp}</Badge>
                </div>
                <div className="sheetcard__stats">
                  {STAT_KEYS.map((k) => (
                    <span key={k} className="sheetcard__stat tnum" data-sign={sheet.stats[k] > 0 ? "pos" : sheet.stats[k] < 0 ? "neg" : "zero"}>
                      {k} {sheet.stats[k] > 0 ? `+${sheet.stats[k]}` : sheet.stats[k]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="sheetcard__actions">
                <Button size="sm" tone="phase" onClick={() => add(sheet)}>
                  Add to tracker
                </Button>
                <Button size="sm" onClick={() => setDetail(sheet)}>
                  View
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(sheet);
                    setEditorOpen(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </section>
      ))}

      {detail && <SheetDetail sheet={detail} onClose={() => setDetail(null)} />}
      {editorOpen && (
        <SheetEditor
          editing={editing}
          existing={sheets}
          onClose={() => setEditorOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
