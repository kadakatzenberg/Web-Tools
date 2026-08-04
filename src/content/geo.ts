import manifest from './geo-manifest.json';

/**
 * ---------------------------------------------------------------------------
 * THE MEASURED LAYER
 * ---------------------------------------------------------------------------
 * The page draws on three kinds of imagery.
 *
 *  - The mythic layer is the procedural landscape: the live shader and the
 *    still plates captured from it.
 *  - The measured layer is this one. Every plate is drawn from Natural Earth,
 *    which is public domain: named ranges, plateaux and basins of the region,
 *    surveyed summit elevations, river centrelines, world coastlines and
 *    recorded urban footprints. No coordinate is moved and no feature is
 *    invented. `scripts/build-geo.mjs` renders them; `scripts/fetch-geodata.mjs`
 *    refreshes the source data.
 *  - The human layer is photography, in `photos.ts`.
 *
 * Provenance for everything here is recorded in ASSET_SOURCES.md and
 * public/asset-sources.json.
 * ---------------------------------------------------------------------------
 */

export interface GeoPlate {
  widths: number[];
  ratio: string;
  alt: string;
}

const plates = manifest as Record<string, GeoPlate>;

export function geoPlateInfo(name: string): GeoPlate | undefined {
  return plates[name];
}

export function hasGeoPlate(name: string): boolean {
  return name in plates;
}
