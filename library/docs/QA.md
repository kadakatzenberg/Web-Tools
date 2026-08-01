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
