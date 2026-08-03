# Walk The Dragon — Joey Yap's China Excursion 2026

A single page, scroll-driven sales experience for Joey Yap's China Excursion,
10 to 15 September 2026. The visitor follows the movement of Qi through an
immense mountain range: a distant profile at dawn, a descent toward a sacred
site, a convergence in the sky, a fracture as the year turns, and a still frame
with a path leading back to the land.

The conversion action is a private conversation with the China Excursion team.
No price appears anywhere on the page.

---

## Before you deploy

**One value must be set.** Open `src/config.ts` and replace the placeholder with
the live destination the team uses to take enquiries:

```ts
export const CONTACT_TEAM_URL = 'REPLACE_WITH_CONTACT_TEAM_URL';
```

Every call to action on the page reads from this single constant, so setting it
once wires all ten of them. When the value points at another origin the links
automatically open in a new tab; while it is a placeholder they stay in the same
tab.

Nothing else is required to go live.

---

## Commands

```bash
npm install     # install dependencies
npm run dev     # development server on http://127.0.0.1:5173
npm run build   # type check, then production build into dist/
npm run preview # serve the production build on http://127.0.0.1:4173
```

Authoring commands, only needed when the artwork changes:

```bash
npm run plates  # re-render the still plates and social card from the shader
npm run zip     # package the project as china-excursion-2026.zip
```

`npm run plates` drives a real browser against the running dev server, captures
frames from the same shader the live page uses, then grades them and writes the
responsive AVIF and WebP sets into `public/media`. Start `npm run dev` first.

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
prefers reduced motion. Everything else — the landscape, the instruments, the
soundscape, the motion system — is written for this page.

```
src/
  config.ts             the single contact destination
  main.ts               composition and boot sequence
  ui.ts                 calls to action, responsive plates, text splitting
  content/
    glyphs.ts           vector outlines for 天 地 人 龍 氣, so no CJK webfont loads
    testimonials.ts     attributed accounts, and the approved response descriptions
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

### Imagery

Every image in `public/media` is generated from the project's own shader by
`npm run plates`, then graded, grained and written as responsive AVIF and WebP.
Nothing is fetched from another origin at runtime. Images below the first
viewport are lazy loaded.

The five Chinese characters used as visual anchors ship as vector outlines in
`src/content/glyphs.ts`, so the page never downloads a CJK webfont.

### Copy and claims

The wording follows the approved brief in British English. The page carries no
price, no seat count, no deadline, no invented inclusions and no assured
outcome. Where participant responses are described they are unattributed and
qualified.

`src/content/testimonials.ts` holds an empty, documented list for named
accounts. Add entries there only when the exact wording and attribution have
been confirmed against an official source: use `quote` for wording reproduced
exactly, which renders in quotation marks, and `account` for anything shortened
or rephrased, which renders without them. The section renders named accounts
ahead of the general descriptions as soon as the list is populated.

---

## Browser support

Chromium, Firefox and Safari, current versions. The live landscape needs WebGL2
with `EXT_color_buffer_float`; anything else falls back automatically.
