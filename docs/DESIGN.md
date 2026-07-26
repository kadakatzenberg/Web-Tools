# Design rationale

## Direction: The Living War Table

The interface is built as a lacquered command table rather than a dashboard.
Materials do the work that chrome usually does:

- **Ground** — near-black lacquer (`#05050a`–`#1f1f32`) with a fine carved grid,
  a warm pour of light from above, and a slow drift of embers on canvas.
- **Structure** — brushed-metal borders and an inset carve highlight, so panels
  read as objects set into a surface rather than cards floating over a page.
- **Text** — warm bone (`#ece7dc`) on lacquer, never pure white on pure black.
- **Seal** — vermilion (`#c8382e`) marks authored surfaces: the brand mark, the
  top edge of every dialog, the centre line of the battlefield.

## Three faces, three jobs

- **Cinzel** — carved Roman capital. Ceremony only: the round, the phase name,
  seals, section headings.
- **IBM Plex Sans** — a systems typeface, and the face of every piece of
  operational data. This is most of the interface.
- **IBM Plex Mono** — tabular figures wherever numbers align in a column:
  health, counters, dice, log timestamps.
- **Noto Serif** — prose only. Help text, empty states, the initiative
  explanation.

The serif used to carry the whole interface. It is a poor face for dense
numeric data, which is what a combat tracker mostly is, so it has been pushed
back to the sentences it reads well. All four are self-hosted through
`@fontsource`, Latin subsets, under the SIL Open Font License — see
`ATTRIBUTIONS.md`.

## The three-zone workspace

The single most consequential change in the redesign. The tracker used to be one
narrow column: on a 1440×900 desktop, six combatants produced 4,600px of scroll
and *not one card was above the fold*. The primary instrument was invisible on
the primary screen.

The workspace is now three zones cut into one surface:

- **The Order** (left, 236–258px) — a read-only standing of every combatant:
  rank, health, conditions, turn state. This is the "understand the fight in
  three seconds" surface. It is deliberately read-only; nothing on it can change
  a combatant, which is what lets it be this dense without being dangerous to
  skim with a cursor. Selecting a unit focuses its card.
- **The table** (centre) — the phase strip, the war table, and the roster, which
  becomes a two- or three-column grid as the column widens.
- **Activity** (right, 284–320px) — the combat log, permanently visible instead
  of hidden behind a toggle most people never found, replaced by the enemy roll
  block during the enemy phase.

Zones are divided by hairline inlay rather than gaps, so the workspace reads as
one carved plane rather than three floating panels. Both rails are pinned and
scroll independently, so the roster can be any length without pushing the Order
or the log out of reach.

## Rank as a visual system

A combatant's standing is carried four ways at once, so it survives greyscale,
small sizes, and a colour-blind reader:

| Rank | Mark | Spine | Pigment | Frame |
| --- | --- | --- | --- | --- |
| Player | upward chevrons | 2px | jade | — |
| Enemy | filled node | 2px, dimmed | cinnabar | — |
| Elite | faceted lozenge | 3px | candle | raised border |
| Boss | sealed lozenge in a ring | 3px, lit | violet | second frame, inner glow |
| Down | broken ring | 2px, faded | grey | struck-through name |

The boss is the only card allowed extra chrome, because it is the only one whose
arrival changes how the whole table is read.

## Health, without relying on colour

Four bands on one warming ramp — jade, candle, orange, dried cinnabar — so the
*direction* of travel reads even where the hues do not separate. Below half, the
bar fill also gains a diagonal hatch, and the track carries fixed quarter marks
so a ratio can be estimated without reading the number. The fill eases toward
its new value over 520ms so a hit reads as movement rather than a jump cut.

(The hatch was authored twice before it actually rendered: the meter set its
colour with the `background` shorthand inline, which resets `background-image`
and silently discarded it. It is now set with `backgroundColor`.)

## Marks are original

No icon library. Every mark is drawn in `src/ui/icons.tsx` as inline SVG on a
16×16 grid, cut from the same motifs as the rest of the system — brush strokes,
blade edges, seal geometry, moon phases, cat-eye curves — with butt caps and
mitre joins, because these are cut rather than rounded. A general-purpose icon
set would have brought a house style belonging to no particular product.

Conditions map to marks through a registry with a polarity (harmful, helpful,
neutral); anything unregistered falls back to a neutral mark, so a custom
condition is never left without one.

## Phase as material, not decoration

Each phase owns a pigment: **jade** for the player phase, **cinnabar** for the
enemy phase, **candle amber** for the environment phase. A single
`[data-phase]` attribute on the root swaps three custom properties, and every
accent in the app follows — buttons, focus rings, tab underline, war-table
selection, ember tint. Changing phase changes the colour of the room.

The transition is deliberately fast (620ms, and 1ms under reduced motion). A GM
advances phases dozens of times a session; a cinematic wipe would become an
obstacle by the third round.

## Legibility outranks atmosphere

Three rules constrain every effect:

1. **Nothing occludes a number the GM is reading.** Floating damage marks rise
   beside the health readout, never over it.
2. **State is never carried by colour alone.** Health bands pair hue with a
   glyph (`◐` wounded, `◔` critical, `✕` unconscious) and a word. Ability
   readiness pairs a lit edge with the literal word "Ready".
3. **Feedback never changes layout.** Impact is a lateral jolt and a rim light,
   not a scale or size change — anything that reflows would move the control
   under the pointer.

That third rule was learned the hard way; see the layout-shift bug in
`docs/QA.md`.

## Information architecture

The tracker is ordered by the round loop, not by feature grouping:

1. Phase, round, and both phase counters — pinned, always visible.
2. How many combatants still have to act.
3. The war table: where everyone is and how badly hurt.
4. The roster itself.
5. Setup — adding combatants, session codes — below the roster.

Within a card the same logic applies: identity and health, then damage / heal /
shield, then abilities, then conditions, then editing behind disclosures.

## The war table

Built on the Front / Back / Out positions that already existed. Tokens are plain
buttons in a CSS grid, so the view is keyboard-operable and screen-reader legible
with no canvas fallback to maintain. Health reads as **volume** — a ring that
fills from the bottom — which is scannable at a glance across twenty tokens in a
way that twenty numbers are not.

It complements the cards rather than replacing them: the table answers "who is
where and how hurt", the cards answer "what can this combatant actually do".

## Motion budget

The strongest motion in the application is spent on exactly one event: the round
herald, a struck plate with two ink rules drawing apart, shown when the round
number advances. A new round is the only moment where the whole table's state
moves at once — durations tick, damage-over-time resolves, every acted flag
clears — so it is the only moment that earns a full-screen gesture. It never
blocks a pointer, never covers the rails, is hidden from assistive technology
(the phase strip is already live), and does not render at all under reduced
motion. It is also suppressed when the counter moves *backwards*, since
celebrating an undo would be a lie about what just happened.

Everything else is under 200ms and attached to a state change: the phase edge
sweep, the meter ease, the detail panel open, hover and focus responses.

## Sound

Procedural Web Audio, no files. Muted until explicitly enabled, quiet enough to
sit under conversation, and never the sole carrier of information — every cue it
marks also has a visual and a screen-reader announcement. Healing rises a third;
damage falls with a noise transient. They are opposite gestures on purpose.

## Performance posture

The atmosphere layer caps device pixel ratio at 1.5, scales particle count by a
coarse capability tier, and stops its loop entirely when the tab is hidden or
reduced motion is requested. The tracker is fully functional with the canvas
removed — it is decoration behind an `aria-hidden` boundary, not a dependency.


## Dice notation

The bot accepts far more than `1d20+n`, and three of its features map onto rules
the tracker already modelled but never expressed:

**Advantage and Disadvantage were already status conditions** and had no
mechanical effect whatsoever — every roll the tracker emitted was a flat d20
regardless. They now produce `2d20kh1` and `2d20kl1`, on both the enemy phase
block and a combatant's own attack roll. Holding both cancels, per convention.

**Crit highlighting** (`cs`, `cf=1`) costs nothing mathematically and makes a
natural 20 or 1 obvious in the Discord message. It is opt-in on the enemy phase
block: it is the only part of the emitted notation the bot could plausibly
reject, and a broken roll block mid-phase is worse than a plain one.

**Scatter rolls.** Targeting *everyone* emits a die sized to the living party
plus a numbered legend, matching how indiscriminate attacks already get handled
at the table.

Skills can also carry their own notation — sessions show them rolling `1d4`,
`1d6` and similar — which attaches a one-click copy button to the ability.

**The tracker never rolls.** Every one of these functions builds a string and
nothing more. The bot stays the single source of randomness, so nobody has to
trust a number the tool produced over one the whole table watched happen.
