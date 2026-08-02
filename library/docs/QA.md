# QA record

Everything below was run against the **production build** served by
`vite preview`, not the dev server, so what is verified is what ships —
including the code-split chunks, the minified CSS and the real worker bundle.

## Automated

| Suite | Count | Result |
| --- | --- | --- |
| Vitest — codec, search, taxonomy, sigils, legacy hash | 58 | pass |
| Playwright — desktop 1440×900 | 37 | pass |
| Playwright — desktop 1280×800 | 36 | pass |
| Playwright — mobile 390×844 | 36 | pass |

```
npx vitest run       →  Test Files 5 passed (5),  Tests 58 passed (58)
npx playwright test  →  109 passed, 2 skipped
npm run build        →  ✓ built, no type errors, no warnings
npx tsc --noEmit     →  clean
```

The two skips are the narrow-screen rail test at the two desktop widths, where
the rail is a permanent column rather than an overlay.

Every browser test intercepts Supabase and serves a fixture. Nothing in the
suite touches the live archive: it must be deterministic, must run offline, and
must never be one typo away from writing to a database 304 people depend on.

## The fixture

Shaped from the real table rather than from the schema, so the awkward rows are
represented. Verified against production on 2026-08-01:

- Nine-element `stats` arrays (all 304 live rows are length 9)
- Relations as both two- and three-element tuples
- `The Seven Hells` — a world v1's constants had never heard of, holding eight
  live entries, which reached the table through the editor's custom escape hatch
- `5th Astral Era` — an era stored as prose where every other row stores a code
- An entry with no portrait, an entry with no era, an entry with no world
- An apostrophe in a name, which is half the cast

## Viewports verified

Horizontal-overflow assertion (`scrollWidth - clientWidth <= 1`, plus naming
any element whose right edge exceeds the viewport) across four routes:

- 1440 × 900
- 1280 × 800
- 390 × 844

## Accessibility checks that run on every build

| Check | Why |
| --- | --- |
| No visible text below 11px | v1 had ~40 labels at 5–6px |
| No interactive target below 24×24 | WCAG 2.2 Target Size (Minimum); v1's buttons were ~22px |
| Skip link is the first tab stop | v1 had none |
| `/` focuses search, Escape leaves | v1 was mouse-only |
| Cards are real links with accessible names | v1 bound click to a `div` |
| Reduced motion stops all animation | v1 animated unconditionally |
| Masthead never overlaps content | v1's fixed 98px header did, below 900px |

Two real accessibility bugs were caught by these during development and fixed:

1. **Icon-only buttons lost their names.** Collapsing the masthead buttons to
   icons below 860px used `display: none` on the label, which removes it from
   the accessibility tree as well as the screen — leaving Star Map and Submit
   with no accessible name on every phone. Same bug in the record action bar
   below 620px. Both now visually hide instead.
2. **Three controls in the editor were all labelled "Name"** — the identity
   field, the relationship picker and the lineage picker.

## Manual checks

- Both modes on every route; mode survives reload with no flash of the other,
  because it is applied before first paint from a blocking inline script.
- Star map: pan, pinch and wheel zoom, select, deselect, open, fit, arrow-key
  pan, Escape twice to leave.
- Opening and closing the map repeatedly does not exhaust the browser's WebGL
  context budget — `dispose()` calls `loseContext()` explicitly, and there is a
  test that reopens it five times.
- The star map renders: asserted by screenshotting the canvas and checking it
  does not compress like a black frame. Reading pixels back is not available —
  the context is created with `preserveDrawingBuffer: false`, which is correct
  for production, so both `readPixels` and `drawImage` return empty outside the
  draw call.
- Printing a character page. v1 printed its fixed masthead over the text and
  dropped everything below the fold.

## Bugs found and fixed during QA

| What | Where |
| --- | --- |
| Chromatic aberration at 0.16 split every star into three coloured dots (~58px separation at frame edge on 1440) | `renderer.ts` |
| Stars bottomed out at a 2.5px quad, so cores were ~2px | `renderer.ts` |
| Star instance buffer had `a_flags` and `a_phase` at the same offset | `renderer.ts` |
| Stat block's empty trailing cells painted the divider colour as a grey slab | `components.css` |
| Rail ended at its content height, leaving a hard seam mid-page | `components.css` |
| Masthead overflowed the viewport below ~420px | `components.css` |
| Tag buttons measured 21px against a 24px minimum | `components.css` |
| Foxing texture was strong enough to read as damp rather than as age | `tokens.css` |

## Not covered

- **Real Supabase.** Outbound access to `supabase.co` is blocked by this
  environment's network policy, so the write path is verified against an
  intercepted RPC rather than the database. The SQL in
  `supabase/migrations/0001_secure_entries.sql` has **not** been executed
  against production. Its one genuinely dangerous part — the legacy password
  reimplementation, where a one-bit disagreement locks out all 304 people — was
  verified separately by defining the function body on the live database as a
  temporary probe and comparing it against the v1 JavaScript across eight
  vectors including two non-ASCII cases. All eight matched; the probe was
  dropped. Those vectors are pinned in `tests/unit/legacy-hash.test.ts`.
- **Safari and Firefox.** Chromium only, since that is what is installed here.
  Nothing in the build is Chromium-specific; View Transitions and
  `animation-timeline` are both behind `@supports` and degrade to a plain swap.
- **Real-device touch.** Pinch and drag are exercised through synthetic
  pointer events, not fingers.
- **Screen readers.** The markup is checked structurally — roles, names,
  `aria-describedby`, live regions — but nothing here has been listened to with
  VoiceOver or NVDA.

## Round two — the four things that were wrong

Reported after the first build, and each one fixed against a screenshot rather
than against a guess.

### Portraits everywhere were broken

`portraitAt()` rewrote every portrait URL from `/storage/v1/object/public/` to
`/storage/v1/render/image/public/` to fetch each image at its displayed size.
That is a real saving — v1 pulled multi-megabyte originals to fill 48px
thumbnails — but Supabase image transformation is a **paid add-on**, and
without it `/render/image/` does not fall back to the original. It returns 400.
So the optimisation did not degrade; it broke every portrait in the archive at
once.

Now off by default and behind `VITE_SUPABASE_IMAGE_TRANSFORMS=true`, so it can
be switched on if the add-on is ever enabled.

### The star map had no names and no faces

Both were in v1 and neither survived the WebGL rewrite. Three separate bugs:

1. **No label layer at all.** Added as a 2D canvas over the GL one, drawn after
   bloom — bloomed text is mush, and text that does not bloom reads as an
   interface label rather than as part of the sky.

2. **The visibility gate rejected everything.** Written against absolute zoom,
   using v1's thresholds. Measured, the map opens at scale 0.40, below every
   one of them — so the layer ran, culled all 12 nodes, and painted nothing. A
   *larger* archive settles wider and would have been worse. Rewritten to gate
   on degree rank and rendered node size, which is independent of how many
   souls there are.

3. **The vertical axis was not flipped.** World space is y-up, matching the
   shader's NDC conversion; a 2D canvas is y-down. This does not look like a
   mirror when it is wrong — labels near mid-height land almost exactly right
   and the rest drift by an amount that grows with distance from the centre, so
   it reads as a random per-node offset. It took drawing a debug crosshair at
   each computed centre to see it. Now a pure `projectToScreen()` with seven
   unit tests, one of which is specifically the centre-line case that let it
   hide.

Portraits came back as a texture atlas — one 128px tile per entry, uploaded
per-tile with `texSubImage2D` as each image lands, sampled in the star shader.
The field stays a single instanced draw call. The first attempt composited the
face *over* the star's core, which is a near-white blowout, and washed the
portraits out completely; the core is now suppressed where a face is drawn.

Edge alphas were carried over from v1 unchanged, which was wrong: v1
composited `source-over` onto flat dark, these are additive over a lit nebula
and then run through a bloom threshold that discards anything under 0.42.
Roughly doubled, which lands them back where v1 read.

### The Hei Mao logo was missing

Replaced in the first pass with a drawn cat-in-an-astrolabe, on the grounds
that hotlinking a PNG put a storage round trip on the critical path. The
reasoning was fine and the conclusion was wrong — a brand mark is not a
decoration to be substituted for a tasteful equivalent.

The real logo is back in the masthead and the hero. The drawn mark is retained
as the placeholder while it loads and as the fallback if storage is
unreachable, and is removed from the DOM once the image is ready — leaving it
underneath would show gold geometry through the transparent parts of the PNG.

### Animation was too fast

Duration tokens up roughly 1.5× (`--dur` 300→420ms, `--dur-slow` 620→900ms),
the scroll-driven reveal range widened from `entry 8% cover 26%` to
`entry 4% cover 38%`, and the gold sweep across the wordmark slowed to 14s.
Tap feedback deliberately left near-instant.

## Round two verification

| Suite | Count | Result |
| --- | --- | --- |
| Vitest — domain, projection, legacy hash | 65 | pass |
| Playwright — 1440, 1280, 390 | 109 | pass (2 skipped) |

Two new browser tests guard the regressions that a passing suite had missed:
the label canvas must actually paint lit pixels, and at least one portrait must
reach the atlas. Before the fixes the first returned 0.

Every screenshot below was taken against the production standalone build with
fixture data, at 1440 and 390, in both modes: no horizontal overflow, no
console errors, no page exceptions.

## Round three — invisible edges, and idle cost

### The star map's connection lines were invisible on a retina screen

Drawn with `gl.LINES`. Every WebGL implementation clamps `lineWidth` to 1,
because the core profile dropped wide lines and the drivers followed — and
that 1 is a **device** pixel. At dpr 1 that is a visible hairline. At dpr 2 it
is half a CSS pixel, which is most of the machines this runs on.

The previous round's fix — roughly doubling the edge alphas — could not have
worked. The problem was geometry, not opacity, and it was invisible in a
screenshot pass taken at dpr 1.

Edges are now instanced quads expanded along their own normal, with the width
given in CSS pixels and scaled by the device ratio at pack time. That also buys
two things `gl.LINES` never could: per-edge thickness, so a selected thread is
visibly heavier than a background one, and a soft shoulder across the width, so
the lines are antialiased instead of stair-stepped.

Guarded by a test that screenshots the canvas at **both** ratios and asserts
the fraction of the frame lit in the band an edge occupies. Under `gl.LINES`
the dpr 2 frame covered about half as much of itself as the dpr 1 frame did.

One tripwire worth recording: the first version of the vertex shader named a
local `half`, which GLSL reserves. The shader failed to compile and the entire
edge pass vanished without a console error.

### The map redrew itself forever

The scene is a full pass — sky, nebulae, edges, stars, a bright cut, four blur
passes, a composite — at device resolution. It ran unconditionally at 60fps, so
a settled map nobody was touching cost exactly as much as one being flung
around, indefinitely, on battery.

Two changes:

**Instance buffers are packed only when their inputs change.** Repacking 304
stars and every edge, then uploading both, happened every frame. None of it can
change unless the layout moved, the selection moved, or a portrait landed.

**Frames are drawn on demand,** in three tiers: every frame while something is
actually changing; at 30fps when idle, since the twinkle and nebula drift are
slow enough that half rate is indistinguishable; and *not at all* under reduced
motion, where the shader is fed a frozen clock and consecutive frames are
byte-identical pixels.

Camera, selection and hover are detected by object identity rather than by
flagging every mutation site — every pan, zoom and fit replaces `camera.current`
wholesale, so identity is a complete and free change detector. Only the two
things that mutate in place (worker layout ticks, atlas tile uploads) raise the
flag explicitly.

Measured under SwiftShader at 1440×900 dpr 2, idle with reduced motion: median
frame 16.7ms — that is, free — against a continuous ~800ms software draw
before. On real hardware the win is not the frame time, it is that a static map
stops asking the GPU for anything.

### The landing page constellation

Two textbook canvas mistakes, neither of which was showing up as dropped frames
on a desktop but both of which cost real battery on a phone:

- `createRadialGradient` was called once per star per frame — ninety gradient
  allocations and ramp rebuilds every 16ms. Now one small offscreen sprite per
  colour, baked once, blitted thereafter.
- Neighbour links were found by testing every star against every other: 90
  stars is 4,005 distance tests a frame, growing with the square of the count.
  Now bucketed into a grid sized to the link range, so only adjacent buckets
  are considered.

## Round three verification

| Suite | Count | Result |
| --- | --- | --- |
| Vitest | 65 | pass |
| Playwright — 1440, 1280, 390, plus dpr 2 | 121 | pass (2 skipped) |

Production bundle unchanged in shape: the star map (42KB) and editor (20KB)
stay lazy, so neither is on the path to reading the archive.

## Round four — the compositing was wrong, not the parameters

Put side by side with v1, the map was worse in every way that mattered: nodes
were uniform blue-white smudges instead of faces, the connection web had
effectively vanished, and eight labels were doing the work of three hundred.

The previous two rounds treated this as a tuning problem — raise the edge
alpha, loosen the label gate. It was not. It was the render architecture.

### What v1 actually did

Reading its draw loop back, the numbers are unambiguous:

| | v1 | This map, before |
| --- | --- | --- |
| Glow alpha, ordinary node | **0.10** | a dominant additive halo |
| Portrait | full opacity, untinted, no twinkle | tinted, twinkled, additively lifted |
| Ring | era colour, `0.3 + degree × 0.025` | none |
| Compositing | source-over throughout | additive throughout |
| Cluster nebula | 0.12 outer, 0.22 inner | 0.16 / 0.20, then bloomed |
| Post-processing | **none** | full-scene bloom |

v1 was dark ground plus high-contrast content. This was bright ground plus
content dissolved into it. A photograph composited additively over its own
halo and then blurred is no longer a photograph; a 1px line under the same
treatment is no longer a line.

### The fix

The scene is now two composited layers, which is the standard selective-bloom
arrangement — anything carrying information is composited *after* the blur
rather than through it:

1. **Atmosphere**, into the scene buffer, additive, bloomed: sky, nebulae, and
   star *halos* only. Nebulae roughly halved; bloom strength 0.9 → 0.55.
2. **Content**, straight to the screen after the composite, source-over, no
   bloom, no grain, no tint: connection lines, then node bodies — portrait or
   procedural disc, plus an era-coloured ring.

Stars are drawn twice from the same instance buffer with a `u_pass` uniform.
Portraits are now untouched: no tint, no twinkle, no additive lift. Glow alphas
went back to v1's — 0.10 for an ordinary node.

Two tripwires on the way, both silent:

- `u_pass` failed to **link**, because GLSL ES 3.00 defaults `int` to `highp`
  in a vertex shader and `mediump` in a fragment shader, and a uniform declared
  in both must agree. Fixed with an explicit `precision highp int`.
- The star map's error path was showing one generic sentence and discarding the
  driver's log. That is how a local variable named `half` — a reserved word —
  took the whole edge pass down in the previous round with nothing in the
  console. It now reports the cause.

### Labels

Rewritten to place greedily in priority order with collision culling, on a
bucketed grid. No zoom thresholds at all.

The two previous attempts both gated on absolute zoom, and a fixed budget of 90
was no better: at real density the ninety best-connected names all land in the
same crowded middle and overprint into a grey mat while the outer reaches stay
blank. Greedy placement fixes it at any density — important names win the space
they need, crowded regions thin themselves, empty regions fill in, and zooming
makes room so more appear.

### Why this kept happening

Every previous round was verified against the twelve-row fixture. Twelve sparse
nodes cannot show you that your labels are too few, your nebulae too bright, or
your lines lost in the glow — all three only appear in a crowd.

`bigArchive()` in `tests/e2e/fixture.ts` now generates a synthetic archive at
the real thing's scale, with the live table's world populations, its
five-in-304 portrait gap, and a relationship web of comparable density. Two
tests use it: labels must leave ink between a floor (the scatter-plot failure)
and a ceiling (the grey-mat failure), and the connection web must cover a
minimum fraction of the frame. They run at one viewport only — each costs a
couple of minutes on a software rasteriser.

## Round five — size was carrying no information

Two things reported: still no connection lines, and every star the same size
regardless of how connected its character is.

The second was real, reproducible, and mine. The archive was exported from the
live database and rendered locally — 305 souls, 1,107 edges, degrees running
from 45 down to 0 — and every disc on screen came out identical.

Two causes stacked:

- **The curve saturated too early.** `min(26, max(6, 6 + sqrt(d) * 4.6))` was
  v1's, and it tops out at degree 19. Everyone from the quiet middle of the
  cast to the single best-connected character in it drew at exactly the same
  radius. Widened to `min(36, max(4.5, 4.5 + sqrt(d) * 5.4))`, which is still
  sublinear — degree is heavy-tailed and a linear map would make the hubs
  enormous — but keeps separating all the way to 45.

- **A screen-space floor flattened what was left.** An 11px minimum was added
  so portraits would not render as mush. At dpr 2 that is 22 device pixels,
  which is above what most of the archive ever reaches at a normal zoom, so
  almost every node clamped to the same value. The floor is now 3px for
  everything, and the legibility problem it was solving is handled where it
  belongs: the portrait fades out and the procedural disc fades in when there
  are too few pixels to show a face. A small node is allowed to be small.

The label layer mirrors the same sizing, floor included, or names drift away
from the nodes they belong to as the zoom changes.

`tests/unit/radius.test.ts` now pins the encoding: the curve must keep
separating across 1 → 8 → 20 → 45, must span more than 5× from an unconnected
soul to the busiest one, and must grow sublinearly.

### On the missing lines

The previous entry under this heading said the edges rendered correctly here,
that nothing platform-specific explained the reports, and that the next step
was to go looking at the reporter's GPU. All three were wrong, and the way they
were wrong is the useful part.

The lines were being drawn. Every check confirmed that, which is exactly why
the checks kept passing: they asked *are edges present* when the complaint was
*I cannot see the connections*. Those are not the same question, and no amount
of counting lit pixels distinguishes them.

Loading v1 and this build in the same browser, at the same viewport, against
the same 304-row archive settled it in one screenshot each. Both drew every
edge. v1 was legible and this was a hairball.

The cause was a stale compensation. Edge alphas had been roughly doubled to
survive two conditions that were true when the number was chosen — the pass was
additive over a lit nebula, and it ran through a bloom threshold that discarded
anything faint. Moving the edges to composite source-over *after* the bloom, on
a dark ground, removed both conditions and made this build's situation
identical to v1's. Nothing removed the compensation.

What that cost was not brightness. It was the ratios:

| link | v1 | here | |
|---|---|---|---|
| within an era | .28 / .9px solid | .55 / 1.5px solid | 2× |
| shared world | .13 / .6px **dashed** | .38 / 1.3px solid | 3×, undashed |
| cross-world | .06 / .5px **dashed** | .30 / 1.2px solid | **5×**, undashed |

v1 separates a real tie from an incidental one by more than four to one and
draws the loose ones broken. Flattened to within a factor of two and all solid,
1,107 edges stop being constellations and become a cross-hatch — every
relationship visible, no relationship legible. Which is precisely what "no
lines" means when a reader says it, and why it was never going to be found by
asserting that edges existed.

Restored to v1's weights, with dash support added to the edge shader (period
and duty per instance, stepped along the line in device pixels so the rhythm
holds at any zoom).

The same comparison caught a second thing: at the fit zoom this build printed
about 150 names where v1 printed 6. Greedy collision placement fills whatever
space it is given, and space is what a zoomed-out map has. v1 gated on zoom
*before* placing — only hubs of degree ≥12 are named from far out, everyone at
`scale > 1.2`. That gate is what makes zooming reveal something instead of
magnifying a wall of text; it is now the eligibility rule, with collision
culling kept for placement so crowded regions still thin out.

The method is worth more than either fix: when a rendering complaint and a
rendering test disagree, put the two builds side by side on identical data
before trusting the test. The test was measuring the wrong property, and it
passed all the way through five rounds of this being wrong.
