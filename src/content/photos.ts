import manifest from './photo-manifest.json';

/**
 * ---------------------------------------------------------------------------
 * THE HUMAN LAYER
 * ---------------------------------------------------------------------------
 * The procedural landscape carries the mythology. These photographs carry the
 * evidence: a real guide, real participants, real ground.
 *
 * Each role below names one photograph the page wants. Drop the source file
 * into `public/photos/` using the `file` name given here, then run:
 *
 *     npm run photos
 *
 * The ingest script produces art-directed crops, grades them to the page
 * palette, adds grain, and writes responsive AVIF and WebP into
 * `public/media/photos/`. It also rewrites `photo-manifest.json` with the roles
 * it found.
 *
 * Any role without a processed file falls back to the procedural plate named in
 * `fallback`, so the page is always complete. Nothing breaks while photography
 * is still being cleared.
 * ---------------------------------------------------------------------------
 */

export type Treatment = 'ink' | 'aperture' | 'strip' | 'field' | 'cutout' | 'stele';
export type Grade = 'mineral' | 'warm' | 'ash' | 'none';

export interface Crop {
  /** Suffix used in the generated filename. */
  name: string;
  /** Width divided by height. */
  ratio: number;
  /** Where sharp anchors the crop. */
  focus: 'centre' | 'north' | 'south' | 'east' | 'west' | 'attention' | 'entropy';
}

export interface PhotoRole {
  id: string;
  file: string;
  alt: string;
  treatment: Treatment;
  grade: Grade;
  crops: Crop[];
  /** Procedural plate used until the photograph is in place. */
  fallback: string;
  /** Describes the fallback plate, which shows something different. */
  fallbackAlt: string;
}

export const PHOTO_ROLES: PhotoRole[] = [
  {
    id: 'joey-figure',
    file: 'joey-figure.png',
    alt: "Dato' Joey Yap mid-explanation, marker in hand.",
    treatment: 'cutout',
    grade: 'none',
    crops: [{ name: 'full', ratio: 0.66, focus: 'north' }],
    fallback: '',
    fallbackAlt: '',
  },
  {
    id: 'joey-briefing',
    file: 'joey-briefing.jpg',
    alt: "Dato' Joey Yap briefing the excursion group at the start of a day on the land.",
    treatment: 'field',
    grade: 'mineral',
    crops: [
      { name: 'wide', ratio: 16 / 9, focus: 'east' },
      { name: 'portrait', ratio: 4 / 5, focus: 'east' },
    ],
    fallback: 'chapter-departure',
    fallbackAlt:
      'A wide valley floor falling away beneath low cloud, the range ahead barely visible through the haze.',
  },
  {
    id: 'group-temple',
    file: 'group-temple.jpg',
    alt: 'The excursion group gathered in a mountain temple courtyard.',
    treatment: 'ink',
    grade: 'mineral',
    crops: [
      { name: 'wide', ratio: 16 / 9, focus: 'centre' },
      { name: 'square', ratio: 1, focus: 'centre' },
    ],
    fallback: 'chapter-sacred',
    fallbackAlt:
      'A sheltered basin held by surrounding peaks, with fine points of light gathering above its centre.',
  },
  {
    id: 'meditation-stone',
    file: 'meditation-stone.jpg',
    alt: 'A participant sitting in meditation on bare rock beside a stone carved with the character for Dragon.',
    treatment: 'aperture',
    grade: 'warm',
    crops: [
      { name: 'wide', ratio: 3 / 2, focus: 'centre' },
      { name: 'portrait', ratio: 4 / 5, focus: 'centre' },
      { name: 'detail', ratio: 1, focus: 'east' },
    ],
    fallback: 'chapter-moment',
    fallbackAlt: 'A column of fine light rising from the land into the sky above the range.',
  },
  {
    id: 'terrain-reading',
    file: 'terrain-reading.jpg',
    alt: 'Joey reading a formation on the land with the group watching.',
    treatment: 'strip',
    grade: 'mineral',
    crops: [
      { name: 'wide', ratio: 16 / 9, focus: 'centre' },
      { name: 'portrait', ratio: 4 / 5, focus: 'centre' },
    ],
    fallback: 'chapter-reading',
    fallbackAlt: 'A valley seen from above, a watercourse tracing the floor between two slopes.',
  },
];

const available = new Set<string>(manifest.roles as string[]);

export function hasPhoto(id: string): boolean {
  return available.has(id);
}

export function photoRole(id: string): PhotoRole | undefined {
  return PHOTO_ROLES.find((role) => role.id === id);
}

/** Widths written for each crop. */
export const PHOTO_WIDTHS = [640, 1024, 1600] as const;
