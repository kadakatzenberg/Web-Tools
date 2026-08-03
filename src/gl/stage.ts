import {
  createFullscreenTriangle,
  FULLSCREEN_VERT,
  Program,
  Target,
  type UniformValue,
} from './renderer';
import { cameraBasis, viewProjection, type Vec3 } from './math';

import commonSrc from './shaders/common.glsl?raw';
import heightmapSrc from './shaders/heightmap.frag?raw';
import sceneSrc from './shaders/scene.frag?raw';
import brightSrc from './shaders/bright.frag?raw';
import blurSrc from './shaders/blur.frag?raw';
import postSrc from './shaders/post.frag?raw';
import particlesVertSrc from './shaders/particles.vert?raw';
import particlesFragSrc from './shaders/particles.frag?raw';

export interface QualityTier {
  name: 'high' | 'medium' | 'low';
  steps: number;
  micro: boolean;
  renderScale: number;
  maxDpr: number;
  particles: number;
  bloom: boolean;
  heightmapSize: number;
}

export const TIERS: Record<QualityTier['name'], QualityTier> = {
  high: {
    name: 'high',
    steps: 132,
    micro: true,
    renderScale: 0.56,
    maxDpr: 1.5,
    particles: 4200,
    bloom: true,
    heightmapSize: 1536,
  },
  medium: {
    name: 'medium',
    steps: 96,
    micro: true,
    renderScale: 0.5,
    maxDpr: 1.4,
    particles: 2400,
    bloom: true,
    heightmapSize: 1024,
  },
  low: {
    name: 'low',
    steps: 64,
    micro: false,
    renderScale: 0.42,
    maxDpr: 1.25,
    particles: 900,
    bloom: false,
    heightmapSize: 768,
  },
};

/** Everything the narrative can move. Defaults describe the opening frame. */
export interface SceneState {
  camPos: Vec3;
  camTarget: Vec3;
  fov: number;
  mood: number;
  vein: number;
  meridian: number;
  rings: number;
  embrace: number;
  waterLevel: number;
  waterFade: number;
  mist: number;
  fracture: number;
  goldPath: number;
  dawn: number;
  celestial: number;
  exposure: number;
  bloom: number;
  chroma: number;
  grain: number;
  vignette: number;
  instability: number;
  flash: number;
  flashColour: Vec3;
  particles: number;
  timeScale: number;
}

export function defaultState(): SceneState {
  return {
    camPos: [-196, 74, 96],
    camTarget: [-70, 26, 24],
    fov: 34,
    mood: 0,
    vein: 0,
    meridian: 0,
    rings: 0,
    embrace: 0,
    waterLevel: 2.2,
    waterFade: 0,
    mist: 1,
    fracture: 0,
    goldPath: 0,
    dawn: 1,
    celestial: 0,
    exposure: 1.08,
    bloom: 0.55,
    chroma: 0.12,
    grain: 0.05,
    vignette: 0.62,
    instability: 0,
    flash: 0,
    flashColour: [1, 1, 1],
    particles: 0.9,
    timeScale: 1,
  };
}

const WORLD_ORIGIN: [number, number] = [-330, -350];
const WORLD_SIZE: [number, number] = [660, 680];
const NEAR = 0.6;
const FAR = 760;

function withCommon(source: string, defines: string): string {
  const header = source.slice(0, source.indexOf('\n') + 1);
  const body = source.slice(header.length);
  return `${header}${defines}\n${body.replace('// COMMON', commonSrc)}`;
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private tier: QualityTier;

  private heightTexture: WebGLTexture | null = null;
  private sceneTarget: Target;
  private bloomA: Target;
  private bloomB: Target;

  private sceneProgram!: Program;
  private postProgram!: Program;
  private brightProgram!: Program;
  private blurProgram!: Program;
  private particleProgram!: Program;

  private readonly vao: WebGLVertexArrayObject;
  private readonly particleVao: WebGLVertexArrayObject;

  private readonly basis = new Float32Array(9);
  private readonly viewProj = new Float32Array(16);

  private width = 1;
  private height = 1;
  private dpr = 1;
  private time = 0;
  private lastFrame = 0;
  private frameSamples: number[] = [];
  private degradeLocked = false;

  private state: SceneState = defaultState();
  private running = false;
  private rafId = 0;
  private onFrame: ((dt: number) => void) | null = null;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, tier: QualityTier) {
    this.canvas = canvas;
    this.gl = gl;
    this.tier = tier;
    this.vao = createFullscreenTriangle(gl);
    const pvao = gl.createVertexArray();
    if (!pvao) throw new Error('Unable to allocate particle geometry');
    this.particleVao = pvao;

    this.sceneTarget = new Target(gl, 2, 2, { float: true, depth: true });
    this.bloomA = new Target(gl, 2, 2, { float: true });
    this.bloomB = new Target(gl, 2, 2, { float: true });

    this.buildPrograms();
    this.buildHeightmap();
  }

  /** Returns null when the device cannot run the live landscape. */
  static create(canvas: HTMLCanvasElement, tierName: QualityTier['name']): Stage | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float')) return null;
    try {
      return new Stage(canvas, gl, TIERS[tierName]);
    } catch {
      return null;
    }
  }

  private buildPrograms(): void {
    const gl = this.gl;
    const defines = `#define STEPS ${this.tier.steps}\n#define MICRO_DETAIL ${
      this.tier.micro ? 1 : 0
    }`;
    this.sceneProgram?.dispose();
    this.sceneProgram = new Program(
      gl,
      FULLSCREEN_VERT,
      withCommon(sceneSrc, defines),
      'scene',
    );
    if (!this.postProgram) {
      this.postProgram = new Program(gl, FULLSCREEN_VERT, postSrc, 'post');
      this.brightProgram = new Program(gl, FULLSCREEN_VERT, brightSrc, 'bright');
      this.blurProgram = new Program(gl, FULLSCREEN_VERT, blurSrc, 'blur');
      this.particleProgram = new Program(
        gl,
        withCommon(particlesVertSrc, ''),
        particlesFragSrc,
        'particles',
      );
    }
  }

  private buildHeightmap(): void {
    const gl = this.gl;
    const size = this.tier.heightmapSize;
    if (this.heightTexture) gl.deleteTexture(this.heightTexture);

    const tex = gl.createTexture();
    if (!tex) throw new Error('Unable to allocate heightmap');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, size, size, 0, gl.RED, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const program = new Program(gl, FULLSCREEN_VERT, withCommon(heightmapSrc, ''), 'heightmap');
    gl.viewport(0, 0, size, size);
    program.use();
    program.set('uWorldOrigin', WORLD_ORIGIN);
    program.set('uWorldSize', WORLD_SIZE);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    program.dispose();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    this.heightTexture = tex;
  }

  setTier(name: QualityTier['name']): void {
    if (this.tier.name === name) return;
    this.tier = TIERS[name];
    this.buildPrograms();
    this.buildHeightmap();
    this.resize(this.width, this.height, this.dpr);
  }

  get tierName(): QualityTier['name'] {
    return this.tier.name;
  }

  /** Raises internal resolution when capturing still plates from the shader. */
  setRenderScale(scale: number, maxDpr: number): void {
    this.tier = { ...this.tier, renderScale: scale, maxDpr };
    this.degradeLocked = true;
    this.resize(this.width, this.height, maxDpr);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = Math.min(dpr, this.tier.maxDpr);

    const outW = Math.max(2, Math.round(cssWidth * this.dpr));
    const outH = Math.max(2, Math.round(cssHeight * this.dpr));
    this.canvas.width = outW;
    this.canvas.height = outH;

    const sceneW = Math.max(2, Math.round(outW * this.tier.renderScale));
    const sceneH = Math.max(2, Math.round(outH * this.tier.renderScale));
    this.sceneTarget.resize(sceneW, sceneH);

    const bloomW = Math.max(2, Math.round(sceneW * 0.5));
    const bloomH = Math.max(2, Math.round(sceneH * 0.5));
    this.bloomA.resize(bloomW, bloomH);
    this.bloomB.resize(bloomW, bloomH);
  }

  apply(state: SceneState): void {
    this.state = state;
  }

  /**
   * Projects a world position into CSS pixels so field annotations can sit on
   * the feature they name rather than being placed by hand.
   * Returns null when the point is behind the camera.
   */
  project(world: Vec3, out: { x: number; y: number; depth: number }): boolean {
    const m = this.viewProj;
    const w = m[3]! * world[0] + m[7]! * world[1] + m[11]! * world[2] + m[15]!;
    if (w <= 0.001) return false;
    const x = m[0]! * world[0] + m[4]! * world[1] + m[8]! * world[2] + m[12]!;
    const y = m[1]! * world[0] + m[5]! * world[1] + m[9]! * world[2] + m[13]!;
    out.x = (x / w * 0.5 + 0.5) * this.width;
    out.y = (1 - (y / w * 0.5 + 0.5)) * this.height;
    out.depth = w;
    return true;
  }

  setFrameCallback(fn: (dt: number) => void): void {
    this.onFrame = fn;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;
      this.time += dt * this.state.timeScale;
      this.onFrame?.(dt);
      this.render();
      this.sampleFrame(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Drops a tier when the device consistently misses frame budget. */
  private sampleFrame(dt: number): void {
    if (this.degradeLocked) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 90) return;
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0.016;
    this.frameSamples = [];
    if (median > 0.042) {
      if (this.tier.name === 'high') this.setTier('medium');
      else if (this.tier.name === 'medium') this.setTier('low');
      else this.degradeLocked = true;
    } else if (median < 0.02) {
      this.degradeLocked = true;
    }
  }

  private render(): void {
    const gl = this.gl;
    const s = this.state;
    if (!this.heightTexture) return;

    const aspect = this.sceneTarget.width / this.sceneTarget.height;
    const fovY = (s.fov * Math.PI) / 180;
    const tanHalf = Math.tan(fovY / 2);
    cameraBasis(s.camPos, s.camTarget, this.basis);
    viewProjection(s.camPos, this.basis, fovY, aspect, NEAR, FAR, this.viewProj);

    // --- landscape ----------------------------------------------------------
    this.sceneTarget.bind();
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.sceneProgram.use();
    this.sceneProgram.setAll({
      uRes: [this.sceneTarget.width, this.sceneTarget.height],
      uTime: this.time,
      uCamPos: s.camPos as unknown as number[],
      uCamBasis: this.basis,
      uTanHalfFov: tanHalf,
      uNear: NEAR,
      uFar: FAR,
      uHeight: { texture: this.heightTexture, unit: 0 },
      uWorldOrigin: WORLD_ORIGIN,
      uWorldSize: WORLD_SIZE,
      uMood: s.mood,
      uVein: s.vein,
      uMeridian: s.meridian,
      uRings: s.rings,
      uEmbrace: s.embrace,
      uWaterLevel: s.waterLevel,
      uWaterFade: s.waterFade,
      uMist: s.mist,
      uFracture: s.fracture,
      uGoldPath: s.goldPath,
      uDawn: s.dawn,
      uCelestial: s.celestial,
    } satisfies Record<string, UniformValue>);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- Qi motes -----------------------------------------------------------
    const count = Math.round(this.tier.particles * Math.min(s.particles, 1.4));
    if (count > 0 && s.particles > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      this.particleProgram.use();
      this.particleProgram.setAll({
        uViewProj: this.viewProj,
        uCamPos: s.camPos as unknown as number[],
        uTime: this.time,
        uRes: [this.sceneTarget.width, this.sceneTarget.height],
        uDpr: this.tier.renderScale * this.dpr,
        uHeight: { texture: this.heightTexture, unit: 0 },
        uWorldOrigin: WORLD_ORIGIN,
        uWorldSize: WORLD_SIZE,
        uCount: count,
        uFracture: s.fracture,
        uMeridian: s.meridian,
        uMood: s.mood,
        uIntensity: Math.min(s.particles, 1.4),
      });
      gl.bindVertexArray(this.particleVao);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    gl.disable(gl.DEPTH_TEST);

    // --- bloom --------------------------------------------------------------
    let bloomTexture = this.bloomB.texture;
    if (this.tier.bloom && s.bloom > 0.001) {
      this.bloomA.bind();
      this.brightProgram.use();
      this.brightProgram.setAll({
        uSource: { texture: this.sceneTarget.texture, unit: 0 },
        uThreshold: 0.62,
        uKnee: 0.34,
      });
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      for (let pass = 0; pass < 2; pass++) {
        this.bloomB.bind();
        this.blurProgram.use();
        this.blurProgram.setAll({
          uSource: { texture: this.bloomA.texture, unit: 0 },
          uTexel: [1 / this.bloomA.width, 1 / this.bloomA.height],
          uDirection: [1 + pass * 0.6, 0],
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        this.bloomA.bind();
        this.blurProgram.setAll({
          uSource: { texture: this.bloomB.texture, unit: 0 },
          uTexel: [1 / this.bloomB.width, 1 / this.bloomB.height],
          uDirection: [0, 1 + pass * 0.6],
        });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      bloomTexture = this.bloomA.texture;
    } else {
      this.bloomB.bind();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bloomTexture = this.bloomB.texture;
    }

    // --- composite ----------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.postProgram.use();
    this.postProgram.setAll({
      uScene: { texture: this.sceneTarget.texture, unit: 0 },
      uBloom: { texture: bloomTexture, unit: 1 },
      uRes: [this.canvas.width, this.canvas.height],
      uTime: this.time,
      uExposure: s.exposure,
      uBloomAmount: this.tier.bloom ? s.bloom : 0,
      uChroma: s.chroma,
      uGrain: s.grain,
      uVignette: s.vignette,
      uMood: s.mood,
      uInstability: s.instability,
      uFlash: s.flash,
      uFlashColour: s.flashColour as unknown as number[],
    });
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.stop();
    const gl = this.gl;
    this.sceneProgram.dispose();
    this.postProgram.dispose();
    this.brightProgram.dispose();
    this.blurProgram.dispose();
    this.particleProgram.dispose();
    this.sceneTarget.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    if (this.heightTexture) gl.deleteTexture(this.heightTexture);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.particleVao);
  }
}
