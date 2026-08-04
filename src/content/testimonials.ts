/**
 * ---------------------------------------------------------------------------
 * ATTRIBUTED ACCOUNTS
 * ---------------------------------------------------------------------------
 * Named accounts from previous excursions. The section renders these ahead of
 * the unattributed descriptions.
 *
 * Two rules apply to every entry:
 *
 *  1. `quote` is wording reproduced exactly as the person gave it. The section
 *     places it in quotation marks. Use it only when the wording has been read
 *     back against the source.
 *  2. `account` is wording that has been shortened or rephrased. The section
 *     renders it without quotation marks, so it is never presented as a direct
 *     quotation.
 *
 * `source` records where the wording was found. It does not render; it exists
 * so any claim on this page can be traced without leaving the codebase.
 *
 * Entries deliberately excluded:
 *
 *  - The scoliosis account, and any other medical-result account.
 *  - An unnamed 2020 account reporting that thirteen wishes came true. The
 *    wording is real, but it is unattributed and reads as an assured outcome.
 *  - Elvis Ang, Yi Tian, Marijana Gak, Jacqueline and Shirley T. Their accounts
 *    are referenced in the brief but appear in no reachable indexed source, so
 *    there is no wording to reproduce and nothing has been invented in their
 *    place. Add them here once the official wording is to hand.
 * ---------------------------------------------------------------------------
 */
export interface Testimonial {
  name: string;
  location?: string;
  /** Reproduced exactly. Rendered in quotation marks. */
  quote?: string;
  /** Shortened or rephrased. Rendered without quotation marks. */
  account?: string;
  /** Where the wording was found. Does not render. */
  source: string;
  /** Which excursion the account belongs to. Renders beside the name. */
  excursion?: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Yeo Ai Lee',
    location: 'Malaysia',
    excursion: 'Excursion 2019',
    quote:
      'This is the first time I felt my whole body trembling and full of Qi. Tears were falling down, and I was relieving all my past anguish and anxiety.',
    source:
      'Media OutReach Newswire, 10 May 2019. "Joey Yap Delivers An Ethereal Immersive Transformational Experience in Taiwan to over 200 Dedicated Feng Shui Enthusiasts"',
  },
  {
    name: 'Pamila Caparelli',
    excursion: 'China Excursion, second year',
    quote:
      "This is my second China Excursion with Joey. This one has been amazing thus far, we've seen landforms that completely give clarity to all the books that we've learned in Feng Shui 1, 2, 3 and 4 classes with Joey.",
    source: "masteryacademy.com, Joey Yap's Excursion Online, China",
  },
  {
    name: 'Patricia Lee',
    location: 'United States',
    excursion: 'Excursion 2019',
    quote:
      'The transformation is in you, and when you transform, you come to that place of knowing and being.',
    source:
      'Media OutReach Newswire, 10 May 2019. "Joey Yap Delivers An Ethereal Immersive Transformational Experience in Taiwan to over 200 Dedicated Feng Shui Enthusiasts"',
  },
  {
    name: 'MO Wong',
    excursion: 'China Excursion',
    account:
      'Encourages anyone drawn to Feng Shui to come and stand in front of the landforms themselves, rather than read about them.',
    source: "masteryacademy.com, Joey Yap's Excursion Online, China",
  },
];

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
