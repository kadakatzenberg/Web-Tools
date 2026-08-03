/**
 * ---------------------------------------------------------------------------
 * AUTHORITY MARKS
 * ---------------------------------------------------------------------------
 * The guide section shows two tiers of authority.
 *
 * `STANDING` always renders. Every line in it describes something about Joey
 * Yap's position that does not depend on a figure which could drift out of
 * date.
 *
 * `FIGURES` renders only when `FIGURES_CONFIRMED` is set to true. It is off by
 * default: the numbers below were supplied in the brief but could not be
 * checked against an official Joey Yap page, and independent sources reachable
 * at build time carried materially different figures (for example a book count
 * in the 180s rather than 198, and country counts well under 100). Publishing
 * an unverified count on a page selling a five-figure journey is not worth the
 * risk.
 *
 * To turn the figures on: confirm each one against the current official page,
 * correct any that have moved, then set `FIGURES_CONFIRMED` to true.
 * ---------------------------------------------------------------------------
 */

export const FIGURES_CONFIRMED = false;

export interface Figure {
  value: number;
  display: string;
  prefix?: string;
  label: string;
  reading: string;
}

export const FIGURES: Figure[] = [
  {
    value: 1000000,
    display: '1,000,000',
    prefix: 'More than',
    label: 'Students taught worldwide',
    reading: 'across three decades of teaching',
  },
  {
    value: 100,
    display: '100',
    prefix: 'More than',
    label: 'Countries reached',
    reading: 'classrooms, consultations and field study',
  },
  {
    value: 30,
    display: '30',
    label: 'Years of mastery and research',
    reading: 'Feng Shui, BaZi, Qi Men Dun Jia, Date Selection',
  },
  {
    value: 198,
    display: '198',
    label: 'Books published',
    reading: 'on classical Chinese metaphysics',
  },
];

export interface Standing {
  mark: string;
  label: string;
  reading: string;
}

export const STANDING: Standing[] = [
  {
    mark: 'Founder',
    label: 'Mastery Academy of Chinese Metaphysics',
    reading: 'a global school devoted to the classical arts',
  },
  {
    mark: "Dato'",
    label: 'Darjah Indera Mahkota Pahang',
    reading: 'conferred for his contribution to the field',
  },
  {
    mark: 'Author',
    label: 'Feng Shui, BaZi, Qi Men Dun Jia, Date Selection',
    reading: 'published across several languages',
  },
  {
    mark: 'Field study',
    label: 'The terrain behind the classical texts',
    reading: 'mountains, rivers, cities, temples and burial sites',
  },
];
