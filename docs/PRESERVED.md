# Preserved behaviours

Every item below was read out of the v1 source before implementation and is
carried over with identical arithmetic. Items marked **[T]** are pinned by a unit
test; **[E]** by a browser test.

## Damage pipeline

- Order is resistance → temporary shields (in array order) → normal shield → HP. **[T][E]**
- Physical damage is reduced by effective CON; magical by effective WIS. **[T][E]**
- True damage (`raw` from the card selector, `true` from the DoT selector) ignores resistance entirely. **[T][E]**
- Resistance is clamped at zero, so negative CON/WIS grants no resistance and does **not** amplify damage. **[T]** *(the settled rule — the rulebook wording is misleading; see `docs/MIGRATION.md`)*
- Temporary modifiers feed into the resistance calculation. **[T]**
- Temporary shields are consumed in order and dropped at zero. **[T][E]**
- HP clamps to `[0, maxHp]`; damage never drives it negative. **[T][E]**
- Zero or negative damage is a no-op. **[T]**

## Health, healing, shields

- Healing clamps at `maxHp` and never revives from below zero. **[T][E]**
- Full heal restores to `maxHp`. **[E]**
- Multi-target damage and healing apply the full pipeline per target. **[E]**
- Normal shield adjusts in steps of one, clamped to `[0, 20]`.
- Temporary shield duration is derived from magnitude: 1–2 → 3 rounds, 3–4 → 2, 5+ → 1. **[T]**
- Thresholds: `hp <= 0` unconscious, `<= 25%` critical, `<= 50%` wounded. **[T][E]**

## Stats

- Six stats: STR, DEX, INT, WIS, AGI, CON.
- AC = `10 + AGI×2`; Hit = `DEX×2`; physical damage = `2 + STR`; magical damage = `2 + INT`; physical resist = CON; magical resist = WIS. **[T]**
- Temporary modifiers fold into every derived value. **[T]**

## Phases and rounds

- Fixed order: Player (0) → Enemy (1) → Environment (2). **[E]**
- Entering the enemy phase increments only the enemy phase counter. **[T][E]**
- Entering the player phase increments the round *and* the player phase counter. **[T][E]**
- The full duration tick happens **only** on entry to the player phase — once per round, not once per phase. **[T][E]**
- Entering the environment phase only clears per-phase "acted" marks. **[T][E]**
- Every phase change clears "acted" marks. **[T][E]**

## Round processing order

1. DoTs resolve first, each through the complete damage pipeline, threading HP and shields between ticks. **[T]**
2. Regeneration applies, clamped at `maxHp`. **[T]**
3. Durations decrement and expired entries drop: DoTs, regens, statuses, temporary modifiers, temporary shields. **[T][E]**
4. Abilities tick. **[T][E]**
5. `done` resets. **[T]**

- A legacy scalar `hpRegen` is promoted to a permanent regeneration only when the modern list is empty. **[T]**
- Permanent DoTs and regens never expire. **[T]**

## Initiative

- Roll *n* d20 for the enemy side; the total is what players must beat. **[E]**
- Players must **beat** the enemy total; a tie goes to the enemies. **[T][E]**
- Player-first seeds `playerPhaseCount = 1` and starts at phase 0. **[T][E]**
- Enemy-first seeds `enemyPhaseCount = 1` and starts at phase 1. **[T][E]**
- Resetting initiative returns to round 1, zeroes both counters, and unlocks. **[T][E]**

## Abilities

All six modes preserved with their exact semantics:

| Mode | Ready when | Use |
| --- | --- | --- |
| Cooldown | `cur === 0` | sets `cur = max`, marks the combatant acted **[T][E]** |
| Ammo | `cur > 0` | decrements, marks acted; enters play fully loaded **[T][E]** |
| Charge | `cur >= max` | Charge → `charging = true` (marks acted); Cancel → reset; Fire → reset, marks acted **[T][E]** |
| Passive | never | no controls **[T]** |
| Stack | never | manual +/− and Reset **[T]** |
| Reaction | `cur === 0` | sets `cur = max + 1`, does **not** mark acted **[T]** |

- Cooldown and reaction tick down by one per round, floored at zero. **[T]**
- Charge accrues `gainPerPhase` per round only while charging, capped at `max`. **[T]**
- Ammo, passive, and stack are untouched by the round tick. **[T]**
- Phase locks compare against the player or enemy phase counter as configured. **[T][E]**
- Progress fills forward for ammo/charge/stack and as a cooldown drains. **[T]**
- Abilities are editable and deletable, with effect text. **[E]**

## Character library

- Loads approved sheets ordered by character then sheet name. **[E]**
- Search across character name, sheet name, and player. **[E]**
- Multiple sheets group beneath one character.
- Full sheet view, add to tracker, edit, create another sheet for an existing character.
- Character name autocomplete from existing sheets.
- Sheet → ability mapping: cooldown and reaction default to capacity 2, others to 1; ammo enters loaded; the ultimate slot is prefixed `ULT:`; phase lock carries across only when set. **[T]**
- Display name is `Character (Sheet)`, or the character name alone when there is no variant. **[T]**

## Enemy generator

- MOOK: total +3, heavy +2, 10 HP, 1 skill slot. NORMAL: total +5, heavy +3, 15 HP, 2 slots. **[T][E]**
- Seven archetypes: one per stat plus fully random. **[T]**
- Every stat line hits the exact tier total. **[T][E]**
- Every stat line contains at least one negative — the guaranteed weakness. **[T][E]**
- Stats never fall below −3; non-heavy stats cap at +2 for archetype rolls, +5 for fully random. **[T]**
- Reroll, random skill modes per slot, manual skill selection.
- Batch add with a quantity limit of 20. **[E]**
- Generated enemies are named `{Archetype} {TIER} #{n}`, typed Normal (mook) or Elite (normal). **[T]**

## Sessions

- Start a session, generate a 7-character uppercase code, resume by code.
- Persists combatants, phase, round, locked state, and both phase counters.
- Debounced autosave (2s).
- Loading, saved, offline, and failure states — now explicit rather than silent.

## Tracker

- Player, enemy, and environment phases; round and dual phase counters.
- Manual phase advancement; player-first and enemy-first starts.
- Player and enemy groupings, collapsible, with the acting side listed first.
- Front / Back / Out positions. **[E]**
- Per-combatant acted state; add, remove, rename, reorder. **[E]**
- Copy encounter status to the clipboard. **[E]**
