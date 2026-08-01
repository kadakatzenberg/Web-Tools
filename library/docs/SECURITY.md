# Security

## What the archive is

A public, community-written record. Anyone can read every entry, and that is
intended — the whole point is a shareable cast list. Nothing here tries to keep
entries secret. What it tries to do is stop a stranger *rewriting* them.

## What was wrong in v1

Three problems, which compounded.

**The client asked for the hash.** Editing worked like this:

```js
sbFetch("entries?id=eq." + id + "&select=password")
  .then(r => r.json())
  .then(cd => { if (cd[0].password !== hp(pw)) { toast("Incorrect password."); return; } ... });
```

The comparison happens in the browser, so the browser needs the stored hash,
so the stored hash is public. Anyone could read every password hash in the
archive by visiting a URL. Removing the button would not have helped; the data
was the problem.

**The hash was not a password hash.**

```js
function hp(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString();}
```

djb2, 32 bits, unsalted. Four billion possible outputs, no work factor, and
collisions are as good as the password — you do not need to find the original
string, only *a* string that hashes the same. That is minutes of laptop time
per entry, and the same rainbow table works for every entry at once because
there is no salt.

**None of it mattered, because there was no row-level security.** The anon key
had full CRUD on `entries`. A single request deleted any row, or all of them,
without going near the password prompt. The prompt was UI in front of an
unlocked door.

Also: `ADMIN_HASH = hp("heimao-admin-2025")` was in the page source. The admin
password was `heimao-admin-2025`, published on every page load for as long as
the site has been up. **Treat it as burned.** The migration replaces it, and
step 8 of the migration file asks you to set a new one.

## What v2 does

Applied by `supabase/migrations/0001_secure_entries.sql`.

| | v1 | v2 |
| --- | --- | --- |
| Hash | djb2, 32-bit, unsalted | bcrypt, cost 12, salted |
| Where it is stored | `entries.password` | `entry_secrets`, no browser grant |
| Who can read it | anyone | nothing that talks to the API |
| Where it is checked | in the browser | in the database |
| Direct writes | anon has full CRUD | anon has `SELECT` only |
| Brute force | unlimited, offline | 10 attempts, then 15 minutes |
| Admin password | in the page source | bcrypt in `library_admin` |

Writes go through four `SECURITY DEFINER` functions — `create_entry`,
`update_entry`, `delete_entry`, `change_entry_password` — which check the
password before touching anything. Every one of them sets `search_path = ''`
and schema-qualifies its references, which is what stops the classic definer
escalation where a caller shadows a function name the definer body relies on.

### Nobody gets locked out

Existing passwords still work. `legacy_djb2()` reproduces the old function
exactly — including the detail that JavaScript's `<<` and `^` truncate to
signed 32-bit while `+` does not — so old hashes verify on the first attempt
and are re-hashed with bcrypt in the same transaction. The upgrade is
invisible; the algorithm column records which rows have made the trip.

## What is still open, deliberately

**Read access.** Every entry is public. If something should not be published,
do not put it in the archive.

**The anon key is in the bundle.** It has to be — it is how a browser
identifies itself to PostgREST. It is a public client credential, not a
secret, and after this migration it grants exactly `SELECT` on `entries` plus
the right to call four password-checked functions. Rotating it changes
nothing about who can do what.

**Anyone can create an entry.** The submit form is open, as it was before.
There is no rate limit on creation, so someone determined could fill the table
with junk. Fixing that properly needs either sign-in or a CAPTCHA, both of
which are a real cost to a small community that currently just posts a link.
The trade is deliberate; revisit if it is ever actually abused.

**Portrait uploads are open.** The `portraits` bucket accepts writes from the
anon key. The client caps size and type before uploading, but a client-side
cap stops accidents, not attackers. Section 9 of the migration has the bucket
policy that enforces size and MIME server-side. It still does not stop someone
patiently filling the bucket with valid 5MB JPEGs — that needs an Edge
Function in front of the upload, which is the obvious next piece of work if
the bucket ever starts growing on its own.

**Passwords are per entry, and shared by whoever knows them.** There are no
accounts, so there is no way to tell two people who know the same password
apart, and no audit trail of who edited what. Appropriate for the size of the
group; not appropriate if it grows.

## Client-side hardening

Independent of the database.

**Stored links are sanitised.** `carrd_url`, `voice_claim_url` and
`image_song_url` were written straight into `href`. `javascript:` in one of
those fields was stored XSS against every visitor who opened that character —
and escaping the attribute, which v1 did, does not help, because the payload
is the scheme rather than the quoting. `safeUrl()` in `src/domain/codec.ts`
permits `http:` and `https:` and nothing else, on the way in and on the way
out.

**No `innerHTML`.** v1 built the entire detail view by concatenating HTML
strings, correctness resting on remembering `esc()` at roughly sixty
interpolation sites. React escapes by construction, and there is no
`dangerouslySetInnerHTML` anywhere in this codebase.

**A content security policy that means something.** `netlify.toml` sets
`script-src 'self'` with no `'unsafe-inline'`, which is only possible because
nothing is inline any more. v1 loaded d3 from `cdnjs.cloudflare.com` and fonts
from `fonts.googleapis.com`, so its policy would have had to trust both; a
compromise of either would have been a compromise of the archive. Everything
is bundled and self-hosted, and the only outbound origin is Supabase.

## Reporting

Something wrong here, mail the repository owner rather than opening a public
issue.
