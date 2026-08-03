# Drop the photographs here

This folder is the only input to the human layer of the page. It is not
published: `npm run photos` reads from here, processes each file, and writes the
results into `public/media/photos/`.

Use these file names. Any common extension is accepted for the same stem, so
`joey-briefing.jpeg` and `joey-briefing.png` both work.

| File | What it shows |
| --- | --- |
| `joey-figure.png` | Joey mid-explanation, transparent background |
| `joey-briefing.jpg` | Joey briefing the group at the start of a day |
| `terrain-reading.jpg` | Joey reading a formation with the group watching |
| `group-temple.jpg` | The group gathered in a temple courtyard |
| `meditation-stone.jpg` | A participant meditating beside a stone carved with 龍 |

Then run:

```bash
npm run photos
npm run build
```

Supply the largest version of each file you have. The script crops, grades and
downsizes; it never scales an image up.

Every role missing from this folder falls back to the procedural plate declared
beside it in `src/content/photos.ts`, so the page stays complete while clearance
is still in progress. `ASSET_SOURCES.md` records where each photograph appears.

Confirm web clearance before publishing, particularly for photographs in which
participants are identifiable.
