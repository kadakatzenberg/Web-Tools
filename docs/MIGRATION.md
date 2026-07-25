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

## Rules change: negative CON and WIS now add damage

**v1 behaviour:** resistance was clamped at zero (`Math.max(0, effCON)`), so a
negative CON or WIS granted no resistance but also did not increase damage taken.

**v2 behaviour:** resistance is a signed value. A combatant with CON -2 takes two
extra physical damage per hit; WIS does the same for magical damage. True and raw
damage still bypass the calculation entirely.

This is a deliberate change made by the table, not a bug fix and not a
preservation. The reasoning:

- CON and WIS feed **nothing but resistance**. Under clamping, CON -3 and CON 0
  were mechanically identical, so a negative in either stat cost nothing at all.
- Every other stat's negative has a real price: -STR is less damage, -DEX is less
  hit, -AGI is lower AC, -INT is less magical damage.
- The enemy generator **requires** a negative stat on every roll. Under clamping,
  spending that mandatory weakness on CON or WIS was strictly free, and the freed
  points went into offence — so "dump the weakness into CON" was a dominant
  outcome for generated enemies and for player sheets alike.

The written rulebook already described this behaviour; v1's code did not
implement it.

### Consequences to be aware of

- Every combatant with a negative CON or WIS is now measurably more fragile.
  Most generated enemies have one, since a weakness is mandatory.
- The effect is largest at -3, where a 5-damage hit lands for 8. If that proves
  too swingy in play, the two cheapest levers are capping generator negatives at
  -2 for CON and WIS, or halving the amplification rounded down.
- Historical session records are unaffected — nothing is recalculated on load.
  Only damage applied from now on uses the new maths.

Pinned by tests: `amplifies physical damage for a negative CON`, `amplifies
magical damage for a negative WIS`, `does not amplify true or raw damage
regardless of CON`, and `amplifies through a negative temporary modifier`.
