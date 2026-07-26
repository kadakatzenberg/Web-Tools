# IRON TIDE

A mathematically honest army shooter, in one self-contained `index.html`.

Open the file in any browser with WebGL2. No build step, no server, no dependencies —
the renderer, the geometry, the textures and the entire soundtrack are generated at runtime.

## Controls

Mouse or `A`/`D` (arrow keys work too) to steer · firing is automatic · `SPACE` for
overdrive when the meter is full · `R` restart · `P` pause · `M` mute · `F` performance readout.

## The premise

It is the format every fake mobile-game advert promises: steer a squad down a road, run it
through `+40` and `×3` gates, and arrive at the end with an army. The difference is that here
the numbers are real.

- **The gate maths is exact.** `×3` triples the soldiers who physically walk through that
  panel. `÷3` keeps every third one. The number shown above each gate is the result you will
  actually get, computed from your current count.
- **Gates apply per soldier, not per army.** Straddle two panels and the left half of your
  formation gets one operation and the right half gets the other. Both resolve, both count.
- **Growth costs you precision.** The block saturates at about eighteen units wide, which is
  wider than a single gate lane. Past roughly four hundred soldiers you can no longer fit
  inside one lane, so every choice becomes a compromise. There are narrow gaps at each kerb —
  a small squad can dodge a whole gate row, a legion cannot.
- **A blast kills whoever is standing in it.** Denser formations lose more to the same shell.

Six sectors, escalating from golden-hour skirmishes to a night-time horde, ending at THE ANVIL —
a three-phase siege walker whose health is scaled to the force you actually bring. Win, and the
next tide runs harder.

## Under the hood

Everything is procedural and dependency-free:

- **Renderer** — hand-written WebGL2. Instanced rendering with two levels of detail, a shadow
  pass with rotated PCF, GGX shading with a hemisphere-plus-sky ambient, geometric specular
  antialiasing, height fog, and a dual-filtered bloom chain into an ACES composite with
  chromatic aberration, radial blur, vignette and grain.
- **Animation** — soldiers walk, lean, aim, recoil and fall entirely in the vertex shader,
  driven by per-instance state, so two thousand of them cost nothing on the CPU.
- **Geometry** — every mesh is built at load time from bevelled primitives with baked ambient
  occlusion and part IDs.
- **Textures** — panel lines, rivets, scratches, cracked earth and their normal maps are
  generated with Canvas2D and a Sobel pass at startup.
- **Audio** — an adaptive four-layer score that gates its own instrumentation to combat
  intensity, plus a density-modulated gunfire bed, all synthesised through the Web Audio API.
- **Simulation** — flat typed-array pools with swap-removal, a uniform spatial grid for
  collisions, and damage-conserving cluster fire so that massed volleys stay honest at any
  army size. A fixed 60 Hz timestep, roughly 0.3 ms per step at the two-thousand-unit cap.
