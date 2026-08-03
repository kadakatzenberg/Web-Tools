/**
 * A small WebGL2 layer: programs, uniform caching, float render targets and a
 * fullscreen triangle. Deliberately minimal, because the interesting work all
 * happens in the shaders.
 */

export type UniformValue =
  | number
  | boolean
  | Float32Array
  | readonly number[]
  | { texture: WebGLTexture; unit: number };

export class Program {
  readonly program: WebGLProgram;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    label: string,
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label}:vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}:frag`);
    const program = gl.createProgram();
    if (!program) throw new Error(`Unable to create program ${label}`);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Link failed for ${label}: ${info ?? 'unknown'}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  private location(name: string): WebGLUniformLocation | null {
    let loc = this.locations.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(this.program, name);
      this.locations.set(name, loc);
    }
    return loc;
  }

  set(name: string, value: UniformValue): void {
    const gl = this.gl;
    const loc = this.location(name);
    if (!loc) return;
    if (typeof value === 'number') {
      gl.uniform1f(loc, value);
      return;
    }
    if (typeof value === 'boolean') {
      gl.uniform1i(loc, value ? 1 : 0);
      return;
    }
    if (!Array.isArray(value) && !(value instanceof Float32Array)) {
      const sampler = value as { texture: WebGLTexture; unit: number };
      gl.activeTexture(gl.TEXTURE0 + sampler.unit);
      gl.bindTexture(gl.TEXTURE_2D, sampler.texture);
      gl.uniform1i(loc, sampler.unit);
      return;
    }
    const data =
      value instanceof Float32Array ? value : new Float32Array(value as readonly number[]);
    switch (data.length) {
      case 2:
        gl.uniform2fv(loc, data);
        break;
      case 3:
        gl.uniform3fv(loc, data);
        break;
      case 4:
        gl.uniform4fv(loc, data);
        break;
      case 9:
        gl.uniformMatrix3fv(loc, false, data);
        break;
      case 16:
        gl.uniformMatrix4fv(loc, false, data);
        break;
      default:
        gl.uniform1fv(loc, data);
    }
  }

  setAll(values: Record<string, UniformValue>): void {
    for (const key in values) this.set(key, values[key]!);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`Unable to create shader ${label}`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Compile failed for ${label}: ${info ?? 'unknown'}`);
  }
  return shader;
}

export interface TargetOptions {
  float?: boolean;
  depth?: boolean;
  filter?: number;
  wrap?: number;
}

export class Target {
  readonly framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width = 0;
  height = 0;
  private depthBuffer: WebGLRenderbuffer | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    width: number,
    height: number,
    private readonly options: TargetOptions = {},
  ) {
    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    if (!fb || !tex) throw new Error('Unable to allocate render target');
    this.framebuffer = fb;
    this.texture = tex;
    if (options.depth) {
      const rb = gl.createRenderbuffer();
      if (!rb) throw new Error('Unable to allocate depth buffer');
      this.depthBuffer = rb;
    }
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    const filter = this.options.filter ?? gl.LINEAR;
    const wrap = this.options.wrap ?? gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.options.float ? gl.RGBA16F : gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      this.options.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    if (this.depthBuffer) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        this.depthBuffer,
      );
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.texture);
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
  }
}

/** A single oversized triangle covers the viewport with no wasted fragments. */
export function createFullscreenTriangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) throw new Error('Unable to allocate fullscreen geometry');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export const FULLSCREEN_VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
