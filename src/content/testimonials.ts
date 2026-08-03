/**
 * ---------------------------------------------------------------------------
 * ATTRIBUTED ACCOUNTS
 * ---------------------------------------------------------------------------
 * Named accounts from previous excursions belong here. The section renders
 * them ahead of the unattributed descriptions when the list is populated.
 *
 * Two rules apply to anything added to this file:
 *
 *  1. Use `quote` only when the wording is reproduced exactly as the person
 *     gave it. The section will place it in quotation marks.
 *  2. Where the wording has been shortened or rephrased, use `account`
 *     instead. The section renders that without quotation marks so it is never
 *     presented as a direct quotation.
 *
 * The list ships empty: no wording could be confirmed against an official
 * source, and nothing on this page is invented.
 * ---------------------------------------------------------------------------
 */
export interface Testimonial {
  name: string;
  location?: string;
  /** Reproduced exactly. Rendered in quotation marks. */
  quote?: string;
  /** Shortened or rephrased. Rendered without quotation marks. */
  account?: string;
}

export const TESTIMONIALS: Testimonial[] = [];

/**
 * Descriptions of what previous participants have reported, drawn from the
 * approved wording for this excursion. They are deliberately unattributed.
 */
export interface Response {
  line: string;
  register: string;
}

export const RESPONSES: Response[] = [
  { line: 'Warmth moving through the body.', register: 'Reported response' },
  { line: 'Tingling, lightness, or unusual stillness.', register: 'Reported response' },
  { line: 'An emotional release they did not expect.', register: 'Reported response' },
  {
    line: 'A first understanding of what Qi means, because the environment was experienced directly.',
    register: 'Reported response',
  },
  { line: 'Tranquillity, and renewed energy carried home.', register: 'Reported response' },
];
