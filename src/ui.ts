import { CONTACT_LINK_ATTRS, CONTACT_TEAM_URL } from './config';

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
  return `<a class="${classes}" href="${CONTACT_TEAM_URL}" ${CONTACT_LINK_ATTRS}${
    id ? ` id="${id}"` : ''
  }${describedBy ? ` aria-describedby="${describedBy}"` : ''}${
    magnetic ? ' data-magnetic="0.2"' : ''
  } data-cta="${label}">
    <span class="cta__fill" aria-hidden="true"></span>
    <span class="cta__label">${label}</span>
    <span class="cta__arrow" aria-hidden="true"></span>
  </a>`;
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

export function eyebrow(text: string, index?: string): string {
  return `<p class="eyebrow" data-reveal="fade">${
    index ? `<span class="visually-hidden">Section </span>${index} <span aria-hidden="true">/</span> ` : ''
  }${text}</p>`;
}

/** Splits a line into per character spans for the kinetic passages. */
export function splitChars(text: string, className = 'char'): string {
  return text
    .split('')
    .map((char, index) =>
      char === ' '
        ? ' '
        : `<span class="${className}" style="--i:${index}" aria-hidden="true">${char}</span>`,
    )
    .join('');
}

export function kineticLine(text: string, tag = 'span'): string {
  return `<${tag} class="kinetic-line"><span class="visually-hidden">${text}</span>${splitChars(
    text,
  )}</${tag}>`;
}
