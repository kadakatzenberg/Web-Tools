# Migration notes

## Data compatibility

**No data migration is required.** Table shapes, column names, and the
`combat_sessions.state` payload are unchanged from v1. A v2 build reads and
writes the same records as the deployed v1 page, and the two can run against the
same database.

| Table | Change |
| --- | --- |
| `combat_sheets` | None. Same columns, same query (`approved=eq.true`, ordered by character then sheet name). |
| `combat_skills` | None. Read-only, ordered by `id`. |
| `combat_sessions` | None. `{ code, state, updated_at }`, same state shape. |

### Legacy records are repaired on read, never rejected

Everything arriving from Supabase passes through `src/domain/schema.ts` before
reaching the UI:

- `stats` and `skills` columns are accepted whether they are objects **or** JSON
  strings — v1 wrote both.
- Missing collection fields (`tempShields`, `dots`, `hpRegens`, `abilities`,
  `statuses`, `tempMods`, `sheetSkills`) default to empty rather than crashing.
- The legacy scalar `hpRegen` is preserved and still honoured. It is promoted to
  a permanent regeneration entry only when the modern `hpRegens` list is empty,
  so a record written by v1 behaves identically.
- A combatant with `maxHp <= 0` is repaired to a positive value instead of
  producing `NaN` percentages.
- Individual malformed rows are skipped; one bad record never fails the whole
  load. The session banner reports when a repair happened.
- An out-of-range `phase` is coerced back into `{0,1,2}`.

Nothing is deleted or rewritten server-side as a side effect of reading.

## Architectural changes

| v1 | v2 |
| --- | --- |
| One 1,395-line `index.html` | Vite + React 18 + TypeScript, modular source |
| Babel Standalone compiling JSX in the browser on every load | Pre-built bundle |
| React + ReactDOM + Babel from cdnjs | Bundled, no external origins |
| Google Fonts hotlink | `@fontsource`, self-hosted, latin subsets only |
| Inline style objects throughout | CSS custom properties and design tokens |
| Combat maths inline in components | Pure functions in `src/domain`, unit-tested |
| `useState` per concern, prop-drilled | Command reducer + context, undo/redo |
| Raw `fetch` inside components | Persistence layer with retries and typed errors |
| No tests | 94 unit tests, 37 browser tests across two viewports |

### Undo/redo

Implemented as bounded full-state snapshots (60 entries) rather than inverse
commands. An encounter is a few dozen small plain objects, so snapshotting costs
far less than the correctness risk of hand-writing an inverse for each of the
thirty-odd commands.

## Deliberate behaviour changes

Three, all of them narrow. Everything else is preserved verbatim — see
`docs/PRESERVED.md`.

### 1. Reordering no longer crosses sides

**v1:** the up/down arrows swapped entries in the flat combatant array. Because
players and enemies are rendered as separate groups, moving the first player
"up" swapped them with whatever happened to precede them in the array — often an
enemy — silently reordering the opposing group.

**v2:** a combatant swaps with its neighbour **on its own side**. The arrows
disable at each side's boundary.

*Why:* the v1 behaviour had no coherent reading and produced visible reordering
in a group the GM was not touching.

### 2. The generator's fallback stat line is now valid

**v1:** if 400 random attempts failed, the fallback emitted `STR -1`, everything
else `0`, plus the fixed heavy stat — which does not respect the tier total and
could produce an illegal stat block.

**v2:** the fallback is constructed to guarantee both the exact tier total and at
least one negative stat.

*Why:* the fallback could emit an invalid enemy. In practice the path is
unreachable for the shipped tier configurations — 400 attempts always succeed —
so this changes no observable behaviour.

### 3. Save failures are surfaced

**v1:** `catch(e){}` — a failed session save was completely silent. A GM could
lose an entire fight without any indication.

**v2:** every save reports `saving` / `saved` / `offline` / `error` with a retry
control, and the encounter is mirrored to `localStorage` on every change
regardless of network state.

*Why:* silent data loss during a live session.

## Settled rule: negative CON and WIS never add damage

Resistance clamps at zero. A negative CON or WIS grants **no** resistance and
does **not** increase damage taken.

The written rulebook says negative values increase damage taken. That wording is
misleading, and session logs show it producing manual arithmetic errors in play —
a 4-damage hit applied as 5 against -1 CON, and a 9-damage round applied as 11.
The table has confirmed the clamped behaviour is the intended rule.

**Do not change this.** It is pinned by two tests
(`never amplifies damage for a negative CON`, and the WIS equivalent). If the
rulebook text is ever revised, that reference document should be corrected to
match the code rather than the other way round.
