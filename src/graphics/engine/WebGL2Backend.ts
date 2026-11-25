import type {
  AtlasRegion,
  BackendKind,
  BiomeColorGrade,
  CameraState,
  CanopyShadowConfig,
  FrameStats,
  IRenderBackend,
  ParticleDrawCmd,
  PointLight,
  RendererCapabilities,
  SpriteDrawCmd,
  WaterConfig,
} from '../../contracts';
import {
  createShaderLibrary,
  MAX_POINT_LIGHTS,
  type ShaderLibrary,
} from '../shaders/programs';
import {
  createDefaultCamera,
  createDefaultCanopyConfig,
  createDefaultColorGrade,
  createDefaultWaterConfig,
  type BackendStateSnapshot,
  type Custom2DDrawFn,
} from './Canvas2DBackend';

interface WaterQuadCmd {
  x: number;
  y: number;
  w: number;
  h: number;
  depthFactor: number;
  foamMask: number;
}

type WorldSegment =
  | { kind: 'water'; items: WaterQuadCmd[] }
  | { kind: 'sprites'; items: SpriteDrawCmd[] }
  | { kind: 'custom2d'; items: Custom2DDrawFn[] };

interface RegisteredAtlasGL {
  albedoTex: WebGLTexture;
  normalTex: WebGLTexture | null;
  emissiveTex: WebGLTexture | null;
  width: number;
  height: number;
  pixelCrisp: boolean;
  regions: Record<string, AtlasRegion>;
}

interface DynamicSourceTex {
  tex: WebGLTexture;
  width: number;
  height: number;
  mutable: boolean;
  pixelCrisp: boolean;
}

interface HybridLayerTarget {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: WebGLTexture;
}

interface RenderTargetFBO {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  emissiveTex: WebGLTexture | null;
  width: number;
  height: number;
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software\s*rasterizer|microsoft\s*basic\s*render\s*driver|mesa\s*offscreen/i;

const SPRITE_FLOATS_PER_INSTANCE = 20;
const WATER_FLOATS_PER_INSTANCE = 6;
const PARTICLE_FLOATS_PER_INSTANCE = 11;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function getSourceDims(src: CanvasImageSource): { width: number; height: number } {
  if ('naturalWidth' in src && typeof src.naturalWidth === 'number' && src.naturalWidth > 0) {
    return { width: src.naturalWidth, height: (src as HTMLImageElement).naturalHeight || 1 };
  }
  if ('videoWidth' in src && typeof src.videoWidth === 'number' && src.videoWidth > 0) {
    return { width: src.videoWidth, height: (src as HTMLVideoElement).videoHeight || 1 };
  }
  const w = 'width' in src && typeof src.width === 'number' ? src.width : 1;
  const h = 'height' in src && typeof src.height === 'number' ? src.height : 1;
  return { width: Math.max(1, w), height: Math.max(1, h) };
}

function isMutableCanvasSource(src: CanvasImageSource): boolean {
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    return true;
  }
  if (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas) {
    return true;
  }
  if (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement) {
    return true;
  }
  return false;
}

export class WebGL2Backend implements IRenderBackend {
  readonly kind: BackendKind = 'webgl2';

  private _capabilities: RendererCapabilities = {
    kind: 'webgl2',
    webgl2Supported: false,
    isSoftwareRasterizer: false,
    rendererString: 'WebGL2',
    maxTextureSize: 4096,
    dpr: 1,
    reducedMotion: false,
    crtMode: false,
  };

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private shaders: ShaderLibrary | null = null;

  private unitQuadVbo: WebGLBuffer | null = null;
  private fullscreenVao: WebGLVertexArrayObject | null = null;

  private spriteVao: WebGLVertexArrayObject | null = null;
  private spriteInstanceVbo: WebGLBuffer | null = null;
  private spriteData = new Float32Array(256 * SPRITE_FLOATS_PER_INSTANCE);

  private waterVao: WebGLVertexArrayObject | null = null;
  private waterInstanceVbo: WebGLBuffer | null = null;
  private waterData = new Float32Array(256 * WATER_FLOATS_PER_INSTANCE);

  private particleVao: WebGLVertexArrayObject | null = null;
  private particleInstanceVbo: WebGLBuffer | null = null;
  private particleData = new Float32Array(256 * PARTICLE_FLOATS_PER_INSTANCE);

  private sceneTarget: RenderTargetFBO | null = null;
  private litTarget: RenderTargetFBO | null = null;

  private fallbackWhiteTex: WebGLTexture | null = null;
  private fallbackBlackTex: WebGLTexture | null = null;
  private fallbackNormalTex: WebGLTexture | null = null;

  private worldLayer: HybridLayerTarget | null = null;
  private postLightLayer: HybridLayerTarget | null = null;
  private screenLayer: HybridLayerTarget | null = null;

  private atlases = new Map<string, RegisteredAtlasGL>();
  private dynamicSourceCache = new WeakMap<object, DynamicSourceTex>();
  private dynamicTextures: WebGLTexture[] = [];

  private dprCap = 2;
  private dpr = 1;
  private cssWidth = 960;
  private cssHeight = 540;
  private pixelWidth = 960;
  private pixelHeight = 540;
  private disposed = false;

  private camera: CameraState = createDefaultCamera();
  private colorGrade: BiomeColorGrade = createDefaultColorGrade();
  private canopyConfig: CanopyShadowConfig = createDefaultCanopyConfig();
  private waterConfig: WaterConfig = createDefaultWaterConfig();
  private reducedMotion = false;
  private crtMode = false;

  // Per-frame queues
  private frameTimeSeconds = 0;
  private clearColor: [number, number, number, number] = [0.04, 0.06, 0.14, 1];
  private worldSegments: WorldSegment[] = [];
  private lights: PointLight[] = [];
  private particles: ParticleDrawCmd[] = [];
  private postLightDraws: Custom2DDrawFn[] = [];
  private screenDraws: Custom2DDrawFn[] = [];

  // Preallocated uniform scratch buffers (zero GC churn per frame)
  private lightPosRadiusBuf = new Float32Array(MAX_POINT_LIGHTS * 4);
  private lightColorIntBuf = new Float32Array(MAX_POINT_LIGHTS * 4);
  private lightFlickerBuf = new Float32Array(MAX_POINT_LIGHTS);
  private spriteLightPosRadBuf = new Float32Array(MAX_POINT_LIGHTS * 4);
  private spriteLightColIntBuf = new Float32Array(MAX_POINT_LIGHTS * 4);

  // Telemetry
  private smoothedFps = 60;
  private frameStartMs = 0;
  private clampedDtMs = 16.67;
  private contextLostCount = 0;
  private contextRestoredCount = 0;
  private lastStats: FrameStats = {
    fps: 60,
    frameTimeMs: 0,
    clampedDtMs: 16.67,
    drawCalls: 0,
    activeLights: 0,
    activeParticles: 0,
    backend: 'webgl2',
    contextLostCount: 0,
    contextRestoredCount: 0,
  };

  get capabilities(): RendererCapabilities {
    return { ...this._capabilities };
  }

  getGLContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  async init(
    canvas: HTMLCanvasElement,
    options: {
      dprCap?: number;
      reducedMotion?: boolean;
      crtMode?: boolean;
    },
  ): Promise<void> {
    this.initSync(canvas, options);
  }

  initSync(
    canvas: HTMLCanvasElement,
    options: {
      dprCap?: number;
      reducedMotion?: boolean;
      crtMode?: boolean;
    },
  ): void {
    this.disposed = false;
    this.canvas = canvas;
    this.dprCap = Math.max(1, options.dprCap ?? 2);
    this.reducedMotion = Boolean(options.reducedMotion);
    this.crtMode = Boolean(options.crtMode);

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      throw new Error('WebGL2 context unavailable');
    }
    this.gl = gl;

    // Query renderer string & hardware capabilities safely
    let rendererString = 'WebGL2';
    try {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (typeof unmasked === 'string' && unmasked.trim().length > 0) {
          rendererString = unmasked;
        }
      }
      if (rendererString === 'WebGL2') {
        const fallbackRenderer = gl.getParameter(gl.RENDERER);
        if (typeof fallbackRenderer === 'string' && fallbackRenderer.trim().length > 0) {
          rendererString = fallbackRenderer;
        }
      }
    } catch {
      rendererString = 'WebGL2';
    }

    let maxTextureSize = 4096;
    try {
      const param = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (typeof param === 'number' && param > 0) {
        maxTextureSize = param;
      }
    } catch {
      maxTextureSize = 4096;
    }

    const isSoftwareRasterizer = SOFTWARE_RENDERER_PATTERN.test(rendererString);

    try {
      this.shaders = createShaderLibrary(gl);
      this.initGeometry(gl);
      this.initFallbackTextures(gl);
      this.worldLayer = this.createHybridLayer(gl);
      this.postLightLayer = this.createHybridLayer(gl);
      this.screenLayer = this.createHybridLayer(gl);

      const initialW = canvas.clientWidth || canvas.width || 960;
      const initialH = canvas.clientHeight || canvas.height || 540;
      const rawDpr =
        typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

      this._capabilities = {
        kind: 'webgl2',
        webgl2Supported: true,
        isSoftwareRasterizer,
        rendererString,
        maxTextureSize,
        dpr: clamp(rawDpr, 1, this.dprCap),
        reducedMotion: this.reducedMotion,
        crtMode: this.crtMode,
      };

      this.resize(initialW, initialH, rawDpr);
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  setContextCounts(lost: number, restored: number): void {
    this.contextLostCount = lost;
    this.contextRestoredCount = restored;
    this.lastStats.contextLostCount = lost;
    this.lastStats.contextRestoredCount = restored;
  }

  exportStateSnapshot(): BackendStateSnapshot {
    return {
      camera: { ...this.camera },
      colorGrade: {
        ...this.colorGrade,
        ambientRgb: [...this.colorGrade.ambientRgb],
        tintRgb: [...this.colorGrade.tintRgb],
      },
      canopyConfig: {
        ...this.canopyConfig,
        sunbeamColor: [...this.canopyConfig.sunbeamColor],
      },
      waterConfig: {
        ...this.waterConfig,
        skyTopColor: [...this.waterConfig.skyTopColor],
        skyBottomColor: [...this.waterConfig.skyBottomColor],
        foamColor: [...this.waterConfig.foamColor],
      },
      reducedMotion: this.reducedMotion,
      crtMode: this.crtMode,
      dprCap: this.dprCap,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
    };
  }

  importStateSnapshot(snapshot: BackendStateSnapshot): void {
    this.camera = { ...snapshot.camera };
    this.colorGrade = {
      ...snapshot.colorGrade,
      ambientRgb: [...snapshot.colorGrade.ambientRgb],
      tintRgb: [...snapshot.colorGrade.tintRgb],
    };
    this.canopyConfig = {
      ...snapshot.canopyConfig,
      sunbeamColor: [...snapshot.canopyConfig.sunbeamColor],
    };
    this.waterConfig = {
      ...snapshot.waterConfig,
      skyTopColor: [...snapshot.waterConfig.skyTopColor],
      skyBottomColor: [...snapshot.waterConfig.skyBottomColor],
      foamColor: [...snapshot.waterConfig.foamColor],
    };
    this.dprCap = snapshot.dprCap;
    this.setReducedMotion(snapshot.reducedMotion);
    this.setCrtMode(snapshot.crtMode);
    if (snapshot.cssWidth > 0 && snapshot.cssHeight > 0) {
      this.resize(snapshot.cssWidth, snapshot.cssHeight, this.dpr);
    }
  }

  resize(cssWidth: number, cssHeight: number, dpr?: number): void {
    const safeW = Math.max(1, Math.round(cssWidth));
    const safeH = Math.max(1, Math.round(cssHeight));
    const rawDpr =
      dpr ?? (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
    const effectiveDpr = this._capabilities.isSoftwareRasterizer
      ? 0.55
      : clamp(rawDpr, 1, this.dprCap);

    this.cssWidth = safeW;
    this.cssHeight = safeH;
    this.dpr = effectiveDpr;
    this._capabilities.dpr = effectiveDpr;
    this.camera.viewportWidth = safeW;
    this.camera.viewportHeight = safeH;

    const maxTex = this._capabilities.maxTextureSize || 4096;
    const pixelW = clamp(Math.round(safeW * effectiveDpr), 1, maxTex);
    const pixelH = clamp(Math.round(safeH * effectiveDpr), 1, maxTex);
    this.pixelWidth = pixelW;
    this.pixelHeight = pixelH;

    if (this.canvas) {
      if (this.canvas.width !== pixelW) this.canvas.width = pixelW;
      if (this.canvas.height !== pixelH) this.canvas.height = pixelH;
    }

    this.resizeHybridLayer(this.worldLayer, pixelW, pixelH);
    this.resizeHybridLayer(this.postLightLayer, pixelW, pixelH);
    this.resizeHybridLayer(this.screenLayer, pixelW, pixelH);

    const gl = this.gl;
    if (!gl || this.disposed || gl.isContextLost()) {
      return;
    }

    try {
      this.sceneTarget = this.ensureRenderTarget(gl, this.sceneTarget, pixelW, pixelH, true);
      this.litTarget = this.ensureRenderTarget(gl, this.litTarget, pixelW, pixelH, false);
    } catch {
      // Safe degradation if resize fails during context loss
    }
  }

  registerAtlas(
    sheetId: string,
    albedo: HTMLImageElement | HTMLCanvasElement,
    normal?: HTMLImageElement | HTMLCanvasElement,
    emissive?: HTMLImageElement | HTMLCanvasElement,
    pixelCrisp = true,
  ): void {
    const gl = this.gl;
    if (!gl || this.disposed || gl.isContextLost()) {
      return;
    }
    try {
      const existing = this.atlases.get(sheetId);
      const regions = existing ? existing.regions : {};
      if (existing) {
        gl.deleteTexture(existing.albedoTex);
        if (existing.normalTex) gl.deleteTexture(existing.normalTex);
        if (existing.emissiveTex) gl.deleteTexture(existing.emissiveTex);
      }

      const crisp = pixelCrisp !== false;
      const albedoTex = this.createImageTexture(gl, albedo, crisp);
      const normalTex = normal ? this.createImageTexture(gl, normal, crisp) : null;
      const emissiveTex = emissive ? this.createImageTexture(gl, emissive, crisp) : null;
      const dims = getSourceDims(albedo);

      this.atlases.set(sheetId, {
        albedoTex,
        normalTex,
        emissiveTex,
        width: dims.width,
        height: dims.height,
        pixelCrisp: crisp,
        regions,
      });
    } catch {
      // Non-fatal atlas upload error
    }
  }

  setAtlasRegions(sheetId: string, regions: Record<string, AtlasRegion>): void {
    const existing = this.atlases.get(sheetId);
    if (existing) {
      existing.regions = { ...regions };
    }
  }

  setCamera(camera: Partial<CameraState>): void {
    this.camera = {
      ...this.camera,
      ...camera,
      viewportWidth: camera.viewportWidth ?? this.cssWidth,
      viewportHeight: camera.viewportHeight ?? this.cssHeight,
    };
  }

  setColorGrade(grade: BiomeColorGrade): void {
    this.colorGrade = {
      ...grade,
      ambientRgb: [...grade.ambientRgb],
      tintRgb: [...grade.tintRgb],
    };
  }

  setCanopyConfig(config: CanopyShadowConfig): void {
    this.canopyConfig = {
      ...config,
      sunbeamColor: [...config.sunbeamColor],
    };
  }

  setWaterConfig(config: WaterConfig): void {
    this.waterConfig = {
      ...config,
      skyTopColor: [...config.skyTopColor],
      skyBottomColor: [...config.skyBottomColor],
      foamColor: [...config.foamColor],
    };
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = Boolean(enabled);
    this._capabilities.reducedMotion = this.reducedMotion;
  }

  setCrtMode(enabled: boolean): void {
    this.crtMode = Boolean(enabled);
    this._capabilities.crtMode = this.crtMode;
  }

  beginFrame(
    timeSeconds: number,
    dtSeconds: number,
    clearColor?: [number, number, number, number],
  ): void {
    this.frameStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.frameTimeSeconds = Number.isFinite(timeSeconds) ? timeSeconds : 0;

    const clampedDtSec = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
    this.clampedDtMs = clampedDtSec * 1000;
    if (clampedDtSec > 0.0005) {
      const instantFps = clamp(1 / clampedDtSec, 1, 240);
      this.smoothedFps = this.smoothedFps * 0.88 + instantFps * 0.12;
    }

    this.clearColor = clearColor
      ? [clearColor[0], clearColor[1], clearColor[2], clearColor[3]]
      : [0.04, 0.06, 0.14, 1];

    this.worldSegments.length = 0;
    this.lights.length = 0;
    this.particles.length = 0;
    this.postLightDraws.length = 0;
    this.screenDraws.length = 0;
  }

  drawSprite(cmd: SpriteDrawCmd): void {
    const last = this.worldSegments[this.worldSegments.length - 1];
    if (last && last.kind === 'sprites') {
      last.items.push(cmd);
    } else {
      this.worldSegments.push({ kind: 'sprites', items: [cmd] });
    }
  }

  drawWaterQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    depthFactor: number,
    foamMask: number,
  ): void {
    const quad: WaterQuadCmd = { x, y, w, h, depthFactor, foamMask };
    const last = this.worldSegments[this.worldSegments.length - 1];
    if (last && last.kind === 'water') {
      last.items.push(quad);
    } else {
      this.worldSegments.push({ kind: 'water', items: [quad] });
    }
  }

  addPointLight(light: PointLight): void {
    this.lights.push(light);
  }

  drawParticle(cmd: ParticleDrawCmd): void {
    this.particles.push(cmd);
  }

  drawCustom2D(
    drawFn: Custom2DDrawFn,
    layer: 'world' | 'post-light' | 'screen' = 'world',
  ): void {
    if (layer === 'post-light') {
      this.postLightDraws.push(drawFn);
    } else if (layer === 'screen') {
      this.screenDraws.push(drawFn);
    } else {
      const last = this.worldSegments[this.worldSegments.length - 1];
      if (last && last.kind === 'custom2d') {
        last.items.push(drawFn);
      } else {
        this.worldSegments.push({ kind: 'custom2d', items: [drawFn] });
      }
    }
  }

  endFrame(): FrameStats {
    const gl = this.gl;
    let drawCalls = 0;
    let activeLights = 0;
    const activeParticles = this.particles.length;

    if (
      gl &&
      !this.disposed &&
      !gl.isContextLost() &&
      this.shaders &&
      this.sceneTarget &&
      this.litTarget
    ) {
      try {
        // ============================================================
        // PASS 1: Scene FBO — Water + Sprites + World 2D Hybrid Layer
        // ============================================================
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.fbo);
        gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
        const hasSceneEmissive =
          this.sceneTarget.emissiveTex !== null &&
          typeof gl.drawBuffers === 'function' &&
          typeof gl.COLOR_ATTACHMENT1 === 'number';
        if (hasSceneEmissive) {
          gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
          gl.clearColor(
            this.clearColor[0],
            this.clearColor[1],
            this.clearColor[2],
            this.clearColor[3],
          );
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawBuffers([gl.NONE ?? 0, gl.COLOR_ATTACHMENT1]);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        } else {
          gl.clearColor(
            this.clearColor[0],
            this.clearColor[1],
            this.clearColor[2],
            this.clearColor[3],
          );
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );

        for (const seg of this.worldSegments) {
          if (seg.kind === 'water') {
            if (this.waterConfig.enabled && seg.items.length > 0) {
              drawCalls += this.executeWaterPass(gl, seg.items);
            }
          } else if (seg.kind === 'sprites') {
            drawCalls += this.executeSpritePass(gl, seg.items);
          } else if (this.worldLayer && seg.items.length > 0) {
            drawCalls += this.executeHybridLayerBlit(gl, this.worldLayer, seg.items);
          }
        }

        // ============================================================
        // PASS 2: Lit FBO — Deferred 2D PointLights + Emissive + Canopy
        // ============================================================
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.litTarget.fbo);
        gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
        gl.disable(gl.BLEND);
        const lightPass = this.executeLightingPass(
          gl,
          this.sceneTarget.tex,
          this.sceneTarget.emissiveTex,
        );
        drawCalls += lightPass.drawCalls;
        activeLights = lightPass.activeLights;

        // ============================================================
        // PASS 3: Additive Particles + Post-Light 2D Hybrid onto Lit FBO
        // ============================================================
        if (this.particles.length > 0) {
          gl.enable(gl.BLEND);
          drawCalls += this.executeParticlePass(gl);
        }
        if (this.postLightLayer && this.postLightDraws.length > 0) {
          gl.enable(gl.BLEND);
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
          drawCalls += this.executeHybridLayerBlit(gl, this.postLightLayer, this.postLightDraws);
        }

        // ============================================================
        // PASS 4: Dual-Kawase Bloom + Biome Color-Grade LUT + Vignette + CRT
        // ============================================================
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
        gl.disable(gl.BLEND);
        drawCalls += this.executeBloomCompositePass(
          gl,
          this.litTarget.tex,
          this.sceneTarget.emissiveTex,
        );

        // Screen-space 2D HUD overlays composited cleanly on top
        if (this.screenLayer && this.screenDraws.length > 0) {
          gl.enable(gl.BLEND);
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
          drawCalls += this.executeHybridLayerBlit(gl, this.screenLayer, this.screenDraws);
        }
      } catch {
        // Safe degradation without uncaught exceptions on WebGL driver errors
      }
    }

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const frameTimeMs = Math.max(0, nowMs - this.frameStartMs);

    this.lastStats = {
      fps: Math.round(this.smoothedFps * 10) / 10,
      frameTimeMs: Math.round(frameTimeMs * 100) / 100,
      clampedDtMs: Math.round(this.clampedDtMs * 100) / 100,
      drawCalls,
      activeLights,
      activeParticles,
      backend: 'webgl2',
      contextLostCount: this.contextLostCount,
      contextRestoredCount: this.contextRestoredCount,
    };

    return { ...this.lastStats };
  }

  getCanvas2DContext(): CanvasRenderingContext2D | null {
    return null;
  }

  getViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(1, this.cssWidth),
      height: Math.max(1, this.cssHeight),
    };
  }

  getStats(): FrameStats {
    return { ...this.lastStats };
  }

  dispose(): void {
    const gl = this.gl;
    this.disposed = true;

    if (gl && !gl.isContextLost()) {
      try {
        this.shaders?.dispose(gl);

        if (this.unitQuadVbo) gl.deleteBuffer(this.unitQuadVbo);
        if (this.fullscreenVao) gl.deleteVertexArray(this.fullscreenVao);
        if (this.spriteVao) gl.deleteVertexArray(this.spriteVao);
        if (this.spriteInstanceVbo) gl.deleteBuffer(this.spriteInstanceVbo);
        if (this.waterVao) gl.deleteVertexArray(this.waterVao);
        if (this.waterInstanceVbo) gl.deleteBuffer(this.waterInstanceVbo);
        if (this.particleVao) gl.deleteVertexArray(this.particleVao);
        if (this.particleInstanceVbo) gl.deleteBuffer(this.particleInstanceVbo);

        if (this.sceneTarget) {
          gl.deleteFramebuffer(this.sceneTarget.fbo);
          gl.deleteTexture(this.sceneTarget.tex);
          if (this.sceneTarget.emissiveTex) gl.deleteTexture(this.sceneTarget.emissiveTex);
        }
        if (this.litTarget) {
          gl.deleteFramebuffer(this.litTarget.fbo);
          gl.deleteTexture(this.litTarget.tex);
          if (this.litTarget.emissiveTex) gl.deleteTexture(this.litTarget.emissiveTex);
        }

        if (this.fallbackWhiteTex) gl.deleteTexture(this.fallbackWhiteTex);
        if (this.fallbackBlackTex) gl.deleteTexture(this.fallbackBlackTex);
        if (this.fallbackNormalTex) gl.deleteTexture(this.fallbackNormalTex);

        if (this.worldLayer) gl.deleteTexture(this.worldLayer.tex);
        if (this.postLightLayer) gl.deleteTexture(this.postLightLayer.tex);
        if (this.screenLayer) gl.deleteTexture(this.screenLayer.tex);

        for (const atlas of this.atlases.values()) {
          gl.deleteTexture(atlas.albedoTex);
          if (atlas.normalTex) gl.deleteTexture(atlas.normalTex);
          if (atlas.emissiveTex) gl.deleteTexture(atlas.emissiveTex);
        }
        for (const tex of this.dynamicTextures) {
          gl.deleteTexture(tex);
        }
      } catch {
        // Ignore cleanup errors on lost context
      }
    }

    this.shaders = null;
    this.unitQuadVbo = null;
    this.fullscreenVao = null;
    this.spriteVao = null;
    this.spriteInstanceVbo = null;
    this.waterVao = null;
    this.waterInstanceVbo = null;
    this.particleVao = null;
    this.particleInstanceVbo = null;
    this.sceneTarget = null;
    this.litTarget = null;
    this.fallbackWhiteTex = null;
    this.fallbackBlackTex = null;
    this.fallbackNormalTex = null;
    this.worldLayer = null;
    this.postLightLayer = null;
    this.screenLayer = null;
    this.atlases.clear();
    this.dynamicTextures.length = 0;
    this.worldSegments.length = 0;
    this.lights.length = 0;
    this.particles.length = 0;
    this.postLightDraws.length = 0;
    this.screenDraws.length = 0;
    this.gl = null;
    this.canvas = null;
  }

  private initGeometry(gl: WebGL2RenderingContext): void {
    const unitQuad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    this.unitQuadVbo = gl.createBuffer();
    if (!this.unitQuadVbo) throw new Error('Failed to create unit quad VBO');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuad, gl.STATIC_DRAW);

    // Fullscreen quad VAO
    this.fullscreenVao = gl.createVertexArray();
    if (!this.fullscreenVao) throw new Error('Failed to create fullscreen VAO');
    gl.bindVertexArray(this.fullscreenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instanced Sprite VAO
    this.spriteVao = gl.createVertexArray();
    this.spriteInstanceVbo = gl.createBuffer();
    if (!this.spriteVao || !this.spriteInstanceVbo) throw new Error('Failed to create sprite VAO/VBO');
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInstanceVbo);
    const spriteStride = SPRITE_FLOATS_PER_INSTANCE * 4;
    for (let attr = 1; attr <= 5; attr++) {
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, 4, gl.FLOAT, false, spriteStride, (attr - 1) * 16);
      gl.vertexAttribDivisor(attr, 1);
    }

    // Instanced Water VAO
    this.waterVao = gl.createVertexArray();
    this.waterInstanceVbo = gl.createBuffer();
    if (!this.waterVao || !this.waterInstanceVbo) throw new Error('Failed to create water VAO/VBO');
    gl.bindVertexArray(this.waterVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterInstanceVbo);
    const waterStride = WATER_FLOATS_PER_INSTANCE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, waterStride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, waterStride, 16);
    gl.vertexAttribDivisor(2, 1);

    // Instanced Particle VAO
    this.particleVao = gl.createVertexArray();
    this.particleInstanceVbo = gl.createBuffer();
    if (!this.particleVao || !this.particleInstanceVbo) {
      throw new Error('Failed to create particle VAO/VBO');
    }
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceVbo);
    const partStride = PARTICLE_FLOATS_PER_INSTANCE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, partStride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, partStride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, partStride, 32);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  private initFallbackTextures(gl: WebGL2RenderingContext): void {
    this.fallbackWhiteTex = this.createSolidTexture(gl, 255, 255, 255, 255);
    this.fallbackBlackTex = this.createSolidTexture(gl, 0, 0, 0, 0);
    this.fallbackNormalTex = this.createSolidTexture(gl, 128, 128, 255, 255);
  }

  private createSolidTexture(
    gl: WebGL2RenderingContext,
    r: number,
    g: number,
    b: number,
    a: number,
  ): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create solid WebGL2 texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([r, g, b, a]),
    );
    return tex;
  }

  private createImageTexture(
    gl: WebGL2RenderingContext,
    source: CanvasImageSource,
    pixelCrisp = true,
  ): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create image WebGL2 texture');
    const filter = pixelCrisp ? (gl.NEAREST ?? 0x2600) : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    return tex;
  }

  private setTextureFilter(
    gl: WebGL2RenderingContext,
    tex: WebGLTexture,
    pixelCrisp: boolean,
  ): void {
    const filter = pixelCrisp ? (gl.NEAREST ?? 0x2600) : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  private createHybridLayer(gl: WebGL2RenderingContext): HybridLayerTarget | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = this.pixelWidth;
    canvas.height = this.pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    const tex = gl.createTexture();
    if (!tex) {
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    return { canvas, ctx, tex };
  }

  private resizeHybridLayer(layer: HybridLayerTarget | null, width: number, height: number): void {
    if (!layer) return;
    if (layer.canvas.width !== width) layer.canvas.width = width;
    if (layer.canvas.height !== height) layer.canvas.height = height;
  }

  private ensureRenderTarget(
    gl: WebGL2RenderingContext,
    existing: RenderTargetFBO | null,
    width: number,
    height: number,
    withEmissive = false,
  ): RenderTargetFBO {
    const wantEmissive =
      withEmissive &&
      typeof gl.drawBuffers === 'function' &&
      typeof gl.COLOR_ATTACHMENT1 === 'number';
    if (
      existing &&
      existing.width === width &&
      existing.height === height &&
      Boolean(existing.emissiveTex) === wantEmissive
    ) {
      return existing;
    }

    const fbo = existing?.fbo ?? gl.createFramebuffer();
    const tex = existing?.tex ?? gl.createTexture();
    if (!fbo || !tex) {
      throw new Error('Failed to allocate WebGL2 FBO target');
    }

    // Keep linear filtering strictly on FBO bloom/post-process render targets
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    let emissiveTex: WebGLTexture | null = existing?.emissiveTex ?? null;
    if (wantEmissive) {
      emissiveTex = emissiveTex ?? gl.createTexture();
      if (!emissiveTex) {
        throw new Error('Failed to allocate WebGL2 emissive FBO target');
      }
      gl.bindTexture(gl.TEXTURE_2D, emissiveTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else if (emissiveTex) {
      gl.deleteTexture(emissiveTex);
      emissiveTex = null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (emissiveTex) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emissiveTex, 0);
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Incomplete WebGL2 FBO status: 0x${status.toString(16)}`);
    }

    return { fbo, tex, emissiveTex, width, height };
  }

  private resolveDynamicSourceTexture(
    gl: WebGL2RenderingContext,
    source: CanvasImageSource,
    pixelCrisp = true,
  ): DynamicSourceTex {
    const key = source as object;
    const dims = getSourceDims(source);
    const cached = this.dynamicSourceCache.get(key);
    if (cached) {
      if (cached.mutable) {
        gl.bindTexture(gl.TEXTURE_2D, cached.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
        cached.width = dims.width;
        cached.height = dims.height;
      }
      return cached;
    }

    const tex = this.createImageTexture(gl, source, pixelCrisp);
    const entry: DynamicSourceTex = {
      tex,
      width: dims.width,
      height: dims.height,
      mutable: isMutableCanvasSource(source),
      pixelCrisp,
    };
    this.dynamicSourceCache.set(key, entry);
    this.dynamicTextures.push(tex);
    return entry;
  }

  private executeWaterPass(gl: WebGL2RenderingContext, quads: WaterQuadCmd[]): number {
    if (!this.shaders || !this.waterVao || !this.waterInstanceVbo || quads.length === 0) {
      return 0;
    }

    const needed = quads.length * WATER_FLOATS_PER_INSTANCE;
    if (this.waterData.length < needed) {
      this.waterData = new Float32Array(Math.max(needed, this.waterData.length * 2));
    }

    let offset = 0;
    for (const q of quads) {
      this.waterData[offset++] = q.x;
      this.waterData[offset++] = q.y;
      this.waterData[offset++] = q.w;
      this.waterData[offset++] = q.h;
      this.waterData[offset++] = q.depthFactor;
      this.waterData[offset++] = q.foamMask;
    }

    const prog = this.shaders.water;
    const cfg = this.waterConfig;
    gl.useProgram(prog.program);
    gl.uniform2f(prog.getUniform('uResolution'), this.cssWidth, this.cssHeight);
    gl.uniform4f(
      prog.getUniform('uCameraPosZoom'),
      this.camera.x,
      this.camera.y,
      this.camera.zoom,
      this.camera.rotation,
    );
    gl.uniform2f(prog.getUniform('uCameraShake'), this.camera.shakeX, this.camera.shakeY);
    gl.uniform1f(prog.getUniform('uTime'), cfg.time || this.frameTimeSeconds);
    gl.uniform3f(
      prog.getUniform('uSkyTop'),
      cfg.skyTopColor[0],
      cfg.skyTopColor[1],
      cfg.skyTopColor[2],
    );
    gl.uniform3f(
      prog.getUniform('uSkyBottom'),
      cfg.skyBottomColor[0],
      cfg.skyBottomColor[1],
      cfg.skyBottomColor[2],
    );
    gl.uniform1f(prog.getUniform('uStarlightIntensity'), cfg.starlightIntensity);
    gl.uniform1f(prog.getUniform('uWaveAmplitude'), cfg.waveAmplitude);
    gl.uniform3f(
      prog.getUniform('uFoamColor'),
      cfg.foamColor[0],
      cfg.foamColor[1],
      cfg.foamColor[2],
    );
    gl.uniform1f(prog.getUniform('uReducedMotion'), this.reducedMotion ? 1 : 0);

    gl.bindVertexArray(this.waterVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterInstanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.waterData.subarray(0, offset), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, quads.length);
    gl.bindVertexArray(null);

    return 1;
  }

  private executeSpritePass(gl: WebGL2RenderingContext, sprites: SpriteDrawCmd[]): number {
    if (!this.shaders || !this.spriteVao || !this.spriteInstanceVbo || sprites.length === 0) {
      return 0;
    }

    const ordered =
      sprites.length > 1
        ? [...sprites].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
        : sprites;

    const spriteLightCount = this.collectSpriteWorldLights();

    const prog = this.shaders.sprite;
    gl.useProgram(prog.program);
    gl.uniform2f(prog.getUniform('uResolution'), this.cssWidth, this.cssHeight);
    gl.uniform4f(
      prog.getUniform('uCameraPosZoom'),
      this.camera.x,
      this.camera.y,
      this.camera.zoom,
      this.camera.rotation,
    );
    gl.uniform2f(prog.getUniform('uCameraShake'), this.camera.shakeX, this.camera.shakeY);
    gl.uniform1f(prog.getUniform('uApplyCamera'), 1.0);
    gl.uniform1i(prog.getUniform('uAlbedoTex'), 0);
    gl.uniform1i(prog.getUniform('uNormalTex'), 1);
    gl.uniform1i(prog.getUniform('uEmissiveTex'), 2);
    gl.uniform1i(prog.getUniform('uLightCount'), spriteLightCount);
    if (spriteLightCount > 0) {
      gl.uniform4fv(
        prog.getUniform('uLightPosRad[0]') ?? prog.getUniform('uLightPosRad'),
        this.spriteLightPosRadBuf.subarray(0, spriteLightCount * 4),
      );
      gl.uniform4fv(
        prog.getUniform('uLightColInt[0]') ?? prog.getUniform('uLightColInt'),
        this.spriteLightColIntBuf.subarray(0, spriteLightCount * 4),
      );
    }

    let drawCalls = 0;
    let batchAlbedo: WebGLTexture | null = null;
    let batchNormal: WebGLTexture | null = null;
    let batchEmissive: WebGLTexture | null = null;
    let batchAtlas: RegisteredAtlasGL | null = null;
    let batchDynamic: DynamicSourceTex | null = null;
    let batchWidth = 1;
    let batchHeight = 1;
    let batchAdditive = false;
    let batchPixelCrisp = true;
    let batchCount = 0;

    const flush = (): void => {
      if (batchCount === 0 || !batchAlbedo) return;

      if (batchAdditive) {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, batchAlbedo);
      if (batchAtlas && batchAtlas.pixelCrisp !== batchPixelCrisp) {
        this.setTextureFilter(gl, batchAtlas.albedoTex, batchPixelCrisp);
        if (batchAtlas.normalTex) {
          this.setTextureFilter(gl, batchAtlas.normalTex, batchPixelCrisp);
        }
        if (batchAtlas.emissiveTex) {
          this.setTextureFilter(gl, batchAtlas.emissiveTex, batchPixelCrisp);
        }
        batchAtlas.pixelCrisp = batchPixelCrisp;
        gl.bindTexture(gl.TEXTURE_2D, batchAlbedo);
      } else if (batchDynamic && batchDynamic.pixelCrisp !== batchPixelCrisp) {
        this.setTextureFilter(gl, batchDynamic.tex, batchPixelCrisp);
        batchDynamic.pixelCrisp = batchPixelCrisp;
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, batchNormal ?? this.fallbackNormalTex);
      gl.uniform1i(prog.getUniform('uHasNormal'), batchNormal ? 1 : 0);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, batchEmissive ?? this.fallbackBlackTex);
      gl.uniform1i(prog.getUniform('uHasEmissive'), batchEmissive ? 1 : 0);

      gl.uniform2f(
        prog.getUniform('uTexelSize'),
        1 / Math.max(batchWidth, 1),
        1 / Math.max(batchHeight, 1),
      );

      gl.bindVertexArray(this.spriteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInstanceVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.spriteData.subarray(0, batchCount * SPRITE_FLOATS_PER_INSTANCE),
        gl.DYNAMIC_DRAW,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batchCount);
      gl.bindVertexArray(null);

      drawCalls += 1;
      batchCount = 0;
    };

    for (const cmd of ordered) {
      let tex: WebGLTexture | null = null;
      let normTex: WebGLTexture | null = null;
      let emTex: WebGLTexture | null = null;
      let atlasRef: RegisteredAtlasGL | null = null;
      let dynRef: DynamicSourceTex | null = null;
      let texW = 1;
      let texH = 1;
      let sx = cmd.sx;
      let sy = cmd.sy;
      let sw = cmd.sw;
      let sh = cmd.sh;
      const wantCrisp = cmd.pixelCrisp !== false;

      if (cmd.source) {
        const dyn = this.resolveDynamicSourceTexture(gl, cmd.source, wantCrisp);
        tex = dyn.tex;
        dynRef = dyn;
        texW = dyn.width;
        texH = dyn.height;
      } else if (cmd.sheetId) {
        const atlas = this.atlases.get(cmd.sheetId);
        if (atlas) {
          atlasRef = atlas;
          tex = atlas.albedoTex;
          normTex = cmd.useNormalMap !== false ? atlas.normalTex : null;
          emTex = atlas.emissiveTex;
          texW = atlas.width;
          texH = atlas.height;
          if (cmd.regionId && atlas.regions[cmd.regionId]) {
            const region = atlas.regions[cmd.regionId];
            sx = sx ?? region.x;
            sy = sy ?? region.y;
            sw = sw ?? region.w;
            sh = sh ?? region.h;
          }
        }
      }

      if (!tex) continue;

      const additive = Boolean(cmd.additive);
      if (
        batchCount > 0 &&
        (tex !== batchAlbedo ||
          normTex !== batchNormal ||
          emTex !== batchEmissive ||
          additive !== batchAdditive ||
          wantCrisp !== batchPixelCrisp)
      ) {
        flush();
      }

      batchAlbedo = tex;
      batchNormal = normTex;
      batchEmissive = emTex;
      batchAtlas = atlasRef;
      batchDynamic = dynRef;
      batchWidth = texW;
      batchHeight = texH;
      batchAdditive = additive;
      batchPixelCrisp = wantCrisp;

      const needed = (batchCount + 1) * SPRITE_FLOATS_PER_INSTANCE;
      if (this.spriteData.length < needed) {
        const grown = new Float32Array(Math.max(needed, this.spriteData.length * 2));
        grown.set(this.spriteData);
        this.spriteData = grown;
      }

      const u0 = (sx ?? 0) / texW;
      const v0 = (sy ?? 0) / texH;
      const uSpan = (sw ?? texW) / texW;
      const vSpan = (sh ?? texH) / texH;
      const tint = cmd.tint ?? [1, 1, 1, 1];
      const rim = cmd.rimColor ?? [0, 0, 0, 0];

      let o = batchCount * SPRITE_FLOATS_PER_INSTANCE;
      this.spriteData[o++] = cmd.dx;
      this.spriteData[o++] = cmd.dy;
      this.spriteData[o++] = cmd.dw;
      this.spriteData[o++] = cmd.dh;

      this.spriteData[o++] = u0;
      this.spriteData[o++] = v0;
      this.spriteData[o++] = uSpan;
      this.spriteData[o++] = vSpan;

      this.spriteData[o++] = cmd.rotation ?? 0;
      this.spriteData[o++] = cmd.flipX ? 1 : 0;
      this.spriteData[o++] = cmd.alpha ?? 1;
      this.spriteData[o++] = cmd.emissive ?? 0;

      this.spriteData[o++] = tint[0];
      this.spriteData[o++] = tint[1];
      this.spriteData[o++] = tint[2];
      this.spriteData[o++] = tint[3];

      this.spriteData[o++] = rim[0];
      this.spriteData[o++] = rim[1];
      this.spriteData[o++] = rim[2];
      this.spriteData[o++] = rim[3];

      batchCount += 1;
    }

    flush();

    // Restore standard blend func
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return drawCalls;
  }

  private executeHybridLayerBlit(
    gl: WebGL2RenderingContext,
    layer: HybridLayerTarget,
    draws: Custom2DDrawFn[],
  ): number {
    if (!this.shaders || !this.spriteVao || !this.spriteInstanceVbo || draws.length === 0) {
      return 0;
    }

    const { canvas, ctx, tex } = layer;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const fn of draws) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      fn(ctx, this.cssWidth, this.cssHeight, this.dpr);
      ctx.restore();
    }

    // Upload offscreen 2D canvas into WebGL2 texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fallbackNormalTex);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fallbackBlackTex);

    const prog = this.shaders.sprite;
    gl.useProgram(prog.program);
    gl.uniform2f(prog.getUniform('uResolution'), this.cssWidth, this.cssHeight);
    gl.uniform4f(prog.getUniform('uCameraPosZoom'), 0, 0, 1, 0);
    gl.uniform2f(prog.getUniform('uCameraShake'), 0, 0);
    gl.uniform1f(prog.getUniform('uApplyCamera'), 0.0);
    gl.uniform1i(prog.getUniform('uAlbedoTex'), 0);
    gl.uniform1i(prog.getUniform('uNormalTex'), 1);
    gl.uniform1i(prog.getUniform('uEmissiveTex'), 2);
    gl.uniform1i(prog.getUniform('uHasNormal'), 0);
    gl.uniform1i(prog.getUniform('uHasEmissive'), 0);
    gl.uniform1i(prog.getUniform('uLightCount'), 0);
    gl.uniform2f(
      prog.getUniform('uTexelSize'),
      1 / Math.max(canvas.width, 1),
      1 / Math.max(canvas.height, 1),
    );

    const d = this.spriteData;
    // aRect
    d[0] = 0;
    d[1] = 0;
    d[2] = this.cssWidth;
    d[3] = this.cssHeight;
    // aUvRect
    d[4] = 0;
    d[5] = 0;
    d[6] = 1;
    d[7] = 1;
    // aTransform (rot, flipX, alpha, emissive)
    d[8] = 0;
    d[9] = 0;
    d[10] = 1;
    d[11] = 0;
    // aTint
    d[12] = 1;
    d[13] = 1;
    d[14] = 1;
    d[15] = 1;
    // aRimColor
    d[16] = 0;
    d[17] = 0;
    d[18] = 0;
    d[19] = 0;

    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteInstanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, SPRITE_FLOATS_PER_INSTANCE), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
    gl.bindVertexArray(null);

    return 1;
  }

  private worldToScreen(wx: number, wy: number): [number, number] {
    const cx = this.cssWidth * 0.5;
    const cy = this.cssHeight * 0.5;
    const px = wx - this.camera.x;
    const py = wy - this.camera.y;
    const zoom = this.camera.zoom;
    const rot = this.camera.rotation;

    if (zoom === 1 && rot === 0) {
      return [px + this.camera.shakeX, py + this.camera.shakeY];
    }
    const dx = px - cx;
    const dy = py - cy;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [
      cx + (dx * c - dy * s) * zoom + this.camera.shakeX,
      cy + (dx * s + dy * c) * zoom + this.camera.shakeY,
    ];
  }

  private screenToWorld(sx: number, sy: number): [number, number] {
    const cx = this.cssWidth * 0.5;
    const cy = this.cssHeight * 0.5;
    const zoom = Math.max(this.camera.zoom, 0.05);
    const rot = this.camera.rotation;
    const rx = (sx - this.camera.shakeX - cx) / zoom;
    const ry = (sy - this.camera.shakeY - cy) / zoom;

    if (rot === 0) {
      return [rx + cx + this.camera.x, ry + cy + this.camera.y];
    }
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    return [
      rx * c - ry * s + cx + this.camera.x,
      rx * s + ry * c + cy + this.camera.y,
    ];
  }

  private collectSpriteWorldLights(): number {
    const motionScale = this.reducedMotion ? 0.15 : 1.0;
    let activeCount = 0;

    for (let i = 0; i < this.lights.length && activeCount < MAX_POINT_LIGHTS; i++) {
      const light = this.lights[i];
      if (light.intensity <= 0.005 || light.radius <= 0.5) continue;

      let sx = light.x;
      let sy = light.y;
      let screenRad = light.radius;
      let wx = light.x;
      let wy = light.y;
      let worldRad = light.radius;

      if (light.screenSpace) {
        [wx, wy] = this.screenToWorld(light.x, light.y);
        worldRad = light.radius / Math.max(this.camera.zoom, 0.05);
      } else {
        [sx, sy] = this.worldToScreen(light.x, light.y);
        screenRad = light.radius * this.camera.zoom;
      }

      if (
        sx + screenRad < 0 ||
        sx - screenRad > this.cssWidth ||
        sy + screenRad < 0 ||
        sy - screenRad > this.cssHeight
      ) {
        continue;
      }

      const flickAmt = (light.flickerAmount ?? 0) * motionScale;
      const flickSpeed = Math.max(light.flickerSpeed ?? 3.0, 0.5);
      let flicker = 1.0;
      if (flickAmt > 0.001) {
        const phase = this.frameTimeSeconds * flickSpeed + activeCount * 2.37;
        flicker = 1.0 + (Math.sin(phase) * 0.65 + Math.sin(phase * 2.13) * 0.35) * flickAmt;
      }

      const p4 = activeCount * 4;
      this.spriteLightPosRadBuf[p4] = wx;
      this.spriteLightPosRadBuf[p4 + 1] = wy;
      this.spriteLightPosRadBuf[p4 + 2] = worldRad;
      this.spriteLightPosRadBuf[p4 + 3] = clamp(worldRad * 0.36, 24, 96);

      this.spriteLightColIntBuf[p4] = light.color[0];
      this.spriteLightColIntBuf[p4 + 1] = light.color[1];
      this.spriteLightColIntBuf[p4 + 2] = light.color[2];
      this.spriteLightColIntBuf[p4 + 3] = Math.max(0, light.intensity * flicker);

      activeCount += 1;
    }

    return activeCount;
  }

  private executeLightingPass(
    gl: WebGL2RenderingContext,
    sceneTex: WebGLTexture,
    emissiveTex: WebGLTexture | null,
  ): { drawCalls: number; activeLights: number } {
    if (!this.shaders || !this.fullscreenVao) {
      return { drawCalls: 0, activeLights: 0 };
    }

    let activeCount = 0;
    for (let i = 0; i < this.lights.length && activeCount < MAX_POINT_LIGHTS; i++) {
      const light = this.lights[i];
      if (light.intensity <= 0.005 || light.radius <= 0.5) continue;

      let sx = light.x;
      let sy = light.y;
      let radius = light.radius;
      if (!light.screenSpace) {
        [sx, sy] = this.worldToScreen(light.x, light.y);
        radius = light.radius * this.camera.zoom;
      }

      if (
        sx + radius < 0 ||
        sx - radius > this.cssWidth ||
        sy + radius < 0 ||
        sy - radius > this.cssHeight
      ) {
        continue;
      }

      const p4 = activeCount * 4;
      this.lightPosRadiusBuf[p4] = sx;
      this.lightPosRadiusBuf[p4 + 1] = sy;
      this.lightPosRadiusBuf[p4 + 2] = radius;
      this.lightPosRadiusBuf[p4 + 3] = light.flickerSpeed ?? 3.0;

      this.lightColorIntBuf[p4] = light.color[0];
      this.lightColorIntBuf[p4 + 1] = light.color[1];
      this.lightColorIntBuf[p4 + 2] = light.color[2];
      this.lightColorIntBuf[p4 + 3] = light.intensity;

      this.lightFlickerBuf[activeCount] = light.flickerAmount ?? 0;
      activeCount += 1;
    }

    const prog = this.shaders.lightingCanopy;
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fallbackNormalTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, emissiveTex ?? this.fallbackBlackTex);

    gl.uniform1i(prog.getUniform('uSceneTex'), 0);
    gl.uniform1i(prog.getUniform('uNormalTex'), 1);
    gl.uniform1f(prog.getUniform('uHasNormal'), 0.0);
    gl.uniform1i(prog.getUniform('uEmissiveTex'), 2);
    gl.uniform1f(prog.getUniform('uHasEmissive'), emissiveTex ? 1.0 : 0.0);

    gl.uniform2f(prog.getUniform('uResolution'), this.cssWidth, this.cssHeight);
    gl.uniform1f(prog.getUniform('uTime'), this.frameTimeSeconds);
    gl.uniform1f(prog.getUniform('uReducedMotion'), this.reducedMotion ? 1.0 : 0.0);

    gl.uniform3f(
      prog.getUniform('uAmbientRgb'),
      this.colorGrade.ambientRgb[0],
      this.colorGrade.ambientRgb[1],
      this.colorGrade.ambientRgb[2],
    );
    gl.uniform1f(prog.getUniform('uAmbientStrength'), this.colorGrade.ambientStrength);

    gl.uniform1i(prog.getUniform('uLightCount'), activeCount);
    if (activeCount > 0) {
      gl.uniform4fv(
        prog.getUniform('uLightPosRadius[0]') ?? prog.getUniform('uLightPosRadius'),
        this.lightPosRadiusBuf.subarray(0, activeCount * 4),
      );
      gl.uniform4fv(
        prog.getUniform('uLightColorIntensity[0]') ?? prog.getUniform('uLightColorIntensity'),
        this.lightColorIntBuf.subarray(0, activeCount * 4),
      );
      gl.uniform1fv(
        prog.getUniform('uLightFlickerAmount[0]') ?? prog.getUniform('uLightFlickerAmount'),
        this.lightFlickerBuf.subarray(0, activeCount),
      );
    }

    const canopy = this.canopyConfig;
    gl.uniform1f(prog.getUniform('uCanopyEnabled'), canopy.enabled ? 1.0 : 0.0);
    gl.uniform1f(prog.getUniform('uSunbeamIntensity'), canopy.sunbeamIntensity);
    gl.uniform1f(prog.getUniform('uSunbeamAngle'), canopy.sunbeamAngle);
    gl.uniform3f(
      prog.getUniform('uSunbeamColor'),
      canopy.sunbeamColor[0],
      canopy.sunbeamColor[1],
      canopy.sunbeamColor[2],
    );
    gl.uniform2f(prog.getUniform('uCloudSpeed'), canopy.cloudSpeedX, canopy.cloudSpeedY);
    gl.uniform1f(prog.getUniform('uCloudOpacity'), canopy.cloudOpacity);

    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    return { drawCalls: 1, activeLights: activeCount };
  }

  private executeParticlePass(gl: WebGL2RenderingContext): number {
    if (!this.shaders || !this.particleVao || !this.particleInstanceVbo || this.particles.length === 0) {
      return 0;
    }

    const prog = this.shaders.particle;
    gl.useProgram(prog.program);
    gl.uniform2f(prog.getUniform('uResolution'), this.cssWidth, this.cssHeight);
    gl.uniform4f(
      prog.getUniform('uCameraPosZoom'),
      this.camera.x,
      this.camera.y,
      this.camera.zoom,
      this.camera.rotation,
    );
    gl.uniform2f(prog.getUniform('uCameraShake'), this.camera.shakeX, this.camera.shakeY);

    let drawCalls = 0;
    let batchCount = 0;
    let batchAdditive = true;

    const flush = (): void => {
      if (batchCount === 0) return;
      if (batchAdditive) {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );
      }
      gl.bindVertexArray(this.particleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceVbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.particleData.subarray(0, batchCount * PARTICLE_FLOATS_PER_INSTANCE),
        gl.DYNAMIC_DRAW,
      );
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batchCount);
      gl.bindVertexArray(null);
      drawCalls += 1;
      batchCount = 0;
    };

    for (const p of this.particles) {
      if (p.radius <= 0.1 || p.color[3] <= 0.003) continue;
      const additive = p.additive !== false;
      if (batchCount > 0 && additive !== batchAdditive) {
        flush();
      }
      batchAdditive = additive;

      const needed = (batchCount + 1) * PARTICLE_FLOATS_PER_INSTANCE;
      if (this.particleData.length < needed) {
        const grown = new Float32Array(Math.max(needed, this.particleData.length * 2));
        grown.set(this.particleData);
        this.particleData = grown;
      }

      let o = batchCount * PARTICLE_FLOATS_PER_INSTANCE;
      this.particleData[o++] = p.x;
      this.particleData[o++] = p.y;
      this.particleData[o++] = p.radius;
      this.particleData[o++] = p.softness ?? 0.7;

      this.particleData[o++] = p.color[0];
      this.particleData[o++] = p.color[1];
      this.particleData[o++] = p.color[2];
      this.particleData[o++] = p.color[3];

      this.particleData[o++] = p.stretchX ?? 1;
      this.particleData[o++] = p.stretchY ?? 1;
      this.particleData[o++] = p.rotation ?? 0;

      batchCount += 1;
    }

    flush();
    return drawCalls;
  }

  private executeBloomCompositePass(
    gl: WebGL2RenderingContext,
    litTex: WebGLTexture,
    emissiveTex: WebGLTexture | null,
  ): number {
    if (!this.shaders || !this.fullscreenVao) {
      return 0;
    }

    const prog = this.shaders.bloomComposite;
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, litTex);
    gl.uniform1i(prog.getUniform('uLitTex'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, emissiveTex ?? this.fallbackBlackTex);
    gl.uniform1i(prog.getUniform('uEmissiveTex'), 1);
    gl.uniform1f(prog.getUniform('uHasEmissive'), emissiveTex ? 1.0 : 0.0);
    gl.uniform2f(
      prog.getUniform('uTexelSize'),
      1 / Math.max(this.pixelWidth, 1),
      1 / Math.max(this.pixelHeight, 1),
    );
    gl.uniform2f(prog.getUniform('uResolution'), this.pixelWidth, this.pixelHeight);
    gl.uniform1f(prog.getUniform('uTime'), this.frameTimeSeconds);

    gl.uniform1f(prog.getUniform('uBloomIntensity'), this.colorGrade.bloomIntensity);
    gl.uniform1f(prog.getUniform('uBloomThreshold'), this.colorGrade.bloomThreshold);
    gl.uniform3f(
      prog.getUniform('uTintRgb'),
      this.colorGrade.tintRgb[0],
      this.colorGrade.tintRgb[1],
      this.colorGrade.tintRgb[2],
    );
    gl.uniform1f(prog.getUniform('uContrast'), this.colorGrade.contrast);
    gl.uniform1f(prog.getUniform('uSaturation'), this.colorGrade.saturation);
    gl.uniform1f(prog.getUniform('uVignetteStrength'), this.colorGrade.vignetteStrength);
    gl.uniform1f(prog.getUniform('uCrtEnabled'), this.crtMode ? 1.0 : 0.0);
    gl.uniform1f(prog.getUniform('uReducedMotion'), this.reducedMotion ? 1.0 : 0.0);

    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    return 1;
  }
}
