import { CONTACT_LINK_ATTRS, CONTACT_TEAM_URL } from './config';
import { hasPhoto, photoRole, PHOTO_WIDTHS, type Treatment } from './content/photos';
import { geoPlateInfo, hasGeoPlate } from './content/geo';

export interface CtaOptions {
  label: string;
  variant?: 'primary' | 'ghost';
  size?: 'default' | 'large';
  magnetic?: boolean;
  id?: string;
  describedBy?: string;
}

/**
 * Every call to action on the page is produced here, so they all point at the
 * single configured destination and share the same tactile behaviour.
 */
export function cta({
  label,
  variant = 'primary',
  size = 'default',
  magnetic = false,
  id,
  describedBy,
}: CtaOptions): string {
  const classes = [
    'cta',
    variant === 'ghost' ? 'cta--ghost' : '',
    size === 'large' ? 'cta--large' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const shared =
    `${id ? ` id="${id}"` : ''}` +
    `${describedBy ? ` aria-describedby="${describedBy}"` : ''}` +
    `${magnetic ? ' data-magnetic="0.2"' : ''}` +
    ` data-cta="${label}"`;
  const inner = `
    <span class="cta__fill" aria-hidden="true"></span>
    <span class="cta__label">${label}</span>
    <span class="cta__arrow" aria-hidden="true"></span>`;

  // Until a destination exists the button is a real, focusable control that
  // performs no navigation, rather than a link to nowhere.
  if (!CONTACT_TEAM_URL) {
    return `<button type="button" class="${classes}" aria-disabled="true"${shared}>${inner}</button>`;
  }
  return `<a class="${classes}" href="${CONTACT_TEAM_URL}" ${CONTACT_LINK_ATTRS}${shared}>${inner}</a>`;
}

const PLATE_WIDTHS = [640, 1024, 1600];

/**
 * Responsive art plate. Every source is local; nothing is fetched from another
 * origin at runtime.
 */
export function plate(
  name: string,
  alt: string,
  options: { sizes?: string; className?: string; eager?: boolean; ratio?: string } = {},
): string {
  const sizes = options.sizes ?? '(max-width: 767px) 92vw, 46vw';
  const srcset = (ext: string) =>
    PLATE_WIDTHS.map((w) => `/media/${name}-${w}.${ext} ${w}w`).join(', ');
  return `<picture class="plate ${options.className ?? ''}">
    <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}" />
    <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}" />
    <img
      src="/media/${name}-1024.webp"
      alt="${alt}"
      loading="${options.eager ? 'eager' : 'lazy'}"
      decoding="async"
      ${options.ratio ? `style="aspect-ratio:${options.ratio}"` : ''}
    />
  </picture>`;
}

export interface PhotoOptions {
  crop?: string;
  sizes?: string;
  className?: string;
  eager?: boolean;
  /** Treatment override; defaults to the one declared on the role. */
  treatment?: Treatment;
}

/**
 * A photograph from the human layer, or the procedural plate standing in for it.
 *
 * The two are deliberately interchangeable at the call site: a section asks for
 * a role and gets whichever exists, wrapped in the same treatment, so the page
 * is complete whether or not the photography has landed yet.
 */
export function photo(id: string, options: PhotoOptions = {}): string {
  const role = photoRole(id);
  if (!role) return '';
  const treatment = options.treatment ?? role.treatment;
  const sizes = options.sizes ?? '(max-width: 899px) 92vw, 46vw';
  const wrapper = `photo photo--${treatment} ${options.className ?? ''}`.trim();

  if (!hasPhoto(id)) {
    if (!role.fallback) return '';
    return `<div class="${wrapper} is-standin">${plate(role.fallback, role.fallbackAlt, {
      sizes,
      eager: options.eager,
    })}</div>`;
  }

  const crop = options.crop ?? role.crops[0]?.name ?? 'wide';
  const srcset = (ext: string) =>
    PHOTO_WIDTHS.map((w) => `/media/photos/${id}-${crop}-${w}.${ext} ${w}w`).join(', ');

  return `<div class="${wrapper}">
    <picture class="plate">
      <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}" />
      <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}" />
      <img
        src="/media/photos/${id}-${crop}-1024.webp"
        alt="${role.alt}"
        loading="${options.eager ? 'eager' : 'lazy'}"
        decoding="async"
      />
    </picture>
  </div>`;
}

export interface GeoOptions {
  sizes?: string;
  className?: string;
  eager?: boolean;
  treatment?: Treatment;
  /** Overrides the description written by the renderer. */
  alt?: string;
}

/**
 * A plate from the measured layer: real geography drawn from public domain
 * survey data. Same call shape as `photo`, so a section can be composed from
 * whichever layer serves the passage best.
 */
export function geo(name: string, options: GeoOptions = {}): string {
  const info = geoPlateInfo(name);
  if (!info) return '';
  const sizes = options.sizes ?? '(max-width: 899px) 92vw, 46vw';
  const srcset = (ext: string) =>
    info.widths.map((w) => `/media/photos/${name}-${w}.${ext} ${w}w`).join(', ');
  const wrapper = `photo photo--geo ${
    options.treatment ? `photo--${options.treatment}` : ''
  } ${options.className ?? ''}`.trim();

  return `<div class="${wrapper}">
    <picture class="plate">
      <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}" />
      <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}" />
      <img
        src="/media/photos/${name}-1024.webp"
        alt="${options.alt ?? info.alt}"
        loading="${options.eager ? 'eager' : 'lazy'}"
        decoding="async"
        style="aspect-ratio:${info.ratio}"
      />
    </picture>
  </div>`;
}

/** True when a section should compose around a real photograph. */
export { hasPhoto, hasGeoPlate };

export function eyebrow(text: string, index?: string): string {
  return `<p class="eyebrow" data-reveal="fade">${
    index ? `<span class="visually-hidden">Section </span>${index} <span aria-hidden="true">/</span> ` : ''
  }${text}</p>`;
}

/**
 * Splits a line for the kinetic passages.
 *
 * Characters are addressable individually, but each word is wrapped in its own
 * non-breaking box, so a headline can never split mid-word at a narrow width.
 * The whole run is hidden from assistive technology; callers pair it with a
 * plain-text copy of the same line.
 */
export function splitChars(text: string, className = 'char'): string {
  let index = 0;
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return ' ';
      const chars = token
        .split('')
        .map((char) => `<span class="${className}" style="--i:${index++}">${char}</span>`)
        .join('');
      return `<span class="word">${chars}</span>`;
    })
    .join('');
}

/**
 * Like `splitChars`, but keeps named groups of words on one line. Used where a
 * headline has a natural break point that should be the only one available at
 * narrow widths.
 */
export function splitPhrase(groups: readonly string[], className = 'char'): string {
  return groups
    .map((group) => `<span class="word-group">${splitChars(group, className)}</span>`)
    .join(' ');
}

export function kineticLine(text: string, tag = 'span'): string {
  return `<${tag} class="kinetic-line"><span class="visually-hidden">${text}</span><span aria-hidden="true">${splitChars(
    text,
  )}</span></${tag}>`;
}
