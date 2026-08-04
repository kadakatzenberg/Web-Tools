# Walk The Dragon. Joey Yap's China Excursion 2026

A single page, scroll-driven sales experience for Joey Yap's China Excursion,
10 to 15 September 2026. The visitor follows the movement of Qi through an
immense mountain range: a distant profile at dawn, a descent toward a sacred
site, a convergence in the sky, a fracture as the year turns, and a still frame
with a path leading back to the land.

The conversion action is a private conversation with the China Excursion team.
No price appears anywhere on the page.

---

## Before you deploy

**The calls to action are deliberately inert.** Open `src/config.ts`:

```ts
export const CONTACT_TEAM_URL: string | null = null;
```

While this is `null`, all ten buttons render, take keyboard focus, and respond to
a click, but they do not navigate anywhere. They carry `aria-disabled` so screen
readers announce that nothing follows the press. Put a destination in and every
one of them becomes a real link at once, opening in a new tab when it leaves this
site. Nothing else needs changing.

The build reports this state as a warning rather than failing, so the site can be
deployed and reviewed before the destination is decided.

Two other things are worth reviewing before launch, both covered below: the
photographs, and the authority figures in the guide section.

---

## Commands

```bash
npm install     # install dependencies
npm run dev     # development server on http://127.0.0.1:5173
npm run build   # type check, then production build into dist/
npm run preview # serve the production build on http://127.0.0.1:4173
npm run qa      # drive the built site through every viewport and mode
```

Authoring commands, only needed when the artwork changes:

```bash
npm run plates   # re-render the shader plates (needs npm run dev running)
npm run geo      # re-render the survey charts from vendored geodata
npm run geodata  # refresh that geodata from Natural Earth (needs network)
npm run social   # rebuild the Open Graph card
npm run photos   # process client photographs dropped into public/photos
npm run zip      # package the project as china-excursion-2026.zip
```

`npm run plates` drives a real browser against the running dev server, captures
frames from the same shader the live page uses, then grades them and writes the
responsive AVIF and WebP sets into `public/media`. Start `npm run dev` first.

`npm run geo` and `npm run social` both run standalone: no browser, no server.

### Running QA

Build first, then serve, then run the suite:

```bash
npm run build
npm run preview &
npm run qa
```

It opens the built site at nine viewports from 1440x900 down to 320x568, in
three modes (default, reduced motion, WebGL disabled), scrolls through 27
positions in each, and reports console errors, failed requests, HTTP 400 and
above, horizontal overflow with the offending element named, any word broken
across two lines, heading order, call to action wiring, and missing or broken
image alternatives. Screenshots land in `/tmp/qa` by default; set `OUT` to
change that and `URL` to point it somewhere else.

---

## Deploying

`netlify.toml` is configured for Netlify: build command `npm run build`, publish
directory `dist`. Long-lived cache headers are set for `/assets`, `/fonts` and
`/media`; `index.html` is always revalidated.

The canonical URL and the Open Graph URLs are injected at build time. Netlify
supplies its own `URL` environment variable, so a production deploy resolves
them automatically. To pin a different origin, set `SITE_URL` in the build
environment.

There is no server component, no API key, and no paid runtime service.

---

## How it is built

Vite and TypeScript with no UI framework. The only runtime dependency is Lenis
(about 5 kB) for smooth scrolling, which is skipped entirely when the visitor
prefers reduced motion. Everything else is written for this page: the
landscape, the instruments, the soundscape, the motion system.

```
src/
  config.ts             the single contact destination
  main.ts               composition and boot sequence
  ui.ts                 calls to action, responsive plates, text splitting
  content/
    glyphs.ts           vector outlines for 天 地 人 龍 氣, so no CJK webfont loads
    testimonials.ts     attributed accounts with their sources, and the approved
                        response descriptions
    authority.ts        two tiers of standing, numeric one switched off
    photos.ts           the human layer: one role per photograph, with fallbacks
    geo.ts              the measured layer, rendered from survey data
  core/
    beats.ts            the camera script, one entry per narrative beat
    narrative.ts        turns scroll position into a camera and mood
    scroll.ts           smooth scrolling, viewport measurement, sticky progress
    ticker.ts           one rAF loop for everything outside the shader
    capabilities.ts     reduced motion, pointer type, quality tier
    audio.ts            synthesised soundscape, created only on consent
    pointer.ts          eased pointer, trailing ring, magnetic buttons
    reveal.ts           entrance reveals, one observer for the page
    grain.ts            film grain tile
  gl/
    stage.ts            render pipeline, quality tiers, world projection
    renderer.ts         WebGL2 programs, render targets, fullscreen geometry
    fallback.ts         the landscape without WebGL
    math.ts             camera basis, view projection, easing
    shaders/            heightmap, raymarched scene, particles, bloom, grade
  sections/             one module per section of the page
  styles/               tokens, base, type, components, sections
```

### The landscape

One WebGL2 canvas sits behind the whole page. A heightmap is generated once into
an `R16F` texture from erosion-damped fractal noise: each octave is divided down
by the accumulated gradient, so detail collapses on ground that is already steep
and survives on the flats. The same pass carves the watercourse and levels the
basin at the sacred site, with a raised formation embracing it and opening
toward the water.

The scene pass raymarches that heightmap. Surface crossings are interpolated
rather than stepped onto, which removes the terracing a plain heightfield march
leaves on steep ground, and each ray is offset by a per-pixel fraction of a step
so the volumetric mist grains rather than rings. Qi travelling the spine, the
column of light at the site, the surveying rings and the gold path are all
accumulated in the same march. Point sprites are drawn afterwards against the
depth the scene pass writes, so motes pass behind ridges correctly. Post
processing adds bloom, an ACES tone curve, the gold-to-crimson grade, vignette,
grain and restrained chromatic separation.

`src/core/beats.ts` is the camera script. Each beat is anchored to a real
element and a fraction through it, so the landscape stays in step with the
writing at any viewport size without a single hard coded scroll offset.

Field annotations in "The land teaches" are projected through the live camera
every frame, so each label stays on the feature it names as the camera moves.

### Performance

Three quality tiers pick step count, render scale, particle count, heightmap
resolution and device pixel ratio ceiling from device memory, core count and
pointer type. The scene renders to a reduced-resolution float target and is
composited at full resolution. Frame times are sampled continuously and the tier
drops if the device consistently misses budget. Render loops stop when the tab
is hidden, and the drift canvas in the warning section only draws while it is
near the viewport.

### Without WebGL, or with reduced motion

The canvas is removed and a layered fallback takes its place: a wide plate
rendered from the same shader, three ridge silhouettes with their own depth, a
mist band and the point of light at the site. It follows the same narrative
colour arc, so the journey from ceremonial gold to crimson and back still
happens. Under reduced motion nothing moves: no smooth scrolling, no parallax,
no kinetic type, no particle drift, and the pinned passages become ordinary
stacked sections.

### Accessibility

Semantic sections with a single `h1` and no skipped heading levels. A skip link
is the first tab stop. Every interactive element is reachable by keyboard with a
visible focus ring, and all text meets WCAG AA contrast against its background in
both palettes. The landscape is decorative and hidden from assistive technology;
nothing that carries meaning lives only on the canvas. Sound is off until asked
for, and the toggle reports its state through `aria-pressed` and a text label.
There are no rapid flashes anywhere on the page.

### Three layers of imagery

The page is built from three layers, and the relationship between them is the
design.

**The mythic layer** is the procedural landscape: the live shader, and the still
plates in `public/media` captured from it by `npm run plates`, then graded,
grained and written as responsive AVIF and WebP. It carries atmosphere and
continuity, and it is the connective tissue everything else sits inside.

**The measured layer** is real geography. `scripts/build-geo.mjs` renders six
plates from Natural Earth survey data: the named ranges, plateaux and basins of
the region with their surveyed summit elevations, river centrelines against a
graticule, world coastlines, and every recorded urban footprint on the planet,
drawn both flat and on a globe. Nothing on these plates is invented. No
coordinate is moved. They carry the claim that this is about real ground, and
they appear in four of the six journey chapters, in the guide section, and
underneath the Blood Goat descent, where the world grows through the text and is
then taken by the black frame.

Natural Earth is public domain and asks for no attribution. It is credited on the
plates anyway.

**The human layer** is photography, and it carries belief. `src/content/photos.ts`
declares one role per photograph the page wants, with the crops, treatment and
grade each position needs. Drop the source files into `public/photos/` and run
`npm run photos`; the script produces every crop at every width, grades it to the
page palette, lays in grain, and records what it found in
`src/content/photo-manifest.json`.

**No photographs are currently in the project.** They could not be obtained from
the build environment: the egress policy blocks every Joey Yap and Mastery
Academy domain, Instagram and Facebook, and every stock and archive host. Nothing
was substituted, because a stock model standing in for Joey Yap, or for a past
participant, would be a fabrication rather than a photograph. Every role falls
back to a plate from one of the other two layers, so the page is complete and
never shows a broken image. `ASSET_SOURCES.md` lists what each photograph should
show and where it goes.

Photographs are never dropped into a plain rectangle. Six treatments give each
one a different relationship to the page: `ink` tears it from wet paper,
`aperture` looks through an opening, `strip` is a documentary fragment, `field`
frames it like a plate in a notebook, `cutout` composites a person into the
landscape, and `stele` cuts it into rock. Each of the six journey chapters uses a
different treatment, a different frame proportion and a different emotional
register, and the sequence alternates between the layers rather than repeating
one of them: departure and first sight and the reading and the approach are drawn
from survey data, the selected moment and the return from the shader.

The four chapters currently showing charts each name a photograph they would
rather have. The moment one is added it takes over that position automatically
and the chart steps aside, so the page improves as the photography lands without
any code changing.

Nothing is fetched from another origin at runtime. Images below the first
viewport are lazy loaded.

The five Chinese characters used as visual anchors ship as vector outlines in
`src/content/glyphs.ts`, so the page never downloads a CJK webfont.

### Copy and claims

The wording follows the approved brief in British English. The page carries no
price, no seat count, no deadline, no invented inclusions and no assured
outcome. Where responses are described rather than attributed they are
deliberately unattributed and qualified.

A caption that makes a documentary claim may only sit under a photograph. Both
places that do so, the accounts section and sacred timing, omit their figure
entirely rather than let "Previous excursion" caption a rendered landscape.

**Authority figures.** `src/content/authority.ts` holds two tiers. The tier that
renders by default describes Joey Yap's standing in terms that do not depend on a
number: founder of the Mastery Academy, the conferred title, the body of
published work, the field study behind it. The numeric tier (students taught,
countries reached, years, books published) is present but switched off, because
those figures could not be checked against an official page and independent
sources carried materially different numbers. Confirm each one, correct any that
have moved, then set `FIGURES_CONFIRMED` to true.

**Testimonials.** `src/content/testimonials.ts` carries four sourced accounts
from previous excursions: three reproduced word for word, one an attributed
paraphrase. Each entry records where the wording was found in a `source` field
that never renders, so any claim on the page can be traced without leaving the
codebase. `quote` renders in quotation marks and must be exact; `account`
renders without them and is for anything shortened or rephrased.

The file also documents what was deliberately left out and why: the medical
result account, an unattributed account that reads as an assured outcome, and
five names from the brief whose wording appears in no reachable source. Nothing
was invented to fill those gaps. Add them when the official wording is to hand.

---

## Browser support

Chromium, Firefox and Safari, current versions. The live landscape needs WebGL2
with `EXT_color_buffer_float`; anything else falls back automatically.
