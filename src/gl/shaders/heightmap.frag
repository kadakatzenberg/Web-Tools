#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uWorldOrigin;
uniform vec2 uWorldSize;

// COMMON

const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

/**
 * Eroded relief. Each octave is divided down by the accumulated gradient, so
 * detail collapses on slopes that are already steep and survives on the flats.
 * The result has valleys that drain and crests that hold a line.
 */
float erodedFbm(vec2 x, int octaves) {
  float total = 0.0;
  float amp = 1.0;
  vec2 gradient = vec2(0.0);
  mat2 basis = mat2(1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= octaves) break;
    vec3 n = noised(x);
    gradient += basis * n.yz;
    total += amp * n.x / (1.0 + dot(gradient, gradient));
    amp *= 0.52;
    x = ROT * x * 2.0;
    basis = ROT * basis * 2.0;
  }
  return total;
}

/** A separate sharpened pass used only to firm up the crest line. */
float crestFbm(vec2 p, int octaves) {
  float total = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    total += n * n * amp;
    p = ROT * p * 2.11 + 3.7;
    amp *= 0.5;
  }
  return total;
}

void main() {
  vec2 world = uWorldOrigin + vUv * uWorldSize;

  // Warping the domain before the ridges are built stops the range reading as
  // parallel folds and gives it the wandering line a real massif has.
  vec2 warp = vec2(fbm(world * 0.0055, 3), fbm(world * 0.0055 + 41.7, 3)) - 0.5;
  vec2 shaped = world + warp * 62.0;

  float base = erodedFbm(shaped * 0.0122, 7);
  float crestNoise = crestFbm(shaped * 0.0155, 4);
  float broad = fbm(world * 0.0042, 4);

  // Mass concentrated along the spine, thinning into foothills either side.
  float dSpine = abs(world.y - spineZ(world.x));
  float massif = exp(-dSpine * dSpine / (2.0 * 78.0 * 78.0));
  float crest = exp(-dSpine * dSpine / (2.0 * 30.0 * 30.0));

  // The range steps back around the site, which is what allows a basin to
  // exist inside a massif rather than another summit.
  float toSite = length(world - SANCTUARY);
  float clearing = exp(-toSite * toSite / (2.0 * 74.0 * 74.0));
  massif *= 1.0 - 0.62 * clearing;
  crest *= 1.0 - 0.85 * clearing;

  // A second range further back gives the horizon something to hold.
  float dBack = abs(world.y - (spineZ(world.x * 0.7) + 172.0));
  float backRange = exp(-dBack * dBack / (2.0 * 62.0 * 62.0));

  float h = 6.0 + base * (22.0 + 126.0 * massif + 76.0 * backRange);
  h += crest * crestNoise * 18.0;
  h += broad * 22.0 * (0.3 + 0.7 * massif);

  // The sanctuary: ground level enough for Qi to settle on.
  vec2 d = world - SANCTUARY;
  float r = length(d);
  float ang = atan(d.y, d.x);

  float basin = smoothstep(48.0, 14.0, r);
  const float BASIN_LEVEL = 15.0;
  h = mix(h, BASIN_LEVEL + (h - BASIN_LEVEL) * 0.12, basin);

  // Mountains embracing it, opening toward the water in the south.
  float openness = 0.22 + 0.78 * smoothstep(-1.0, 0.45, cos(ang + PI * 0.5));
  float ringProfile = exp(-pow(r - SANCTUARY_RADIUS, 2.0) / (2.0 * 21.0 * 21.0));
  h += 74.0 * ringProfile * openness * (0.6 + 0.4 * sin(ang * 4.0 + 0.7));

  // The watercourse carves through.
  float dRiver = abs(world.y - riverZ(world.x));
  float channel = exp(-dRiver * dRiver / (2.0 * 11.0 * 11.0));
  h = mix(h, min(h, 2.6 - 1.4 * channel), channel * 0.94);

  // A shallow approach shelf so the camera has somewhere to stand.
  h -= 9.0 * exp(-pow(world.x + 118.0, 2.0) / (2.0 * 46.0 * 46.0));

  fragColor = vec4(h, 0.0, 0.0, 1.0);
}
