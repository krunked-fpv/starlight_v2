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
  emissiveRegionCache?: Map<number, boolean>;
}

interface EmissiveBatchItem {
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
}

const MAX_LIGHTS = 24;
const WATER_DEPTH_BUCKETS = 7;
const SPARKLE_STYLES: readonly string[] = [
  'rgba(255, 248, 224, 0.12)',
  'rgba(255, 248, 224, 0.24)',
  'rgba(255, 248, 224, 0.36)',
  'rgba(255, 248, 224, 0.48)',
  'rgba(255, 248, 224, 0.60)',
  'rgba(255, 248, 224, 0.72)',
  'rgba(255, 248, 224, 0.84)',
  'rgba(255, 248, 224, 0.96)',
];

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

function getSourceWidth(src: CanvasImageSource): number {
  if ('naturalWidth' in src && typeof src.naturalWidth === 'number' && src.naturalWidth > 0) {
    return src.naturalWidth;
  }
  if ('videoWidth' in src && typeof src.videoWidth === 'number' && src.videoWidth > 0) {
    return src.videoWidth;
  }
  return Math.max(1, 'width' in src && typeof src.width === 'number' ? src.width : 1);
}

function getSourceHeight(src: CanvasImageSource): number {
  if ('naturalHeight' in src && typeof src.naturalHeight === 'number' && src.naturalHeight > 0) {
    return src.naturalHeight;
  }
  if ('videoHeight' in src && typeof src.videoHeight === 'number' && src.videoHeight > 0) {
    return src.videoHeight;
  }
  return Math.max(1, 'height' in src && typeof src.height === 'number' ? src.height : 1);
}

function getImageSourceDimensions(src: CanvasImageSource): { width: number; height: number } {
  return { width: getSourceWidth(src), height: getSourceHeight(src) };
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
  private particleSpriteCache = new Map<string, HTMLCanvasElement>();
  private cloudSpriteCache = new Map<string, HTMLCanvasElement>();
  private vignetteSpriteCache = new Map<string, HTMLCanvasElement>();
  private vignetteCacheKey = '';
  private vignetteCacheGrad: CanvasGradient | null = null;

  // Cached CSS color tables & zero-allocation scratch state
  private clearColorCss = 'rgba(10, 15, 36, 1.0000)';
  private clearColorKey = '';
  private waterPaletteKey = '';
  private waterTopStyles: string[] = new Array<string>(WATER_DEPTH_BUCKETS);
  private waterBotStyles: string[] = new Array<string>(WATER_DEPTH_BUCKETS);
  private waterShimmerStyles: string[] = new Array<string>(WATER_DEPTH_BUCKETS);
  private waterSeafoamStyle = '';
  private waterFoamLipStyle = '';
  private ambientWashKey = '';
  private ambientWashStyle = '';
  private tintWashKey = '';
  private tintWashStyle = '';

  // Per-frame pooled queues (zero GC churn)
  private frameTimeSeconds = 0;
  private clearColor: [number, number, number, number] = [0.04, 0.06, 0.14, 1];
  private worldSegments: WorldSegment[] = [];
  private segmentPoolWater: Array<{ kind: 'water'; items: WaterQuadCmd[] }> = [];
  private segmentPoolSprites: Array<{ kind: 'sprites'; items: SpriteDrawCmd[] }> = [];
  private segmentPoolCustom: Array<{ kind: 'custom2d'; items: Custom2DDrawFn[] }> = [];
  private waterSegCursor = 0;
  private spriteSegCursor = 0;
  private customSegCursor = 0;
  private waterQuadPool: WaterQuadCmd[] = [];
  private waterQuadCursor = 0;
  private spriteSortScratch: SpriteDrawCmd[] = [];
  private emissiveBatchPool: EmissiveBatchItem[] = [];
  private emissiveBatchCount = 0;
  private projX = 0;
  private projY = 0;
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
      ctx = canvas.getContext('2d', { alpha: false });
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
      emissiveRegionCache: emissiveAlphaData ? new Map<number, boolean>() : undefined,
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
    const key = ((x0 & 0x7ff) + ((y0 & 0x7ff) << 11)) + (((x1 - x0) & 0x3ff) * 4194304) + (((y1 - y0) & 0x3ff) * 4294967296);
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
      const lctx = c.getContext('2d');
      if (!lctx) return null;
      const grad = lctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, rgbaStr(r, g, b, 0.17));
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

  private getParticleSprite(r: number, g: number, b: number, softness: number): HTMLCanvasElement | null {
    if (!this.hasRealDomCanvas()) {
      return null;
    }
    const qr = Math.round(clamp(r, 0, 1) * 15);
    const qg = Math.round(clamp(g, 0, 1) * 15);
    const qb = Math.round(clamp(b, 0, 1) * 15);
    const qs = Math.round(clamp(softness, 0.05, 1) * 4);
    const key = `${qr}_${qg}_${qb}_${qs}`;
    const cached = this.particleSpriteCache.get(key);
    if (cached) return cached;

    try {
      const size = 48;
      const half = size * 0.5;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const pctx = c.getContext('2d');
      if (!pctx) return null;
      const innerStop = clamp(1 - qs * 0.25, 0, 0.85);
      const grad = pctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, rgbaStr(Math.min(1, r * 1.2), Math.min(1, g * 1.2), Math.min(1, b * 1.2), 1));
      if (innerStop > 0.05) {
        grad.addColorStop(innerStop, rgbaStr(r, g, b, 0.8));
      }
      grad.addColorStop(1, rgbaStr(r, g, b, 0));
      pctx.fillStyle = grad;
      pctx.fillRect(0, 0, size, size);
      if (this.particleSpriteCache.size > 64) {
        this.particleSpriteCache.clear();
      }
      this.particleSpriteCache.set(key, c);
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
      const cctx = c.getContext('2d');
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
      const vctx = c.getContext('2d');
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
    const c = this.camera;
    if (camera.x !== undefined) c.x = camera.x;
    if (camera.y !== undefined) c.y = camera.y;
    if (camera.zoom !== undefined) c.zoom = camera.zoom;
    if (camera.shakeX !== undefined) c.shakeX = camera.shakeX;
    if (camera.shakeY !== undefined) c.shakeY = camera.shakeY;
    if (camera.rotation !== undefined) c.rotation = camera.rotation;
    c.viewportWidth = camera.viewportWidth ?? this.cssWidth;
    c.viewportHeight = camera.viewportHeight ?? this.cssHeight;
  }

  setColorGrade(grade: BiomeColorGrade): void {
    const g = this.colorGrade;
    g.biomeId = grade.biomeId;
    g.ambientRgb[0] = grade.ambientRgb[0];
    g.ambientRgb[1] = grade.ambientRgb[1];
    g.ambientRgb[2] = grade.ambientRgb[2];
    g.ambientStrength = grade.ambientStrength;
    g.tintRgb[0] = grade.tintRgb[0];
    g.tintRgb[1] = grade.tintRgb[1];
    g.tintRgb[2] = grade.tintRgb[2];
    g.contrast = grade.contrast;
    g.saturation = grade.saturation;
    g.bloomIntensity = grade.bloomIntensity;
    g.bloomThreshold = grade.bloomThreshold;
    g.vignetteStrength = grade.vignetteStrength;
    g.skyTopHex = grade.skyTopHex;
    g.skyHorizonHex = grade.skyHorizonHex;
    g.starlightGlow = grade.starlightGlow;
  }

  setCanopyConfig(config: CanopyShadowConfig): void {
    const c = this.canopyConfig;
    c.enabled = config.enabled;
    c.sunbeamIntensity = config.sunbeamIntensity;
    c.sunbeamAngle = config.sunbeamAngle;
    c.sunbeamColor[0] = config.sunbeamColor[0];
    c.sunbeamColor[1] = config.sunbeamColor[1];
    c.sunbeamColor[2] = config.sunbeamColor[2];
    c.cloudSpeedX = config.cloudSpeedX;
    c.cloudSpeedY = config.cloudSpeedY;
    c.cloudOpacity = config.cloudOpacity;
  }

  setWaterConfig(config: WaterConfig): void {
    const w = this.waterConfig;
    w.enabled = config.enabled;
    w.time = config.time;
    w.skyTopColor[0] = config.skyTopColor[0];
    w.skyTopColor[1] = config.skyTopColor[1];
    w.skyTopColor[2] = config.skyTopColor[2];
    w.skyBottomColor[0] = config.skyBottomColor[0];
    w.skyBottomColor[1] = config.skyBottomColor[1];
    w.skyBottomColor[2] = config.skyBottomColor[2];
    w.starlightIntensity = config.starlightIntensity;
    w.waveAmplitude = config.waveAmplitude;
    w.foamColor[0] = config.foamColor[0];
    w.foamColor[1] = config.foamColor[1];
    w.foamColor[2] = config.foamColor[2];
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

    if (clearColor) {
      this.clearColor[0] = clearColor[0];
      this.clearColor[1] = clearColor[1];
      this.clearColor[2] = clearColor[2];
      this.clearColor[3] = clearColor[3];
    } else {
      this.clearColor[0] = 0.04;
      this.clearColor[1] = 0.06;
      this.clearColor[2] = 0.14;
      this.clearColor[3] = 1;
    }

    this.worldSegments.length = 0;
    this.waterSegCursor = 0;
    this.spriteSegCursor = 0;
    this.customSegCursor = 0;
    this.waterQuadCursor = 0;
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
      let seg = this.segmentPoolSprites[this.spriteSegCursor++];
      if (!seg) {
        seg = { kind: 'sprites', items: [] };
        this.segmentPoolSprites.push(seg);
      } else {
        seg.items.length = 0;
      }
      seg.items.push(cmd);
      this.worldSegments.push(seg);
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
    let quad = this.waterQuadPool[this.waterQuadCursor++];
    if (!quad) {
      quad = { x, y, w, h, depthFactor, foamMask };
      this.waterQuadPool.push(quad);
    } else {
      quad.x = x;
      quad.y = y;
      quad.w = w;
      quad.h = h;
      quad.depthFactor = depthFactor;
      quad.foamMask = foamMask;
    }
    const last = this.worldSegments[this.worldSegments.length - 1];
    if (last && last.kind === 'water') {
      last.items.push(quad);
    } else {
      let seg = this.segmentPoolWater[this.waterSegCursor++];
      if (!seg) {
        seg = { kind: 'water', items: [] };
        this.segmentPoolWater.push(seg);
      } else {
        seg.items.length = 0;
      }
      seg.items.push(quad);
      this.worldSegments.push(seg);
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
        let seg = this.segmentPoolCustom[this.customSegCursor++];
        if (!seg) {
          seg = { kind: 'custom2d', items: [] };
          this.segmentPoolCustom.push(seg);
        } else {
          seg.items.length = 0;
        }
        seg.items.push(drawFn);
        this.worldSegments.push(seg);
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
      const ccKey = `${this.clearColor[0]},${this.clearColor[1]},${this.clearColor[2]},${this.clearColor[3]}`;
      if (ccKey !== this.clearColorKey) {
        this.clearColorKey = ccKey;
        this.clearColorCss = rgbaStr(
          this.clearColor[0],
          this.clearColor[1],
          this.clearColor[2],
          this.clearColor[3],
        );
      }
      ctx.fillStyle = this.clearColorCss;
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

    this.lastStats.fps = Math.round(this.smoothedFps * 10) / 10;
    this.lastStats.frameTimeMs = Math.round(frameTimeMs * 100) / 100;
    this.lastStats.clampedDtMs = Math.round(this.clampedDtMs * 100) / 100;
    this.lastStats.drawCalls = drawCalls;
    this.lastStats.activeLights = activeLights;
    this.lastStats.activeParticles = activeParticles;
    this.lastStats.backend = 'canvas2d';
    this.lastStats.contextLostCount = this.contextLostCount;
    this.lastStats.contextRestoredCount = this.contextRestoredCount;

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
    this.segmentPoolWater.length = 0;
    this.segmentPoolSprites.length = 0;
    this.segmentPoolCustom.length = 0;
    this.waterQuadPool.length = 0;
    this.spriteSortScratch.length = 0;
    this.emissiveBatchPool.length = 0;
    this.lights.length = 0;
    this.particles.length = 0;
    this.postLightDraws.length = 0;
    this.screenDraws.length = 0;
    this.atlases.clear();
    this.lightSpriteCache.clear();
    this.particleSpriteCache.clear();
    this.cloudSpriteCache.clear();
    this.vignetteSpriteCache.clear();
    this.vignetteCacheKey = '';
    this.vignetteCacheGrad = null;
    this.crtPattern = null;
    this.ctx = null;
    this.canvas = null;
  }

  private projectWorldToScreen(wx: number, wy: number): void {
    const cx = this.cssWidth * 0.5;
    const cy = this.cssHeight * 0.5;
    const px = wx - this.camera.x;
    const py = wy - this.camera.y;
    const zoom = this.camera.zoom;
    const rot = this.camera.rotation;

    if (zoom === 1 && rot === 0) {
      this.projX = px + this.camera.shakeX;
      this.projY = py + this.camera.shakeY;
      return;
    }
    const dx = px - cx;
    const dy = py - cy;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    this.projX = cx + (dx * c - dy * s) * zoom + this.camera.shakeX;
    this.projY = cy + (dx * s + dy * c) * zoom + this.camera.shakeY;
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

  private ensureWaterStyleCache(): void {
    const cfg = this.waterConfig;
    const key = `${Math.round(cfg.skyTopColor[0] * 100)}_${Math.round(cfg.skyTopColor[1] * 100)}_${Math.round(cfg.skyTopColor[2] * 100)}_${Math.round(cfg.skyBottomColor[0] * 100)}_${Math.round(cfg.skyBottomColor[1] * 100)}_${Math.round(cfg.skyBottomColor[2] * 100)}_${Math.round(cfg.foamColor[0] * 100)}_${Math.round(cfg.foamColor[1] * 100)}_${Math.round(cfg.foamColor[2] * 100)}`;
    if (this.waterPaletteKey === key) return;
    this.waterPaletteKey = key;

    const maxIdx = WATER_DEPTH_BUCKETS - 1;
    for (let i = 0; i < WATER_DEPTH_BUCKETS; i++) {
      const depth = i / maxIdx;
      const alpha = 0.84 + depth * 0.12;
      const topR = cfg.skyTopColor[0] * 0.5 + (0.14 * (1 - depth) + 0.04 * depth);
      const topG = cfg.skyTopColor[1] * 0.5 + (0.54 * (1 - depth) + 0.14 * depth);
      const topB = cfg.skyTopColor[2] * 0.5 + (0.72 * (1 - depth) + 0.34 * depth);
      const botR = cfg.skyBottomColor[0] * 0.45 + (0.18 * (1 - depth) + 0.06 * depth);
      const botG = cfg.skyBottomColor[1] * 0.45 + (0.62 * (1 - depth) + 0.2 * depth);
      const botB = cfg.skyBottomColor[2] * 0.45 + (0.78 * (1 - depth) + 0.42 * depth);
      this.waterTopStyles[i] = rgbaStr(topR, topG, topB, alpha);
      this.waterBotStyles[i] = rgbaStr(botR, botG, botB, alpha);
      this.waterShimmerStyles[i] = rgbaStr(
        cfg.skyBottomColor[0] * 0.7 + 0.3,
        cfg.skyBottomColor[1] * 0.7 + 0.3,
        cfg.skyBottomColor[2] * 0.7 + 0.3,
        0.18 * (1 - depth * 0.35),
      );
    }
    this.waterSeafoamStyle = rgbaStr(cfg.foamColor[0], cfg.foamColor[1], cfg.foamColor[2], 0.72);
    this.waterFoamLipStyle = rgbaStr(
      cfg.skyBottomColor[0] * 0.5 + 0.5,
      cfg.skyBottomColor[1] * 0.5 + 0.5,
      1.0,
      0.34,
    );
  }

  private renderWaterQuads(ctx: CanvasRenderingContext2D, quads: WaterQuadCmd[]): number {
    const cfg = this.waterConfig;
    const motionScale = this.reducedMotion ? 0.2 : 1.0;
    const t = (cfg.time || this.frameTimeSeconds) * motionScale;
    const amp = clamp(cfg.waveAmplitude, 0, 2.5);
    const maxBucket = WATER_DEPTH_BUCKETS - 1;
    this.ensureWaterStyleCache();

    let calls = 0;
    let lastFill = '';

    ctx.save();
    this.applyCameraToContext(ctx);

    for (let qi = 0; qi < quads.length; qi++) {
      const q = quads[qi];
      const depth = clamp(q.depthFactor, 0, 1);
      const bucket = Math.round(depth * maxBucket);

      const halfH = Math.ceil(q.h * 0.5);
      const topStyle = this.waterTopStyles[bucket];
      if (lastFill !== topStyle) {
        ctx.fillStyle = topStyle;
        lastFill = topStyle;
      }
      ctx.fillRect(q.x, q.y, q.w, halfH);

      const botStyle = this.waterBotStyles[bucket];
      if (lastFill !== botStyle) {
        ctx.fillStyle = botStyle;
        lastFill = botStyle;
      }
      ctx.fillRect(q.x, q.y + halfH, q.w, q.h - halfH);
      calls += 1;

      // Pixel-snapped horizontal ripple shimmer bars
      const bandCount = Math.max(2, Math.min(4, Math.floor(q.h / 12)));
      const shimmerStyle = this.waterShimmerStyles[bucket];
      if (lastFill !== shimmerStyle) {
        ctx.fillStyle = shimmerStyle;
        lastFill = shimmerStyle;
      }
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

      // Pixel-snapped twinkling starlight 4-point cross sparkles (LUT-indexed, zero string allocs)
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
            const lutIdx = clamp(Math.floor(sparkAlpha * SPARKLE_STYLES.length), 0, SPARKLE_STYLES.length - 1);
            const spStyle = SPARKLE_STYLES[lutIdx];
            if (lastFill !== spStyle) {
              ctx.fillStyle = spStyle;
              lastFill = spStyle;
            }
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy - 1, 1, 3);
          }
        }
      }

      // Pixel-snapped animated shoreline surf foam (0..1 float & 4-bit N/E/S/W bitmask)
      if (q.foamMask > 0.001) {
        const waveOffset = Math.round(Math.sin(t * 2.9 + q.x * 0.15 + q.y * 0.12) * 1.6 * amp);
        const foamThickness = Math.max(2, Math.round(Math.min(q.w, q.h) * 0.09));
        const seafoam = this.waterSeafoamStyle;
        const foamLip = this.waterFoamLipStyle;

        if (q.foamMask > 1.01) {
          const mask = Math.round(q.foamMask);
          const inset = Math.max(0, Math.round(waveOffset * 0.5));
          const dashH = (yPos: number, dir: number) => {
            if (lastFill !== foamLip) {
              ctx.fillStyle = foamLip;
              lastFill = foamLip;
            }
            ctx.fillRect(q.x + 1, yPos + dir * foamThickness, q.w - 2, 1);
            if (lastFill !== seafoam) {
              ctx.fillStyle = seafoam;
              lastFill = seafoam;
            }
            for (let ox = 0; ox < q.w; ox += 8) {
              const seg = Math.min(6, q.w - ox);
              ctx.fillRect(q.x + ox + 1, yPos, Math.max(2, seg - 1), foamThickness);
            }
          };
          const dashV = (xPos: number, dir: number) => {
            if (lastFill !== foamLip) {
              ctx.fillStyle = foamLip;
              lastFill = foamLip;
            }
            ctx.fillRect(xPos + dir * foamThickness, q.y + 1, 1, q.h - 2);
            if (lastFill !== seafoam) {
              ctx.fillStyle = seafoam;
              lastFill = seafoam;
            }
            for (let oy = 0; oy < q.h; oy += 8) {
              const seg = Math.min(6, q.h - oy);
              ctx.fillRect(xPos, q.y + oy + 1, foamThickness, Math.max(2, seg - 1));
            }
          };
          if ((mask & 1) !== 0) dashH(q.y + inset, 1);
          if ((mask & 2) !== 0) dashV(q.x + q.w - foamThickness - inset, -1);
          if ((mask & 4) !== 0) dashH(q.y + q.h - foamThickness - inset, -1);
          if ((mask & 8) !== 0) dashV(q.x + inset, 1);
        } else {
          const intensity = clamp(q.foamMask, 0, 1);
          const inset = Math.max(0, Math.round(waveOffset * 0.5));
          ctx.globalAlpha = intensity;
          if (lastFill !== seafoam) {
            ctx.fillStyle = seafoam;
            lastFill = seafoam;
          }
          for (let ox = 1; ox < q.w - 1; ox += 8) {
            ctx.fillRect(q.x + ox, q.y + inset, Math.min(5, q.w - ox - 1), foamThickness);
          }
          ctx.fillRect(
            q.x + 3,
            Math.round(q.y + q.h * 0.5 + waveOffset * 0.4),
            Math.round(q.w * 0.55),
            1,
          );
          ctx.globalAlpha = 1;
        }
      }
    }

    ctx.restore();
    return calls;
  }

  private renderSprites(ctx: CanvasRenderingContext2D, sprites: SpriteDrawCmd[]): number {
    const count = sprites.length;
    if (count === 0) return 0;

    let ordered = sprites;
    if (count > 1) {
      let sorted = true;
      let prevDepth = sprites[0].depth ?? 0;
      for (let i = 1; i < count; i++) {
        const d = sprites[i].depth ?? 0;
        if (d < prevDepth) {
          sorted = false;
          break;
        }
        prevDepth = d;
      }
      if (!sorted) {
        const scratch = this.spriteSortScratch;
        scratch.length = count;
        for (let i = 0; i < count; i++) scratch[i] = sprites[i];
        scratch.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
        ordered = scratch;
      }
    }

    let calls = 0;
    ctx.save();
    this.applyCameraToContext(ctx);
    let lastSmoothing: boolean | null = null;
    this.emissiveBatchCount = 0;

    const pushEmissive = (
      img: CanvasImageSource,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
      alpha: number,
      crisp: boolean,
    ) => {
      let item = this.emissiveBatchPool[this.emissiveBatchCount];
      if (!item) {
        item = { img, sx, sy, sw, sh, dx, dy, dw, dh, alpha, crisp };
        this.emissiveBatchPool.push(item);
      } else {
        item.img = img;
        item.sx = sx;
        item.sy = sy;
        item.sw = sw;
        item.sh = sh;
        item.dx = dx;
        item.dy = dy;
        item.dw = dw;
        item.dh = dh;
        item.alpha = alpha;
        item.crisp = crisp;
      }
      this.emissiveBatchCount += 1;
    };

    const flushEmissiveBatch = () => {
      if (this.emissiveBatchCount === 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      let lastEmSmooth: boolean | null = null;
      let lastEmAlpha = -1;
      for (let i = 0; i < this.emissiveBatchCount; i++) {
        const em = this.emissiveBatchPool[i];
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
      this.emissiveBatchCount = 0;
      lastSmoothing = null;
    };

    for (let si = 0; si < ordered.length; si++) {
      const cmd = ordered[si];
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
          if (cmd.regionId) {
            const r = atlas.regions[cmd.regionId];
            if (r) {
              sx = sx ?? r.x;
              sy = sy ?? r.y;
              sw = sw ?? r.w;
              sh = sh ?? r.h;
            }
          }
        }
      }

      if (!source) {
        continue;
      }

      const srcX = sx ?? 0;
      const srcY = sy ?? 0;
      const srcW = sw ?? (atlasRecord ? atlasRecord.width : getSourceWidth(source));
      const srcH = sh ?? (atlasRecord ? atlasRecord.height : getSourceHeight(source));

      const alpha = clamp((cmd.alpha ?? 1) * (cmd.tint ? cmd.tint[3] : 1), 0, 1);
      if (alpha <= 0.003) {
        continue;
      }

      const crisp = cmd.pixelCrisp !== undefined ? cmd.pixelCrisp !== false : defaultCrisp;
      const hasRim = Boolean(cmd.rimColor && cmd.rimColor[3] > 0.01);
      const isSimple = !cmd.rotation && !cmd.flipX && !hasRim && !cmd.additive && alpha >= 0.999;

      if (isSimple) {
        if (!crisp && this.emissiveBatchCount > 0) {
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
          pushEmissive(atlasEmissive, srcX, srcY, srcW, srcH, cmd.dx, cmd.dy, cmd.dw, cmd.dh, 0.9, crisp);
        }
        if (cmd.emissive && cmd.emissive > 0.05) {
          pushEmissive(
            source,
            srcX,
            srcY,
            srcW,
            srcH,
            cmd.dx,
            cmd.dy,
            cmd.dw,
            cmd.dh,
            clamp(cmd.emissive * 0.45, 0, 0.85),
            crisp,
          );
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
      const ar = this.colorGrade.ambientRgb[0];
      const ag = this.colorGrade.ambientRgb[1];
      const ab = this.colorGrade.ambientRgb[2];
      const ambKey = `${Math.round(ar * 100)}_${Math.round(ag * 100)}_${Math.round(ab * 100)}_${Math.round(darkness * 200)}`;
      if (this.ambientWashKey !== ambKey) {
        this.ambientWashKey = ambKey;
        this.ambientWashStyle = rgbaStr(ar * 0.28, ag * 0.32, ab * 0.45, darkness);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.ambientWashStyle;
      ctx.fillRect(0, 0, w, h);
      drawCalls += 1;
    }

    // Additive radial PointLight blooms (up to 24 visible lights)
    let activeLights = 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < this.lights.length && activeLights < MAX_LIGHTS; i++) {
      const light = this.lights[i];
      if (light.intensity <= 0.005 || light.radius <= 0.5) continue;

      let sx = light.x;
      let sy = light.y;
      let radius = light.radius;
      if (!light.screenSpace) {
        this.projectWorldToScreen(light.x, light.y);
        sx = this.projX;
        sy = this.projY;
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
      const r = light.color[0];
      const g = light.color[1];
      const b = light.color[2];

      const lightSprite = this.getPointLightSprite(r, g, b);
      if (lightSprite) {
        ctx.globalAlpha = clamp(strength, 0, 1.45);
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
        const sr = cfg.sunbeamColor[0];
        const sg = cfg.sunbeamColor[1];
        const sb = cfg.sunbeamColor[2];
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
    const useSpriteCache = this.hasRealDomCanvas();
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    let lastComp: GlobalCompositeOperation = 'source-over';

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const alpha = clamp(p.color[3], 0, 1);
      if (alpha <= 0.004 || p.radius <= 0.2) continue;

      this.projectWorldToScreen(p.x, p.y);
      const sx = this.projX;
      const sy = this.projY;
      const r = Math.max(0.5, p.radius * this.camera.zoom);
      const stretchX = Math.max(0.05, p.stretchX ?? 1);
      const stretchY = Math.max(0.05, p.stretchY ?? 1);
      const rot = p.rotation ?? 0;
      const softness = clamp(p.softness ?? 0.7, 0.05, 1);
      const wantComp: GlobalCompositeOperation = p.additive === false ? 'source-over' : 'lighter';
      const cr = p.color[0];
      const cg = p.color[1];
      const cb = p.color[2];

      if (useSpriteCache) {
        if (lastComp !== wantComp) {
          ctx.globalCompositeOperation = wantComp;
          lastComp = wantComp;
        }
        if (r <= 8) {
          const core = Math.max(1, r * 0.55);
          if (rot === 0 && stretchX === 1 && stretchY === 1) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = rgbaStr(cr, cg, cb, alpha * 0.42);
            ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
            ctx.fillStyle = rgbaStr(Math.min(1, cr * 1.2), Math.min(1, cg * 1.2), Math.min(1, cb * 1.2), alpha);
            ctx.fillRect(sx - core, sy - core, core * 2, core * 2);
          } else {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.translate(sx, sy);
            if (rot) ctx.rotate(rot);
            ctx.scale(stretchX, stretchY);
            ctx.fillStyle = rgbaStr(cr, cg, cb, alpha * 0.42);
            ctx.fillRect(-r, -r, r * 2, r * 2);
            ctx.fillStyle = rgbaStr(Math.min(1, cr * 1.2), Math.min(1, cg * 1.2), Math.min(1, cb * 1.2), alpha);
            ctx.fillRect(-core, -core, core * 2, core * 2);
            ctx.restore();
          }
          calls += 1;
          continue;
        }

        const sprite = this.getParticleSprite(cr, cg, cb, softness);
        if (sprite) {
          if (rot === 0 && stretchX === 1 && stretchY === 1) {
            ctx.globalAlpha = alpha;
            ctx.drawImage(sprite, sx - r, sy - r, r * 2, r * 2);
          } else {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(sx, sy);
            if (rot) ctx.rotate(rot);
            ctx.scale(stretchX, stretchY);
            ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
            ctx.restore();
          }
          calls += 1;
          continue;
        }
      }

      ctx.save();
      ctx.globalCompositeOperation = wantComp;
      ctx.translate(sx, sy);
      if (rot) {
        ctx.rotate(rot);
      }
      if (stretchX !== 1 || stretchY !== 1) {
        ctx.scale(stretchX, stretchY);
      }

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
    const tr = this.colorGrade.tintRgb[0];
    const tg = this.colorGrade.tintRgb[1];
    const tb = this.colorGrade.tintRgb[2];
    const tintDelta = Math.abs(tr - 1) + Math.abs(tg - 1) + Math.abs(tb - 1);
    if (tintDelta > 0.03) {
      const tKey = `${Math.round(tr * 100)}_${Math.round(tg * 100)}_${Math.round(tb * 100)}`;
      if (this.tintWashKey !== tKey) {
        this.tintWashKey = tKey;
        this.tintWashStyle = rgbaStr(
          clamp(0.5 + (tr - 1) * 1.4, 0, 1),
          clamp(0.5 + (tg - 1) * 1.4, 0, 1),
          clamp(0.5 + (tb - 1) * 1.4, 0, 1),
          0.06,
        );
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.tintWashStyle;
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
      const tctx = tile.getContext('2d');
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
