/**
 * Small WebGL2 helpers. No framework — the scene is points, lines and four
 * fullscreen passes, which is a few hundred lines of GL against roughly six
 * hundred kilobytes of Three.js for the same picture.
 */

export function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

export function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create program');
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The shaders are referenced by the program now; free our handles.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program failed to link: ${log}`);
  }
  return program;
}

export function uniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): Record<string, WebGLUniformLocation | null> {
  const map: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    // Array uniforms come back as "name[0]".
    const name = info.name.replace(/\[\d+\]$/, '');
    map[name] = gl.getUniformLocation(program, name);
  }
  return map;
}

export interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  float: boolean,
): Target {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new Error('Could not create render target');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    float ? gl.RGBA16F : gl.RGBA8,
    Math.max(1, width),
    Math.max(1, height),
    0,
    gl.RGBA,
    float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture, width: Math.max(1, width), height: Math.max(1, height) };
}

export function resizeTarget(
  gl: WebGL2RenderingContext,
  target: Target,
  width: number,
  height: number,
  float: boolean,
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (target.width === w && target.height === h) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    float ? gl.RGBA16F : gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );
  target.width = w;
  target.height = h;
}

export function disposeTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** #rrggbb (or #rgb) to linear-ish 0–1 RGB. */
export function hexToRgb(hex: string): [number, number, number] {
  let value = (hex || '#ffffff').replace('#', '').trim();
  if (value.length === 3) {
    value = value[0]! + value[0]! + value[1]! + value[1]! + value[2]! + value[2]!;
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  if (Number.isNaN(int)) return [1, 1, 1];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

/** A single triangle covering the viewport: cheaper than a quad, no seam. */
export function createFullscreenTriangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) throw new Error('Could not create fullscreen triangle');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export const FULLSCREEN_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
