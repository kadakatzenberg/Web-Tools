# Preserved behaviours

Every item below was read out of the v1 source before implementation and is
carried over with identical arithmetic. Items marked **[T]** are pinned by a unit
test; **[E]** by a browser test.

## Damage pipeline

- Order is resistance → temporary shields (in array order) → normal shield → HP. **[T][E]**
- Physical damage is reduced by effective CON; magical by effective WIS. **[T][E]**
- True damage (`raw` from the card selector, `true` from the DoT selector) ignores resistance entirely. **[T][E]**
- Resistance is a signed value: positive reduces the hit, **negative increases it**. **[T]** *(deliberate rules change from v1, which clamped at zero — see `docs/MIGRATION.md`)*
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

## Rules changes made deliberately

Every entry here changes what the tracker computes. Each was made because the
skill pool in `combat_skills` already assumes it and the tracker did not
implement it — not to simplify the interface.

### Overheal converts to a temporary shield (new, default on)

**Before:** healing clamped at max HP and the excess was discarded.

**Now:** the overflow becomes a temporary shield labelled "Overheal", whose
duration follows the existing magnitude rule (1–2 → 3 rounds, 3–4 → 2, 5+ → 1).

**Why:** twelve skills in the pool end with the sentence "Overheal converts to
temporary shield" — every heal skill that exists. The tracker was resolving all
of them wrong unless the GM caught it by hand.

**Escape hatch:** a shield toggle beside Mend, and an "Overheal wards" checkbox
on Multi-mend. Both default on. Turn either off for plain healing. The domain
function defaults the behaviour *off*, so any caller that has not opted in is
unaffected.

**Not implemented:** per-skill caps ("capped at 3") are supported by
`applyHealing`'s `wardCap`, but no UI sets it yet — cap it by healing for less,
or trim the ward chip afterwards.

### Flat damage channels on temporary modifiers

**Before:** a temporary modifier could only move one of the six stats.

**Now:** it can also move `dmgTaken` or `dmgDealt`.

**Why:** "Reduce all incoming damage by 1" is not a CON buff. Expressing it as
one would also change resistance ordering and every CON check that combatant
makes. The channels are separate so the skill means only what it says.

**Order:** damage resolves as resistance → flat damage-taken → temporary
shields → shield → HP. The flat bonus lands *after* resistance deliberately: if
it came first, a target's CON could eat a Vulnerability stack, which is the
opposite of what the stack is for.

### Stacks carried by the target

**Before:** the only stack counter lived on an ability, which lives on the unit
that owns the skill.

**Now:** a combatant carries its own `stacks`, each with a name, a count, an
optional ceiling, and an optional per-stack damage-taken bonus.

**Why:** five skills read "on hit, *target* gains 1 stack" — Vulnerability, Hit
Stack True Damage, Ally Damage Stack, WIS Check Stack, True Damage Stack. The
counter belongs to the victim, and those five were previously unrepresentable.

**Behaviour:** reaching the ceiling resets the stack to zero and logs it. What
*happens* at the ceiling stays the GM's call, because it differs per skill.

### Stat checks are built, not recited

Abilities carry `dcStat` and `dcValue`, populated from `combat_skills`. A skill
that forces a save shows it on its chip, and any card can produce that
combatant's saving throw with their own effective modifier and any
Advantage/Disadvantage already applied.

The tracker still never rolls. It writes notation.

### Reactions have a trigger, not just a timer

**Before:** `reaction` mode was a cooldown. That says when a reaction is
*available* and nothing about when it goes off.

**Now:** a reaction carries a trigger — this unit is hit, hit physically, hit
magically, an ally is hit, an ally goes down, this unit reaches 0 HP. After a
hit or a knockout the tracker raises every armed reaction whose trigger the
event satisfies, and offers to spend it.

**Why:** all fourteen reaction skills are defined by their trigger. A timer
alone cannot say "when hit by a magical attack, negate the damage".

**Derived, never stored.** The prompt is recomputed from the encounter and the
last event, so it cannot go stale, survive an undo, or point at a combatant who
has since been removed. A reaction with no trigger set is never raised — a
default of "answers everything" would cry wolf on every hit.

### Per-round and per-combat budgets

**Before:** `gainPerPhase` was the only refill, and it fires three times a
round.

**Now:** an ability can carry `refill: "round"` (restores its whole budget on
the round boundary) or `refill: "combat"` (never restores). A passive with a
budget gets a Spend control and shows "1/1 this round".

**Why:** "Once per round, negate one hit entirely" and "survive with 1 HP once
per combat" were both unsayable.

### Attacks can be redirected

**Before:** nothing. Aggro Transfer and Ally Hit Intercept lived in the GM's
memory.

**Now:** a combatant can be covered by another. Redirects resolve inside
`DAMAGE_APPLIED`, so every path that deals damage honours them rather than only
the ones the UI remembered to ask about. They tick down with everything else on
the round boundary.

**Edge cases, decided rather than left open:**

- A chain is followed to its end, because an interceptor can itself be
  intercepted.
- A **circular** cover resolves back to the original target. A protecting B
  while B protects A cancels out — nobody is in front. Returning the original
  is the only answer that does not depend on where the walk started, which
  matters once a longer chain feeds into a loop.
- A redirect to a **downed** combatant is ignored. A body cannot cover anyone.
- Two wards sharing one guardian strike that guardian **once** per attack, not
  twice.

### Lifesteal is applied with the hit

**Before:** "heal self for all damage dealt" was arithmetic plus a second
action the table routinely forgot.

**Now:** the strike row carries an optional drain target and a full/half
toggle. The heal lands in the same beat as the hit, and drains the damage that
**actually reached HP** — not the raw number typed in, which would ignore
resistance and shields.

### Deliberately not built

- **Formula damage** — "damage equals max HP minus current HP, capped at 10"
  (HP Threshold Charge) and "damage is calculated using the target's highest
  stat" (Stat Mirror Strike). One skill each, both trivial mental arithmetic,
  and a UI for them would cost more attention than it saves.
- **Per-skill overheal caps** — `applyHealing` accepts a `wardCap`, but no
  control sets it. Heal for less, or trim the ward chip.

### Readiness is reported in Next Phase presses

**Before:** a cooldown said "2 left" and a charge sat at "0/1". Both count
rounds, but abilities only accrue when the round turns over — so a one-round
charge showed the same thing through three presses of Next Phase.

**Now:** every waiting state answers the same question in the same unit —
"Ready in 6 phases" → "Ready in 5 phases" → … → "Ready next phase" → "Ready".
Phase locks do the same: "Opens in 6 phases".

**Timing is unchanged.** The original tool also ticked on the round boundary,
and the skill pool measures charges in player phases ("if not interrupted by
end of 3rd player phase"), so once per round is correct. The gap was feedback.

Two further states stopped being ambiguous: an empty ammo clip reads **Spent**
rather than "0/3", because ammo does not refill in this system; and a stack at
its ceiling reads **At max 4/4**, because reaching the ceiling is the event
those skills exist for.

### Skills can require another skill

**Before:** nothing. Dawn's ult reads "Requires Sangre Lanza at max (+4 STR)"
and the link lived in somebody's memory.

**Now:** an ability can carry a prerequisite on a sibling skill. Unmet, it is
shown, muted, and explained — "Needs Sangre Lanza at 4/4 — currently 2" — with
no usable control. Met, it says so and **readies itself**: a gated charge does
not also need a Charge press the skill text never asked for.

**The gate is read out of the sheet's own prose** at import, so it appears on
existing characters without anyone re-entering a sheet. Parsing is anchored on
the word "requires" and nothing else, so an ordinary sentence — "STR resets to
0 after using Ult" — cannot become a gate by accident.
