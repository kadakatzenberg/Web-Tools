import { describe, expect, it } from 'vitest';
import { projectToScreen } from '@/starmap/labels';
import type { Camera } from '@/starmap/renderer';

/**
 * The star map's label layer and its WebGL layer have to agree on where a node
 * is, and they reach that answer by different routes: the shader converts to
 * NDC, which is y-up, while the label canvas draws in CSS pixels, which are
 * y-down.
 *
 * The first two attempts at this shipped with the flip missing. It does not
 * look like a mirror when it is wrong — labels near the vertical centre land
 * almost exactly right, and the rest drift by an amount that grows with
 * distance from the middle, which reads as a random offset. These are the
 * cases that would have caught it.
 */

const IDENTITY: Camera = { x: 0, y: 0, scale: 1 };

describe('projectToScreen', () => {
  it('puts the world origin at the centre of the viewport', () => {
    expect(projectToScreen({ x: 0, y: 0 }, IDENTITY, 1440, 900)).toEqual({ x: 720, y: 450 });
  });

  it('inverts the vertical axis', () => {
    // World y-up: a node *above* the origin has positive y and must land
    // *above* the centre line, which is a smaller canvas y.
    const above = projectToScreen({ x: 0, y: 100 }, IDENTITY, 1440, 900);
    const below = projectToScreen({ x: 0, y: -100 }, IDENTITY, 1440, 900);

    expect(above.y).toBe(350);
    expect(below.y).toBe(550);
    expect(above.y).toBeLessThan(below.y);
  });

  it('leaves the horizontal axis alone', () => {
    expect(projectToScreen({ x: 100, y: 0 }, IDENTITY, 1440, 900).x).toBe(820);
    expect(projectToScreen({ x: -100, y: 0 }, IDENTITY, 1440, 900).x).toBe(620);
  });

  it('is exact on the centre line whatever the flip', () => {
    // Precisely why the bug survived being looked at twice.
    const camera: Camera = { x: 0, y: 0, scale: 2.5 };
    expect(projectToScreen({ x: 40, y: 0 }, camera, 1440, 900).y).toBe(450);
  });

  it('applies scale before translation, as the vertex shader does', () => {
    const camera: Camera = { x: -50, y: 30, scale: 2 };
    const at = projectToScreen({ x: 10, y: 10 }, camera, 1000, 600);
    // x: 10*2 + -50 + 500
    expect(at.x).toBe(470);
    // y: 300 - (10*2 + 30)
    expect(at.y).toBe(250);
  });

  it('round-trips against the inverse used for hit testing', () => {
    // StarMap.toWorld is the inverse; the two must not drift apart.
    const camera: Camera = { x: -211, y: -44, scale: 0.4 };
    const width = 1440;
    const height = 900;
    const world = { x: 137, y: -388 };

    const screen = projectToScreen(world, camera, width, height);

    // toWorld: centred, y-up.
    const cx = screen.x - width / 2;
    const cy = height / 2 - screen.y;
    const back = { x: (cx - camera.x) / camera.scale, y: (cy - camera.y) / camera.scale };

    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it('handles a wide range of cameras without producing NaN', () => {
    for (const scale of [0.05, 0.4, 1, 3.7, 8]) {
      for (const [cx, cy] of [
        [0, 0],
        [-2000, 1500],
        [900, -400],
      ] as const) {
        const at = projectToScreen({ x: -820, y: 640 }, { x: cx, y: cy, scale }, 1280, 800);
        expect(Number.isFinite(at.x)).toBe(true);
        expect(Number.isFinite(at.y)).toBe(true);
      }
    }
  });
});
