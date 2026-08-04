/**
 * Downloads the Natural Earth layers the page draws from, trims them to what is
 * actually used, and vendors the result into scripts/geodata/.
 *
 * Natural Earth is public domain: "No permission is needed to use Natural
 * Earth. Crediting the authors is unnecessary." The trimmed files are committed
 * so `npm run geo` renders offline and the build never reaches the network.
 *
 * Run this again only to refresh the source data.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const out = new URL('./geodata/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

/** The window the regional charts are drawn through. */
const ASIA = { west: 71, east: 137, south: 17, north: 55 };

const round = (n, places = 2) => Number(n.toFixed(places));

/** Drops vertices below the resolution the plates are rendered at. */
function decimate(ring, places, keepEvery) {
  const kept = ring.filter((_, i) => i % keepEvery === 0 || i === ring.length - 1);
  const source = kept.length >= 4 ? kept : ring;
  return source.map(([x, y]) => [round(x, places), round(y, places)]);
}

function thinGeometry(geometry, places, keepEvery) {
  const walk = (coords, depth) =>
    depth === 0 ? decimate(coords, places, keepEvery) : coords.map((c) => walk(c, depth - 1));
  const depth = { LineString: 0, MultiLineString: 1, Polygon: 1, MultiPolygon: 2 }[geometry.type];
  if (depth === undefined) return geometry;
  return { type: geometry.type, coordinates: walk(geometry.coordinates, depth) };
}

function centroid(geometry) {
  const points = [];
  const walk = (c) => {
    if (typeof c[0] === 'number') points.push(c);
    else c.forEach(walk);
  };
  walk(geometry.coordinates);
  if (!points.length) return null;
  const x = points.reduce((a, p) => a + p[0], 0) / points.length;
  const y = points.reduce((a, p) => a + p[1], 0) / points.length;
  return [x, y];
}

const inAsia = ([x, y]) =>
  x >= ASIA.west && x <= ASIA.east && y >= ASIA.south && y <= ASIA.north;

async function grab(name) {
  const response = await fetch(`${BASE}/${name}.geojson`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const write = (file, value) => {
  const path = `${out}${file}`;
  writeFileSync(path, JSON.stringify(value));
  const kb = (JSON.stringify(value).length / 1024).toFixed(0);
  console.log(`  ${file.padEnd(22)} ${String(value.features?.length ?? value.length).padStart(5)} features  ${kb} kB`);
};

console.log('Fetching Natural Earth (public domain)...');

// --- Named landforms of the region -----------------------------------------
{
  const raw = await grab('ne_10m_geography_regions_polys');
  const want = new Set(['Range/mtn', 'Plateau', 'Basin', 'Plain']);
  const features = raw.features
    .filter((f) => want.has(f.properties.FEATURECLA))
    .map((f) => ({ f, c: centroid(f.geometry) }))
    .filter(({ c }) => c && inAsia(c))
    .map(({ f, c }) => ({
      type: 'Feature',
      properties: {
        kind: f.properties.FEATURECLA,
        name: f.properties.NAME_EN || f.properties.NAME,
        lon: round(c[0]),
        lat: round(c[1]),
      },
      geometry: thinGeometry(f.geometry, 2, 3),
    }));
  write('landforms.json', { type: 'FeatureCollection', features });
}

// --- Named summits, with their surveyed elevations --------------------------
{
  const raw = await grab('ne_10m_geography_regions_elevation_points');
  const features = raw.features
    .filter((f) => f.geometry?.type === 'Point' && inAsia(f.geometry.coordinates))
    .filter((f) => f.properties.elevation)
    .map((f) => ({
      name: f.properties.name_en || f.properties.name,
      elevation: f.properties.elevation,
      lon: round(f.geometry.coordinates[0], 3),
      lat: round(f.geometry.coordinates[1], 3),
    }))
    .sort((a, b) => b.elevation - a.elevation);
  write('summits.json', features);
}

// --- Watercourses -----------------------------------------------------------
{
  const raw = await grab('ne_50m_rivers_lake_centerlines');
  const features = raw.features
    .filter((f) => {
      const c = centroid(f.geometry);
      return c && inAsia(c);
    })
    .map((f) => ({
      type: 'Feature',
      properties: { name: f.properties.name_en || f.properties.name || null },
      geometry: thinGeometry(f.geometry, 2, 2),
    }));
  write('rivers.json', { type: 'FeatureCollection', features });
}

// --- The world, for the closing sequence ------------------------------------
{
  const raw = await grab('ne_110m_land');
  write('land.json', {
    type: 'FeatureCollection',
    features: raw.features.map((f) => ({
      type: 'Feature',
      properties: {},
      geometry: thinGeometry(f.geometry, 1, 2),
    })),
  });
}

// --- Urban footprints, as a density field -----------------------------------
{
  const raw = await grab('ne_50m_urban_areas');
  const points = raw.features
    .map((f) => {
      const c = centroid(f.geometry);
      return c ? { lon: round(c[0], 1), lat: round(c[1], 1), rank: f.properties.scalerank ?? 8 } : null;
    })
    .filter(Boolean);
  write('urban.json', points);
}

if (!existsSync(`${out}land.json`)) throw new Error('geodata was not written');
console.log('Vendored into scripts/geodata/. Run `npm run geo` to render the plates.');
