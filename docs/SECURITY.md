# Security notes

## Supabase access model

The client holds a **publishable (anon) key**. This is a public credential by
design: it identifies the project, not a user, and it ships in browser code for
every Supabase application. It is only meaningful in combination with row-level
security policies, which decide what that key may actually read and write.

The key is committed as a fallback so the deployed site keeps working, and can be
overridden with `VITE_SUPABASE_ANON_KEY`. Overriding it is a configuration
convenience, **not** a security measure — whatever key ships is readable by
anyone who opens the page.

## The editing passphrase is not authentication

v1 gated sheet creation and editing behind a passphrase compared client-side
against a hardcoded djb2 checksum, and then wrote that same checksum into the
`combat_sheets.password` column.

That is not a security control, and v2 does not present it as one:

- The check happens entirely in the browser. The constant is in the bundle.
- Anyone can read it, bypass it with devtools, or call PostgREST directly with
  the anon key and skip the UI altogether.
- Storing the checksum in a `password` column implies a credential that does not
  exist.

**What changed in v2:** the gate is retained — it genuinely prevents accidental
edits during a live session, which is useful — but it is now labelled honestly in
the UI as a guard against accidents, with the explicit statement that access is
governed by the database's policies.

The `password` column is still written on save. That is deliberate: the existing
schema may declare it `NOT NULL`, and dropping the field from the payload could
break inserts against the live database. Nothing reads the value. Removing it is
a server-side migration (step 6 below), not a client change.

**What has not changed:** if the `combat_sheets` table has permissive policies,
anyone can still write to it with the anon key. That is a database configuration
issue and cannot be fixed from this repository.

## Remaining limitation, stated precisely

> Write access to `combat_sheets`, `combat_skills`, and `combat_sessions` is
> currently governed only by whatever row-level security policies exist on the
> Supabase project. This repository has no way to inspect or change them. If
> those policies permit anonymous writes, any visitor can create, edit, or delete
> sheets and sessions regardless of the passphrase in the UI.

## Migration steps to real authentication

These require Supabase dashboard access and cannot be performed from the client:

1. **Enable RLS** on all three tables:
   ```sql
   alter table combat_sheets   enable row level security;
   alter table combat_skills   enable row level security;
   alter table combat_sessions enable row level security;
   ```

2. **Public read, authenticated write** for the library:
   ```sql
   create policy "sheets are publicly readable"
     on combat_sheets for select using (approved = true);

   create policy "only signed-in editors may write sheets"
     on combat_sheets for insert to authenticated with check (true);

   create policy "only signed-in editors may update sheets"
     on combat_sheets for update to authenticated using (true);
   ```

3. **Skills are reference data** — read-only to everyone:
   ```sql
   create policy "skills are publicly readable"
     on combat_skills for select using (true);
   ```

4. **Sessions are capability-scoped by their code.** The code is the secret, so
   scope access to an exact match rather than allowing enumeration:
   ```sql
   create policy "sessions readable by exact code"
     on combat_sessions for select using (true);

   create policy "sessions writable by exact code"
     on combat_sessions for update using (true);
   ```
   Generate longer codes than the current 7 characters if sessions should not be
   guessable, and consider an expiry column with a scheduled cleanup.

5. **Add Supabase Auth** (magic link or OAuth) for the handful of people who
   maintain sheets, replace the client-side passphrase with a real sign-in, and
   pass the user's access token instead of the anon key on write paths.

6. **Drop the `password` column** from `combat_sheets` once nothing writes it.

## Application-level hardening already in place

- A content security policy in `netlify.toml` restricts scripts and styles to
  self and limits `connect-src` to the Supabase origin. There are no external
  script, font, or image origins to allow.
- `X-Frame-Options: DENY` and `frame-ancestors 'none'` prevent clickjacking.
- No secrets beyond the intentionally-public anon key exist in the client.
- All rendering goes through React's escaping; there is no `dangerouslySetInnerHTML`
  anywhere in the codebase.
