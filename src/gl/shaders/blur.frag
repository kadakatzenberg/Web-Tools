#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uDirection;

/* Nine tap Gaussian folded into five bilinear samples. */
const float OFFSETS[3] = float[3](0.0, 1.3846153846, 3.2307692308);
const float WEIGHTS[3] = float[3](0.2270270270, 0.3162162162, 0.0702702703);

void main() {
  vec2 step = uTexel * uDirection;
  vec3 sum = texture(uSource, vUv).rgb * WEIGHTS[0];
  for (int i = 1; i < 3; i++) {
    vec2 o = step * OFFSETS[i];
    sum += texture(uSource, vUv + o).rgb * WEIGHTS[i];
    sum += texture(uSource, vUv - o).rgb * WEIGHTS[i];
  }
  fragColor = vec4(sum, 1.0);
}
