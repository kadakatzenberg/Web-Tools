# 天河 · The Heavenly River

An interactive almanac for **丁未 Ding Wei — 2027, the Year of the Yin Fire Goat**, built
around Joey Yap's Feng Shui & Astrology material.

Open `index.html`. That is the whole thing — no build, no server, no network.

## Why "The Heavenly River"

The *nayin* (納音, sound element) of the 丁未 pillar is **天河水 — Heavenly River Water**,
the Milky Way. A year of Yin Fire sitting on late-summer Earth whose hidden sound is the
river of stars is too good an image to waste, so the whole site is built on it: a
particle field that starts as a river of light and then re-forms, on scroll, into every
instrument the year is read with.

## Chapters

| | | |
|---|---|---|
| 卷一 | The Pillar | 丁未 taken apart — stem, branch, the three hidden stems of 未, the 天河水 nayin, and the Output structure the pillar forces |
| 卷二 | The Hexagram | 臨 *Approach* at 六五, the year figure from Shao Yong's 皇極經世書, with 卦辭 / 彖 / 象 / 爻辭 set vertically |
| 卷三 | The Plate | A working Luo Pan — 24 mountains, 8 trigrams, drag the plate under a fixed needle to read any arc. Tai Sui, Sui Po, San Sha, Five Yellow |
| 卷四 | Nine Palaces | The 2027 annual flying-star chart, south at top, palace by palace with per-star remedies |
| 卷五 | The Twelve | The zodiac ring as a chord diagram — 六合, 三合, 沖, 破·刑, 害 drawn against 未 |
| 卷六 | Twelve Months | Monthly pillars on their solar terms, with the July 伏吟 and the January 天剋地沖 marked |
| 卷七 | The Long View | 三元九運 — 180 years as nine rooms, Period 9 lit |
| 卷八 | The Seminar | Cities and dates |

## The chart data is derivable, not invented

- **Annual stars** — the Luo Shu advanced four places from base (centre 5 → 9), giving
  SE 8 · S 4 · SW 6 / E 7 · centre 9 / W 2 · NE 3 · N 5 · NW 1.
- **Afflictions** — follow the 未 branch: Tai Sui at 未 (SW1), Sui Po opposite at 丑 (NE1),
  San Sha west across 申酉戌 in a 亥卯未 year, Five Yellow north.
- **Monthly pillars** — a 丁 year heads at 壬寅, so the twelve run 壬寅 → 癸丑.
- **Year hexagram** — 臨 at the fifth line, per 皇極經世書; texts quoted from the received 周易.

## Technique

No libraries. No CDN. No image, font, or audio files on disk — every visible mark is
generated at runtime.

- **WebGL2, hand-written** — a ~104k-point curl-noise field whose vertex shader carries six
  analytic target forms (river → compass ring → 3×3 palace lattice → twelve-cluster ring →
  month helix → embers) and blends between them from scroll position. No FBO ping-pong;
  positions are computed from a seed each frame.
- **Custom post chain** — scene → bright-pass → two-level separable Gaussian bloom →
  composite with radial chromatic aberration, ACES tonemap, film grain and vignette.
- **Adaptive quality** — an uncapped frame-time watch sheds render scale, point count and
  the second bloom level in two steps rather than dropping frames on weak GPUs.
- **Art-directed light and dark**, not inverted: *Night* is a starfield with additive
  particles and bloom; *Almanac* is rice paper with ink-wash and cinnabar specks in
  alpha-over, bloom near zero. Switched through a View Transition circular wipe.
- **Procedural SVG instruments** — the Luo Pan, the hexagram, and the zodiac ring with
  seeded per-animal constellation sigils are all generated from the data tables.
- **Type** — Fraunces with `SOFT`/`WONK` driven by scroll velocity, per-character reveal, a
  per-glyph gradient that drifts across the word, and vertical `writing-mode` for the
  classical Chinese.
- **Web Audio** — a struck bowl synthesised from inharmonic partials plus a filtered drone
  bed. Off by default.
- **Physics** — critically-damped springs for the cursor, needle and magnetic elements;
  inertial free-spin on the compass plate.

Accessible: keyboard-operable instruments, `aria-live` readouts, visible focus, and a
`prefers-reduced-motion` path that stills the field and skips the transitions.

## Rebuilding

`index.html` is generated from authored parts plus a base64 font bundle. The generator
lives outside the repo; the committed file is the deliverable and is edited directly.

## Colophon

An independent design study — not an official Joey Yap property. Event dates are as
publicly announced and subject to change; confirm at the official source.
