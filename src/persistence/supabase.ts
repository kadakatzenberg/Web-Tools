/**
 * Supabase transport.
 *
 * A thin typed wrapper over PostgREST with timeouts, bounded retries on
 * transient failures, and structured errors. Nothing above this module issues
 * a raw `fetch`.
 *
 * The anon/publishable key is a *public* client credential — it is designed to
 * ship in browser code, and it is only safe because Row Level Security decides
 * what it may read and write. See docs/SECURITY.md for the current policy state
 * and the exact remaining work.
 */

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? "https://srvqlrmefjyluocwtvkt.supabase.co";

export const SUPABASE_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_Q_OBH6LbXZOzTsB1OsVC9Q_q89iruCr";

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: "network" | "http" | "timeout" | "parse",
  ) {
    super(message);
    this.name = "SupabaseError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  prefer?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

function headers(prefer?: string): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Issue a request, retrying transient failures with exponential backoff.
 * Returns parsed JSON, or `null` for an empty (204 / return=minimal) response.
 */
export async function request<T>(opts: RequestOptions): Promise<T | null> {
  const {
    method = "GET",
    path,
    body,
    prefer,
    timeoutMs = 12_000,
    retries = 2,
    signal,
  } = opts;

  let lastError: SupabaseError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new SupabaseError("aborted", null, "network");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: headers(prefer),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const payload = (await res.json()) as { message?: string; details?: string };
          detail = payload.message || payload.details || detail;
        } catch {
          /* body was not JSON; keep the status line */
        }
        const err = new SupabaseError(detail, res.status, "http");
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          lastError = err;
          await sleep(2 ** attempt * 400);
          continue;
        }
        throw err;
      }

      if (res.status === 204) return null;
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SupabaseError("Malformed JSON in response", res.status, "parse");
      }
    } catch (e) {
      if (e instanceof SupabaseError) {
        if (e.kind === "http" || e.kind === "parse") throw e;
        lastError = e;
      } else if (controller.signal.aborted && !signal?.aborted) {
        lastError = new SupabaseError("Request timed out", null, "timeout");
      } else if (signal?.aborted) {
        throw new SupabaseError("aborted", null, "network");
      } else {
        lastError = new SupabaseError(
          e instanceof Error ? e.message : "Network error",
          null,
          "network",
        );
      }
      if (attempt < retries) {
        await sleep(2 ** attempt * 400);
        continue;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  throw lastError ?? new SupabaseError("Request failed", null, "network");
}

/** True when the failure looks like lost connectivity rather than a bad request. */
export function isOffline(e: unknown): boolean {
  return (
    e instanceof SupabaseError && (e.kind === "network" || e.kind === "timeout")
  );
}
