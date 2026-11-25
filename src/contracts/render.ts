import type { BiomeId, RendererMode } from './types';

export type BackendKind = 'webgl2' | 'canvas2d';

export interface RendererCapabilities {
  kind: BackendKind;
  webgl2Supported: boolean;
  isSoftwareRasterizer: boolean;
  rendererString: string;
  maxTextureSize: number;
  dpr: number;
  reducedMotion: boolean;
  crtMode: boolean;
}

export interface FrameStats {
  fps: number;
  frameTimeMs: number;
  clampedDtMs: number;
  drawCalls: number;
  activeLights: number;
  activeParticles: number;
  backend: BackendKind;
  contextLostCount: number;
  contextRestoredCount: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  rotation: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface PointLight {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: [number, number, number]; // 0..1 RGB
  intensity: number; // 0..2
  flickerSpeed?: number;
  flickerAmount?: number;
  screenSpace?: boolean;
}

export interface CanopyShadowConfig {
  enabled: boolean;
  sunbeamIntensity: number;
  sunbeamAngle: number;
  sunbeamColor: [number, number, number];
  cloudSpeedX: number;
  cloudSpeedY: number;
  cloudOpacity: number;
}

export interface WaterConfig {
  enabled: boolean;
  time: number;
  skyTopColor: [number, number, number];
  skyBottomColor: [number, number, number];
  starlightIntensity: number;
  waveAmplitude: number;
  foamColor: [number, number, number];
}

export interface BiomeColorGrade {
  biomeId: BiomeId;
  ambientRgb: [number, number, number];
  ambientStrength: number;
  tintRgb: [number, number, number];
  contrast: number;
  saturation: number;
  bloomIntensity: number;
  bloomThreshold: number;
  vignetteStrength: number;
  skyTopHex: string;
  skyHorizonHex: string;
  starlightGlow: number;
}

export interface AtlasRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasSheetDescriptor {
  id: string;
  albedoPath: string;
  normalPath?: string;
  emissivePath?: string;
  width: number;
  height: number;
  tileSize: number;
  pixelCrisp?: boolean;
  regions: Record<string, AtlasRegion>;
}

export interface AtlasManifest {
  version: string;
  seed: number;
  generatedBy: string;
  sheets: Record<string, AtlasSheetDescriptor>;
  arenas: Record<BiomeId | 'skyhop', string>;
  tileRegions: Record<string, string>;
  biomeTileRowMap?: Partial<Record<BiomeId, number>>;
  iconIds: string[];
  totalBytes: number;
}

export interface SpriteDrawCmd {
  sheetId?: string;
  regionId?: string;
  source?: CanvasImageSource;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  rotation?: number;
  alpha?: number;
  flipX?: boolean;
  pixelCrisp?: boolean;
  useNormalMap?: boolean;
  tint?: [number, number, number, number]; // RGBA 0..1
  rimColor?: [number, number, number, number];
  emissive?: number;
  additive?: boolean;
  depth?: number;
  /** Optional hint that a dynamic HTMLCanvasElement/OffscreenCanvas source is static after first upload. */
  staticSource?: boolean;
}

export interface ParticleDrawCmd {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number, number]; // RGBA 0..1
  softness?: number;
  additive?: boolean;
  stretchX?: number;
  stretchY?: number;
  rotation?: number;
}

export interface RectDrawCmd {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alpha?: number;
  radius?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export type ContextLossListener = (event: {
  type: 'lost' | 'restored' | 'fallback';
  previousBackend: BackendKind;
  activeBackend: BackendKind;
  reason?: string;
}) => void;

export interface IRenderBackend {
  readonly kind: BackendKind;
  readonly capabilities: RendererCapabilities;
  init(canvas: HTMLCanvasElement, options: {
    dprCap?: number;
    reducedMotion?: boolean;
    crtMode?: boolean;
  }): Promise<void>;
  resize(cssWidth: number, cssHeight: number, dpr?: number): void;
  registerAtlas(
    sheetId: string,
    albedo: HTMLImageElement | HTMLCanvasElement,
    normal?: HTMLImageElement | HTMLCanvasElement,
    emissive?: HTMLImageElement | HTMLCanvasElement,
  ): void;
  setCamera(camera: Partial<CameraState>): void;
  setColorGrade(grade: BiomeColorGrade): void;
  setCanopyConfig(config: CanopyShadowConfig): void;
  setWaterConfig(config: WaterConfig): void;
  setReducedMotion(enabled: boolean): void;
  setCrtMode(enabled: boolean): void;
  beginFrame(timeSeconds: number, dtSeconds: number, clearColor?: [number, number, number, number]): void;
  drawSprite(cmd: SpriteDrawCmd): void;
  drawWaterQuad(x: number, y: number, w: number, h: number, depthFactor: number, foamMask: number): void;
  addPointLight(light: PointLight): void;
  drawParticle(cmd: ParticleDrawCmd): void;
  drawCustom2D(
    drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void,
    layer?: 'world' | 'post-light' | 'screen',
  ): void;
  endFrame(): FrameStats;
  getCanvas2DContext(): CanvasRenderingContext2D | null;
  getViewportSize?(): { width: number; height: number };
  getStats(): FrameStats;
  dispose(): void;
}

export interface IRenderEngine {
  readonly activeBackend: IRenderBackend;
  readonly requestedMode: RendererMode;
  init(canvas: HTMLCanvasElement, options: {
    preferredMode: RendererMode;
    reducedMotion: boolean;
    crtMode: boolean;
  }): Promise<RendererCapabilities>;
  loadManifest(manifestUrl: string): Promise<AtlasManifest>;
  getManifest(): AtlasManifest | null;
  getSheetImage(sheetId: string): HTMLImageElement | null;
  getArenaImage(biomeId: BiomeId | 'skyhop'): HTMLImageElement | null;
  switchBackend(mode: RendererMode, reason?: string): Promise<BackendKind>;
  onContextEvent(listener: ContextLossListener): () => void;
  simulateContextLoss(): boolean;
  startLoop(onTick: (dtSeconds: number, elapsedSeconds: number, backend: IRenderBackend) => void): void;
  stopLoop(): void;
  resize(): void;
  getStats(): FrameStats;
  dispose(): void;
}
