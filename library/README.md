# Hei Mao Character Library

A public archive of characters across the reflections — browse, search and
filter by world and era, read a full record, and see who is bound to whom on a
star map.

Live at [hmlibrary.netlify.app](https://hmlibrary.netlify.app).

## Requirements

- Node 22+

## Development

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

## Testing

```bash
npm test             # domain unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright, against the production build)
npm run typecheck    # TypeScript, no emit
```

Browser tests build and serve `dist` through `vite preview`, so they exercise
the shipped bundle. They intercept Supabase and serve a fixture — the suite
never touches the live archive.

## Building

```bash
npm run build        # type-check then bundle to dist/
npm run preview      # serve dist/ on http://127.0.0.1:4174
```

## Deploying

This is a subdirectory of the Web-Tools repository, so the Netlify site needs
its **base directory set to `library`** (Site configuration → Build & deploy →
Build settings). Everything else — build command, publish directory, SPA
redirect, cache headers, content security policy — is read from `netlify.toml`.

### Before the first deploy of this version

**Run `supabase/migrations/0001_secure_entries.sql`.** The v1 client fetched
password hashes into the browser and compared them there; v2 calls database
functions that check them server-side. Until the migration is applied those
functions do not exist and editing will report that plainly. Reading works
either way, so the site is never down — only the write path waits.

Applying the migration also takes v1's write path offline, since it drops the
`password` column and the permissive RLS policies. Apply it as part of the
cutover, not before.

Read `docs/SECURITY.md` first. It explains what the migration fixes, why it
matters, and what is deliberately left open.

### Environment variables

Both optional. Unset, the app falls back to the Supabase project the deployed
site already uses.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |

The anon key is a public client credential by design — it ships in the bundle
because it has to. After the migration it grants `SELECT` on `entries` plus the
right to call four password-checked functions, and nothing else.

## Layout

```
src/
  domain/        taxonomy, entry model, wire codec, search, sigils, validation
  data/          Supabase transport and the entry repository
  app/           routing and app-level hooks
  ui/            shell, views, editor, primitives
  starmap/       graph model, layout worker, WebGL renderer
  fx/            the home page constellation
  styles/        design tokens, global styles, components
tests/
  unit/          domain logic
  e2e/           browser tests and the archive fixture
supabase/
  migrations/    the security migration
tools/
  capture.spec.ts   regenerates docs screenshots; not part of the suite
```

## Documentation

- `docs/DESIGN.md` — the art direction and what changed from v1
- `docs/SECURITY.md` — the auth model, what was wrong, what is still open
- `docs/QA.md` — the testing actually performed, and what is not covered
