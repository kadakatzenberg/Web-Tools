-- ============================================================================
-- Hei Mao Library — 0001: close the archive to strangers
--
-- Run this once, in the Supabase dashboard: SQL Editor → New query → paste →
-- Run. It is written to be safe to run twice.
--
-- WHAT IS WRONG TODAY
--
-- The v1 client asked the database for `entries?select=password` and compared
-- the answer to a hash it computed in JavaScript. Three things follow from
-- that, and all three are live right now:
--
--   1. Every entry's password hash is readable by anyone. Open the network
--      tab, or just visit the REST URL — the anon key is in the page source,
--      because it has to be.
--
--   2. The hash is a 20-line djb2 variant with a 32-bit output. There are
--      about four billion possible values and no salt, so a laptop recovers
--      any password in it in under a minute. It was never a password hash;
--      it is a checksum someone reached for because it was short.
--
--   3. It does not matter anyway. Row-level security is switched on, which
--      looks reassuring in the dashboard, but the table carries six policies
--      and every one of them is `USING (true)`:
--
--        Public insert / Public update / Public delete
--        allow all insert / allow all update / allow all delete
--
--      (Two full sets, which is its own tell — someone hit the problem twice
--      and added a second set rather than finding the first.) The anon key can
--      DELETE all 304 rows in one request. The password prompt is a dialog in
--      front of an unlocked door; it only ever stopped people not looking.
--
-- WHAT THIS DOES
--
--   * Moves hashes into `entry_secrets`, which no browser-facing role can
--     read, ever. The client cannot compare a hash it cannot fetch.
--   * Re-hashes with bcrypt at cost 12 (~250ms per attempt), salted.
--   * Keeps everyone's existing password working. Legacy djb2 hashes are
--     verified by a faithful reimplementation of the old function, then
--     immediately upgraded to bcrypt on that first successful use. Nobody has
--     to be told anything, and nobody is locked out.
--   * Turns on RLS: anon may read entries and nothing else. Every write goes
--     through a function that checks a password first.
--   * Rate-limits attempts per entry, so bcrypt's cost actually buys
--     something rather than being brute-forced in parallel.
--   * Replaces the admin password that was sitting in the page source
--     (`ADMIN_HASH=hp("heimao-admin-2025")`) with a bcrypt hash in a table
--     nothing can read. Set it at the bottom of this file.
--
-- WHAT THIS DOES NOT DO
--
--   Read access stays open, because the archive is meant to be public. Anyone
--   can still enumerate every entry. That is by design; see docs/SECURITY.md
--   for what is and is not protected.
-- ============================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Secrets live apart from content.
--
-- A separate table rather than a column, so that `select=*` on entries can
-- never leak it — not through a forgotten grant, not through a view, not
-- through a future column added by someone who did not read this file.
-- ---------------------------------------------------------------------------

create table if not exists public.entry_secrets (
  entry_id        text primary key,
  password_hash   text not null,
  -- 'bcrypt' or 'legacy-djb2'. Legacy rows upgrade themselves on first use.
  algorithm       text not null default 'bcrypt',
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.entry_secrets is
  'Per-entry edit passwords. No browser-facing role has any grant on this '
  'table; it is reachable only through the SECURITY DEFINER functions below.';

-- ---------------------------------------------------------------------------
-- 2. The admin secret, likewise out of reach.
-- ---------------------------------------------------------------------------

create table if not exists public.library_admin (
  id            boolean primary key default true,
  password_hash text not null,
  updated_at    timestamptz not null default now(),
  constraint library_admin_singleton check (id)
);

comment on table public.library_admin is
  'Single row. The override that can delete any entry.';

-- ---------------------------------------------------------------------------
-- 3. The old hash, reimplemented exactly, so existing passwords still work.
--
--   function hp(s){
--     var h=5381;
--     for(var i=0;i<s.length;i++) h=((h<<5)+h)^s.charCodeAt(i);
--     return (h>>>0).toString();
--   }
--
-- The fiddly part is that JavaScript's `<<` and `^` coerce to signed 32-bit
-- while `+` does not, so the intermediate `(h<<5)+h` can exceed 32 bits before
-- the XOR truncates it again. Getting that wrong locks people out, so it is
-- reproduced step by step rather than simplified.
-- ---------------------------------------------------------------------------

create or replace function public.legacy_djb2(input text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  h        bigint := 5381;
  shifted  bigint;
  summed   bigint;
  i        integer;
  code     bigint;
begin
  if input is null then
    return null;
  end if;

  for i in 1 .. length(input) loop
    code := ascii(substr(input, i, 1));

    -- h << 5, truncated to signed 32-bit the way ToInt32 does
    shifted := (h * 32) & 4294967295;
    if shifted >= 2147483648 then
      shifted := shifted - 4294967296;
    end if;

    -- + is ordinary arithmetic; the result may not fit in 32 bits yet
    summed := shifted + h;

    -- ^ coerces both sides back to signed 32-bit
    summed := summed & 4294967295;
    if summed >= 2147483648 then
      summed := summed - 4294967296;
    end if;

    h := (summed # code) & 4294967295;
    if h >= 2147483648 then
      h := h - 4294967296;
    end if;
  end loop;

  -- h >>> 0
  if h < 0 then
    h := h + 4294967296;
  end if;

  return h::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Adopt whatever passwords the table is carrying today.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'password'
  ) then
    insert into public.entry_secrets (entry_id, password_hash, algorithm)
    select e.id, e.password, 'legacy-djb2'
    from public.entries e
    where e.password is not null and e.password <> ''
    on conflict (entry_id) do nothing;

    -- The column has served its purpose and is now only a liability.
    alter table public.entries drop column password;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Two small data repairs, while we are here.
--
-- Both came from v1's "Other (custom)…" escape hatch, which wrote whatever was
-- typed into the same slot the era *codes* live in — so the era column holds a
-- mix of codes and prose and nothing downstream could tell which was which.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Two entries store the era as the literal label '5th Astral Era' where
  -- every other row stores a code. They sorted to the end of The Source,
  -- after Neo-Kugane, because a label does not match any known code.
  update public.entries
     set stats = jsonb_set(stats, '{7}', '"5A"')
   where stats->>7 = '5th Astral Era';

  -- `player` is vestigial: 29 rows have it, 303 have the same field at
  -- stats[0], and 280 of them disagree. Every version of the client has read
  -- stats[0]. The column is left in place rather than dropped — it is the only
  -- copy of whatever those 29 rows said, and it costs nothing to keep — but
  -- nothing reads it, and nothing should start.
  comment on column public.entries.player is
    'Dead column, superseded by stats[0]. Not read by the client. Retained '
    'only because 29 rows hold values that disagree with stats[0].';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Verification, with a lockout.
--
-- Attempts are counted per entry. Ten failures buys a fifteen minute pause,
-- which is what stops someone pointing a script at one character overnight.
-- ---------------------------------------------------------------------------

create or replace function public.verify_entry_password(p_entry_id text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret public.entry_secrets%rowtype;
  ok     boolean := false;
begin
  if p_entry_id is null or p_password is null or p_password = '' then
    return false;
  end if;

  select * into secret from public.entry_secrets where entry_id = p_entry_id for update;

  -- An entry with no secret row cannot be edited by anyone. That is the safe
  -- default: it fails closed rather than open.
  if not found then
    return false;
  end if;

  if secret.locked_until is not null and secret.locked_until > now() then
    raise exception 'Too many attempts. Try again later.'
      using errcode = 'P0001';
  end if;

  if secret.algorithm = 'bcrypt' then
    ok := secret.password_hash = extensions.crypt(p_password, secret.password_hash);
  else
    ok := secret.password_hash = public.legacy_djb2(p_password);

    -- Upgrade in place, now that we have the plaintext and know it is right.
    if ok then
      update public.entry_secrets
         set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
             algorithm = 'bcrypt',
             updated_at = now()
       where entry_id = p_entry_id;
    end if;
  end if;

  if ok then
    update public.entry_secrets
       set failed_attempts = 0, locked_until = null
     where entry_id = p_entry_id;
  else
    update public.entry_secrets
       set failed_attempts = secret.failed_attempts + 1,
           locked_until = case
             when secret.failed_attempts + 1 >= 10 then now() + interval '15 minutes'
             else null
           end
     where entry_id = p_entry_id;
  end if;

  return ok;
end;
$$;

create or replace function public.verify_admin_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
begin
  if p_password is null or p_password = '' then
    return false;
  end if;
  select password_hash into stored from public.library_admin where id;
  if not found then
    return false;
  end if;
  return stored = extensions.crypt(p_password, stored);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Writes.
--
-- One function per operation. Each takes the password, and none of them
-- returns anything that would help someone guess it.
--
-- The payload is jsonb rather than thirty parameters so that adding a field
-- to the entry does not mean a migration. Only keys on the allow-list are
-- copied across, so a client cannot smuggle in `id` or a timestamp.
-- ---------------------------------------------------------------------------

create or replace function public.create_entry(
  p_id       text,
  p_password text,
  p_payload  jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_id text;
begin
  clean_id := lower(trim(coalesce(p_id, '')));

  if clean_id !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
    raise exception 'Invalid entry ID' using errcode = 'P0001';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.entries where id = clean_id) then
    raise exception 'That entry ID is already taken' using errcode = 'P0001';
  end if;

  insert into public.entries (
    id, name, alias, blurb, quote, fun_fact, carrd_url,
    voice_claim, voice_claim_url, image_song, image_song_url,
    portrait_url, stats, relations, lineage, rp_hooks, genre_tags,
    created_at, updated_at
  )
  values (
    clean_id,
    nullif(trim(coalesce(p_payload->>'name', '')), ''),
    p_payload->>'alias',
    p_payload->>'blurb',
    p_payload->>'quote',
    p_payload->>'fun_fact',
    p_payload->>'carrd_url',
    p_payload->>'voice_claim',
    p_payload->>'voice_claim_url',
    p_payload->>'image_song',
    p_payload->>'image_song_url',
    p_payload->>'portrait_url',
    coalesce(p_payload->'stats', '[]'::jsonb),
    coalesce(p_payload->'relations', '[]'::jsonb),
    coalesce(p_payload->'lineage', '[]'::jsonb),
    coalesce(p_payload->'rp_hooks', '[]'::jsonb),
    coalesce(p_payload->'genre_tags', '[]'::jsonb),
    now(),
    now()
  );

  insert into public.entry_secrets (entry_id, password_hash, algorithm)
  values (clean_id, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), 'bcrypt');

  return clean_id;
end;
$$;

create or replace function public.update_entry(
  p_id       text,
  p_password text,
  p_payload  jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.verify_entry_password(p_id, p_password) then
    raise exception 'Incorrect password' using errcode = 'P0001';
  end if;

  update public.entries set
    name            = coalesce(nullif(trim(coalesce(p_payload->>'name', '')), ''), name),
    alias           = coalesce(p_payload->>'alias', alias),
    blurb           = coalesce(p_payload->>'blurb', blurb),
    quote           = coalesce(p_payload->>'quote', quote),
    fun_fact        = coalesce(p_payload->>'fun_fact', fun_fact),
    carrd_url       = coalesce(p_payload->>'carrd_url', carrd_url),
    voice_claim     = coalesce(p_payload->>'voice_claim', voice_claim),
    voice_claim_url = coalesce(p_payload->>'voice_claim_url', voice_claim_url),
    image_song      = coalesce(p_payload->>'image_song', image_song),
    image_song_url  = coalesce(p_payload->>'image_song_url', image_song_url),
    portrait_url    = coalesce(p_payload->>'portrait_url', portrait_url),
    stats           = coalesce(p_payload->'stats', stats),
    relations       = coalesce(p_payload->'relations', relations),
    lineage         = coalesce(p_payload->'lineage', lineage),
    rp_hooks        = coalesce(p_payload->'rp_hooks', rp_hooks),
    genre_tags      = coalesce(p_payload->'genre_tags', genre_tags),
    updated_at      = now()
  where id = p_id;

  if not found then
    raise exception 'No such entry' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.delete_entry(p_id text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The admin override is checked first so that a locked-out entry can still
  -- be removed, and so a wrong admin password does not burn an entry attempt.
  if not public.verify_admin_password(p_password) then
    if not public.verify_entry_password(p_id, p_password) then
      raise exception 'Incorrect password' using errcode = 'P0001';
    end if;
  end if;

  delete from public.entry_secrets where entry_id = p_id;
  delete from public.entries where id = p_id;
end;
$$;

create or replace function public.change_entry_password(
  p_id           text,
  p_old_password text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = 'P0001';
  end if;

  if not public.verify_entry_password(p_id, p_old_password) then
    raise exception 'Incorrect password' using errcode = 'P0001';
  end if;

  update public.entry_secrets
     set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
         algorithm = 'bcrypt',
         updated_at = now()
   where entry_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lock the doors.
-- ---------------------------------------------------------------------------

alter table public.entries       enable row level security;
alter table public.entry_secrets enable row level security;
alter table public.library_admin enable row level security;

-- The six that made RLS decorative. Dropped by name, and then anything else
-- on the table that is not the read policy, so a seventh added later by hand
-- does not quietly survive this migration.
drop policy if exists "Public insert"    on public.entries;
drop policy if exists "Public update"    on public.entries;
drop policy if exists "Public delete"    on public.entries;
drop policy if exists "allow all insert" on public.entries;
drop policy if exists "allow all update" on public.entries;
drop policy if exists "allow all delete" on public.entries;

do $$
declare
  stale record;
begin
  for stale in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'entries'
      and policyname <> 'entries are public to read'
  loop
    execute format('drop policy if exists %I on public.entries', stale.policyname);
  end loop;
end;
$$;

-- No policies on the secret tables at all: RLS with zero policies denies
-- everything, and the definer functions bypass it by design.
revoke all on public.entry_secrets from anon, authenticated;
revoke all on public.library_admin from anon, authenticated;

drop policy if exists "entries are public to read" on public.entries;
create policy "entries are public to read"
  on public.entries for select
  to anon, authenticated
  using (true);

-- Reading is all a browser may do directly. Writes have to come through the
-- functions, which is the entire point.
revoke insert, update, delete on public.entries from anon, authenticated;
grant select on public.entries to anon, authenticated;

revoke all on function public.legacy_djb2(text) from anon, authenticated;
revoke all on function public.verify_admin_password(text) from anon, authenticated;
-- verify_entry_password is called by the others; it is not part of the API.
revoke all on function public.verify_entry_password(text, text) from anon, authenticated;

grant execute on function public.create_entry(text, text, jsonb) to anon, authenticated;
grant execute on function public.update_entry(text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_entry(text, text) to anon, authenticated;
grant execute on function public.change_entry_password(text, text, text) to anon, authenticated;

commit;

-- ============================================================================
-- 8. SET THE ADMIN PASSWORD — do this now, in a separate query.
--
-- Replace the placeholder. Do not commit the real one anywhere; this file is
-- in a public repository.
--
--   insert into public.library_admin (id, password_hash)
--   values (true, extensions.crypt('choose-a-long-one', extensions.gen_salt('bf', 12)))
--   on conflict (id) do update
--     set password_hash = excluded.password_hash, updated_at = now();
--
-- The old admin password `heimao-admin-2025` has been public in the page
-- source of every visit to the site. Treat it as burned and pick a new one.
-- ============================================================================

-- ============================================================================
-- 9. PORTRAIT UPLOADS — the other open door.
--
-- The `portraits` bucket currently accepts uploads from the anon key with no
-- checks, so anyone can write objects to it until the quota runs out. There is
-- no way to fix that from the client, because the client is the thing being
-- trusted. Tighten the bucket in Storage → Policies, or run:
--
--   update storage.buckets
--      set public = true,
--          file_size_limit = 5242880,
--          allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
--    where id = 'portraits';
--
--   drop policy if exists "anon may upload portraits" on storage.objects;
--   create policy "anon may upload portraits"
--     on storage.objects for insert
--     to anon
--     with check (
--       bucket_id = 'portraits'
--       and (storage.foldername(name))[1] is null
--       and octet_length(coalesce(metadata->>'size', '0')::int::text) > 0
--     );
--
-- That caps size and type. It does not stop a determined person filling the
-- bucket with 5MB JPEGs, which needs either authentication or an Edge Function
-- in front of the upload. Noted in docs/SECURITY.md as a known limit.
-- ============================================================================
