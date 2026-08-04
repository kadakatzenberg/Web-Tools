/**
 * Renders the real-world layer of the page from vendored Natural Earth data.
 *
 * Everything drawn here is measured geography: the named ranges, plateaus and
 * basins of the region, surveyed summit elevations, river centrelines, world
 * coastlines and urban footprints. Nothing is invented, and no coordinate is
 * moved to make a nicer picture.
 *
 * Source: Natural Earth, public domain. See ASSET_SOURCES.md.
 * Output: public/media/photos/<name>-<width>.{avif,webp}
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const geo = new URL('./geodata/', import.meta.url).pathname;
const out = new URL('../public/media/photos/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const read = (file) => JSON.parse(readFileSync(`${geo}${file}`, 'utf8'));
const landforms = read('landforms.json');
const summits = read('summits.json');
const rivers = read('rivers.json');
const land = read('land.json');
const urban = read('urban.json');

const WIDTHS = [640, 1024, 1600];

// The page palette. Kept in step with src/styles/tokens.css.
const INK = '#06070a';
// Charts are drawn on a lifted floor so they read as objects on the page.
const PLATE_FLOOR = '#0d1017';
const GOLD = '#c9a24a';
const GOLD_HI = '#ecd396';
const GOLD_DIM = '#7f6a30';
const CRIMSON = '#e05a50';
const CRIMSON_DEEP = '#a3161d';
const PAPER = '#ddd8ce';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* --- projections ---------------------------------------------------------- */

/** Equirectangular, scaled so the region fills the frame without distortion. */
function regional({ west, east, south, north }, width, height) {
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const spanX = (east - west) * Math.cos(midLat);
  const spanY = north - south;
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = ([lon, lat]) => [
    offsetX + (lon - west) * Math.cos(midLat) * scale,
    offsetY + (north - lat) * scale,
  ];
  project.visible = () => true;
  return project;
}

/** Orthographic. The far hemisphere is reported invisible so it can be cut. */
function orthographic(lon0, lat0, width, height, radius) {
  const rad = Math.PI / 180;
  const l0 = lon0 * rad;
  const p0 = lat0 * rad;
  const cx = width / 2;
  const cy = height / 2;
  const front = ([lon, lat]) => {
    const l = lon * rad;
    const p = lat * rad;
    return Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0) >= 0;
  };
  const project = ([lon, lat]) => {
    const l = lon * rad;
    const p = lat * rad;
    return [cx + radius * Math.cos(p) * Math.sin(l - l0), cy - radius * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0))];
  };
  project.visible = front;
  return project;
}

/* --- geometry to path ----------------------------------------------------- */

/**
 * Splits a ring wherever it crosses behind the globe, and wherever consecutive
 * points jump implausibly far across the frame. The second case is the
 * antimeridian: a shape that wraps from +180 to -180 would otherwise be drawn
 * as a line straight across the map.
 */
function ringToPath(ring, project, close, maxJump = Infinity) {
  const segments = [];
  let current = [];
  let previous = null;
  const flush = () => {
    if (current.length > 1) segments.push(current);
    current = [];
  };
  for (const point of ring) {
    if (!project.visible(point)) {
      flush();
      previous = null;
      continue;
    }
    const [x, y] = project(point);
    if (previous && Math.hypot(x - previous[0], y - previous[1]) > maxJump) flush();
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    previous = [x, y];
  }
  flush();
  return segments
    .map((s) => `M${s.join('L')}${close && s.length > 2 ? 'Z' : ''}`)
    .join('');
}

/** Keeps only labels that are far enough apart to be read. */
function declutter(items, project, minDistance, reserved = []) {
  const placed = reserved.map((r) => project([r.lon, r.lat]));
  return items.filter((item) => {
    const [x, y] = project([item.lon, item.lat]);
    if (placed.some(([px, py]) => Math.hypot(x - px, y - py) < minDistance)) return false;
    placed.push([x, y]);
    return true;
  });
}

/**
 * `forceOpen` matters for clipped polygons. A ring cut by the globe's limb has
 * to be closed to fill correctly, but closing it also draws a straight chord
 * back to the start, which strokes as a scratch across the disc. Fill and
 * stroke are therefore drawn from two different paths.
 */
function toPath(geometry, project, maxJump, forceOpen = false) {
  const { type, coordinates } = geometry;
  const closed = !forceOpen && (type === 'Polygon' || type === 'MultiPolygon');
  const depth = { LineString: 0, MultiLineString: 1, Polygon: 1, MultiPolygon: 2 }[type];
  if (depth === undefined) return '';
  const collect = (coords, level) =>
    level === 0
      ? ringToPath(coords, project, closed, maxJump)
      : coords.map((c) => collect(c, level - 1)).join('');
  return collect(coordinates, depth);
}

/* --- shared chrome -------------------------------------------------------- */

function graticule(project, step, { west, east, south, north }, opacity, colour, maxJump = Infinity, centreLon = null) {
  const lines = [];
  for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step) {
    if (centreLon !== null) {
      const delta = Math.abs(((lon - centreLon + 540) % 360) - 180);
      if (Math.abs(180 - delta) > 74) continue;
    }
    const ring = [];
    for (let lat = south; lat <= north; lat += 2) ring.push([lon, lat]);
    lines.push(ringToPath(ring, project, false, maxJump));
  }
  for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) {
    const ring = [];
    for (let lon = west; lon <= east; lon += 2) ring.push([lon, lat]);
    lines.push(ringToPath(ring, project, false, maxJump));
  }
  return `<g stroke="${colour}" stroke-width="0.6" fill="none" opacity="${opacity}">${lines
    .filter(Boolean)
    .map((d) => `<path d="${d}"/>`)
    .join('')}</g>`;
}

const grade = (name) => ({
  atlas: { tint: [12, 14, 20], grain: 9 },
  chart: { tint: [10, 13, 20], grain: 8 },
  systems: { tint: [22, 10, 12], grain: 10 },
}[name]);

async function grainTile(width, height, strength) {
  const size = width * height * 3;
  const data = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i += 3) {
    const v = 128 + (Math.random() - 0.5) * strength * 2;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const only = new Set(process.argv.slice(2));
const manifest = JSON.parse(
  readFileSync(new URL('../src/content/geo-manifest.json', import.meta.url).pathname, 'utf8'),
);

async function emit(name, width, height, svg, gradeName, alt) {
  if (only.size && !only.has(name)) return;
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const g = grade(gradeName);
  const composed = await sharp(base)
    .modulate({ brightness: 1.14 })
    .linear(1.18, -6)
    .composite([
      { input: await grainTile(width, height, g.grain), blend: 'overlay' },
      {
        input: {
          create: {
            width,
            height,
            channels: 4,
            background: { r: g.tint[0], g: g.tint[1], b: g.tint[2], alpha: 0.14 },
          },
        },
        blend: 'soft-light',
      },
    ])
    .toBuffer();

  for (const w of WIDTHS) {
    const resized = sharp(composed).resize(w, null, { withoutEnlargement: false });
    await resized.clone().avif({ quality: 54, effort: 5 }).toFile(`${out}${name}-${w}.avif`);
    await resized.clone().webp({ quality: 76, effort: 5 }).toFile(`${out}${name}-${w}.webp`);
  }
  manifest[name] = { widths: WIDTHS, ratio: `${width} / ${height}`, alt };
  console.log(`  ${name.padEnd(16)} ${width}x${height} at ${WIDTHS.join(', ')}`);
}

/* --- 1. The range atlas --------------------------------------------------- */
{
  const W = 1600;
  const H = 1000;
  const box = { west: 73, east: 135, south: 20, north: 52 };
  const p = regional(box, W, H);

  const byKind = (kind) => landforms.features.filter((f) => f.properties.kind === kind);
  const paint = (features, fill, stroke, fillOpacity) =>
    features
      .map((f) => `<path d="${toPath(f.geometry, p)}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="0.9" stroke-opacity="0.55"/>`)
      .join('');

  // The ranges classical landform practice descends from, named on the plate.
  const anchors = ['Kunlun Mountains', 'Tian Shan', 'Qinling Mountains', 'Taihang Mountains', 'Himalayas', 'Altun Mountains', 'Nan Ling Mountains', 'Wuyi Mountains', 'Greater Khingan Range', 'Qilian Mountains'];
  const labelled = landforms.features.filter((f) =>
    anchors.some((a) => (f.properties.name ?? '').toLowerCase().startsWith(a.toLowerCase().slice(0, 9))),
  );

  const inFrame = summits.filter(
    (s) => s.lon >= box.west && s.lon <= box.east && s.lat >= box.south && s.lat <= box.north,
  );
  const top = inFrame.slice(0, 22);
  // Summit labels avoid each other and the range names already on the plate.
  const named = declutter(inFrame, p, 132, labelled.map((f) => f.properties)).slice(0, 9);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="vig" cx="50%" cy="48%" r="76%">
        <stop offset="55%" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${INK}" stop-opacity="0.62"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PLATE_FLOOR}"/>
    ${graticule(p, 5, box, 0.13, '#3c4654')}
    <g>
      ${paint(byKind('Basin'), '#0d1017', '#28303c', 1)}
      ${paint(byKind('Plain'), '#0c1016', '#242c38', 1)}
      ${paint(byKind('Plateau'), GOLD_DIM, '#6d5c2c', 0.26)}
      ${paint(byKind('Range/mtn'), GOLD, GOLD_HI, 0.46)}
    </g>
    <g stroke="#6f8ea6" stroke-width="1.3" fill="none" opacity="0.8">
      ${rivers.features.map((f) => `<path d="${toPath(f.geometry, p)}"/>`).join('')}
    </g>
    <g>
      ${top
        .map((s) => {
          const [x, y] = p([s.lon, s.lat]);
          return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
            <path d="M-5 4 L0 -5 L5 4 Z" fill="none" stroke="${GOLD_HI}" stroke-width="1.1" opacity="0.85"/>
          </g>`;
        })
        .join('')}
    </g>
    <g font-family="DejaVu Sans Mono, monospace" font-size="13" fill="${GOLD_HI}" opacity="0.9">
      ${named
        .map((s) => {
          const [x, y] = p([s.lon, s.lat]);
          return `<text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}" letter-spacing="1">${esc(s.name)} ${s.elevation}m</text>`;
        })
        .join('')}
    </g>
    <g font-family="DejaVu Sans, sans-serif" font-size="17" fill="${PAPER}" opacity="0.72" letter-spacing="2.4">
      ${labelled
        .map((f) => {
          const [x, y] = p([f.properties.lon, f.properties.lat]);
          return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(
            (f.properties.name ?? '').toUpperCase(),
          )}</text>`;
        })
        .join('')}
    </g>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <g font-family="DejaVu Sans Mono, monospace" font-size="12" fill="${GOLD}" opacity="0.6" letter-spacing="3">
      <text x="34" y="${H - 30}">NAMED RANGES, PLATEAUX AND BASINS OF THE REGION</text>
      <text x="${W - 34}" y="${H - 30}" text-anchor="end">SOURCE: NATURAL EARTH, PUBLIC DOMAIN</text>
    </g>
  </svg>`;

  await emit('range-atlas', W, H, svg, 'atlas',
    'Topographic chart of the named mountain ranges, plateaux and basins of the region, with surveyed summit elevations marked.');
}

/* --- 2. The meridian chart ------------------------------------------------ */
{
  const W = 1400;
  const H = 1050;
  const box = { west: 96, east: 124, south: 22, north: 42 };
  const p = regional(box, W, H);
  const inBox = (f) =>
    f.properties.lon >= box.west && f.properties.lon <= box.east &&
    f.properties.lat >= box.south && f.properties.lat <= box.north;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="vig2" cx="50%" cy="50%" r="72%">
        <stop offset="50%" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${INK}" stop-opacity="0.66"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PLATE_FLOOR}"/>
    ${graticule(p, 2, box, 0.2, '#3a4452')}
    <g>
      ${landforms.features
        .filter(inBox)
        .map((f) => `<path d="${toPath(f.geometry, p)}" fill="${GOLD}" fill-opacity="0.22" stroke="${GOLD_HI}" stroke-width="1.6" stroke-opacity="0.9"/>`)
        .join('')}
    </g>
    <g stroke="#93b6cc" stroke-width="2.1" fill="none" opacity="0.95" stroke-linecap="round">
      ${rivers.features.map((f) => `<path d="${toPath(f.geometry, p)}"/>`).join('')}
    </g>
    <g stroke="${GOLD_HI}" stroke-width="0.7" opacity="0.4">
      ${Array.from({ length: 13 }, (_, i) => {
        const y = (H / 13) * (i + 0.5);
        return `<path d="M0 ${y.toFixed(0)} H${W}" stroke-dasharray="2 16"/>`;
      }).join('')}
    </g>
    <rect width="${W}" height="${H}" fill="url(#vig2)"/>
    <g font-family="DejaVu Sans Mono, monospace" font-size="12" fill="${GOLD}" opacity="0.62" letter-spacing="3">
      <text x="30" y="${H - 28}">WATERCOURSES AND LANDFORM AGAINST THE GRATICULE</text>
    </g>
  </svg>`;

  await emit('meridian-chart', W, H, svg, 'chart',
    'Analytical chart of watercourses and landform boundaries plotted against a two degree graticule.');
}

/* --- 3. The approach ------------------------------------------------------ */
{
  const W = 1200;
  const H = 1500;
  const box = { west: 103, east: 119, south: 23, north: 35 };
  const p = regional(box, W, H);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${INK}" stop-opacity="0.72"/>
        <stop offset="34%" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="72%" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${INK}" stop-opacity="0.76"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PLATE_FLOOR}"/>
    ${graticule(p, 1, box, 0.14, '#39424f')}
    <g>
      ${landforms.features
        .map((f) => `<path d="${toPath(f.geometry, p)}" fill="${GOLD_DIM}" fill-opacity="0.5" stroke="${GOLD_HI}" stroke-width="2" stroke-opacity="0.9"/>`)
        .join('')}
    </g>
    <g stroke="#a3c6dc" stroke-width="3" fill="none" opacity="1" stroke-linecap="round">
      ${rivers.features.map((f) => `<path d="${toPath(f.geometry, p)}"/>`).join('')}
    </g>
    <rect width="${W}" height="${H}" fill="url(#fade)"/>
    <g font-family="DejaVu Sans Mono, monospace" font-size="12" fill="${GOLD}" opacity="0.55" letter-spacing="3">
      <text x="28" y="${H - 26}">WATER GATHERS BEFORE THE GROUND OPENS</text>
    </g>
  </svg>`;

  await emit('approach-chart', W, H, svg, 'chart',
    'Close survey of a river system threading between landform boundaries, drawn at one degree spacing.');
}

/* --- 4. The world, twice -------------------------------------------------- */
/**
 * The same measured world is drawn in two registers. Cool and neutral it is
 * the modern world the journey departs from; crimson it is the same world under
 * pressure, at the close. Only the palette changes, never the data.
 */
{
  const W = 1600;
  const H = 900;
  const box = { west: -180, east: 180, south: -60, north: 84 };
  const p = regional(box, W, H);

  // Urban footprints stand in for density. Rank drives radius, so the largest
  // agglomerations read first, exactly as Natural Earth ranks them.
  const dots = urban
    .map((u) => {
      const [x, y] = p([u.lon, u.lat]);
      return { x, y, r: Math.max(1.1, (9 - u.rank) * 0.9) };
    })
    .filter((d) => d.x >= 0 && d.x <= W && d.y >= 0 && d.y <= H);

  const world = ({ id, grid, landFill, coast, dot, halo, ink, caption }) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="${id}" cx="50%" cy="50%" r="74%">
        <stop offset="46%" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${INK}" stop-opacity="0.94"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PLATE_FLOOR}"/>
    ${graticule(p, 15, box, 0.16, grid)}
    <g>
      ${land.features.map((f) => `<path d="${toPath(f.geometry, p, W * 0.5)}" fill="${landFill}" stroke="none"/>`).join('')}
      ${land.features.map((f) => `<path d="${toPath(f.geometry, p, W * 0.5, true)}" fill="none" stroke="${coast}" stroke-width="0.8" stroke-opacity="0.7"/>`).join('')}
    </g>
    <g fill="${dot}" opacity="0.72">
      ${dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}"/>`).join('')}
    </g>
    <g fill="${halo}" opacity="0.16">
      ${dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${(d.r * 3.4).toFixed(1)}"/>`).join('')}
    </g>
    <rect width="${W}" height="${H}" fill="url(#${id})"/>
    ${
      caption
        ? `<g font-family="DejaVu Sans Mono, monospace" font-size="12" fill="${ink}" opacity="0.58" letter-spacing="3">
      <text x="32" y="${H - 28}">${caption}</text>
      <text x="${W - 32}" y="${H - 28}" text-anchor="end">SOURCE: NATURAL EARTH, PUBLIC DOMAIN</text>
    </g>`
        : ''
    }
  </svg>`;

  await emit('world-departure', W, H,
    world({
      id: 'vigA', grid: '#2c3644', landFill: '#0b0d12', coast: '#46536a',
      dot: '#8f9db4', halo: '#7c8ba3', ink: GOLD,
      caption: 'THE WORLD LEFT BEHIND FOR SIX DAYS',
    }),
    'chart',
    'World coastline with every built up area in the source dataset marked, drawn cool and quiet.');

  await emit('world-systems', W, H,
    world({
      id: 'vigB', grid: '#4a2a2c', landFill: '#12080a', coast: CRIMSON_DEEP,
      dot: CRIMSON, halo: CRIMSON, ink: CRIMSON,
      caption: '',
    }),
    'systems',
    'The same world coastline and built up areas, drawn under a red cast.');
}

/* --- 5. The globe --------------------------------------------------------- */
{
  const W = 1200;
  const H = 1200;
  const R = 470;
  const p = orthographic(104, 30, W, H, R);
  const box = { west: -180, east: 180, south: -88, north: 88 };

  const dots = urban
    .filter((u) => p.visible([u.lon, u.lat]))
    .map((u) => {
      const [x, y] = p([u.lon, u.lat]);
      return { x, y, r: Math.max(0.9, (9 - u.rank) * 0.75) };
    });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="limb" cx="50%" cy="50%" r="50%">
        <stop offset="82%" stop-color="${CRIMSON}" stop-opacity="0"/>
        <stop offset="97%" stop-color="${CRIMSON}" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="${CRIMSON}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="shade" cx="36%" cy="32%" r="78%">
        <stop offset="0%" stop-color="#1a1216" stop-opacity="1"/>
        <stop offset="100%" stop-color="#050406" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${PLATE_FLOOR}"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="${R}" fill="url(#shade)"/>
    ${graticule(p, 15, box, 0.24, '#4b3034', R * 0.5, 104)}
    <g>
      ${land.features
        .map((f) => `<path d="${toPath(f.geometry, p, R * 0.5)}" fill="#140b0d" stroke="none"/>`)
        .join('')}
      ${land.features
        .map((f) => `<path d="${toPath(f.geometry, p, R * 0.5, true)}" fill="none" stroke="${CRIMSON_DEEP}" stroke-width="1" stroke-opacity="0.85"/>`)
        .join('')}
    </g>
    <g fill="${CRIMSON}" opacity="0.7">
      ${dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}"/>`).join('')}
    </g>
    <circle cx="${W / 2}" cy="${H / 2}" r="${R}" fill="url(#limb)"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="${R}" fill="none" stroke="${CRIMSON}" stroke-width="1.2" opacity="0.42"/>
  </svg>`;

  await emit('orbital', W, H, svg, 'systems',
    'The planet drawn on an orthographic projection centred on the region, coastlines and built up areas picked out.');
}

writeFileSync(
  new URL('../src/content/geo-manifest.json', import.meta.url).pathname,
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`\nWrote ${Object.keys(manifest).length} plates and src/content/geo-manifest.json`);
