import { useState } from 'react';
import { SUPABASE_URL } from '@/data/client';

/**
 * The Hei Mao mark.
 *
 * This is the company's actual logo, stored in the archive's own bucket, and
 * it is the thing people recognise — an earlier pass here replaced it with a
 * drawn cat-in-an-astrolabe on the grounds that hotlinking a PNG put a
 * storage round trip on the critical path. That reasoning was fine and the
 * conclusion was wrong: a brand mark is not a decoration to be substituted
 * for a tasteful equivalent. It is the logo or it is not the logo.
 *
 * The performance concern is answered properly instead:
 *
 *   - The drawn mark is still here, underneath, as the immediate paint. The
 *     header never shows a blank square, and if storage is unreachable the
 *     drawn mark is simply what stays.
 *   - `width`/`height` are set, so the image reserves its box and nothing
 *     shifts when it lands.
 *   - The masthead copy is `eager`; the hero copy is `eager` too, because it
 *     is the largest contentful paint on the front page and lazy-loading the
 *     LCP element is a way of losing a second for nothing.
 */

const LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/portraits/heimaotransparent2.png`;

interface BrandMarkProps {
  /** Rendered box in CSS pixels. */
  size: number;
  className?: string;
}

export function BrandMark({ size, className }: BrandMarkProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    <span
      className={className ? `brand-mark ${className}` : 'brand-mark'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/**
       * The sigil is a *placeholder*, not a backdrop. It has to disappear the
       * moment the real mark is up: the logo is a transparent PNG, so leaving
       * the drawn ring underneath it means gold geometry showing through the
       * transparent areas of the cat — two marks stacked on top of each other.
       */}
      {state === 'ready' ? null : <BrandSigil />}
      {state === 'failed' ? null : (
        <img
          src={LOGO_URL}
          alt=""
          width={size}
          height={size}
          loading="eager"
          decoding="async"
          data-ready={state === 'ready' || undefined}
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
        />
      )}
    </span>
  );
}

/**
 * The fallback, and the thing painted first: a cat's silhouette inside an
 * astrolabe ring. Geometry only — no request, no layout cost.
 */
export function BrandSigil() {
  return (
    <svg viewBox="0 0 48 48" className="brand-mark__sigil" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.3"
        strokeDasharray="2 3.5"
      />
      <path
        d="M13 30c0-7 5-12 11-12s11 5 11 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M13 30 11 19l7 4M35 30l2-11-7 4" fill="currentColor" opacity="0.9" />
      <circle cx="19.5" cy="27" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="27" r="1.6" fill="currentColor" />
      <path
        d="M24 31v2M21 34.5c1.8 1.2 4.2 1.2 6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
