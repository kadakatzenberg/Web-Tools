#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;

uniform float uExposure;
uniform float uBloomAmount;
uniform float uChroma;      // lens separation, kept low by default
uniform float uGrain;
uniform float uVignette;
uniform float uMood;
uniform float uInstability; // shear and wobble through the climax
uniform float uFlash;       // white or crimson overtake
uniform vec3 uFlashColour;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

// Narkowicz's ACES approximation. Cheap, and it holds highlights together when
// the bloom starts pushing past one.
vec3 tonemap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;

  // Instability: a slow horizontal drift that breaks the frame's composure
  // without ever making the type illegible.
  if (uInstability > 0.001) {
    float band = floor(uv.y * 42.0);
    float shear = (hash(vec2(band, floor(uTime * 5.0))) - 0.5);
    uv.x += shear * 0.0055 * uInstability;
    uv += centred * sin(uTime * 0.9) * 0.0022 * uInstability;
  }

  float rSep = (uChroma + uInstability * 0.9) * 0.0022;
  vec2 dir = centred * (1.0 + dot(centred, centred) * 1.6);
  vec3 scene;
  scene.r = texture(uScene, uv + dir * rSep).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - dir * rSep).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = scene + bloom * uBloomAmount;

  col *= uExposure;

  // Grade. The opening leans mineral and cool, the climax oxidised and warm.
  vec3 shadowsCool = vec3(0.90, 0.97, 1.06);
  vec3 shadowsWarm = vec3(1.10, 0.90, 0.86);
  vec3 lift = mix(shadowsCool, shadowsWarm, uMood);
  col = mix(col * lift, col, smoothstep(0.0, 0.5, dot(col, vec3(0.33))));

  float sat = mix(1.0, 0.82, uMood);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, sat);
  // Gold drains first: hold back the green-yellow band as the mood rises.
  col.g = mix(col.g, col.g * 0.9, uMood * 0.55);

  col = tonemap(col);

  float vig = 1.0 - uVignette * smoothstep(0.28, 0.92, length(centred * vec2(1.06, 1.0)));
  col *= vig;

  if (uFlash > 0.001) {
    col = mix(col, uFlashColour, clamp(uFlash, 0.0, 1.0));
  }

  // Grain, applied after the tone curve so it sits in the image rather than
  // on top of it. Ordered dither removes banding in the long gradients.
  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (1.0 - 0.6 * dot(col, vec3(0.33)));

  float dither = (hash(gl_FragCoord.xy * 0.77) - 0.5) / 255.0;
  col += dither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
