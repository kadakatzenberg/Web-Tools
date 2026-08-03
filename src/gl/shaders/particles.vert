#version 300 es
precision highp float;

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec2 uRes;
uniform float uDpr;
uniform sampler2D uHeight;
uniform vec2 uWorldOrigin;
uniform vec2 uWorldSize;
uniform float uCount;
uniform float uFracture;
uniform float uMeridian;
uniform float uMood;

out float vAlpha;
out float vEmber;

// COMMON

float sampleHeight(vec2 w) {
  vec2 uv = clamp((w - uWorldOrigin) / uWorldSize, vec2(0.002), vec2(0.998));
  return texture(uHeight, uv).r;
}

void main() {
  float id = float(gl_VertexID);
  float r1 = hash11(id * 0.017 + 1.3);
  float r2 = hash11(id * 0.031 + 3.1);
  float r3 = hash11(id * 0.053 + 7.7);
  float r4 = hash11(id * 0.091 + 11.9);

  // A share of the field gathers at the settled point rather than travelling.
  float atSpot = step(1.0 - uMeridian * 0.42, r4);
  float ember = step(1.0 - uFracture * 0.65, r3);

  float speed = (4.5 + r1 * 11.0) * (1.0 + uFracture * 1.4);
  float x = mix(-235.0, 235.0, fract(r2 + uTime * speed / 470.0));
  float z = spineZ(x) + (r3 - 0.5) * 62.0;

  vec2 spot = SANCTUARY + vec2(cos(r1 * 6.2831 + uTime * 0.25), sin(r2 * 6.2831 + uTime * 0.22)) * (6.0 + r3 * 26.0);
  vec2 wpos = mix(vec2(x, z), spot, atSpot);

  float ground = sampleHeight(wpos);
  float rise = fract(r1 + uTime * (0.035 + r2 * 0.05) * (1.0 + uFracture * 2.2));
  float lift = mix(2.5 + r1 * 24.0 + sin(uTime * 0.6 + id) * 1.8, rise * 62.0, ember);
  float y = ground + lift + atSpot * 6.0;

  vec3 world = vec3(wpos.x, y, wpos.y);
  vec4 clip = uViewProj * vec4(world, 1.0);

  float dist = length(world - uCamPos);
  float fade = smoothstep(430.0, 90.0, dist) * smoothstep(0.0, 26.0, dist);
  float edge = smoothstep(0.0, 0.10, min(fract(r2 + uTime * speed / 470.0), 1.0 - fract(r2 + uTime * speed / 470.0)));

  vAlpha = fade * mix(edge, 1.0, atSpot) * (0.35 + 0.65 * r1) * mix(1.0, 1.0 - rise, ember);
  vEmber = ember;

  gl_Position = clip;
  float size = mix(1.6, 2.6, r1) * (1.0 + uMood * 0.5) * (260.0 / max(dist, 12.0));
  gl_PointSize = clamp(size, 1.0, 9.0) * uDpr;
}
