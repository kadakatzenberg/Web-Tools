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

Cinzel is retained as the display face because it is the app's existing visual
signature, but self-hosted through `@fontsource` (latin subsets only) instead of
hotlinked from Google Fonts.

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
