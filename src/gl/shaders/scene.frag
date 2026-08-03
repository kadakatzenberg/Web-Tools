#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;

uniform vec3 uCamPos;
uniform mat3 uCamBasis;   // right, up, forward
uniform float uTanHalfFov;
uniform float uNear;
uniform float uFar;

uniform sampler2D uHeight;
uniform vec2 uWorldOrigin;
uniform vec2 uWorldSize;

uniform float uMood;       // 0 ceremonial, 1 contaminated
uniform float uVein;       // Qi travelling the spine
uniform float uMeridian;   // the settled point
uniform float uRings;      // surveying rings on the ground
uniform float uWaterLevel;
uniform float uWaterFade;
uniform float uMist;
uniform float uFracture;
uniform float uGoldPath;
uniform float uEmbrace;    // highlights the surrounding formation
uniform float uDawn;       // horizon light strength
uniform float uCelestial;  // the red body rising behind the range

// COMMON

float terrainRaw(vec2 w) {
  vec2 uv = (w - uWorldOrigin) / uWorldSize;
  uv = clamp(uv, vec2(0.0015), vec2(0.9985));
  return texture(uHeight, uv).r;
}

float terrainH(vec2 w) {
  float h = terrainRaw(w);
#if MICRO_DETAIL
  h += (vnoise(w * 0.24) - 0.5) * 0.9;
  h += (vnoise(w * 0.78) - 0.5) * 0.22;
#endif
  if (uFracture > 0.001) {
    vec2 cell = floor(w / 15.0);
    vec2 r = hash22(cell);
    h += (r.x - 0.42) * 17.0 * uFracture;
    h += sin(w.x * 0.35 + r.y * 6.2831) * 1.1 * uFracture;
  }
  return h;
}

vec3 terrainNormal(vec2 w, float dist) {
  // The sampling distance grows with range so distant crests are read from the
  // shape of the ridge rather than from grain that is smaller than a pixel.
  float e = clamp(dist * 0.0062, 0.25, 3.2);
  float hL = terrainH(w - vec2(e, 0.0));
  float hR = terrainH(w + vec2(e, 0.0));
  float hD = terrainH(w - vec2(0.0, e));
  float hU = terrainH(w + vec2(0.0, e));
  return normalize(vec3(hL - hR, 2.0 * e, hD - hU));
}

// --- palettes ---------------------------------------------------------------

vec3 accentColour() {
  vec3 gold = vec3(1.0, 0.72, 0.31);
  vec3 crimson = vec3(1.0, 0.20, 0.13);
  return mix(gold, crimson, uMood);
}

vec3 skyColour(vec3 rd) {
  float up = clamp(rd.y, -1.0, 1.0);
  vec3 high = mix(vec3(0.020, 0.026, 0.040), vec3(0.042, 0.014, 0.017), uMood);
  vec3 low = mix(vec3(0.145, 0.163, 0.184), vec3(0.190, 0.070, 0.058), uMood);
  vec3 col = mix(low, high, smoothstep(-0.05, 0.55, up));

  // A band of light where the range meets the sky.
  float horizon = exp(-abs(up) * 5.5);
  vec3 dawnCol = mix(vec3(0.52, 0.43, 0.30), vec3(0.68, 0.19, 0.11), uMood);
  col += dawnCol * horizon * 0.30 * uDawn;

  // The Blood Goat body. It does not flash or pulse: it simply becomes
  // larger, and everything else has to make room for it.
  if (uCelestial > 0.001) {
    vec3 toward = normalize(vec3(0.12, 0.30, 1.0));
    float ang = acos(clamp(dot(rd, toward), -1.0, 1.0));
    float radius = mix(0.05, 0.44, uCelestial);
    float limb = smoothstep(radius, radius * 0.965, ang);
    float centreward = clamp(1.0 - ang / max(radius, 1e-3), 0.0, 1.0);
    // Darker toward the edge, so it reads as a body with a far side rather
    // than a red sky.
    vec3 body = mix(vec3(0.14, 0.012, 0.010), vec3(0.78, 0.115, 0.060), pow(centreward, 1.35));
    // A slow turn across the surface, never fast enough to read as animation.
    float surface = fbm(vec2(rd.x * 5.0, rd.y * 5.0) + uTime * 0.012, 4);
    body *= 0.82 + 0.32 * surface;
    col = mix(col, body, limb * uCelestial);
    float rim = smoothstep(radius * 1.02, radius, ang) * smoothstep(radius * 0.94, radius, ang);
    col += vec3(0.9, 0.22, 0.12) * rim * uCelestial * 0.5;
    float corona = exp(-max(ang - radius, 0.0) * 6.5);
    col += vec3(0.30, 0.040, 0.028) * corona * uCelestial * 0.85;
  }

  // Stars, only in the upper reaches and only while the sky is still clean.
  if (up > 0.08) {
    vec2 sp = rd.xz / max(rd.y, 0.001) * 0.5;
    vec2 gp = floor(sp * 34.0);
    float star = hash21(gp);
    float twinkle = 0.5 + 0.5 * sin(uTime * 0.7 + star * 40.0);
    float spark = smoothstep(0.9955, 1.0, star) * twinkle;
    col += vec3(0.55, 0.6, 0.7) * spark * smoothstep(0.08, 0.5, up) * (1.0 - uMood) * 0.9;
  }
  return col;
}

// --- features ---------------------------------------------------------------

float veinFlow(float x) {
  float pulse = 0.5 + 0.5 * sin(x * 0.13 - uTime * 0.85);
  float pulse2 = 0.5 + 0.5 * sin(x * 0.047 + uTime * 0.31);
  return pow(pulse, 5.0) * 0.75 + pow(pulse2, 3.0) * 0.35;
}

float goldPathZ(float x) {
  return mix(spineZ(x) * 0.4 - 30.0, SANCTUARY.y, smoothstep(-150.0, -6.0, x));
}

// Emissive markings laid over the ground: surveying rings around the site and
// the path that appears at the resolution.
vec3 groundMarks(vec2 w, float dist) {
  vec3 acc = vec3(0.0);
  // Widening the line by how fast the ground moves under the pixel keeps the
  // markings smooth where they run across a steep face.
  float soften = max(fwidth(w.x) + fwidth(w.y), clamp(dist * 0.0025, 0.3, 2.4));

  if (uRings > 0.001) {
    vec2 d = w - SANCTUARY;
    float r = length(d);
    float a = atan(d.y, d.x);
    float rings = 0.0;
    rings += smoothstep(soften, 0.0, abs(r - 21.0));
    rings += smoothstep(soften, 0.0, abs(r - 33.5)) * 0.8;
    rings += smoothstep(soften, 0.0, abs(r - 46.0)) * 0.65;
    rings += smoothstep(soften, 0.0, abs(r - 58.5)) * 0.5;
    float ticks =
      smoothstep(0.86, 1.0, cos(a * 12.0)) *
      smoothstep(soften * 3.0, 0.0, abs(mod(r + 6.0, 12.0) - 6.0)) *
      step(14.0, r) * step(r, 62.0);
    float spokes = smoothstep(0.995, 1.0, cos(a * 8.0)) * step(14.0, r) * step(r, 60.0);
    acc += accentColour() * (rings + ticks * 0.55 + spokes * 0.5) * uRings * 0.85;
  }

  if (uGoldPath > 0.001) {
    float dp = abs(w.y - goldPathZ(w.x));
    float band = smoothstep(2.4 + soften, 0.0, dp);
    float travel = 0.55 + 0.45 * sin(w.x * 0.09 - uTime * 0.5);
    acc += vec3(1.0, 0.78, 0.36) * band * uGoldPath * (0.5 + 0.5 * travel) * 1.2;
  }

  if (uFracture > 0.001) {
    vec2 f = fract(w / 15.0);
    float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
    float crack = smoothstep(0.038, 0.0, edge);
    acc += vec3(1.0, 0.18, 0.09) * crack * uFracture * 1.15;

    // Stepped readings across the slope, like a chart drawn into the rock.
    float level = smoothstep(0.9, 1.0, fract(terrainRaw(w) * 0.35 + uTime * 0.02));
    acc += vec3(1.0, 0.36, 0.16) * level * uFracture * 0.35;
  }

  return acc;
}

vec3 shadeTerrain(vec3 p, vec3 rd, float dist) {
  vec3 n = terrainNormal(p.xz, dist);
  vec3 sunDir = normalize(vec3(-0.55, 0.20, 0.42));
  vec3 sunCol = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.44, 0.26), uMood);

  float diff = clamp(dot(n, sunDir), 0.0, 1.0);
  float sky = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
  float back = clamp(dot(n, normalize(vec3(0.6, 0.1, -0.5))), 0.0, 1.0);

  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float height = clamp((p.y - 4.0) / 96.0, 0.0, 1.0);

  // The palette stays mineral and close to neutral. Form is carried by light
  // and by the mist between ridges rather than by local colour, which is what
  // keeps the range reading as ink and stone.
  vec3 rock = mix(vec3(0.112, 0.120, 0.134), vec3(0.148, 0.153, 0.162), slope);
  vec3 turf = mix(vec3(0.074, 0.086, 0.086), vec3(0.096, 0.106, 0.104), sky);
  vec3 albedo = mix(turf, rock, smoothstep(0.18, 0.68, slope));
  albedo = mix(albedo, vec3(0.205, 0.212, 0.220), smoothstep(0.72, 1.0, height) * (1.0 - slope) * 0.55);
  // The land loses its colour as the contamination takes hold.
  albedo = mix(albedo, mix(vec3(0.125), vec3(0.150, 0.088, 0.078), 0.7), uMood * 0.72);

  vec3 col = albedo * (
    sunCol * diff * (0.95 + 1.25 * uDawn) +
    mix(vec3(0.098, 0.118, 0.152), vec3(0.140, 0.064, 0.058), uMood) * sky * 0.58 +
    vec3(0.038, 0.044, 0.058) * back
  );

  // A thin rim where a crest turns away from the camera, just enough to keep
  // one ridge from merging into the next.
  float rim = pow(clamp(1.0 - dot(n, -rd), 0.0, 1.0), 4.0);
  col += mix(vec3(0.10, 0.108, 0.122), vec3(0.16, 0.062, 0.05), uMood) * rim * (0.2 + 0.4 * uDawn);

  // The embrace: the formation around the site catches a little more light.
  if (uEmbrace > 0.001) {
    float r = length(p.xz - SANCTUARY);
    float ring = exp(-pow(r - SANCTUARY_RADIUS, 2.0) / (2.0 * 20.0 * 20.0));
    col += accentColour() * ring * uEmbrace * 0.075 * (0.35 + diff);
  }

  col += groundMarks(p.xz, dist);
  return col;
}

void main() {
  vec2 uv = (vUv * 2.0 - 1.0);
  uv.x *= uRes.x / uRes.y;

  vec3 rd = normalize(uCamBasis * vec3(uv * uTanHalfFov, 1.0));
  vec3 ro = uCamPos;

  float tMax = uFar;
  float t = uNear;
  bool hit = false;
  vec3 hitPos = vec3(0.0);

  // Volumetric accumulation gathered on the way in.
  vec3 glow = vec3(0.0);
  float mist = 0.0;

  vec3 acc = accentColour();

  // Offsetting each ray by a fraction of a step turns the rings that fixed
  // step volumetrics leave in the mist into fine grain instead.
  float jitter = hash21(gl_FragCoord.xy + fract(uTime) * 37.1);
  t += jitter * 0.9;
  float stepDither = 0.86 + 0.28 * jitter;

  float tPrev = t;
  float dPrev = 1e9;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    if (t > tMax) break;
    if (p.y > 320.0 && rd.y > 0.0) break;

    float h = terrainH(p.xz);
    float d = p.y - h;

    // Interpolating across the crossing removes the terracing a plain
    // heightfield march leaves on steep ground.
    if (d < 0.0 && dPrev < 1e8) {
      float f = clamp(dPrev / max(dPrev - d, 1e-5), 0.0, 1.0);
      t = mix(tPrev, t, f);
      hit = true;
      hitPos = ro + rd * t;
      break;
    }

    float stepLen = max(0.4, d * 0.3) * stepDither;
    stepLen *= 1.0 + t * 0.0038;

    // Mist settles into the valleys. Keeping it low is what separates one ridge
    // from the next instead of flattening the whole range into haze.
    float density = exp(-max(p.y - 1.0, 0.0) * 0.040) * (0.5 + 0.5 * vnoise(p.xz * 0.009 + uTime * 0.012));
    mist += density * stepLen * 0.0125 * uMist;

    // Qi travelling the spine.
    if (uVein > 0.001) {
      float dz = p.z - spineZ(p.x);
      if (abs(dz) < 46.0) {
        float crestY = terrainRaw(vec2(p.x, spineZ(p.x))) + 5.5;
        float dy = p.y - crestY;
        float r2 = dz * dz * 0.055 + dy * dy * 0.09;
        glow += acc * exp(-r2) * veinFlow(p.x) * uVein * stepLen * 0.055;
      }
    }

    // The point where it settles.
    if (uMeridian > 0.001) {
      float dc = length(p.xz - SANCTUARY);
      float column = exp(-dc * dc * 0.006) * exp(-max(p.y - 2.0, 0.0) * 0.010);
      glow += mix(vec3(1.0, 0.83, 0.45), acc, uMood) * column * uMeridian * stepLen * 0.030;
    }

    tPrev = t;
    dPrev = d;
    t += stepLen;
  }

  vec3 col;
  float viewZ;

  if (hit) {
    col = shadeTerrain(hitPos, rd, t);
    viewZ = max(dot(hitPos - uCamPos, uCamBasis[2]), uNear);
  } else {
    col = skyColour(rd);
    t = tMax;
    viewZ = uFar;
  }

  // Water. Rendered after the terrain so it can sit inside the carved channel.
  if (uWaterFade > 0.001 && rd.y < 0.0) {
    float tw = (uWaterLevel - ro.y) / rd.y;
    if (tw > uNear && tw < t) {
      vec3 wp = ro + rd * tw;
      if (terrainRaw(wp.xz) < uWaterLevel + 0.6) {
        vec3 wn = normalize(vec3(
          sin(wp.x * 0.35 + uTime * 0.5) * 0.035 + sin(wp.z * 0.21 - uTime * 0.31) * 0.025,
          1.0,
          cos(wp.z * 0.29 - uTime * 0.42) * 0.035
        ));
        float fres = pow(1.0 - clamp(dot(-rd, wn), 0.0, 1.0), 4.0);
        vec3 reflected = skyColour(reflect(rd, wn));
        vec3 deep = mix(vec3(0.012, 0.021, 0.026), vec3(0.030, 0.010, 0.010), uMood);
        vec3 water = mix(deep, reflected, clamp(fres * 1.5 + 0.10, 0.0, 1.0));
        float shore = smoothstep(uWaterLevel + 0.6, uWaterLevel - 2.6, terrainRaw(wp.xz));
        float blend = uWaterFade * shore;
        col = mix(col, water, blend);
        if (blend > 0.5) {
          t = tw;
          viewZ = max(dot(wp - uCamPos, uCamBasis[2]), uNear);
        }
      }
    }
  }

  // Atmosphere. Distance fog carries the mood, and the mist accumulated during
  // the march sits on top of it.
  vec3 fogCol = mix(vec3(0.128, 0.146, 0.168), vec3(0.150, 0.058, 0.050), uMood);
  fogCol += mix(vec3(0.085, 0.072, 0.048), vec3(0.13, 0.045, 0.026), uMood) * uDawn * 0.42;
  // Distance fog belongs to the land. A sky ray travels to the far plane, so
  // applying the same curve to it would erase the sky and everything in it.
  float fogAmt = hit
    ? 1.0 - exp(-t * 0.0026 * (0.6 + 0.8 * uMist))
    : 0.20 * clamp(uMist * 0.6, 0.0, 1.0);
  col = mix(col, fogCol, clamp(fogAmt, 0.0, 1.0));
  col = mix(col, fogCol * 1.32, clamp(mist, 0.0, 0.92));

  col += glow;

  // Smoke replaces mist as the year turns.
  if (uMood > 0.01) {
    float smoke = fbm(vec2(rd.x * 3.0 + uTime * 0.03, rd.y * 3.0 - uTime * 0.018), 4);
    col = mix(col, vec3(0.09, 0.045, 0.040), smoke * uMood * (hit ? 0.30 : 0.14));
  }

  float ndc =
    (uFar + uNear) / (uFar - uNear) - (2.0 * uFar * uNear) / ((uFar - uNear) * viewZ);
  gl_FragDepth = clamp(ndc * 0.5 + 0.5, 0.0, 1.0);

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
