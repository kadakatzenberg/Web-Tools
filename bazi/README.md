# 命盤 — The Ming Pan

An interactive field instrument for **BaZi** (八字, the Four Pillars of Destiny),
in the modern presentation taught by Joey Yap.

Open `index.html` in a browser. That is the whole thing — one file, no build
step, no server, no network. Every font is embedded and every visual is
generated at runtime.

## What it does

Casts a real chart. The year turns at **Li Chun** (solar longitude 315°), not at
Chinese New Year; the month turns at each of the twelve **jie**, solved to the
minute from the sun's apparent longitude; the day pillar comes from the Julian
Day Number. It derives the Ten Gods, hidden stems, twelve life stages, branch
interactions, elemental balance, the Five Structures / Ten Profiles, and ten
luck pillars with their start age.

Solar position follows Meeus, *Astronomical Algorithms*, with the planetary and
lunar perturbation terms, nutation, and aberration scaled by the earth's true
radius vector. Verified against `sxtwl` (壽星天文曆) across **73,414 consecutive
days, 1900–2100**: zero disagreements on year, month or day pillar away from
term boundaries; solar-term instants land a mean of 1.5 minutes from the
reference, worst case 6.4.

## How it is built

Hand-written **WebGL2** — a raymarched volumetric field with four standing
pillars of light, a transform-feedback curl-noise mote system, and a bloom /
chromatic-aberration / grain / filmic-tonemap post chain. Yin renders the field
emissively; yang renders the same field as pigment on paper through
Beer–Lambert absorption, with the light shafts reserved as bare paper.

The wheels, the phase diagram, the seal and the paper grain are drawn from
procedure. Sound is synthesised in WebAudio on the 五音 pentatonic degrees mapped
to the five phases. No frameworks, no libraries.

Not affiliated with, endorsed by, or produced for Joey Yap or the Mastery Academy.
