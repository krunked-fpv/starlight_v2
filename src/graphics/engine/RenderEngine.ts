import type {
  AtlasManifest,
  AtlasRegion,
  BackendKind,
  ContextLossListener,
  FrameStats,
  IRenderBackend,
  IRenderEngine,
  RendererCapabilities,
  RendererMode,
} from '../../contracts';
import { Canvas2DBackend, type BackendStateSnapshot } from './Canvas2DBackend';
import { WebGL2Backend } from './WebGL2Backend';

export const MAX_FRAME_DT_SECONDS = 0.05;

const SOFTWARE_RENDERER_REGEX =
  /swiftshader|llvmpipe|softpipe|software\s*rasterizer|microsoft\s*basic\s*render\s*driver|mesa\s*offscreen/i;

/**
 * Detects CPU/software WebGL rasterizers (SwiftShader, llvmpipe, Software Rasterizer,
 * Microsoft Basic Render Driver) so `auto` mode can cleanly negotiate to Canvas2D parity.
 */
export function detectSoftwareRenderer(rendererStr: string): boolean {
  if (!rendererStr || typeof rendererStr !== 'string') {
    return false;
  }
  return SOFTWARE_RENDERER_REGEX.test(rendererStr);
}

/**
 * Clamps frame delta time strictly to [0, 0.05] seconds (<= 50 ms) for locked 60 FPS pacing.
 */
export function clampFrameDt(rawDtSeconds: number): number {
  if (!Number.isFinite(rawDtSeconds) || rawDtSeconds <= 0) {
    return 0;
  }
  return rawDtSeconds > MAX_FRAME_DT_SECONDS ? MAX_FRAME_DT_SECONDS : rawDtSeconds;
}

interface LoadedAtlasRecord {
  sheetId: string;
  albedo: HTMLImageElement | HTMLCanvasElement;
  normal?: HTMLImageElement | HTMLCanvasElement;
  emissive?: HTMLImageElement | HTMLCanvasElement;
  regions: Record<string, AtlasRegion>;
}

type ManagedBackend = WebGL2Backend | Canvas2DBackend;

interface StarlightDebugGlobal {
  renderEngine?: {
    getBackendKind: () => BackendKind;
    getRequestedMode: () => RendererMode;
    getCapabilities: () => RendererCapabilities;
    getStats: () => FrameStats;
    simulateContextLoss: () => boolean;
    switchBackend: (mode: RendererMode, reason?: string) => Promise<BackendKind>;
  };
  [key: string]: unknown;
}

function resolveManifestUrl(manifestUrl: string): string {
  if (/^https?:\/\//i.test(manifestUrl) || manifestUrl.startsWith('data:') || manifestUrl.startsWith('blob:')) {
    return manifestUrl;
  }
  const baseUri =
    typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI.length > 0
      ? document.baseURI
      : undefined;
  if (baseUri) {
    try {
      return new URL(manifestUrl, baseUri).href;
    } catch {
      return manifestUrl;
    }
  }
  return manifestUrl;
}

function resolveSheetAssetUrl(assetPath: string, manifestResolvedUrl: string): string {
  if (/^https?:\/\//i.test(assetPath) || assetPath.startsWith('data:') || assetPath.startsWith('blob:')) {
    return assetPath;
  }
  const baseUri =
    typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI.length > 0
      ? document.baseURI
      : undefined;

  if (baseUri && /^\.?\/?atlases\//i.test(assetPath)) {
    try {
      return new URL(assetPath, baseUri).href;
    } catch {
      // fall through
    }
  }

  try {
    return new URL(assetPath, manifestResolvedUrl).href;
  } catch {
    if (baseUri) {
      try {
        return new URL(assetPath, baseUri).href;
      } catch {
        return assetPath;
      }
    }
    return assetPath;
  }
}

function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor unavailable in current runtime'));
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load atlas image: ${url}`));
    img.src = url;
  });
}

function swapCanvasInPlace(oldCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const doc = oldCanvas.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') {
    return oldCanvas;
  }

  const fresh = doc.createElement('canvas');
  if (oldCanvas.id) {
    fresh.id = oldCanvas.id;
  }
  if (oldCanvas.className) {
    fresh.className = oldCanvas.className;
  }
  if (oldCanvas.style && typeof oldCanvas.style.cssText === 'string' && oldCanvas.style.cssText.length > 0) {
    fresh.style.cssText = oldCanvas.style.cssText;
  }
  if (typeof oldCanvas.getAttribute === 'function') {
    const ariaLabel = oldCanvas.getAttribute('aria-label');
    if (ariaLabel !== null) {
      fresh.setAttribute('aria-label', ariaLabel);
    }
    const role = oldCanvas.getAttribute('role');
    if (role !== null) {
      fresh.setAttribute('role', role);
    }
    const tabIndex = oldCanvas.getAttribute('tabindex');
    if (tabIndex !== null) {
      fresh.setAttribute('tabindex', tabIndex);
    }
  }
  if (oldCanvas.dataset && fresh.dataset) {
    for (const [k, v] of Object.entries(oldCanvas.dataset)) {
      if (v !== undefined) {
        fresh.dataset[k] = v;
      }
    }
  }

  fresh.width = oldCanvas.width;
  fresh.height = oldCanvas.height;

  if (oldCanvas.parentNode && typeof oldCanvas.parentNode.replaceChild === 'function') {
    oldCanvas.parentNode.replaceChild(fresh, oldCanvas);
    return fresh;
  }

  return fresh;
}

export class RenderEngine implements IRenderEngine {
  private _activeBackend: ManagedBackend = new Canvas2DBackend();
  private _requestedMode: RendererMode = 'auto';

  private canvas: HTMLCanvasElement | null = null;
  private lostWebGLCanvas: HTMLCanvasElement | null = null;
  private canvasHasWebGLContext = false;
  private handledLossCanvases = new WeakSet<HTMLCanvasElement>();

  private dprCap = 2;
  private reducedMotion = false;
  private crtMode = false;
  private webgl2Supported = false;
  private detectedSoftwareRasterizer = false;
  private detectedRendererString = 'Canvas2D Parity Renderer';

  private manifest: AtlasManifest | null = null;
  private loadedAtlases = new Map<string, LoadedAtlasRecord>();
  private listeners = new Set<ContextLossListener>();

  private contextLostCount = 0;
  private contextRestoredCount = 0;

  private rafId: number | null = null;
  private loopActive = false;
  private lastTickTimestampMs: number | null = null;
  private elapsedSeconds = 0;
  private activeTickCallback:
    | ((dtSeconds: number, elapsedSeconds: number, backend: IRenderBackend) => void)
    | null = null;

  private readonly boundHandleContextLost = (event: Event): void => {
    this.handleContextLost(event);
  };

  private readonly boundHandleContextRestored = (event: Event): void => {
    this.handleContextRestored(event);
  };

  private readonly boundHandleWindowResize = (): void => {
    this.resize();
  };

  get activeBackend(): IRenderBackend {
    return this._activeBackend;
  }

  get requestedMode(): RendererMode {
    return this._requestedMode;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  async init(
    canvas: HTMLCanvasElement,
    options: {
      preferredMode: RendererMode;
      reducedMotion: boolean;
      crtMode: boolean;
    },
  ): Promise<RendererCapabilities> {
    this.detachCanvasListeners();
    this.canvas = canvas;
    this.canvasHasWebGLContext = false;
    this._requestedMode = options.preferredMode;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.crtMode = Boolean(options.crtMode);

    if (options.preferredMode === 'canvas2d') {
      this.activateCanvas2DSync(canvas, false);
    } else {
      const attempt = this.tryInitWebGL2Sync(canvas);
      if (attempt.ok && attempt.backend) {
        this.webgl2Supported = true;
        this.detectedRendererString = attempt.backend.capabilities.rendererString;
        this.detectedSoftwareRasterizer = detectSoftwareRenderer(this.detectedRendererString);

        if (options.preferredMode === 'auto' && this.detectedSoftwareRasterizer) {
          // Software rasterizer detected under auto mode -> cleanly fall back to Canvas2D
          const snapshot = attempt.backend.exportStateSnapshot();
          attempt.backend.dispose();
          this.canvas = swapCanvasInPlace(canvas);
          this.canvasHasWebGLContext = false;
          this.activateCanvas2DSync(this.canvas, false, snapshot);
          this.emitContextEvent({
            type: 'fallback',
            previousBackend: 'webgl2',
            activeBackend: 'canvas2d',
            reason: `Software rasterizer detected (${this.detectedRendererString})`,
          });
        } else {
          this._activeBackend = attempt.backend;
          this._activeBackend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
          this.canvasHasWebGLContext = true;
          this.attachCanvasListeners(this.canvas);
          this.reRegisterLoadedAtlases();
        }
      } else {
        // WebGL2 unavailable or initialization failed -> fall back cleanly to Canvas2D
        this.webgl2Supported = false;
        this.detectedSoftwareRasterizer = false;
        const targetCanvas = attempt.touchedContext ? swapCanvasInPlace(canvas) : canvas;
        this.canvas = targetCanvas;
        this.canvasHasWebGLContext = false;
        this.activateCanvas2DSync(this.canvas, false);
        this.emitContextEvent({
          type: 'fallback',
          previousBackend: 'webgl2',
          activeBackend: 'canvas2d',
          reason: attempt.reason ?? 'WebGL2 unavailable',
        });
      }
    }

    this.resize();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.removeEventListener('resize', this.boundHandleWindowResize);
      window.addEventListener('resize', this.boundHandleWindowResize);
    }

    this.exposeDebugDiagnostics();
    return this._activeBackend.capabilities;
  }

  async loadManifest(manifestUrl: string): Promise<AtlasManifest> {
    const resolvedManifestUrl = resolveManifestUrl(manifestUrl);
    const response = await fetch(resolvedManifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch atlas manifest (${response.status}): ${resolvedManifestUrl}`);
    }
    const manifest = (await response.json()) as AtlasManifest;
    this.manifest = manifest;

    const sheetEntries = Object.entries(manifest.sheets ?? {});
    await Promise.allSettled(
      sheetEntries.map(async ([sheetId, descriptor]) => {
        const albedoUrl = resolveSheetAssetUrl(descriptor.albedoPath, resolvedManifestUrl);
        const normalUrl = descriptor.normalPath
          ? resolveSheetAssetUrl(descriptor.normalPath, resolvedManifestUrl)
          : null;
        const emissiveUrl = descriptor.emissivePath
          ? resolveSheetAssetUrl(descriptor.emissivePath, resolvedManifestUrl)
          : null;

        const [albedoRes, normalRes, emissiveRes] = await Promise.allSettled([
          preloadImage(albedoUrl),
          normalUrl ? preloadImage(normalUrl) : Promise.resolve(undefined),
          emissiveUrl ? preloadImage(emissiveUrl) : Promise.resolve(undefined),
        ]);

        if (albedoRes.status === 'fulfilled' && albedoRes.value) {
          const record: LoadedAtlasRecord = {
            sheetId,
            albedo: albedoRes.value,
            normal: normalRes.status === 'fulfilled' ? normalRes.value : undefined,
            emissive: emissiveRes.status === 'fulfilled' ? emissiveRes.value : undefined,
            regions: descriptor.regions ?? {},
          };
          this.loadedAtlases.set(sheetId, record);
          this._activeBackend.registerAtlas(
            record.sheetId,
            record.albedo,
            record.normal,
            record.emissive,
          );
          this._activeBackend.setAtlasRegions(record.sheetId, record.regions);
        }
      }),
    );

    return manifest;
  }

  getManifest(): AtlasManifest | null {
    return this.manifest;
  }

  async switchBackend(mode: RendererMode, reason?: string): Promise<BackendKind> {
    this._requestedMode = mode;
    if (!this.canvas) {
      return this._activeBackend.kind;
    }

    const previousKind = this._activeBackend.kind;
    const snapshot = this._activeBackend.exportStateSnapshot();
    this.reducedMotion = snapshot.reducedMotion;
    this.crtMode = snapshot.crtMode;
    this.dprCap = snapshot.dprCap;

    if (mode === 'canvas2d') {
      if (previousKind === 'canvas2d') {
        return 'canvas2d';
      }
      this.hotSwapToCanvas2DSync(snapshot, reason, 'fallback');
      return 'canvas2d';
    }

    // Requested 'webgl2' or 'auto'
    if (previousKind === 'webgl2') {
      if (mode === 'auto' && this.detectedSoftwareRasterizer) {
        this.hotSwapToCanvas2DSync(
          snapshot,
          reason ?? `Software rasterizer detected (${this.detectedRendererString})`,
          'fallback',
        );
        return 'canvas2d';
      }
      return 'webgl2';
    }

    // Currently on canvas2d -> swap canvas in-place so a fresh WebGL2 context can bind
    this.detachCanvasListeners();
    this._activeBackend.dispose();
    const freshCanvas = swapCanvasInPlace(this.canvas);
    this.canvas = freshCanvas;
    this.canvasHasWebGLContext = false;

    const attempt = this.tryInitWebGL2Sync(freshCanvas);
    if (attempt.ok && attempt.backend) {
      this.webgl2Supported = true;
      this.detectedRendererString = attempt.backend.capabilities.rendererString;
      this.detectedSoftwareRasterizer = detectSoftwareRenderer(this.detectedRendererString);

      if (mode === 'auto' && this.detectedSoftwareRasterizer) {
        attempt.backend.dispose();
        this.canvas = swapCanvasInPlace(freshCanvas);
        this.canvasHasWebGLContext = false;
        this.activateCanvas2DSync(this.canvas, false, snapshot);
        this.emitContextEvent({
          type: 'fallback',
          previousBackend: 'webgl2',
          activeBackend: 'canvas2d',
          reason: reason ?? `Software rasterizer detected (${this.detectedRendererString})`,
        });
        return 'canvas2d';
      }

      this._activeBackend = attempt.backend;
      this._activeBackend.importStateSnapshot(snapshot);
      this._activeBackend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
      this.canvasHasWebGLContext = true;
      this.attachCanvasListeners(this.canvas);
      this.reRegisterLoadedAtlases();
      return 'webgl2';
    }

    // Fallback back to Canvas2D cleanly
    this.canvas = attempt.touchedContext ? swapCanvasInPlace(freshCanvas) : freshCanvas;
    this.canvasHasWebGLContext = false;
    this.activateCanvas2DSync(this.canvas, false, snapshot);
    this.emitContextEvent({
      type: 'fallback',
      previousBackend: 'webgl2',
      activeBackend: 'canvas2d',
      reason: reason ?? attempt.reason ?? 'WebGL2 unavailable',
    });
    return 'canvas2d';
  }

  onContextEvent(listener: ContextLossListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  simulateContextLoss(): boolean {
    if (!this.canvas) {
      return false;
    }

    if (this._activeBackend instanceof WebGL2Backend) {
      const gl = this._activeBackend.getGLContext();
      if (gl) {
        try {
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext && typeof ext.loseContext === 'function') {
            ext.loseContext();
            return true;
          }
        } catch {
          // Fall through to synthetic CustomEvent dispatch
        }
      }
    }

    return this.dispatchSyntheticContextLost(this.canvas);
  }

  startLoop(
    onTick: (dtSeconds: number, elapsedSeconds: number, backend: IRenderBackend) => void,
  ): void {
    this.stopLoop();
    this.loopActive = true;
    this.activeTickCallback = onTick;
    this.lastTickTimestampMs = null;

    const scheduleFrame = (cb: (ts: number) => void): number => {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(cb);
      }
      return setTimeout(() => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16) as unknown as number;
    };

    const step = (timestampMs: number): void => {
      if (!this.loopActive || !this.activeTickCallback) {
        return;
      }

      const rawDtSeconds =
        this.lastTickTimestampMs === null ? 1 / 60 : (timestampMs - this.lastTickTimestampMs) / 1000;
      this.lastTickTimestampMs = timestampMs;

      const dtSeconds = clampFrameDt(rawDtSeconds);
      this.elapsedSeconds += dtSeconds;

      try {
        this.activeTickCallback(dtSeconds, this.elapsedSeconds, this._activeBackend);
      } catch {
        // Prevent a single frame error from killing the render loop
      }

      if (this.loopActive) {
        this.rafId = scheduleFrame(step);
      }
    };

    this.rafId = scheduleFrame(step);
  }

  stopLoop(): void {
    this.loopActive = false;
    this.activeTickCallback = null;
    this.lastTickTimestampMs = null;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
      } else {
        clearTimeout(this.rafId);
      }
      this.rafId = null;
    }
  }

  resize(): void {
    if (!this.canvas) {
      return;
    }
    const rect =
      typeof this.canvas.getBoundingClientRect === 'function'
        ? this.canvas.getBoundingClientRect()
        : null;
    const parent = this.canvas.parentElement;
    const cssWidth = Math.round(
      (rect && rect.width > 0 ? rect.width : 0) ||
        this.canvas.clientWidth ||
        (parent && parent.clientWidth > 0 ? parent.clientWidth : 0) ||
        (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 0) ||
        this.canvas.width ||
        960,
    );
    const cssHeight = Math.round(
      (rect && rect.height > 0 ? rect.height : 0) ||
        this.canvas.clientHeight ||
        (parent && parent.clientHeight > 0 ? parent.clientHeight : 0) ||
        (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 0) ||
        this.canvas.height ||
        540,
    );
    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

    this._activeBackend.resize(Math.max(1, cssWidth), Math.max(1, cssHeight), dpr);
  }

  getStats(): FrameStats {
    const stats = this._activeBackend.getStats();
    return {
      ...stats,
      contextLostCount: this.contextLostCount,
      contextRestoredCount: this.contextRestoredCount,
    };
  }

  dispose(): void {
    this.stopLoop();
    this.detachCanvasListeners();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.boundHandleWindowResize);
    }
    this._activeBackend.dispose();
    this.listeners.clear();
    this.loadedAtlases.clear();
    this.manifest = null;
    this.canvas = null;
    this.lostWebGLCanvas = null;
  }

  private tryInitWebGL2Sync(canvas: HTMLCanvasElement): {
    ok: boolean;
    backend?: WebGL2Backend;
    touchedContext: boolean;
    reason?: string;
  } {
    const backend = new WebGL2Backend();
    try {
      backend.initSync(canvas, {
        dprCap: this.dprCap,
        reducedMotion: this.reducedMotion,
        crtMode: this.crtMode,
      });
      return { ok: true, backend, touchedContext: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'WebGL2 initialization failed';
      const touchedContext = backend.getGLContext() !== null || reason !== 'WebGL2 context unavailable';
      backend.dispose();
      return { ok: false, touchedContext, reason };
    }
  }

  private activateCanvas2DSync(
    canvas: HTMLCanvasElement,
    preserveListeners: boolean,
    snapshot?: BackendStateSnapshot,
  ): void {
    const backend = new Canvas2DBackend();
    backend.initSync(canvas, {
      dprCap: this.dprCap,
      reducedMotion: this.reducedMotion,
      crtMode: this.crtMode,
    });
    backend.setCapabilityMetadata({
      webgl2Supported: this.webgl2Supported,
      isSoftwareRasterizer: this.detectedSoftwareRasterizer,
      rendererString: this.detectedSoftwareRasterizer
        ? `Canvas2D Parity (${this.detectedRendererString})`
        : 'Canvas2D Parity Renderer',
    });
    if (snapshot) {
      backend.importStateSnapshot(snapshot);
    }
    backend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
    this._activeBackend = backend;
    if (!preserveListeners) {
      this.attachCanvasListeners(canvas);
    }
    this.reRegisterLoadedAtlases();
  }

  private hotSwapToCanvas2DSync(
    snapshot: BackendStateSnapshot,
    reason: string | undefined,
    eventType: 'lost' | 'fallback',
  ): void {
    if (!this.canvas) return;
    const previousKind = this._activeBackend.kind;
    const oldCanvas = this.canvas;

    this.detachCanvasListeners();
    this._activeBackend.dispose();

    const freshCanvas = this.canvasHasWebGLContext ? swapCanvasInPlace(oldCanvas) : oldCanvas;
    this.canvas = freshCanvas;
    this.canvasHasWebGLContext = false;

    if (eventType === 'lost') {
      // Retain restored listener on the original WebGL canvas in case browser restores it later
      this.lostWebGLCanvas = oldCanvas;
      if (typeof oldCanvas.addEventListener === 'function') {
        oldCanvas.addEventListener('webglcontextrestored', this.boundHandleContextRestored);
      }
    }

    this.activateCanvas2DSync(freshCanvas, false, snapshot);
    this.emitContextEvent({
      type: eventType,
      previousBackend: previousKind,
      activeBackend: 'canvas2d',
      reason,
    });
  }

  private handleContextLost(event: Event): void {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const eventTarget = (event.target as HTMLCanvasElement | null) ?? this.canvas;
    if (eventTarget && this.canvasHasWebGLContext && this.handledLossCanvases.has(eventTarget)) {
      return;
    }
    if (eventTarget && this.canvasHasWebGLContext) {
      this.handledLossCanvases.add(eventTarget);
    }

    this.contextLostCount += 1;

    if (this._activeBackend.kind === 'webgl2' && this.canvas) {
      const snapshot = this._activeBackend.exportStateSnapshot();
      this.hotSwapToCanvas2DSync(snapshot, 'WebGL2 context lost — hot-swapped to Canvas2D', 'lost');
      return;
    }

    // Already on Canvas2D (e.g., synthetic test event): update count and emit cleanly
    this._activeBackend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
    this.emitContextEvent({
      type: 'lost',
      previousBackend: this._activeBackend.kind,
      activeBackend: this._activeBackend.kind,
      reason: 'Synthetic webglcontextlost received while on Canvas2D',
    });
  }

  private handleContextRestored(_event: Event): void {
    this.contextRestoredCount += 1;
    const previousKind = this._activeBackend.kind;

    // Clean up detached lost WebGL canvas listener once restored
    if (this.lostWebGLCanvas && typeof this.lostWebGLCanvas.removeEventListener === 'function') {
      this.lostWebGLCanvas.removeEventListener(
        'webglcontextrestored',
        this.boundHandleContextRestored,
      );
      this.lostWebGLCanvas = null;
    }

    // Attempt clean WebGL2 restoration if user did not explicitly pin canvas2d
    if (
      this.canvas &&
      this._requestedMode !== 'canvas2d' &&
      !this.detectedSoftwareRasterizer &&
      this._activeBackend.kind === 'canvas2d'
    ) {
      const snapshot = this._activeBackend.exportStateSnapshot();
      this.detachCanvasListeners();
      this._activeBackend.dispose();

      const freshCanvas = swapCanvasInPlace(this.canvas);
      this.canvas = freshCanvas;
      this.canvasHasWebGLContext = false;

      const attempt = this.tryInitWebGL2Sync(freshCanvas);
      if (attempt.ok && attempt.backend) {
        this._activeBackend = attempt.backend;
        this._activeBackend.importStateSnapshot(snapshot);
        this._activeBackend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
        this.canvasHasWebGLContext = true;
        this.attachCanvasListeners(this.canvas);
        this.reRegisterLoadedAtlases();
        this.emitContextEvent({
          type: 'restored',
          previousBackend: previousKind,
          activeBackend: 'webgl2',
          reason: 'WebGL2 context restored',
        });
        return;
      }

      // If WebGL2 cannot be re-initialized, stay smoothly on Canvas2D
      this.canvas = attempt.touchedContext ? swapCanvasInPlace(freshCanvas) : freshCanvas;
      this.canvasHasWebGLContext = false;
      this.activateCanvas2DSync(this.canvas, false, snapshot);
    }

    this._activeBackend.setContextCounts(this.contextLostCount, this.contextRestoredCount);
    this.emitContextEvent({
      type: 'restored',
      previousBackend: previousKind,
      activeBackend: this._activeBackend.kind,
      reason: 'WebGL2 context restored',
    });
  }

  private dispatchSyntheticContextLost(canvas: HTMLCanvasElement): boolean {
    if (typeof canvas.dispatchEvent === 'function') {
      let evt: Event;
      if (typeof CustomEvent === 'function') {
        evt = new CustomEvent('webglcontextlost', { cancelable: true });
      } else if (typeof Event === 'function') {
        evt = new Event('webglcontextlost', { cancelable: true });
      } else {
        this.handleContextLost({ preventDefault: () => {} } as Event);
        return true;
      }
      canvas.dispatchEvent(evt);
      return true;
    }

    this.handleContextLost({ preventDefault: () => {} } as Event);
    return true;
  }

  private attachCanvasListeners(canvas: HTMLCanvasElement): void {
    if (typeof canvas.addEventListener !== 'function') return;
    canvas.addEventListener('webglcontextlost', this.boundHandleContextLost);
    canvas.addEventListener('webglcontextrestored', this.boundHandleContextRestored);
  }

  private detachCanvasListeners(): void {
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('webglcontextlost', this.boundHandleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.boundHandleContextRestored);
    }
    if (this.lostWebGLCanvas && typeof this.lostWebGLCanvas.removeEventListener === 'function') {
      this.lostWebGLCanvas.removeEventListener(
        'webglcontextrestored',
        this.boundHandleContextRestored,
      );
      this.lostWebGLCanvas = null;
    }
  }

  private reRegisterLoadedAtlases(): void {
    for (const record of this.loadedAtlases.values()) {
      this._activeBackend.registerAtlas(
        record.sheetId,
        record.albedo,
        record.normal,
        record.emissive,
      );
      this._activeBackend.setAtlasRegions(record.sheetId, record.regions);
    }
  }

  private emitContextEvent(event: {
    type: 'lost' | 'restored' | 'fallback';
    previousBackend: BackendKind;
    activeBackend: BackendKind;
    reason?: string;
  }): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Isolate subscriber errors so engine recovery never aborts
      }
    }
  }

  private exposeDebugDiagnostics(): void {
    if (typeof globalThis === 'undefined') return;
    const host = globalThis as unknown as { __STARLIGHT_DEBUG__?: StarlightDebugGlobal };
    const existing = host.__STARLIGHT_DEBUG__ ?? {};
    existing.renderEngine = {
      getBackendKind: () => this._activeBackend.kind,
      getRequestedMode: () => this._requestedMode,
      getCapabilities: () => this._activeBackend.capabilities,
      getStats: () => this.getStats(),
      simulateContextLoss: () => this.simulateContextLoss(),
      switchBackend: (mode: RendererMode, reason?: string) => this.switchBackend(mode, reason),
    };
    host.__STARLIGHT_DEBUG__ = existing;
  }
}

export function createRenderEngine(): RenderEngine {
  return new RenderEngine();
}
