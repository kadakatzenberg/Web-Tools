#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec3 c = texture(uSource, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp((lum - uThreshold + uKnee) / max(2.0 * uKnee, 1e-4), 0.0, 1.0);
  float weight = max(soft * soft * uKnee, lum - uThreshold) / max(lum, 1e-4);
  fragColor = vec4(c * weight, 1.0);
}
