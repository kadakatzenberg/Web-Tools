# QA record

Everything below was executed against the **production build** served by
`vite preview`, not the dev server.

## Automated

| Suite | Count | Result |
| --- | --- | --- |
| Vitest — combat rules, actions, phases, generator, schema | 223 | pass |
| Playwright — desktop 1440×900 | 90 | pass |
| Playwright — mobile 390×844 | 90 | pass |

```
npm test        →  Test Files 10 passed (10),  Tests 223 passed (223)
npm run test:e2e →  180 passed
npm run build   →  ✓ built, no type errors, no warnings
```

## Viewports verified

Horizontal-overflow assertion (`scrollWidth - clientWidth <= 1`) plus reachability
of the Next Phase control, with a 12-combatant encounter carrying shields, DoTs,
regeneration, statuses, modifiers, and three abilities each:

- 1440 × 900 desktop
- 1280 × 800 desktop
- 1024 × 768 tablet landscape
- 768 × 1024 tablet portrait
- 430 × 932 mobile
- 390 × 844 mobile
- 360 × 740 mobile

Touch targets checked at 390 px: the primary phase control measures ≥ 40 px tall.

## Stress testing

| Scenario | Result |
| --- | --- |
| 20 combatants, each with 3 abilities, 2 statuses, DoT, regen, temp shield, modifier | typing into a card input stays under 2 s round-trip |
| 40 combatants, same loadout, three phase advancements (one full round tick) | completes well under the 6 s budget; durations verified to have advanced |
| Repeated phase advancement across multiple rounds | no drift in round or phase counters |
| Rapid damage and healing operations | no lost updates, no duplicated effects |

## Manual flows exercised in-browser

Fresh encounter; add players manually; add with custom stats; generate one enemy;
generate a batch of three; apply physical, magical, and true damage; verify
resistance arithmetic against the rules; apply normal and temporary shields and
confirm absorption order; heal and full-heal with clamping; add conditions with
durations; add DoTs and regeneration; drive cooldown, ammo, charge, and
phase-locked abilities; advance through several complete rounds and confirm
expiry timing; undo and redo; remove and restore a combatant; move between
Front/Back/Out and confirm the war table reflects it; resolve attacks, skills,
and mends from the command window on the table, including a miss, a covered
target, and a skill that asks for the total rolled in Discord; command palette; combat
log; export; reload and recover from the local backup; keyboard-only navigation;
reduced-motion mode; backend-unreachable degradation.

## Console

Asserted clean in an automated test covering add → damage → three phase
advancements. No errors, no warnings, no React key or hydration complaints.

## Defects found and fixed during QA

All of these were found by running the app and probing it, not by reading the code.

### 1. The first interaction with any combatant card was silently swallowed

**Symptom:** clicking the shield `+` button three times incremented it twice.
Event tracing showed `mousedown` and `focusin` firing with no `mouseup` and no
`click`, at an unchanged scroll position.

**Cause:** focusing anything inside a card set the selected combatant, which made
the war table render "Move here" buttons in every non-matching lane. That grew
the table — which sits *above* the roster — and pushed the entire card list down
between mousedown and mouseup, so the two landed on different elements and no
click event was ever produced.

**Fix:** the lane action is now absolutely positioned as an overlay inside its
lane, so selection cannot change the table's height. On touch it stays visible
since there is no hover.

**Impact if shipped:** every GM's first tap on any card, every time they switched
combatants, would have done nothing.

### 2. Crash recovery never worked

**Symptom:** the local backup was written correctly but was never offered after a
reload.

**Cause:** the session hook's mirror effect ran before the recovery read, so the
snapshot was overwritten with the current (empty) encounter before anything could
read it.

**Fix:** the recovery snapshot is captured synchronously during the first render,
and `writeBackup` now refuses to overwrite a snapshot with an empty encounter.

### 3. Mobile buried the roster

**Symptom:** at 390 px the war table stacked its six lanes vertically and
consumed the entire first screen; the first combatant card was two screens down.

**Fix:** lanes stay side by side on narrow viewports with per-lane token
scrolling, the table starts collapsed below 720 px, and session/add-combatant
controls moved below the roster so combatants sit directly under the phase bar.

### 4. Buttons that accepted a click and did nothing

**Symptom:** with the condition duration left blank, Apply did nothing at all —
no chip, no message, no error. The same held for Strike and Mend with an empty
amount, and for every Add button in the Effects panel.

**Cause:** each handler opened with a `return` on incomplete input. Correct as
validation, invisible as feedback: a dead click is indistinguishable from a
frozen app, and mid-fight it reads as the tool having lost the encounter.

**Fix:** every one of those guards now raises a warning toast naming the missing
field, and the two duration fields default to one round so the common case takes
a single click.

### 5. A temporary modifier could not be given a negative value

**Symptom:** entering STR −2 produced STR +2 — a debuff silently became a buff.

**Cause:** the same `<input type="number">` flaw already fixed on the stat
editor. The browser reports an intermediate `-` as an empty string, so the minus
was dropped and only the digits survived.

**Fix:** the field is a filtered text input with `inputMode="numeric"`, matching
the stat editor.

### 6. A removed combatant stayed selected in an open multi-target panel

**Symptom:** with both combatants selected for a multi-strike, removing one left
the button reading "Apply to 2".

**Cause:** the selection is held as a list of ids and was never reconciled
against the roster, so applying dispatched to an id that no longer existed and
the count misreported how many combatants were about to be hit.

**Fix:** the selection is intersected with the live roster at render time, so the
count, the disabled state, and the dispatch all agree with what is on the table.

## Known limitations

- The Supabase-backed library and generator skill list cannot be exercised
  against the live database from this environment; both paths are tested with
  the network stubbed and with it failing outright, and both degrade to a visible
  error rather than crashing.
- Row-level security policies on the Supabase project cannot be inspected or
  changed from this repository. See `docs/SECURITY.md`.
