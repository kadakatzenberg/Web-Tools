export type Vec3 = [number, number, number];

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/** Slightly softer than smoothstep at both ends. Used for camera easing. */
export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function lerpVec3(a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

function sub(a: Vec3, b: Vec3, out: Vec3): Vec3 {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

function cross(a: Vec3, b: Vec3, out: Vec3): Vec3 {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

const scratchF: Vec3 = [0, 0, 0];
const scratchR: Vec3 = [0, 0, 0];
const scratchU: Vec3 = [0, 0, 0];

/**
 * Writes the camera basis as three column vectors (right, up, forward) and
 * returns the same forward vector used to build the view matrix, so the
 * raymarched pass and the point sprites cannot drift apart.
 */
export function cameraBasis(pos: Vec3, target: Vec3, out: Float32Array): void {
  const forward = normalise(sub(target, pos, scratchF));
  const worldUp: Vec3 = [0, 1, 0];
  const right = normalise(cross(forward, worldUp, scratchR));
  const up = cross(right, forward, scratchU);

  out[0] = right[0];
  out[1] = right[1];
  out[2] = right[2];
  out[3] = up[0];
  out[4] = up[1];
  out[5] = up[2];
  out[6] = forward[0];
  out[7] = forward[1];
  out[8] = forward[2];
}

/** View-projection for the point sprite pass, matching the raymarched pinhole. */
export function viewProjection(
  pos: Vec3,
  basis: Float32Array,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
  out: Float32Array,
): void {
  const rx = basis[0]!;
  const ry = basis[1]!;
  const rz = basis[2]!;
  const ux = basis[3]!;
  const uy = basis[4]!;
  const uz = basis[5]!;
  const fx = basis[6]!;
  const fy = basis[7]!;
  const fz = basis[8]!;

  // The raymarched pass treats +forward as the viewing direction, so the view
  // matrix negates it to reach the -z convention the projection expects.
  const tx = -(rx * pos[0] + ry * pos[1] + rz * pos[2]);
  const ty = -(ux * pos[0] + uy * pos[1] + uz * pos[2]);
  const tz = fx * pos[0] + fy * pos[1] + fz * pos[2];

  const f = 1 / Math.tan(fovY / 2);
  const a = f / aspect;
  const nf = 1 / (near - far);
  const c = (far + near) * nf;
  const d = 2 * far * near * nf;

  // out = projection * view, stored column major for uniformMatrix4fv.
  out[0] = a * rx;
  out[1] = f * ux;
  out[2] = -c * fx;
  out[3] = fx;

  out[4] = a * ry;
  out[5] = f * uy;
  out[6] = -c * fy;
  out[7] = fy;

  out[8] = a * rz;
  out[9] = f * uz;
  out[10] = -c * fz;
  out[11] = fz;

  out[12] = a * tx;
  out[13] = f * ty;
  out[14] = c * tz + d;
  out[15] = -tz;
}
