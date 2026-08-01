# Attributions

Third-party material bundled into the Hei Mao Character Library, with licence
terms.

## Typefaces

All three families are bundled locally through `@fontsource`, Latin subsets
only. Nothing is fetched from a third-party CDN at runtime — the deployed
Content-Security-Policy forbids it. (v1 loaded these from
`fonts.googleapis.com`.)

| Family | Role | Licence | Copyright |
| --- | --- | --- | --- |
| [Cinzel](https://github.com/NDISCOVER/Cinzel) | Display — names, section heads, seals | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2020 The Cinzel Project Authors |
| [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) | Prose — blurbs, quotes, the reading voice | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2015 The Cormorant Project Authors |
| [IBM Plex Sans](https://github.com/IBM/plex) | Interface — labels, counts, controls, metadata | [SIL Open Font License 1.1](https://scripts.sil.org/OFL) | © 2019 IBM Corp. |

The OFL permits bundling, embedding and redistribution with the software. It
requires that the fonts are not sold on their own and that any derivative font
is not released under a reserved font name. Neither applies: the files are
redistributed unmodified.

Cinzel and IBM Plex Sans are shared with the Hei Mao Combat app in this
repository, so the two tools read as siblings.

## Libraries

| Package | Role | Licence |
| --- | --- | --- |
| [React](https://react.dev) | UI runtime | MIT |
| [d3-force](https://github.com/d3/d3-force) | Star map layout, inside a Web Worker | ISC |
| [Zod](https://zod.dev) | Editor validation | MIT |
| [Vite](https://vite.dev) | Build | MIT |
| [Vitest](https://vitest.dev) / [Playwright](https://playwright.dev) | Testing | MIT / Apache-2.0 |

Only `d3-force` is installed, not `d3`. v1 pulled the full `d3.min.js` — about
280KB — from `cdnjs.cloudflare.com` to use four functions from one module. The
module alone is around 30KB, is bundled rather than hotlinked, and is code-split
so it loads only when the star map opens.

No 3D framework. The star map is written directly against WebGL2 — roughly 15KB
of renderer and shaders against about 600KB for Three.js, for a scene that is
points, lines and four fullscreen passes.

## Visual assets

None. Every mark in the interface is generated in the browser:

- The house mark and every glyph are original inline SVG.
- Character sigils are procedural geometry seeded from each entry's id
  (`src/domain/sigil.ts`).
- The paper grain and foxing are `feTurbulence` in data URIs.
- The home page constellation is drawn to a 2D canvas.
- The star map's sky, nebulae, stars and post-processing are shaders. There are
  no textures in the scene at all.

No icon library, no stock imagery, no CDN asset of any kind. v1 hotlinked its
logo from a Supabase storage bucket into both the masthead and the hero.

Character portraits are uploaded by the community and belong to whoever made
them; they are served from the project's own Supabase storage.

## Fiction

Character names, worlds and eras belong to the members of the Hei Mao
community. Final Fantasy XIV and its settings are © Square Enix. This is an
unofficial fan project with no affiliation.
