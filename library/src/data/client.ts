/**
 * The transport.
 *
 * v1 had eleven bare `fetch(...).then(r => r.json())` chains. None of them
 * checked `response.ok`, so a PostgREST error — which arrives as HTTP 4xx with
 * a JSON *object* in the body — was handed to `Array.isArray(data) ? data : []`
 * and became an empty archive with no message. "Failed to load entries" only
 * appeared for a dropped connection. A permission error looked like a library
 * with nothing in it.
 *
 * Everything here fails loudly and in one shape.
 */

const URL_FROM_ENV = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_FROM_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The deployed project, used when nothing is configured. This key is a public
 * client credential — it is in the page source by necessity and is not a
 * secret. What stops a stranger rewriting the archive is row-level security,
 * not this string. See docs/SECURITY.md.
 */
export const SUPABASE_URL = URL_FROM_ENV || 'https://srvqlrmefjyluocwtvkt.supabase.co';
export const SUPABASE_KEY =
  KEY_FROM_ENV || 'sb_publishable_Q_OBH6LbXZOzTsB1OsVC9Q_q89iruCr';

export type FailureKind =
  | 'offline' // the request never reached the server
  | 'timeout'
  | 'denied' // 401/403 — RLS said no
  | 'missing' // 404 — including "the migration has not been run"
  | 'rejected' // 400/409 — the server refused the payload
  | 'server' // 5xx
  | 'malformed'; // 2xx with a body we cannot read

export class ArchiveError extends Error {
  readonly kind: FailureKind;
  readonly status: number;
  /** True when the same request might succeed if tried again. */
  readonly retryable: boolean;

  constructor(kind: FailureKind, message: string, status = 0) {
    super(message);
    this.name = 'ArchiveError';
    this.kind = kind;
    this.status = status;
    this.retryable = kind === 'offline' || kind === 'timeout' || kind === 'server';
  }
}

const TIMEOUT_MS = 15_000;
const RETRIES = 2;

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

/** PostgREST and pg both report failures as JSON; pull out something readable. */
async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as Record<string, unknown> | null;
    if (body && typeof body === 'object') {
      detail = String(body.message ?? body.error_description ?? body.error ?? body.hint ?? '');
    }
  } catch {
    /* a non-JSON error body tells us nothing extra */
  }
  return detail;
}

function kindFor(status: number): FailureKind {
  if (status === 401 || status === 403) return 'denied';
  if (status === 404) return 'missing';
  if (status === 409 || status === 400 || status === 422) return 'rejected';
  if (status >= 500) return 'server';
  return 'rejected';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Raw body (a File) passes through untouched. */
  raw?: BodyInit;
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, raw, signal } = options;

  let lastError: ArchiveError | null = null;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), TIMEOUT_MS);

    // Caller aborts and our own timeout both have to reach the fetch.
    const onOuterAbort = () => timer.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      const response = await fetch(`${SUPABASE_URL}${path}`, {
        method,
        headers: headers({
          ...(raw ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        }),
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
        signal: timer.signal,
      });

      if (response.ok) return response;

      const detail = await describeFailure(response);
      const kind = kindFor(response.status);
      const error = new ArchiveError(
        kind,
        detail || `The archive replied ${response.status}.`,
        response.status,
      );

      // Only server errors are worth a second try; a 403 will stay a 403.
      if (!error.retryable || attempt === RETRIES) throw error;
      lastError = error;
    } catch (cause) {
      if (cause instanceof ArchiveError) {
        if (!cause.retryable || attempt === RETRIES) throw cause;
        lastError = cause;
      } else if (signal?.aborted) {
        // The caller moved on — not a failure worth reporting.
        throw new ArchiveError('timeout', 'Request cancelled.');
      } else {
        const timedOut = timer.signal.aborted;
        const error = new ArchiveError(
          timedOut ? 'timeout' : 'offline',
          timedOut ? 'The archive took too long to answer.' : 'Could not reach the archive.',
        );
        if (attempt === RETRIES) throw error;
        lastError = error;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onOuterAbort);
    }

    // Back off: 300ms, then 900ms.
    await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** attempt));
  }

  throw lastError ?? new ArchiveError('offline', 'Could not reach the archive.');
}

export async function selectRows(query: string, signal?: AbortSignal): Promise<unknown> {
  const response = await request(`/rest/v1/${query}`, { signal });
  try {
    return await response.json();
  } catch {
    throw new ArchiveError('malformed', 'The archive sent something unreadable.');
  }
}

/**
 * Call a database function.
 *
 * A 404 here means the security migration in `supabase/migrations` has not
 * been applied, which is worth saying out loud rather than reporting as a
 * generic failure — it is the single most likely cause of a broken save on a
 * fresh deploy.
 */
export async function callFunction(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args, signal });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (cause) {
    if (cause instanceof ArchiveError && cause.kind === 'missing') {
      throw new ArchiveError(
        'missing',
        'This archive has not had its security migration applied yet, so edits are ' +
          'disabled. Run supabase/migrations/0001_secure_entries.sql.',
        cause.status,
      );
    }
    throw cause;
  }
}

export async function uploadObject(
  bucket: string,
  path: string,
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  await request(`/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
    method: 'POST',
    raw: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    signal,
  });
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(path)}`;
}

/**
 * Ask Supabase's image transformer for a portrait at the size actually being
 * shown. v1 used the full upload everywhere, so the 54px thumbnails in
 * "Recently Added" each pulled a multi-megabyte original.
 *
 * If the project is on a plan without transforms the URL still resolves to the
 * original image, so this degrades to exactly the old behaviour.
 */
export function portraitAt(url: string, width: number): string {
  if (!url) return '';
  const marker = '/storage/v1/object/public/';
  const at = url.indexOf(marker);
  if (at < 0) return url;
  const rendered = `${url.slice(0, at)}/storage/v1/render/image/public/${url.slice(at + marker.length)}`;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  return `${rendered}?width=${Math.round(width * dpr)}&resize=cover&quality=78`;
}
