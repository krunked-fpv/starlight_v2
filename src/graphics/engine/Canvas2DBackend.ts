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

export type Custom2DDrawFn = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
) => void;

export interface BackendStateSnapshot {
  camera: CameraState;
  colorGrade: BiomeColorGrade;
  canopyConfig: CanopyShadowConfig;
  waterConfig: WaterConfig;
  reducedMotion: boolean;
  crtMode: boolean;
  dprCap: number;
  cssWidth: number;
  cssHeight: number;
}

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

interface RegisteredAtlas2D {
  albedo: HTMLImageElement | HTMLCanvasElement;
  normal?: HTMLImageElement | HTMLCanvasElement;
  emissive?: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  pixelCrisp: boolean;
  regions: Record<string, AtlasRegion>;
  emissiveAlphaData?: Uint8ClampedArray | null;
  emissiveW?: number;
  emissiveH?: number;
  emissiveRegionCache?: Map<string, boolean>;
}

const MAX_LIGHTS = 24;

export function createDefaultCamera(width = 960, height = 540): CameraState {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    shakeX: 0,
    shakeY: 0,
    rotation: 0,
    viewportWidth: width,
    viewportHeight: height,
  };
}

export function createDefaultColorGrade(): BiomeColorGrade {
  return {
    biomeId: 'village',
    ambientRgb: [0.68, 0.72, 0.88],
    ambientStrength: 0.72,
    tintRgb: [1.03, 0.98, 0.92],
    contrast: 1.06,
    saturation: 1.12,
    bloomIntensity: 0.42,
    bloomThreshold: 0.7,
    vignetteStrength: 0.28,
    skyTopHex: '#10183d',
    skyHorizonHex: '#3b4f8c',
    starlightGlow: 0.85,
  };
}

export function createDefaultCanopyConfig(): CanopyShadowConfig {
  return {
    enabled: false,
    sunbeamIntensity: 0.35,
    sunbeamAngle: -0.45,
    sunbeamColor: [1.0, 0.94, 0.74],
    cloudSpeedX: 0.35,
    cloudSpeedY: 0.14,
    cloudOpacity: 0.32,
  };
}

export function createDefaultWaterConfig(): WaterConfig {
  return {
    enabled: true,
    time: 0,
    skyTopColor: [0.07, 0.11, 0.28],
    skyBottomColor: [0.24, 0.38, 0.64],
    starlightIntensity: 0.75,
    waveAmplitude: 1.0,
    foamColor: [0.88, 0.96, 1.0],
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function rgb01To255(c: number): number {
  return Math.round(clamp(c, 0, 1) * 255);
}

function rgbaStr(r: number, g: number, b: number, a: number): string {
  return `rgba(${rgb01To255(r)}, ${rgb01To255(g)}, ${rgb01To255(b)}, ${clamp(a, 0, 1).toFixed(4)})`;
}

function getImageSourceDimensions(src: CanvasImageSource): { width: number; height: number } {
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

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export class Canvas2DBackend implements IRenderBackend {
  readonly kind: BackendKind = 'canvas2d';

  private _capabilities: RendererCapabilities = {
    kind: 'canvas2d',
    webgl2Supported: false,
    isSoftwareRasterizer: false,
    rendererString: 'Canvas2D Parity Renderer',
    maxTextureSize: 4096,
    dpr: 1,
    reducedMotion: false,
    crtMode: false,
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dprCap = 2;
  private dpr = 1;
  private cssWidth = 960;
  private cssHeight = 540;
  private disposed = false;

  private camera: CameraState = createDefaultCamera();
  private colorGrade: BiomeColorGrade = createDefaultColorGrade();
  private canopyConfig: CanopyShadowConfig = createDefaultCanopyConfig();
  private waterConfig: WaterConfig = createDefaultWaterConfig();
  private reducedMotion = false;
  private crtMode = false;

  private atlases = new Map<string, RegisteredAtlas2D>();
  private crtPattern: CanvasPattern | null = null;
  private lightSpriteCache = new Map<string, HTMLCanvasElement>();
  private cloudSpriteCache = new Map<string, HTMLCanvasElement>();
  private vignetteSpriteCache = new Map<string, HTMLCanvasElement>();
  private vignetteCacheKey = '';
  private vignetteCacheGrad: CanvasGradient | null = null;

  // Per-frame queues
  private frameTimeSeconds = 0;
  private clearColor: [number, number, number, number] = [0.04, 0.06, 0.14, 1];
  private worldSegments: WorldSegment[] = [];
  private lights: PointLight[] = [];
  private particles: ParticleDrawCmd[] = [];
  private postLightDraws: Custom2DDrawFn[] = [];
  private screenDraws: Custom2DDrawFn[] = [];

  // Frame telemetry
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
    backend: 'canvas2d',
    contextLostCount: 0,
    contextRestoredCount: 0,
  };

  get capabilities(): RendererCapabilities {
    return { ...this._capabilities };
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

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      ctx = canvas.getContext('2d');
    }
    if (!ctx) {
      throw new Error('Failed to acquire Canvas2D rendering context');
    }
    this.ctx = ctx;

    const initialW = canvas.clientWidth || canvas.width || 960;
    const initialH = canvas.clientHeight || canvas.height || 540;
    const rawDpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    this.resize(initialW, initialH, rawDpr);

    this._capabilities = {
      ...this._capabilities,
      kind: 'canvas2d',
      dpr: this.dpr,
      reducedMotion: this.reducedMotion,
      crtMode: this.crtMode,
    };

    this.buildCrtPattern();
  }

  setCapabilityMetadata(meta: Partial<Pick<RendererCapabilities, 'webgl2Supported' | 'isSoftwareRasterizer' | 'rendererString'>>): void {
    this._capabilities = {
      ...this._capabilities,
      ...meta,
      kind: 'canvas2d',
    };
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
    const effectiveDpr = clamp(rawDpr, 1, this.dprCap);

    this.cssWidth = safeW;
    this.cssHeight = safeH;
    this.dpr = effectiveDpr;
    this._capabilities.dpr = effectiveDpr;

    this.camera.viewportWidth = safeW;
    this.camera.viewportHeight = safeH;

    if (this.canvas) {
      const targetW = Math.max(1, Math.round(safeW * effectiveDpr));
      const targetH = Math.max(1, Math.round(safeH * effectiveDpr));
      if (this.canvas.width !== targetW) {
        this.canvas.width = targetW;
      }
      if (this.canvas.height !== targetH) {
        this.canvas.height = targetH;
      }
    }
  }

  registerAtlas(
    sheetId: string,
    albedo: HTMLImageElement | HTMLCanvasElement,
    normal?: HTMLImageElement | HTMLCanvasElement,
    emissive?: HTMLImageElement | HTMLCanvasElement,
    pixelCrisp = true,
  ): void {
    const dims = getImageSourceDimensions(albedo);
    const existingRegions = this.atlases.get(sheetId)?.regions ?? {};
    let emissiveAlphaData: Uint8ClampedArray | null = null;
    let emissiveW = 0;
    let emissiveH = 0;

    if (emissive && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const eDims = getImageSourceDimensions(emissive);
      if (eDims.width > 0 && eDims.height > 0 && eDims.width <= 2048 && eDims.height <= 2048) {
        try {
          const probe = document.createElement('canvas');
          probe.width = eDims.width;
          probe.height = eDims.height;
          const pctx = probe.getContext('2d', { willReadFrequently: true });
          if (pctx) {
            pctx.drawImage(emissive, 0, 0);
            const imgData = pctx.getImageData(0, 0, eDims.width, eDims.height).data;
            const alpha = new Uint8ClampedArray(eDims.width * eDims.height);
            for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
              alpha[i] = imgData[p];
            }
            emissiveAlphaData = alpha;
            emissiveW = eDims.width;
            emissiveH = eDims.height;
          }
        } catch {
          emissiveAlphaData = null;
        }
      }
    }

    this.atlases.set(sheetId, {
      albedo,
      normal,
      emissive,
      width: dims.width,
      height: dims.height,
      pixelCrisp: pixelCrisp !== false,
      regions: existingRegions,
      emissiveAlphaData,
      emissiveW,
      emissiveH,
      emissiveRegionCache: emissiveAlphaData ? new Map<string, boolean>() : undefined,
    });
  }

  private hasEmissivePixels(
    atlas: RegisteredAtlas2D | undefined,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): boolean {
    if (!atlas?.emissiveAlphaData || !atlas.emissiveW || !atlas.emissiveH || !atlas.emissiveRegionCache) {
      return true;
    }
    const x0 = Math.max(0, Math.floor(sx));
    const y0 = Math.max(0, Math.floor(sy));
    const x1 = Math.min(atlas.emissiveW, Math.ceil(sx + sw));
    const y1 = Math.min(atlas.emissiveH, Math.ceil(sy + sh));
    const key = `${x0},${y0},${x1},${y1}`;
    const cached = atlas.emissiveRegionCache.get(key);
    if (cached !== undefined) return cached;

    const alpha = atlas.emissiveAlphaData;
    const stride = atlas.emissiveW;
    let found = false;
    for (let y = y0; y < y1 && !found; y++) {
      const row = y * stride;
      for (let x = x0; x < x1; x++) {
        if (alpha[row + x] > 4) {
          found = true;
          break;
        }
      }
    }
    atlas.emissiveRegionCache.set(key, found);
    return found;
  }

  private hasRealDomCanvas(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      this.canvas instanceof HTMLCanvasElement
    );
  }

  private getPointLightSprite(r: number, g: number, b: number): HTMLCanvasElement | null {
    if (!this.hasRealDomCanvas()) {
      return null;
    }
    const qr = Math.round(clamp(r, 0, 1) * 15);
    const qg = Math.round(clamp(g, 0, 1) * 15);
    const qb = Math.round(clamp(b, 0, 1) * 15);
    const key = `${qr}_${qg}_${qb}`;
    const cached = this.lightSpriteCache.get(key);
    if (cached) return cached;

    try {
      const size = 64;
      const half = size * 0.5;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const lctx = c.getContext('2d', { willReadFrequently: true });
      if (!lctx) return null;
      const grad = lctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, rgbaStr(r, g, b, 0.22));
      grad.addColorStop(0.45, rgbaStr(r, g, b, 0.10));
      grad.addColorStop(1, rgbaStr(r, g, b, 0));
      lctx.fillStyle = grad;
      lctx.fillRect(0, 0, size, size);
      if (this.lightSpriteCache.size > 48) {
        this.lightSpriteCache.clear();
      }
      this.lightSpriteCache.set(key, c);
      return c;
    } catch {
      return null;
    }
  }

  private getCloudShadowSprite(opacity: number): HTMLCanvasElement | null {
    if (!this.hasRealDomCanvas()) {
      return null;
    }
    const key = opacity.toFixed(2);
    const cached = this.cloudSpriteCache.get(key);
    if (cached) return cached;
    try {
      const size = 64;
      const half = size * 0.5;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      if (!cctx) return null;
      const grad = cctx.createRadialGradient(half, half, half * 0.15, half, half, half);
      grad.addColorStop(0, `rgba(10, 16, 36, ${clamp(opacity * 0.22, 0, 0.32).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(10, 16, 36, 0)');
      cctx.fillStyle = grad;
      cctx.fillRect(0, 0, size, size);
      if (this.cloudSpriteCache.size > 16) this.cloudSpriteCache.clear();
      this.cloudSpriteCache.set(key, c);
      return c;
    } catch {
      return null;
    }
  }

  private getVignetteSprite(vig: number): HTMLCanvasElement | null {
    if (!this.hasRealDomCanvas()) {
      return null;
    }
    const key = vig.toFixed(2);
    const cached = this.vignetteSpriteCache.get(key);
    if (cached) return cached;
    try {
      const size = 128;
      const half = size * 0.5;
      const outerR = Math.hypot(half, half) * 1.05;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const vctx = c.getContext('2d', { willReadFrequently: true });
      if (!vctx) return null;
      const grad = vctx.createRadialGradient(half, half, outerR * 0.42, half, half, outerR);
      grad.addColorStop(0, 'rgba(6, 10, 24, 0)');
      grad.addColorStop(1, `rgba(6, 10, 24, ${(vig * 0.72).toFixed(3)})`);
      vctx.fillStyle = grad;
      vctx.fillRect(0, 0, size, size);
      if (this.vignetteSpriteCache.size > 16) this.vignetteSpriteCache.clear();
      this.vignetteSpriteCache.set(key, c);
      return c;
    } catch {
      return null;
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
    const ctx = this.ctx;
    let drawCalls = 0;
    let activeLights = 0;
    const activeParticles = this.particles.length;

    if (ctx && !this.disposed) {
      const w = this.cssWidth;
      const h = this.cssHeight;
      const dpr = this.dpr;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgbaStr(
        this.clearColor[0],
        this.clearColor[1],
        this.clearColor[2],
        this.clearColor[3],
      );
      ctx.fillRect(0, 0, w, h);
      drawCalls += 1;

      // Pass 1: World pass (water quads, sprites, custom2d('world') in exact draw order)
      for (const seg of this.worldSegments) {
        if (seg.kind === 'water') {
          if (this.waterConfig.enabled && seg.items.length > 0) {
            drawCalls += this.renderWaterQuads(ctx, seg.items);
          }
        } else if (seg.kind === 'sprites') {
          drawCalls += this.renderSprites(ctx, seg.items);
        } else {
          for (const fn of seg.items) {
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            fn(ctx, w, h, dpr);
            ctx.restore();
            drawCalls += 1;
          }
        }
      }

      // Pass 2: Ambient biome mood + dynamic PointLights + Canopy sunbeams & clouds
      const lightResult = this.renderLightingAndCanopy(ctx, w, h);
      drawCalls += lightResult.drawCalls;
      activeLights = lightResult.activeLights;

      // Pass 3: Soft glowing particles + post-light custom2d
      if (this.particles.length > 0) {
        drawCalls += this.renderParticles(ctx);
      }
      for (const fn of this.postLightDraws) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fn(ctx, w, h, dpr);
        ctx.restore();
        drawCalls += 1;
      }

      // Pass 4: Biome color-grade tint, radial vignette, and optional CRT scanlines
      drawCalls += this.renderPostProcess(ctx, w, h);

      // Screen-space HUD / overlays
      for (const fn of this.screenDraws) {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fn(ctx, w, h, dpr);
        ctx.restore();
        drawCalls += 1;
      }

      ctx.restore();
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
      backend: 'canvas2d',
      contextLostCount: this.contextLostCount,
      contextRestoredCount: this.contextRestoredCount,
    };

    return { ...this.lastStats };
  }

  getCanvas2DContext(): CanvasRenderingContext2D | null {
    return this.ctx;
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
    this.disposed = true;
    this.worldSegments.length = 0;
    this.lights.length = 0;
    this.particles.length = 0;
    this.postLightDraws.length = 0;
    this.screenDraws.length = 0;
    this.atlases.clear();
    this.lightSpriteCache.clear();
    this.cloudSpriteCache.clear();
    this.vignetteSpriteCache.clear();
    this.vignetteCacheKey = '';
    this.vignetteCacheGrad = null;
    this.crtPattern = null;
    this.ctx = null;
    this.canvas = null;
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

  private applyCameraToContext(ctx: CanvasRenderingContext2D): void {
    const cx = this.cssWidth * 0.5;
    const cy = this.cssHeight * 0.5;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(cx + this.camera.shakeX, cy + this.camera.shakeY);
    if (this.camera.rotation !== 0) {
      ctx.rotate(this.camera.rotation);
    }
    if (this.camera.zoom !== 1) {
      ctx.scale(this.camera.zoom, this.camera.zoom);
    }
    ctx.translate(-cx - this.camera.x, -cy - this.camera.y);
  }

  private renderWaterQuads(ctx: CanvasRenderingContext2D, quads: WaterQuadCmd[]): number {
    const cfg = this.waterConfig;
    const motionScale = this.reducedMotion ? 0.2 : 1.0;
    const t = (cfg.time || this.frameTimeSeconds) * motionScale;
    const amp = clamp(cfg.waveAmplitude, 0, 2.5);
    let calls = 0;

    ctx.save();
    this.applyCameraToContext(ctx);

    for (const q of quads) {
      const depth = clamp(q.depthFactor, 0, 1);
      const alpha = 0.84 + depth * 0.12;

      // Multi-depth pixel-crisp 2-band water + twilight sky reflection (avoids per-tile CanvasGradient allocs)
      const topR = cfg.skyTopColor[0] * 0.5 + (0.14 * (1 - depth) + 0.04 * depth);
      const topG = cfg.skyTopColor[1] * 0.5 + (0.54 * (1 - depth) + 0.14 * depth);
      const topB = cfg.skyTopColor[2] * 0.5 + (0.72 * (1 - depth) + 0.34 * depth);

      const botR = cfg.skyBottomColor[0] * 0.45 + (0.18 * (1 - depth) + 0.06 * depth);
      const botG = cfg.skyBottomColor[1] * 0.45 + (0.62 * (1 - depth) + 0.2 * depth);
      const botB = cfg.skyBottomColor[2] * 0.45 + (0.78 * (1 - depth) + 0.42 * depth);

      const halfH = Math.ceil(q.h * 0.5);
      ctx.fillStyle = rgbaStr(topR, topG, topB, alpha);
      ctx.fillRect(q.x, q.y, q.w, halfH);
      ctx.fillStyle = rgbaStr(botR, botG, botB, alpha);
      ctx.fillRect(q.x, q.y + halfH, q.w, q.h - halfH);
      calls += 1;

      // Pixel-snapped horizontal ripple shimmer bars
      const bandCount = Math.max(2, Math.min(5, Math.floor(q.h / 12)));
      ctx.fillStyle = rgbaStr(
        cfg.skyBottomColor[0] * 0.7 + 0.3,
        cfg.skyBottomColor[1] * 0.7 + 0.3,
        cfg.skyBottomColor[2] * 0.7 + 0.3,
        0.18 * (1 - depth * 0.35),
      );
      for (let i = 0; i < bandCount; i++) {
        const frac = (i + 0.5) / bandCount;
        const wy = Math.round(q.y + frac * q.h);
        const shift = Math.round(Math.sin(t * 2.1 + wy * 0.12 + q.x * 0.05) * 3.2 * amp);
        const segW = Math.max(
          4,
          Math.round(q.w * (0.36 + 0.22 * Math.sin(t * 1.4 + i * 1.7 + q.x * 0.04))),
        );
        const sx = Math.round(q.x + ((q.w - segW) * 0.5 + shift));
        ctx.fillRect(clamp(sx, q.x, q.x + q.w - 2), wy, Math.min(segW, q.w), 1);
      }

      // Pixel-snapped twinkling starlight 4-point cross sparkles
      if (cfg.starlightIntensity > 0.02) {
        const cellX = Math.floor(q.x / 24);
        const cellY = Math.floor(q.y / 24);
        const seed = hash2d(cellX, cellY);
        if (seed > 0.38) {
          const twinkleRaw = 0.5 + 0.5 * Math.sin(t * (2.5 + seed * 4.0) + seed * 25.0);
          const twinkle = Math.floor(twinkleRaw * 4) / 4;
          const sparkAlpha = twinkle * cfg.starlightIntensity * 0.78;
          if (sparkAlpha > 0.06) {
            const sx = Math.round(
              q.x + (0.18 + seed * 0.64) * q.w + Math.sin(t * 1.8 + seed * 10) * 1.5,
            );
            const sy = Math.round(q.y + (0.18 + hash2d(cellY, cellX) * 0.64) * q.h);
            ctx.fillStyle = `rgba(255, 248, 224, ${clamp(sparkAlpha, 0, 1).toFixed(3)})`;
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy - 1, 1, 3);
          }
        }
      }

      // Pixel-snapped animated shoreline surf foam (0..1 float & 4-bit N/E/S/W bitmask)
      if (q.foamMask > 0.001) {
        const waveOffset = Math.round(Math.sin(t * 3.1 + q.x * 0.15 + q.y * 0.12) * 2.0 * amp);
        const foamThickness = Math.max(2, Math.round(Math.min(q.w, q.h) * 0.14));
        ctx.fillStyle = rgbaStr(cfg.foamColor[0], cfg.foamColor[1], cfg.foamColor[2], 0.78);

        if (q.foamMask > 1.01) {
          const mask = Math.round(q.foamMask);
          const inset = Math.max(0, Math.round(waveOffset * 0.5));
          if ((mask & 1) !== 0) {
            ctx.fillRect(q.x, q.y + inset, q.w, foamThickness);
          }
          if ((mask & 2) !== 0) {
            ctx.fillRect(q.x + q.w - foamThickness - inset, q.y, foamThickness, q.h);
          }
          if ((mask & 4) !== 0) {
            ctx.fillRect(q.x, q.y + q.h - foamThickness - inset, q.w, foamThickness);
          }
          if ((mask & 8) !== 0) {
            ctx.fillRect(q.x + inset, q.y, foamThickness, q.h);
          }
        } else {
          const intensity = clamp(q.foamMask, 0, 1);
          const inset = Math.max(0, Math.round(waveOffset * 0.5));
          ctx.fillStyle = rgbaStr(cfg.foamColor[0], cfg.foamColor[1], cfg.foamColor[2], 0.72 * intensity);
          ctx.fillRect(q.x + 1, q.y + inset, q.w - 2, Math.max(2, Math.round(foamThickness * 0.85)));
          ctx.fillRect(
            q.x + 2,
            Math.round(q.y + q.h * 0.5 + waveOffset * 0.4),
            Math.round(q.w * 0.65),
            Math.max(1, Math.round(foamThickness * 0.45)),
          );
        }
      }
    }

    ctx.restore();
    return calls;
  }

  private renderSprites(ctx: CanvasRenderingContext2D, sprites: SpriteDrawCmd[]): number {
    if (sprites.length === 0) return 0;
    const ordered =
      sprites.length > 1
        ? [...sprites].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
        : sprites;

    let calls = 0;
    ctx.save();
    this.applyCameraToContext(ctx);
    let lastSmoothing: boolean | null = null;
    const emissiveBatch: Array<{
      img: CanvasImageSource;
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      dx: number;
      dy: number;
      dw: number;
      dh: number;
      alpha: number;
      crisp: boolean;
    }> = [];

    const flushEmissiveBatch = () => {
      if (emissiveBatch.length === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      let lastEmSmooth: boolean | null = null;
      let lastEmAlpha = -1;
      for (const em of emissiveBatch) {
        const wantSmooth = !em.crisp;
        if (lastEmSmooth !== wantSmooth) {
          ctx.imageSmoothingEnabled = wantSmooth;
          lastEmSmooth = wantSmooth;
        }
        if (lastEmAlpha !== em.alpha) {
          ctx.globalAlpha = em.alpha;
          lastEmAlpha = em.alpha;
        }
        ctx.drawImage(em.img, em.sx, em.sy, em.sw, em.sh, em.dx, em.dy, em.dw, em.dh);
      }
      ctx.restore();
      emissiveBatch.length = 0;
      lastSmoothing = null;
    };

    for (const cmd of ordered) {
      let source: CanvasImageSource | undefined = cmd.source;
      let atlasRecord: RegisteredAtlas2D | undefined;
      let atlasEmissive: CanvasImageSource | undefined;
      let defaultCrisp = true;
      let sx = cmd.sx;
      let sy = cmd.sy;
      let sw = cmd.sw;
      let sh = cmd.sh;

      if (!source && cmd.sheetId) {
        const atlas = this.atlases.get(cmd.sheetId);
        if (atlas) {
          atlasRecord = atlas;
          source = atlas.albedo;
          atlasEmissive = atlas.emissive;
          defaultCrisp = atlas.pixelCrisp;
          if (cmd.regionId && atlas.regions[cmd.regionId]) {
            const r = atlas.regions[cmd.regionId];
            sx = sx ?? r.x;
            sy = sy ?? r.y;
            sw = sw ?? r.w;
            sh = sh ?? r.h;
          }
        }
      }

      if (!source) {
        continue;
      }

      const dims = getImageSourceDimensions(source);
      const srcX = sx ?? 0;
      const srcY = sy ?? 0;
      const srcW = sw ?? dims.width;
      const srcH = sh ?? dims.height;

      const alpha = clamp((cmd.alpha ?? 1) * (cmd.tint ? cmd.tint[3] : 1), 0, 1);
      if (alpha <= 0.003) {
        continue;
      }

      const crisp = cmd.pixelCrisp !== undefined ? cmd.pixelCrisp !== false : defaultCrisp;
      const hasRim = Boolean(cmd.rimColor && cmd.rimColor[3] > 0.01);
      const isSimple = !cmd.rotation && !cmd.flipX && !hasRim && !cmd.additive && alpha >= 0.999;

      if (isSimple) {
        if (!crisp && emissiveBatch.length > 0) {
          flushEmissiveBatch();
        }
        const wantSmooth = !crisp;
        if (lastSmoothing !== wantSmooth) {
          ctx.imageSmoothingEnabled = wantSmooth;
          lastSmoothing = wantSmooth;
        }
        ctx.drawImage(source, srcX, srcY, srcW, srcH, cmd.dx, cmd.dy, cmd.dw, cmd.dh);
        calls += 1;

        if (
          atlasEmissive &&
          (cmd.emissive === undefined || cmd.emissive > 0.01) &&
          this.hasEmissivePixels(atlasRecord, srcX, srcY, srcW, srcH)
        ) {
          emissiveBatch.push({
            img: atlasEmissive,
            sx: srcX,
            sy: srcY,
            sw: srcW,
            sh: srcH,
            dx: cmd.dx,
            dy: cmd.dy,
            dw: cmd.dw,
            dh: cmd.dh,
            alpha: 0.9,
            crisp,
          });
        }
        if (cmd.emissive && cmd.emissive > 0.05) {
          emissiveBatch.push({
            img: source,
            sx: srcX,
            sy: srcY,
            sw: srcW,
            sh: srcH,
            dx: cmd.dx,
            dy: cmd.dy,
            dw: cmd.dw,
            dh: cmd.dh,
            alpha: clamp(cmd.emissive * 0.45, 0, 0.85),
            crisp,
          });
        }
        continue;
      }

      flushEmissiveBatch();

      ctx.save();
      ctx.imageSmoothingEnabled = !crisp;
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = cmd.additive ? 'lighter' : 'source-over';

      const cx = cmd.dx + cmd.dw * 0.5;
      const cy = cmd.dy + cmd.dh * 0.5;
      ctx.translate(cx, cy);
      if (cmd.rotation) {
        ctx.rotate(cmd.rotation);
      }
      if (cmd.flipX) {
        ctx.scale(-1, 1);
      }

      // Crisp HD-2D pixel rim halo (avoids Skia shadowBlur full-layer Gaussian stalls on Canvas2D)
      if (hasRim && cmd.rimColor && !cmd.additive) {
        ctx.save();
        ctx.imageSmoothingEnabled = !crisp;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(alpha * cmd.rimColor[3] * 0.34, 0, 0.45);
        ctx.drawImage(
          source,
          srcX,
          srcY,
          srcW,
          srcH,
          -cmd.dw * 0.5 - 2,
          -cmd.dh * 0.5 - 2,
          cmd.dw + 4,
          cmd.dh + 4,
        );
        ctx.restore();
      }

      ctx.drawImage(source, srcX, srcY, srcW, srcH, -cmd.dw * 0.5, -cmd.dh * 0.5, cmd.dw, cmd.dh);
      calls += 1;

      if (
        atlasEmissive &&
        (cmd.emissive === undefined || cmd.emissive > 0.01) &&
        this.hasEmissivePixels(atlasRecord, srcX, srcY, srcW, srcH)
      ) {
        ctx.imageSmoothingEnabled = !crisp;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(alpha * 0.9, 0, 1);
        ctx.drawImage(
          atlasEmissive,
          srcX,
          srcY,
          srcW,
          srcH,
          -cmd.dw * 0.5,
          -cmd.dh * 0.5,
          cmd.dw,
          cmd.dh,
        );
      }

      if (cmd.emissive && cmd.emissive > 0.05) {
        ctx.imageSmoothingEnabled = !crisp;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(alpha * cmd.emissive * 0.45, 0, 0.85);
        ctx.drawImage(source, srcX, srcY, srcW, srcH, -cmd.dw * 0.5, -cmd.dh * 0.5, cmd.dw, cmd.dh);
      }

      ctx.restore();
      lastSmoothing = null;
    }

    flushEmissiveBatch();

    ctx.restore();
    return calls;
  }

  private renderLightingAndCanopy(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): { drawCalls: number; activeLights: number } {
    let drawCalls = 0;
    const motionScale = this.reducedMotion ? 0.15 : 1.0;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Subtle twilight/biome ambient tint wash when ambientStrength < 0.92
    const ambStrength = clamp(this.colorGrade.ambientStrength, 0, 1);
    if (ambStrength < 0.92) {
      const darkness = clamp((0.92 - ambStrength) * 0.34, 0, 0.24);
      const [ar, ag, ab] = this.colorGrade.ambientRgb;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgbaStr(ar * 0.28, ag * 0.32, ab * 0.45, darkness);
      ctx.fillRect(0, 0, w, h);
      drawCalls += 1;
    }

    // Additive radial PointLight blooms (up to 24 visible lights)
    let activeLights = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.lights.length && activeLights < MAX_LIGHTS; i++) {
      const light = this.lights[i];
      if (light.intensity <= 0.005 || light.radius <= 0.5) continue;

      let sx = light.x;
      let sy = light.y;
      let radius = light.radius;
      if (!light.screenSpace) {
        [sx, sy] = this.worldToScreen(light.x, light.y);
        radius = light.radius * this.camera.zoom;
      }

      if (sx + radius < 0 || sx - radius > w || sy + radius < 0 || sy - radius > h) {
        continue;
      }

      activeLights += 1;
      const flickAmt = (light.flickerAmount ?? 0) * motionScale;
      const flickSpeed = light.flickerSpeed ?? 3.0;
      const flicker =
        flickAmt > 0.001
          ? 1 + Math.sin(this.frameTimeSeconds * flickSpeed + i * 2.37) * flickAmt
          : 1;
      const strength = clamp(light.intensity * flicker, 0, 2);
      const [r, g, b] = light.color;

      const lightSprite = this.getPointLightSprite(r, g, b);
      if (lightSprite) {
        ctx.globalAlpha = clamp(strength, 0, 1.45);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(lightSprite, sx - radius, sy - radius, radius * 2, radius * 2);
      } else {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grad.addColorStop(0, rgbaStr(r, g, b, clamp(0.2 * strength, 0, 0.34)));
        grad.addColorStop(0.45, rgbaStr(r, g, b, clamp(0.09 * strength, 0, 0.16)));
        grad.addColorStop(1, rgbaStr(r, g, b, 0));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCalls += 1;
    }
    ctx.globalAlpha = 1;

    // Diagonal canopy sunbeam shafts & drifting cloud shadow bands
    if (this.canopyConfig.enabled) {
      const cfg = this.canopyConfig;
      const t = this.frameTimeSeconds * motionScale;

      if (cfg.sunbeamIntensity > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(w * 0.5, h * 0.5);
        ctx.rotate(cfg.sunbeamAngle);
        const span = Math.hypot(w, h);
        const [sr, sg, sb] = cfg.sunbeamColor;
        const beamCount = 5;
        const outerFill = rgbaStr(sr, sg, sb, clamp(cfg.sunbeamIntensity * 0.11, 0, 0.16));
        const innerFill = rgbaStr(sr, sg, sb, clamp(cfg.sunbeamIntensity * 0.14, 0, 0.2));

        for (let i = 0; i < beamCount; i++) {
          const offset = ((i / beamCount) - 0.5) * span + Math.sin(t * 0.45 + i * 1.9) * 28;
          const beamW = span * (0.065 + 0.025 * Math.sin(i * 2.3 + 0.7));
          ctx.fillStyle = outerFill;
          ctx.fillRect(offset - beamW * 0.5, -span * 0.5, beamW, span * 0.72);
          ctx.fillStyle = innerFill;
          ctx.fillRect(offset - beamW * 0.24, -span * 0.5, beamW * 0.48, span * 0.56);
        }
        ctx.restore();
        drawCalls += 1;
      }

      if (cfg.cloudOpacity > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const driftX = (t * cfg.cloudSpeedX * 36) % (w + 260);
        const driftY = (t * cfg.cloudSpeedY * 22) % (h + 180);
        const cloudSprite = this.getCloudShadowSprite(cfg.cloudOpacity);
        if (cloudSprite) {
          ctx.imageSmoothingEnabled = true;
        }
        for (let i = 0; i < 4; i++) {
          const cx = ((driftX + i * (w * 0.34)) % (w + 260)) - 130;
          const cy = ((driftY + i * (h * 0.29)) % (h + 180)) - 90;
          const rx = 140 + (i % 2) * 55;
          if (cloudSprite) {
            ctx.drawImage(cloudSprite, cx - rx, cy - rx, rx * 2, rx * 2);
          } else {
            const grad = ctx.createRadialGradient(cx, cy, rx * 0.15, cx, cy, rx);
            grad.addColorStop(0, `rgba(10, 16, 36, ${clamp(cfg.cloudOpacity * 0.22, 0, 0.32).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(10, 16, 36, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, rx, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        drawCalls += 1;
      }
    }

    ctx.restore();
    return { drawCalls, activeLights };
  }

  private renderParticles(ctx: CanvasRenderingContext2D): number {
    let calls = 0;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (const p of this.particles) {
      const alpha = clamp(p.color[3], 0, 1);
      if (alpha <= 0.004 || p.radius <= 0.2) continue;

      const [sx, sy] = this.worldToScreen(p.x, p.y);
      const r = Math.max(0.5, p.radius * this.camera.zoom);
      const stretchX = Math.max(0.05, p.stretchX ?? 1);
      const stretchY = Math.max(0.05, p.stretchY ?? 1);
      const softness = clamp(p.softness ?? 0.7, 0.05, 1);

      ctx.save();
      ctx.globalCompositeOperation = p.additive === false ? 'source-over' : 'lighter';
      ctx.translate(sx, sy);
      if (p.rotation) {
        ctx.rotate(p.rotation);
      }
      if (stretchX !== 1 || stretchY !== 1) {
        ctx.scale(stretchX, stretchY);
      }

      const [cr, cg, cb] = p.color;
      if (r <= 8 && typeof document !== 'undefined') {
        ctx.fillStyle = rgbaStr(cr, cg, cb, alpha * 0.42);
        ctx.fillRect(-r, -r, r * 2, r * 2);
        const core = Math.max(1, r * 0.55);
        ctx.fillStyle = rgbaStr(Math.min(1, cr * 1.2), Math.min(1, cg * 1.2), Math.min(1, cb * 1.2), alpha);
        ctx.fillRect(-core, -core, core * 2, core * 2);
      } else {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        const innerStop = clamp(1 - softness, 0, 0.85);
        grad.addColorStop(0, rgbaStr(Math.min(1, cr * 1.2), Math.min(1, cg * 1.2), Math.min(1, cb * 1.2), alpha));
        if (innerStop > 0.05) {
          grad.addColorStop(innerStop, rgbaStr(cr, cg, cb, alpha * 0.8));
        }
        grad.addColorStop(1, rgbaStr(cr, cg, cb, 0));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      calls += 1;
    }

    ctx.restore();
    return calls;
  }

  private renderPostProcess(ctx: CanvasRenderingContext2D, w: number, h: number): number {
    let calls = 0;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Subtle biome color-grade tint wash
    const [tr, tg, tb] = this.colorGrade.tintRgb;
    const tintDelta = Math.abs(tr - 1) + Math.abs(tg - 1) + Math.abs(tb - 1);
    if (tintDelta > 0.03) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgbaStr(
        clamp(0.5 + (tr - 1) * 1.4, 0, 1),
        clamp(0.5 + (tg - 1) * 1.4, 0, 1),
        clamp(0.5 + (tb - 1) * 1.4, 0, 1),
        0.06,
      );
      ctx.fillRect(0, 0, w, h);
      calls += 1;
    }

    // Radial vignette (pre-baked 128x128 sprite in browser; cached radial gradient in headless mocks)
    const vig = clamp(this.colorGrade.vignetteStrength, 0, 0.85);
    if (vig > 0.01) {
      const vigSprite = this.getVignetteSprite(vig);
      if (vigSprite) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(vigSprite, 0, 0, w, h);
      } else {
        const vKey = `${w}x${h}x${vig.toFixed(2)}`;
        if (this.vignetteCacheKey !== vKey || !this.vignetteCacheGrad) {
          const cx = w * 0.5;
          const cy = h * 0.5;
          const outerR = Math.hypot(cx, cy) * 1.05;
          const grad = ctx.createRadialGradient(cx, cy, outerR * 0.42, cx, cy, outerR);
          grad.addColorStop(0, 'rgba(6, 10, 24, 0)');
          grad.addColorStop(1, `rgba(6, 10, 24, ${(vig * 0.72).toFixed(3)})`);
          this.vignetteCacheKey = vKey;
          this.vignetteCacheGrad = grad;
        }
        ctx.fillStyle = this.vignetteCacheGrad;
        ctx.fillRect(0, 0, w, h);
      }
      calls += 1;
    }

    // Crisp optional CRT scanlines
    if (this.crtMode) {
      if (this.crtPattern) {
        ctx.fillStyle = this.crtPattern;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = 'rgba(4, 8, 18, 0.16)';
        for (let y = 0; y < h; y += 3) {
          ctx.fillRect(0, y, w, 1);
        }
      }
      calls += 1;
    }

    ctx.restore();
    return calls;
  }

  private buildCrtPattern(): void {
    this.crtPattern = null;
    if (!this.ctx || typeof document === 'undefined' || typeof this.ctx.createPattern !== 'function') {
      return;
    }
    try {
      const tile = document.createElement('canvas');
      tile.width = 3;
      tile.height = 3;
      const tctx = tile.getContext('2d', { willReadFrequently: true }) ?? tile.getContext('2d');
      if (!tctx) return;
      // Row 0: crisp dark scanline
      tctx.fillStyle = 'rgba(4, 8, 18, 0.18)';
      tctx.fillRect(0, 0, 3, 1);
      // Row 1-2: subtle RGB phosphor grille shimmer
      tctx.fillStyle = 'rgba(255, 110, 110, 0.035)';
      tctx.fillRect(0, 1, 1, 2);
      tctx.fillStyle = 'rgba(110, 255, 150, 0.035)';
      tctx.fillRect(1, 1, 1, 2);
      tctx.fillStyle = 'rgba(110, 170, 255, 0.035)';
      tctx.fillRect(2, 1, 1, 2);
      this.crtPattern = this.ctx.createPattern(tile, 'repeat');
    } catch {
      this.crtPattern = null;
    }
  }
}
