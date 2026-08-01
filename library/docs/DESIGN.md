# Design rationale

## The direction: a codex kept in an observatory

The archive is a bound book that lives next to a telescope, and it has two
states rather than a light mode and a dark mode:

- **Vellum** — the page under a lamp. Parchment ground, iron-gall ink that has
  browned with age, gold leaf, and foxing generated from noise. The reading
  state.
- **Astral** — the same book at the eyepiece. The parchment goes to deep
  indigo, the gold becomes starlight, and the star map's pigments come up into
  the page.

Both share every measurement, every piece of structure and every component.
Only pigment and material change, which is what makes the switch read as the
hour changing rather than as a different website.

v1 was, unintentionally, both at once: a near-black masthead and a near-black
sidebar bolted to a parchment page. The two halves had no relationship, and
the seam between them was the first thing you saw. Making the split deliberate
and total resolved it.

## Three rules

**One pigment, one meaning.** Gold is the archive's own voice — seals, rules,
section marks, provenance. Era colour belongs to the eras and is never
borrowed for chrome. Vermilion appears only on destructive actions. v1 used
gold for chrome, headings, borders, links, the active filter and the loading
spinner, so gold meant nothing in particular.

**Nothing below 11px.** v1 set roughly forty labels at
`clamp(.34rem, .55vw, .4rem)` — between five and six pixels — in tracked
uppercase Cinzel. At that size a display capital's counters close and it stops
being type. Those labels carried the only name a field had. There is now a test
that fails the build if any visible text computes below 11px.

**Colour is never the only signal.** Every state also carries a mark, a rule
weight, a position or a shape. The era pip beside a card's era, the lozenge on
a section head, the spine on a hook, the diffraction spikes on a hub star.

## Type: three faces, three jobs

| Face | Job | Floor |
| --- | --- | --- |
| **Cinzel** | Display, section heads, names | 13px |
| **Cormorant Garamond** | Prose, quotes, the reading voice | 17px |
| **IBM Plex Sans** | Labels, counts, controls, metadata | 11px |

v1 ran Cinzel and Cormorant for everything including 6px labels and dense
metadata. Cormorant is a beautiful text face whose hairlines vanish below
about 17px; Cinzel is a monumental capital that was never drawn for running
UI. Adding a workhorse sans for the operational layer is what let both of the
others be used where they are good.

Two of the three are shared with the Hei Mao Combat app in this repository, so
the tools read as siblings.

All four files are self-hosted through `@fontsource`, Latin subsets only. v1
loaded them from `fonts.googleapis.com` — a render-blocking request to a third
party on every cold load, and the reason its content security policy would
have had to trust Google's CDN.

## Everything visual is generated

No image is fetched to draw the interface. Not a decision about purity — it is
the difference between a first paint that waits on a storage bucket and one
that does not. v1 hotlinked an 80×80 PNG from Supabase into the masthead and
the same file again at 160px into the hero.

- **The paper** — two layers of `feTurbulence` in a data URI: a fine grain for
  the tooth of the sheet, and a coarse warm layer for foxing. Resolution
  independent, no memory, and tunable by changing one number.
- **The house mark** — 400 bytes of SVG geometry.
- **The sigils** — see below.
- **The constellation** on the home page — a 2D canvas field that stops when
  scrolled out of view, when the tab is hidden, and under reduced motion.
- **The star map** — five WebGL passes, no textures at all.

## The sigils

Every entry has a mark derived from its id: an outer ring, sometimes a broken
second ring, rim ticks, an inner device drawn from a narrow vocabulary
(star polygon, polygon, crescent, rays, eye, nested rings), and an orbit of
points. The id never changes, so the mark never changes, and nothing is stored.

The vocabulary is deliberately narrow so fifty of them on a grid read as one
system rather than fifty unrelated doodles.

Only five of the 304 entries currently lack a portrait, so this is not mainly
about missing images. It earns its place because every entry spends its first
moments on screen as a placeholder, any entry becomes one permanently the day
a storage object goes missing — v1 rendered a broken-image icon in that case —
and because a linked relationship needs a mark inline where a portrait would
be too heavy. v1 used one `✦` glyph for all of it.

## The star map

The signature feature, and the one with the most rebuilt underneath it.

**The layout moved off the main thread.** v1 ran `simulation.tick(300)`
synchronously — roughly two seconds of frozen page on a laptop, considerably
worse on a phone. The progress bar shown during that time could not have been
real, since nothing could paint; it was set to 100% once, after the blocking
call had already returned. The simulation now runs in a worker and streams
positions back in slices, so the map animates itself into place and the page
stays responsive.

**Rendering moved to WebGL2.** Five passes:

1. **Sky** — one fullscreen shader: gradient, fBm nebula that parallaxes
   against the camera, and three layers of background stars hashed per cell.
   v1 drew 1,360 stars into an offscreen canvas at fixed size, so it had to be
   rebuilt on every resize and was visibly soft on a high-DPR screen.
2. **Nebulae** — one additive instanced quad per era cluster, in that era's
   pigment.
3. **Edges** — additive lines.
4. **Stars** — one instanced draw call for the whole archive, with an SDF core,
   a halo, and diffraction spikes on hubs and the selection.
5. **Composite** — bloom, filmic tone map, chromatic aberration, vignette,
   grain.

Bloom runs at half resolution deliberately: full-res costs around 3.2ms a frame
on a mid-range GPU against roughly 0.8ms at half, and against a starfield the
difference is invisible. That is a quarter of the 16.6ms frame budget bought
back for nothing.

**Soul lineage is drawn.** v1's map used only `relations`, so the reflections
appeared as unconnected islands — when the entire premise of the setting is
that they hold the same souls. Lineage links are edges now, and they are the
ones that cross worlds.

**Portraits are not drawn into the nodes.** v1 loaded all 304 portraits to
paint them inside circles a few pixels across. The portrait now appears in the
selection panel, where it is large enough to be a face, and the map loads no
images at all.

**It is usable without a mouse.** Every node is also a real button in an index
that is parked off-screen until something in it takes focus. Choosing an entry
there centres the camera on it, so the two views stay in step rather than one
being a consolation prize.

## Layout has no magic numbers

v1 positioned the page against a hardcoded 98px masthead (`margin-top: 98px`)
and a hardcoded 220px sidebar (`margin-left: 220px`). Below about 900px the
masthead's actions wrapped, it grew past 98px, and it covered the top of the
content on every page.

The shell is a two-column grid; the masthead is sticky and sized by its
contents. There is a test at three viewports asserting that nothing overflows
horizontally and that the masthead never overlaps what is under it.

## What was kept

The identity. Parchment, gold, Cinzel, the tagline, "Recently Added" and
"Recently Updated", the star map, the stat block, RP hooks, soul lineage, the
`✦`-marked section heads, per-entry passwords, the submit-your-own-entry model.
This is a community's archive with years of work in it, and the brief was to
raise the execution, not to redecorate around it.

Wording on screen is the archive's own. Where a new surface needed a label it
uses the vocabulary already in the app — "Worlds" is what the rail already
called them.
