# Hei Mao Combat

A tactical war table for running live Hei Mao roleplay encounters — phase and round
tracking, health and shields, conditions, abilities, a character library, an enemy
generator, and resumable sessions.

Combat is run from the table itself: click a combatant, pick a verb, drag the line
onto a target, and answer hit or miss. Damage is derived from the attacker's stats
and pushed through the target's resistance and shielding, itemised so it can be
checked. Skills that carry dice ask for the total rolled in Discord rather than
inventing one. The cards below stay authoritative for anything that needs correcting.

## Requirements

- Node 22+

## Development

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

## Testing

```bash
npm test             # combat-rule unit tests (Vitest)
npm run test:watch   # the same, in watch mode
npm run test:e2e     # browser tests (Playwright, against the production build)
npm run typecheck    # TypeScript, no emit
```

The Playwright config builds and serves `dist` through `vite preview`, so browser
tests exercise the shipped bundle rather than the dev server.

## Building

```bash
npm run build        # type-check then bundle to dist/
npm run preview      # serve dist/ locally on http://localhost:4173
```

## Deploying

The repository ships a `netlify.toml` with the build command, publish directory,
SPA redirect, cache headers, and a content security policy.

- **Continuous deploys** — connect the repository in Netlify. It reads
  `netlify.toml`; no dashboard configuration is required.
- **Manual deploy** — `npm run build`, then drag `dist/` onto Netlify, or
  `netlify deploy --prod --dir=dist`.

### Environment variables

Both are optional. When unset the app falls back to the public Supabase project the
deployed site already uses.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |

See `.env.example`. The anon key is a public client credential by design — read
`docs/SECURITY.md` before assuming it protects anything.

## Layout

```
src/
  domain/        pure combat rules, types, generator, schema validation
  state/         command definitions, reducer, store with undo/redo
  persistence/   Supabase transport, repositories, local backup, session hook
  ui/            shell, tracker, battlefield, library, generator, primitives
  fx/            atmosphere canvas, procedural sound, impact feedback
  styles/        design tokens and global styles
tests/
  unit/          combat-rule tests
  e2e/           browser workflow, responsive, and stress tests
```

## Documentation

- `docs/DESIGN.md` — design rationale
- `docs/MIGRATION.md` — architectural and data changes from v1
- `docs/SECURITY.md` — Supabase access model and its limits
- `docs/PRESERVED.md` — behaviours carried over verbatim
- `docs/QA.md` — the testing actually performed
