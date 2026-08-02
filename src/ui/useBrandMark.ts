/**
 * The house mark, taken from the character library.
 *
 * Hei Mao has a logo in the same `entries` table the portraits come from, so
 * the brand is looked up rather than hardcoded — a URL pasted into the source
 * would go stale the first time the image is replaced, and there is no reason
 * for this app to hold a second copy of something the library already owns.
 *
 * Best-effort in every direction. If the request fails, the row is missing, or
 * the image will not load, the carved 黑 seal stands in exactly as before. The
 * brand is never a reason for the tracker not to open.
 */

import { useEffect, useState } from "react";
import { request } from "@/persistence/supabase";

/** Cached for the session: the mark cannot change mid-fight. */
let cached: string | null | undefined;

/**
 * And remembered across loads. The mark changes about never, so re-asking on
 * every visit is a request that only ever costs something — a wasted round
 * trip online, and a console error on a table with no signal.
 */
const STORE_KEY = "heimao.brandmark.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readStored(): string | null | undefined {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return undefined;
    const { url, at } = JSON.parse(raw) as { url: string | null; at: number };
    if (typeof at !== "number" || Date.now() - at > TTL_MS) return undefined;
    return typeof url === "string" || url === null ? url : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(url: string | null): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ url, at: Date.now() }));
  } catch {
    /* a full quota must not break the header */
  }
}

const LOOKUP =
  "entries?select=name,portrait_url&portrait_url=not.is.null" +
  "&or=(id.eq.hei-mao,id.eq.heimao,id.eq.hei_mao,name.ilike.*hei mao*,name.ilike.*heimao*)" +
  "&limit=1";

export function useBrandMark(): string | null {
  if (cached === undefined) cached = readStored();
  const [url, setUrl] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;

    void (async () => {
      try {
        const rows = await request<{ portrait_url?: unknown }[]>({ path: LOOKUP });
        const found = rows?.[0]?.portrait_url;
        cached = typeof found === "string" && /^https?:\/\//i.test(found) ? found : null;
      } catch {
        cached = null;
      }
      writeStored(cached);
      if (alive && cached) setUrl(cached);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return url;
}
