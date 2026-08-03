#version 300 es
precision highp float;

in float vAlpha;
in float vEmber;
out vec4 fragColor;

uniform float uMood;
uniform float uIntensity;

void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r = dot(d, d);
  if (r > 1.0) discard;
  float core = exp(-r * 3.4);

  vec3 gold = vec3(1.0, 0.80, 0.42);
  vec3 crimson = vec3(1.0, 0.30, 0.14);
  vec3 emberCol = vec3(1.0, 0.46, 0.13);
  vec3 col = mix(mix(gold, crimson, uMood), emberCol, vEmber);

  fragColor = vec4(col * core * vAlpha * uIntensity, 1.0);
}
