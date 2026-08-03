/**
 * Development only. Renders a single frame of the landscape with the camera
 * and mood supplied as query parameters, so still plates can be captured from
 * the same shader the live page runs. Not part of the production bundle.
 */
import { defaultState, Stage, type SceneState } from './gl/stage';
import type { Vec3 } from './gl/math';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement;

const num = (key: string, fallback: number): number => {
  const raw = params.get(key);
  return raw === null ? fallback : Number(raw);
};

const vec = (key: string, fallback: Vec3): Vec3 => {
  const raw = params.get(key);
  if (!raw) return fallback;
  const parts = raw.split(',').map(Number);
  return [parts[0] ?? fallback[0], parts[1] ?? fallback[1], parts[2] ?? fallback[2]];
};

const state: SceneState = defaultState();
state.camPos = vec('pos', [-132, 86, -306]);
state.camTarget = vec('target', [-34, 66, -132]);
const keys: Array<keyof SceneState> = [
  'fov',
  'mood',
  'vein',
  'meridian',
  'rings',
  'embrace',
  'waterLevel',
  'waterFade',
  'mist',
  'fracture',
  'goldPath',
  'dawn',
  'celestial',
  'exposure',
  'bloom',
  'chroma',
  'grain',
  'vignette',
  'instability',
  'flash',
  'particles',
];
for (const key of keys) {
  const value = params.get(key);
  if (value !== null) (state[key] as number) = Number(value);
}

const stage = Stage.create(canvas, (params.get('tier') as 'high') ?? 'high');
const marker = document.createElement('div');
marker.id = 'capture-ready';
marker.style.display = 'none';

if (!stage) {
  marker.dataset.error = 'no-webgl';
  document.body.append(marker);
} else {
  const width = num('w', window.innerWidth);
  const height = num('h', window.innerHeight);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  stage.resize(width, height, num('dpr', 2));
  const scale = num('scale', 0);
  if (scale > 0) stage.setRenderScale(scale, num('dpr', 2));
  stage.apply(state);

  // Advance a fixed number of frames so animated elements land in a known
  // place, then hold still for the screenshot.
  let frames = 0;
  const target = Math.max(1, num('frames', 26));
  stage.setFrameCallback(() => {
    frames += 1;
    if (frames >= target) {
      stage.stop();
      document.body.append(marker);
    }
  });
  stage.start();
}
