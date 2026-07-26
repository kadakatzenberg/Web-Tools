# Attributions

Third-party material bundled into Hei Mao Combat, with licence terms.

## Typefaces

All three families are bundled locally through `@fontsource`, Latin subsets
only. Nothing is fetched from a third-party CDN at runtime — the deployed
Content-Security-Policy forbids it.

| Family | Role | Licence | Copyright |
| --- | --- | --- | --- |
| [Cinzel](https://github.com/NDISCOVER/Cinzel) | Display — the round, the phase, seals and headings | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2020 The Cinzel Project Authors |
| [IBM Plex Sans](https://github.com/IBM/plex) | Interface and operational data | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2019 IBM Corp. |
| [IBM Plex Mono](https://github.com/IBM/plex) | Tabular figures — health, counters, dice | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2019 IBM Corp. |

The OFL permits bundling, embedding, and redistribution with the software. It
requires that the fonts are not sold on their own and that any derivative font
is not released under a reserved font name. Neither applies here: the files are
redistributed unmodified.

## Icons and interface art

None. Every mark in the interface is original work authored for this project in
`src/ui/icons.tsx`, as inline SVG cut from the same motifs as the rest of the
design system — brush strokes, blade edges, seal geometry, moon phases, cat-eye
curves. No icon library is installed.

The same holds for every other visual asset: the lacquer ground, the carved
panel edges, the rank emblems, the health hatching, the seal in the header, and
the round herald are all produced from CSS and SVG at runtime. There are no
raster images in the bundle.

## Runtime dependencies

| Package | Purpose | Licence |
| --- | --- | --- |
| [React](https://react.dev) | UI runtime | MIT |
| [Zod](https://zod.dev) | Runtime validation of persisted encounters | MIT |

Build and test tooling (Vite, TypeScript, Vitest, Playwright) is MIT-licensed
and is not shipped to the browser.

## Game content

Hei Mao is a private tabletop campaign. Combatant names, abilities, and
encounter content belong to the campaign's owner.

No Final Fantasy XIV artwork, logos, character portraits, interface elements, or
extracted game assets are used anywhere in this project. The visual identity is
original and does not reproduce any commercial game's interface.
