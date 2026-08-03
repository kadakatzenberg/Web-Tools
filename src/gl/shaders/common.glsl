// Shared noise, terrain description and palette. Prepended to the passes that
// need to agree on where the mountains are.

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  return fract(p * (p + p));
}

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Value noise with analytic derivatives. The gradient is what lets the terrain
 * damp its own detail on steep ground, which is the difference between a
 * mountain range and a field of noise.
 */
vec3 noised(vec2 x) {
  vec2 p = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash21(p);
  float b = hash21(p + vec2(1.0, 0.0));
  float c = hash21(p + vec2(0.0, 1.0));
  float d = hash21(p + vec2(1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;

  return vec3(
    k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
    du.x * (k1 + k3 * u.y),
    du.y * (k2 + k3 * u.x)
  );
}

float fbm(vec2 p, int octaves) {
  float total = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    total += vnoise(p) * amp;
    p = rot * p * 2.03 + 7.31;
    amp *= 0.5;
  }
  return total;
}

// The spine of the range. Every other feature is positioned relative to it,
// which is what gives the landscape a readable direction of travel.
float spineZ(float x) {
  return 26.0 * sin(x * 0.0125) + 9.0 * sin(x * 0.031 + 1.9) + 4.0 * sin(x * 0.071 - 0.6);
}

// The watercourse. It approaches the sanctuary from the open side and leaves
// again, which is what completes the formation.
float riverZ(float x) {
  return spineZ(x) * 0.32 - 47.0 + 13.0 * sin(x * 0.021 + 0.4) + 5.0 * sin(x * 0.058 + 2.2);
}

const vec2 SANCTUARY = vec2(0.0, 6.9);
const float SANCTUARY_RADIUS = 58.0;
