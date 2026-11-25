import { afterEach, describe, expect, it, vi } from 'vitest';
import { BIOME_IDS, type AtlasManifest, type BiomeColorGrade, type ContextLossListener } from '../../contracts';
import {
  ALL_SHADER_SOURCES,
  BLOOM_COMPOSITE_SHADER,
  Canvas2DBackend,
  compileProgram,
  createDefaultCanopyConfig,
  createDefaultColorGrade,
  createDefaultWaterConfig,
  createRenderEngine,
  createShaderLibrary,
  detectSoftwareRenderer,
  LIGHTING_CANOPY_SHADER,
  MAX_FRAME_DT_SECONDS,
  MAX_POINT_LIGHTS,
  PARTICLE_SHADER,
  RenderEngine,
  resolveManifestAssetUrl,
  resolveManifestUrl,
  SPRITE_SHADER,
  WATER_SHADER,
  WebGL2Backend,
  clampFrameDt,
} from './index';

interface MockGradient {
  addColorStop: ReturnType<typeof vi.fn>;
}

interface MockCanvas2DContext {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  createLinearGradient: ReturnType<typeof vi.fn>;
  createRadialGradient: ReturnType<typeof vi.fn>;
  createPattern: ReturnType<typeof vi.fn>;
  globalAlpha: number;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
  fillStyle: unknown;
  shadowColor: string;
  shadowBlur: number;
  _drawImageSmoothingHistory: boolean[];
}

function createMock2DContext(): MockCanvas2DContext {
  const makeGrad = (): MockGradient => ({ addColorStop: vi.fn() });
  const smoothingHistory: boolean[] = [];
  const ctx: MockCanvas2DContext = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(() => {
      smoothingHistory.push(ctx.imageSmoothingEnabled);
    }),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createLinearGradient: vi.fn(() => makeGrad()),
    createRadialGradient: vi.fn(() => makeGrad()),
    createPattern: vi.fn(() => ({ pattern: true })),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    fillStyle: '#000',
    shadowColor: 'transparent',
    shadowBlur: 0,
    _drawImageSmoothingHistory: smoothingHistory,
  };
  return ctx;
}

interface MockWebGL2Options {
  rendererString?: string;
  compileSuccess?: boolean;
  linkSuccess?: boolean;
  fboComplete?: boolean;
  supportLoseContextExt?: boolean;
  autoDispatchLostOnExt?: boolean;
  onLoseContext?: () => void;
}

interface TrackedTextureState {
  id: number;
  minFilter?: number;
  magFilter?: number;
  wrapS?: number;
  wrapT?: number;
  isFboAttachment: boolean;
  uploadedSource?: unknown;
}

function createMockWebGL2Context(
  canvas: MockCanvasElement,
  options: MockWebGL2Options = {},
): WebGL2RenderingContext & {
  _setLost: (lost: boolean) => void;
  _textures: Map<{ id: number }, TrackedTextureState>;
  _calls: {
    texImage2D: ReturnType<typeof vi.fn>;
    texParameteri: ReturnType<typeof vi.fn>;
    drawArraysInstanced: ReturnType<typeof vi.fn>;
    drawArrays: ReturnType<typeof vi.fn>;
    bindFramebuffer: ReturnType<typeof vi.fn>;
    drawBuffers: ReturnType<typeof vi.fn>;
    uniform1i: ReturnType<typeof vi.fn>;
    uniform1f: ReturnType<typeof vi.fn>;
    uniform4fv: ReturnType<typeof vi.fn>;
  };
} {
  let lost = false;
  const rendererString = options.rendererString ?? 'ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)';
  const compileSuccess = options.compileSuccess ?? true;
  const linkSuccess = options.linkSuccess ?? true;
  const fboComplete = options.fboComplete ?? true;
  const supportLoseContextExt = options.supportLoseContextExt ?? true;

  let nextId = 1;
  let boundTexture: { id: number } | null = null;
  const textures = new Map<{ id: number }, TrackedTextureState>();

  const texImage2D = vi.fn((...args: unknown[]) => {
    if (boundTexture) {
      const state = textures.get(boundTexture);
      if (state) {
        state.uploadedSource = args[args.length - 1];
      }
    }
  });
  const texParameteri = vi.fn((_target: number, pname: number, param: number) => {
    if (boundTexture) {
      const state = textures.get(boundTexture);
      if (state) {
        if (pname === 0x2801) state.minFilter = param;
        if (pname === 0x2800) state.magFilter = param;
        if (pname === 0x2802) state.wrapS = param;
        if (pname === 0x2803) state.wrapT = param;
      }
    }
  });
  const drawArraysInstanced = vi.fn();
  const drawArrays = vi.fn();
  const bindFramebuffer = vi.fn();
  const drawBuffers = vi.fn();
  const uniform1i = vi.fn();
  const uniform1f = vi.fn();
  const uniform4fv = vi.fn();

  const loseContextExt = {
    loseContext: vi.fn(() => {
      lost = true;
      options.onLoseContext?.();
      if (options.autoDispatchLostOnExt !== false) {
        canvas.dispatchEvent(new CustomEvent('webglcontextlost', { cancelable: true }));
      }
    }),
    restoreContext: vi.fn(() => {
      lost = false;
      canvas.dispatchEvent(new CustomEvent('webglcontextrestored'));
    }),
  };

  const debugExt = {
    UNMASKED_RENDERER_WEBGL: 0x9246,
  };

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    RENDERER: 0x1f01,
    MAX_TEXTURE_SIZE: 0x0d33,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE2: 0x84c2,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    UNSIGNED_BYTE: 0x1401,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    FRAMEBUFFER: 0x8d40,
    NONE: 0,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_ATTACHMENT1: 0x8ce1,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    COLOR_BUFFER_BIT: 0x4000,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    TRIANGLE_STRIP: 0x0005,

    isContextLost: vi.fn(() => lost),
    getExtension: vi.fn((name: string) => {
      if (name === 'WEBGL_debug_renderer_info') return debugExt;
      if (name === 'WEBGL_lose_context') return supportLoseContextExt ? loseContextExt : null;
      return null;
    }),
    getParameter: vi.fn((param: number) => {
      if (param === debugExt.UNMASKED_RENDERER_WEBGL || param === 0x1f01) return rendererString;
      if (param === 0x0d33) return 8192;
      return 0;
    }),
    createShader: vi.fn(() => ({ id: nextId++ })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => compileSuccess),
    getShaderInfoLog: vi.fn(() => (compileSuccess ? '' : 'Mock shader compile error')),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({ id: nextId++ })),
    attachShader: vi.fn(),
    detachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => linkSuccess),
    getProgramInfoLog: vi.fn(() => (linkSuccess ? '' : 'Mock program link error')),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn((_prog: unknown, name: string) => ({ name })),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({ id: nextId++ })),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    createVertexArray: vi.fn(() => ({ id: nextId++ })),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),
    createTexture: vi.fn(() => {
      const tex = { id: nextId++ };
      textures.set(tex, { id: tex.id, isFboAttachment: false });
      return tex;
    }),
    bindTexture: vi.fn((_target: number, tex: { id: number } | null) => {
      boundTexture = tex;
    }),
    activeTexture: vi.fn(),
    texParameteri,
    pixelStorei: vi.fn(),
    texImage2D,
    deleteTexture: vi.fn(),
    createFramebuffer: vi.fn(() => ({ id: nextId++ })),
    bindFramebuffer,
    framebufferTexture2D: vi.fn((_t: number, _att: number, _tt: number, tex: { id: number } | null) => {
      if (tex) {
        const state = textures.get(tex);
        if (state) state.isFboAttachment = true;
      }
    }),
    drawBuffers,
    checkFramebufferStatus: vi.fn(() => (fboComplete ? 0x8cd5 : 0x8cd6)),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFuncSeparate: vi.fn(),
    uniform1i,
    uniform1f,
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniform4fv,
    uniform1fv: vi.fn(),
    drawArrays,
    drawArraysInstanced,

    _setLost(v: boolean) {
      lost = v;
    },
    _textures: textures,
    _calls: {
      texImage2D,
      texParameteri,
      drawArraysInstanced,
      drawArrays,
      bindFramebuffer,
      drawBuffers,
      uniform1i,
      uniform1f,
      uniform4fv,
    },
  };

  return gl as unknown as WebGL2RenderingContext & {
    _setLost: (lost: boolean) => void;
    _textures: Map<{ id: number }, TrackedTextureState>;
    _calls: {
      texImage2D: ReturnType<typeof vi.fn>;
      texParameteri: ReturnType<typeof vi.fn>;
      drawArraysInstanced: ReturnType<typeof vi.fn>;
      drawArrays: ReturnType<typeof vi.fn>;
      bindFramebuffer: ReturnType<typeof vi.fn>;
      drawBuffers: ReturnType<typeof vi.fn>;
      uniform1i: ReturnType<typeof vi.fn>;
      uniform1f: ReturnType<typeof vi.fn>;
      uniform4fv: ReturnType<typeof vi.fn>;
    };
  };
}

interface MockCanvasElement {
  id: string;
  className: string;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  style: { cssText: string };
  dataset: Record<string, string>;
  attributes: Map<string, string>;
  parentNode: MockParentNode | null;
  parentElement: MockParentNode | null;
  ownerDocument: MockDocument;
  boundContextType: '2d' | 'webgl2' | null;
  last2DContext: MockCanvas2DContext | null;
  lastWebGL2Context: ReturnType<typeof createMockWebGL2Context> | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getBoundingClientRect(): { width: number; height: number };
  getContext(type: string, opts?: unknown): unknown;
  addEventListener(type: string, fn: EventListener): void;
  removeEventListener(type: string, fn: EventListener): void;
  dispatchEvent(evt: Event): boolean;
}

interface MockParentNode {
  clientWidth: number;
  clientHeight: number;
  children: MockCanvasElement[];
  replaceChild(next: MockCanvasElement, prev: MockCanvasElement): MockCanvasElement;
}

interface MockDocument {
  baseURI: string;
  createdCanvases: MockCanvasElement[];
  createElement(tag: string): MockCanvasElement;
}

interface MockDomConfig {
  webgl2Available?: boolean;
  webgl2Options?: MockWebGL2Options;
  baseURI?: string;
}

function createMockCanvasHarness(config: MockDomConfig = {}) {
  const webgl2Available = config.webgl2Available ?? true;
  const webgl2Options = config.webgl2Options ?? {};

  const doc: MockDocument = {
    baseURI: config.baseURI ?? 'https://krunked-fpv.github.io/starlight_v2/',
    createdCanvases: [],
    createElement(tag: string): MockCanvasElement {
      if (tag !== 'canvas') {
        throw new Error(`Unexpected tag: ${tag}`);
      }
      const c = makeCanvas();
      doc.createdCanvases.push(c);
      return c;
    },
  };

  function makeCanvas(): MockCanvasElement {
    const listeners = new Map<string, Set<EventListener>>();
    const attributes = new Map<string, string>();
    const canvas: MockCanvasElement = {
      id: '',
      className: '',
      width: 960,
      height: 540,
      clientWidth: 960,
      clientHeight: 540,
      style: { cssText: '' },
      dataset: {},
      attributes,
      parentNode: null,
      parentElement: null,
      ownerDocument: doc,
      boundContextType: null,
      last2DContext: null,
      lastWebGL2Context: null,
      getAttribute(name: string) {
        return attributes.get(name) ?? null;
      },
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
      getBoundingClientRect() {
        return { width: canvas.clientWidth, height: canvas.clientHeight };
      },
      getContext(type: string) {
        // Real browser semantics: once a canvas binds 'webgl2', getContext('2d') returns null!
        if (type === '2d') {
          if (canvas.boundContextType === 'webgl2') {
            return null;
          }
          canvas.boundContextType = '2d';
          if (!canvas.last2DContext) {
            canvas.last2DContext = createMock2DContext();
          }
          return canvas.last2DContext;
        }
        if (type === 'webgl2') {
          if (canvas.boundContextType === '2d' || !webgl2Available) {
            return null;
          }
          canvas.boundContextType = 'webgl2';
          if (!canvas.lastWebGL2Context) {
            canvas.lastWebGL2Context = createMockWebGL2Context(canvas, webgl2Options);
          }
          return canvas.lastWebGL2Context;
        }
        return null;
      },
      addEventListener(type: string, fn: EventListener) {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener(type: string, fn: EventListener) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(evt: Event): boolean {
        const set = listeners.get(evt.type);
        if (set) {
          for (const fn of [...set]) {
            fn(evt);
          }
        }
        return !evt.defaultPrevented;
      },
    };
    return canvas;
  }

  const parent: MockParentNode = {
    clientWidth: 960,
    clientHeight: 540,
    children: [],
    replaceChild(next: MockCanvasElement, prev: MockCanvasElement) {
      const idx = parent.children.indexOf(prev);
      if (idx === -1) throw new Error('Child not found');
      parent.children[idx] = next;
      prev.parentNode = null;
      prev.parentElement = null;
      next.parentNode = parent;
      next.parentElement = parent;
      return prev;
    },
  };

  const initialCanvas = makeCanvas();
  initialCanvas.id = 'starlight-canvas';
  initialCanvas.className = 'stage-canvas high-dpi';
  initialCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
  initialCanvas.setAttribute('aria-label', 'Starlight Island Game Canvas');
  initialCanvas.parentNode = parent;
  initialCanvas.parentElement = parent;
  parent.children.push(initialCanvas);

  return { doc, parent, initialCanvas };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createFullMockArenas(): AtlasManifest['arenas'] {
  const arenas: Record<string, string> = {
    skyhop: './arenas/skyhop-arena.png',
  };
  for (const biome of BIOME_IDS) {
    arenas[biome] = `./arenas/${biome}-arena.png`;
  }
  return arenas as AtlasManifest['arenas'];
}

function createFakeImageClass(loadedUrls: string[]) {
  return class FakeImage {
    decoding = '';
    crossOrigin = '';
    naturalWidth = 256;
    naturalHeight = 256;
    width = 256;
    height = 256;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(val: string) {
      this._src = val;
      loadedUrls.push(val);
      queueMicrotask(() => this.onload?.());
    }
  };
}

describe('GLSL ES 3.00 Shader Programs', () => {
  it('defines all 5 GLSL ES 3.00 shaders with normal-map, emissive, 24-point-light, pixel-water, and bloom/CRT uniforms', () => {
    const shaders = [
      SPRITE_SHADER,
      WATER_SHADER,
      LIGHTING_CANOPY_SHADER,
      BLOOM_COMPOSITE_SHADER,
      PARTICLE_SHADER,
    ];
    expect(Object.keys(ALL_SHADER_SOURCES)).toHaveLength(5);

    for (const s of shaders) {
      expect(s.vertex.startsWith('#version 300 es\n')).toBe(true);
      expect(s.fragment.startsWith('#version 300 es\n')).toBe(true);
      expect(s.fragment).toContain('precision highp float;');
      expect(s.fragment).toContain('out vec4 fragColor;');
    }

    // HD-2D Normal-map + Emissive + 24-point-light sprite uniforms & logic
    expect(SPRITE_SHADER.vertex).toContain('out vec2 vWorldPos;');
    expect(SPRITE_SHADER.vertex).toContain('out vec2 vSpriteRotFlip;');
    expect(SPRITE_SHADER.fragment).toContain('const int MAX_LIGHTS = 24;');
    expect(SPRITE_SHADER.fragment).toContain('uniform sampler2D uNormalTex;');
    expect(SPRITE_SHADER.fragment).toContain('uniform int uHasNormal;');
    expect(SPRITE_SHADER.fragment).toContain('uniform sampler2D uEmissiveTex;');
    expect(SPRITE_SHADER.fragment).toContain('uniform int uHasEmissive;');
    expect(SPRITE_SHADER.fragment).toContain('uniform int uLightCount;');
    expect(SPRITE_SHADER.fragment).toContain('uniform vec4 uLightPosRad[MAX_LIGHTS];');
    expect(SPRITE_SHADER.fragment).toContain('uniform vec4 uLightColInt[MAX_LIGHTS];');
    expect(SPRITE_SHADER.fragment).toContain('texture(uNormalTex, vUv).rgb * 2.0 - 1.0');
    expect(SPRITE_SHADER.fragment).toContain('uHasNormal == 1');
    expect(SPRITE_SHADER.fragment).toContain('uHasEmissive == 1');
    expect(SPRITE_SHADER.fragment).toContain('vRimColor');
    expect(SPRITE_SHADER.fragment).toContain('vEmissive');
    expect(SPRITE_SHADER.fragment).toContain('layout(location = 1) out vec4 fragEmissive;');

    // Pixel-snapped Water uniforms & pixel grid quantization
    expect(WATER_SHADER.fragment).toContain('uSkyTop');
    expect(WATER_SHADER.fragment).toContain('uSkyBottom');
    expect(WATER_SHADER.fragment).toContain('uStarlightIntensity');
    expect(WATER_SHADER.fragment).toContain('vFoamMask');
    expect(WATER_SHADER.fragment).toContain('floor(vWorldPos)');
    expect(WATER_SHADER.fragment).toContain('layout(location = 1) out vec4 fragEmissive;');

    // Lighting & canopy uniforms
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('MAX_LIGHTS = 24');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uLightPosRadius');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uLightColorIntensity');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uCanopyEnabled');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uSunbeamIntensity');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uSunbeamColor');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uCloudOpacity');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uEmissiveTex');
    expect(LIGHTING_CANOPY_SHADER.fragment).toContain('uHasEmissive');

    // Bloom / LUT / CRT uniforms
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uBloomIntensity');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uBloomThreshold');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uEmissiveTex');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uHasEmissive');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uTintRgb');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uContrast');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uSaturation');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uVignetteStrength');
    expect(BLOOM_COMPOSITE_SHADER.fragment).toContain('uCrtEnabled');
  });

  it('compiles all 5 shader programs and cleans up on shader compile error', () => {
    const { initialCanvas } = createMockCanvasHarness();
    const glOk = createMockWebGL2Context(initialCanvas);
    const lib = createShaderLibrary(glOk);
    expect(lib.sprite.name).toBe('SPRITE_SHADER');
    expect(lib.water.name).toBe('WATER_SHADER');
    expect(lib.lightingCanopy.name).toBe('LIGHTING_CANOPY_SHADER');
    expect(lib.bloomComposite.name).toBe('BLOOM_COMPOSITE_SHADER');
    expect(lib.particle.name).toBe('PARTICLE_SHADER');
    lib.dispose(glOk);
    expect(glOk.deleteProgram).toHaveBeenCalledTimes(5);

    const glBad = createMockWebGL2Context(initialCanvas, { compileSuccess: false });
    expect(() => compileProgram(glBad, SPRITE_SHADER)).toThrow(/Shader compilation failed/);
    expect(glBad.deleteShader).toHaveBeenCalled();
  });
});

describe('detectSoftwareRenderer', () => {
  it('detects SwiftShader, llvmpipe, Software Rasterizer, and Microsoft Basic Render Driver', () => {
    expect(
      detectSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)))'),
    ).toBe(true);
    expect(detectSoftwareRenderer('Google SwiftShader')).toBe(true);
    expect(detectSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(detectSoftwareRenderer('Mesa Software Rasterizer')).toBe(true);
    expect(detectSoftwareRenderer('ANGLE (Microsoft Basic Render Driver Direct3D11)')).toBe(true);
    expect(detectSoftwareRenderer('Mesa OffScreen')).toBe(true);
  });

  it('returns false for real hardware GPUs and empty inputs', () => {
    expect(detectSoftwareRenderer('')).toBe(false);
    expect(detectSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11)')).toBe(false);
    expect(detectSoftwareRenderer('Apple M3 Max')).toBe(false);
    expect(detectSoftwareRenderer('Intel(R) Iris(R) Xe Graphics')).toBe(false);
    expect(detectSoftwareRenderer('AMD Radeon RX 7900 XTX')).toBe(false);
    expect(detectSoftwareRenderer('Adreno (TM) 740')).toBe(false);
  });
});

describe('dt clamping <= 50ms', () => {
  it('clamps raw dt values strictly to [0, 0.05] seconds', () => {
    expect(MAX_FRAME_DT_SECONDS).toBe(0.05);
    expect(clampFrameDt(0.016)).toBeCloseTo(0.016, 6);
    expect(clampFrameDt(0.05)).toBe(0.05);
    expect(clampFrameDt(0.25)).toBe(0.05);
    expect(clampFrameDt(10)).toBe(0.05);
    expect(clampFrameDt(-0.1)).toBe(0);
    expect(clampFrameDt(Number.NaN)).toBe(0);
    expect(clampFrameDt(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('clamps large rAF timestamp jumps to <= 0.05s inside RenderEngine.startLoop', async () => {
    const rafQueue: Array<(ts: number) => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { initialCanvas } = createMockCanvasHarness({ webgl2Available: false });
    const engine = createRenderEngine();
    await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'canvas2d',
      reducedMotion: false,
      crtMode: false,
    });

    const seenDt: number[] = [];
    const seenElapsed: number[] = [];
    engine.startLoop((dt, elapsed) => {
      seenDt.push(dt);
      seenElapsed.push(elapsed);
    });

    // Simulate frame 1 at t=1000ms, then huge 500ms freeze to t=1500ms, then normal 16ms frame
    rafQueue.shift()?.(1000);
    rafQueue.shift()?.(1500);
    rafQueue.shift()?.(1516);
    engine.stopLoop();

    expect(seenDt).toHaveLength(3);
    expect(seenDt[0]).toBeCloseTo(1 / 60, 4);
    expect(seenDt[1]).toBe(0.05); // 500ms jump strictly clamped to 50ms
    expect(seenDt[2]).toBeCloseTo(0.016, 4);
    expect(seenElapsed[1] - seenElapsed[0]).toBeCloseTo(0.05, 6);
    engine.dispose();
  });
});

describe('Canvas2DBackend', () => {
  it('executes full draw, water, light, canopy, particle, custom2d, CRT, and stats pipeline', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness();
    vi.stubGlobal('document', doc);

    const backend = new Canvas2DBackend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: true,
    });

    // Verify DPR cap <= 2
    backend.resize(800, 600, 3.5);
    expect(backend.capabilities.dpr).toBe(2);
    expect(backend.getViewportSize()).toEqual({ width: 800, height: 600 });
    expect(initialCanvas.width).toBe(1600);
    expect(initialCanvas.height).toBe(1200);

    // Register atlas & region
    const fakeSheet = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('terrain', fakeSheet);
    backend.setAtlasRegions('terrain', {
      grass_0: { id: 'grass_0', x: 0, y: 0, w: 48, h: 48 },
    });

    backend.setCamera({ x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0, rotation: 0 });
    backend.setColorGrade({
      ...createDefaultColorGrade(),
      biomeId: 'forest',
      vignetteStrength: 0.32,
    });
    backend.setCanopyConfig({
      ...createDefaultCanopyConfig(),
      enabled: true,
      sunbeamIntensity: 0.5,
      cloudOpacity: 0.35,
    });
    backend.setWaterConfig({
      ...createDefaultWaterConfig(),
      enabled: true,
      starlightIntensity: 0.85,
    });

    // Pass huge dt (0.4s) to verify clampedDtMs <= 50
    backend.beginFrame(2.5, 0.4, [0.05, 0.08, 0.16, 1]);

    // Water quads (both float foamMask and 4-bit cardinal mask)
    backend.drawWaterQuad(0, 320, 48, 48, 0.25, 0.8);
    backend.drawWaterQuad(48, 320, 48, 48, 0.85, 1 | 4);

    // Sprites with depth sorting, regionId, flipX, rimColor, emissive
    backend.drawSprite({
      sheetId: 'terrain',
      regionId: 'grass_0',
      dx: 100,
      dy: 100,
      dw: 48,
      dh: 48,
      depth: 2,
      flipX: true,
      rimColor: [0.5, 0.9, 1.0, 0.8],
      emissive: 0.4,
    });
    backend.drawSprite({
      source: fakeSheet,
      dx: 160,
      dy: 100,
      dw: 48,
      dh: 48,
      depth: 1,
      rotation: 0.2,
    });

    // Queue 30 point lights — backend must cap activeLights at MAX_POINT_LIGHTS (24)
    for (let i = 0; i < 30; i++) {
      backend.addPointLight({
        id: `light-${i}`,
        x: 50 + (i % 6) * 110,
        y: 60 + Math.floor(i / 6) * 90,
        radius: 140,
        color: [1.0, 0.85, 0.55],
        intensity: 1.1,
        flickerSpeed: 3.5,
        flickerAmount: 0.12,
      });
    }

    // Queue additive and non-additive particles
    backend.drawParticle({
      x: 200,
      y: 220,
      radius: 14,
      color: [0.6, 0.9, 1.0, 0.9],
      additive: true,
      stretchX: 1.8,
      stretchY: 0.7,
      rotation: 0.4,
    });
    backend.drawParticle({
      x: 260,
      y: 240,
      radius: 10,
      color: [1.0, 0.7, 0.4, 0.75],
      additive: false,
    });

    const layerOrder: string[] = [];
    backend.drawCustom2D(() => layerOrder.push('world'), 'world');
    backend.drawCustom2D(() => layerOrder.push('post-light'), 'post-light');
    backend.drawCustom2D(() => layerOrder.push('screen'), 'screen');

    const stats = backend.endFrame();

    expect(stats.backend).toBe('canvas2d');
    expect(stats.clampedDtMs).toBe(50);
    expect(stats.activeLights).toBe(MAX_POINT_LIGHTS);
    expect(stats.activeParticles).toBe(2);
    expect(stats.drawCalls).toBeGreaterThan(30);
    expect(stats.fps).toBeGreaterThan(0);
    expect(layerOrder).toEqual(['world', 'post-light', 'screen']);

    const ctx = initialCanvas.last2DContext!;
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.createRadialGradient).toHaveBeenCalled();
    expect(backend.getCanvas2DContext()).toBe(ctx);

    backend.dispose();
  });

  it('sets ctx.imageSmoothingEnabled = false before every crisp sprite draw and honors pixelCrisp: false', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness();
    vi.stubGlobal('document', doc);

    const backend = new Canvas2DBackend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: false,
    });

    const albedo = { width: 128, height: 128 } as unknown as HTMLCanvasElement;
    const emissive = { width: 128, height: 128 } as unknown as HTMLCanvasElement;
    const dynamicSprite = { width: 64, height: 64 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('props', albedo, undefined, emissive);
    backend.setAtlasRegions('props', {
      lantern: { id: 'lantern', x: 0, y: 0, w: 32, h: 32 },
    });

    const ctx = initialCanvas.last2DContext!;
    ctx.imageSmoothingEnabled = true;

    backend.beginFrame(1.0, 0.016);
    // 1. Default crisp atlas sprite (draws albedo + atlas emissive + scalar emissive — all must have smoothing=false)
    backend.drawSprite({
      sheetId: 'props',
      regionId: 'lantern',
      dx: 16,
      dy: 16,
      dw: 64,
      dh: 64,
      depth: 1,
      emissive: 0.5,
    });
    // 2. Explicit pixelCrisp: true dynamic source
    backend.drawSprite({
      source: dynamicSprite,
      dx: 96,
      dy: 16,
      dw: 64,
      dh: 64,
      depth: 2,
      pixelCrisp: true,
    });
    // 3. Explicit pixelCrisp: false smooth draw
    backend.drawSprite({
      source: dynamicSprite,
      dx: 176,
      dy: 16,
      dw: 64,
      dh: 64,
      depth: 3,
      pixelCrisp: false,
    });

    backend.endFrame();

    // 3 drawImage calls for crisp atlas (albedo + emissive map + scalar emissive), 1 for crisp dynamic, 1 for smooth
    expect(ctx._drawImageSmoothingHistory).toEqual([false, false, false, false, true]);
    backend.dispose();
  });
});

describe('WebGL2Backend', () => {
  it('runs all 4 passes (Scene FBO + MRT emissive, Lit FBO, Particles/Post-Light, Bloom/LUT/CRT) and degrades safely on context loss', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: true });
    vi.stubGlobal('document', doc);

    const backend = new WebGL2Backend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: true,
    });

    const gl = initialCanvas.lastWebGL2Context!;
    expect(backend.kind).toBe('webgl2');
    expect(backend.capabilities.webgl2Supported).toBe(true);
    expect(backend.capabilities.isSoftwareRasterizer).toBe(false);
    expect(backend.getViewportSize()).toEqual({ width: 960, height: 540 });

    const fakeSheet = { width: 128, height: 128 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('props', fakeSheet);
    backend.setAtlasRegions('props', { lantern: { id: 'lantern', x: 0, y: 0, w: 32, h: 32 } });

    backend.beginFrame(1.2, 0.016);
    backend.drawWaterQuad(0, 200, 64, 64, 0.5, 1);
    backend.drawSprite({
      sheetId: 'props',
      regionId: 'lantern',
      dx: 120,
      dy: 120,
      dw: 32,
      dh: 32,
      emissive: 0.6,
    });
    backend.drawCustom2D((ctx) => {
      ctx.fillRect(10, 10, 40, 40);
    }, 'world');
    backend.addPointLight({
      id: 'lantern-glow',
      x: 136,
      y: 136,
      radius: 160,
      color: [1.0, 0.85, 0.45],
      intensity: 1.4,
      flickerSpeed: 4,
      flickerAmount: 0.15,
    });
    backend.drawParticle({
      x: 140,
      y: 130,
      radius: 8,
      color: [1.0, 0.95, 0.7, 0.9],
      additive: true,
    });
    backend.drawCustom2D((ctx) => {
      ctx.fillRect(0, 0, 20, 20);
    }, 'post-light');
    backend.drawCustom2D((ctx) => {
      ctx.fillRect(0, 0, 10, 10);
    }, 'screen');

    const stats = backend.endFrame();
    expect(stats.backend).toBe('webgl2');
    expect(stats.activeLights).toBe(1);
    expect(stats.activeParticles).toBe(1);
    // Water + Sprite + World2D + Lighting + Particle + PostLight2D + Bloom + Screen2D = 8 draw calls
    expect(stats.drawCalls).toBe(8);
    expect(gl._calls.drawArraysInstanced).toHaveBeenCalled();
    expect(gl._calls.drawArrays).toHaveBeenCalledTimes(2); // Lighting + Bloom fullscreen passes
    expect(gl._calls.drawBuffers).toHaveBeenCalledWith([gl.NONE, gl.COLOR_ATTACHMENT1]);
    expect(gl._calls.drawBuffers).toHaveBeenCalledWith([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    expect(gl._calls.drawBuffers).not.toHaveBeenCalledWith([gl.COLOR_ATTACHMENT1]);
    expect(gl._calls.uniform4fv).toHaveBeenCalled();
    expect(gl._calls.texImage2D).toHaveBeenCalled();

    // Simulate context lost: endFrame and resize must degrade safely without throwing
    gl._setLost(true);
    backend.resize(640, 360);
    backend.beginFrame(1.3, 0.016);
    const lostStats = backend.endFrame();
    expect(lostStats.drawCalls).toBe(0);

    backend.dispose();
  });

  it('applies GL_NEAREST + CLAMP_TO_EDGE to pixel-art atlases and dynamic sprite sources while keeping GL_LINEAR strictly on FBO targets', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: true });
    vi.stubGlobal('document', doc);

    const backend = new WebGL2Backend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: false,
    });
    const gl = initialCanvas.lastWebGL2Context!;

    const terrainAlbedo = { id: 'terrain-albedo', width: 384, height: 608 } as unknown as HTMLCanvasElement;
    const terrainNormal = { id: 'terrain-normal', width: 384, height: 608 } as unknown as HTMLCanvasElement;
    const terrainEmissive = { id: 'terrain-emissive', width: 384, height: 608 } as unknown as HTMLCanvasElement;
    const propsAlbedo = { id: 'props-albedo', width: 384, height: 192 } as unknown as HTMLCanvasElement;
    const charsAlbedo = { id: 'chars-albedo', width: 256, height: 256 } as unknown as HTMLCanvasElement;
    const fallbacksAlbedo = { id: 'fallbacks-albedo', width: 256, height: 256 } as unknown as HTMLCanvasElement;
    const crispDynSource = { id: 'pokemon-gif-frame', width: 96, height: 96 } as unknown as HTMLCanvasElement;
    const smoothDynSource = { id: 'smooth-glow-card', width: 128, height: 128 } as unknown as HTMLCanvasElement;

    backend.registerAtlas('terrain', terrainAlbedo, terrainNormal, terrainEmissive);
    backend.registerAtlas('props', propsAlbedo);
    backend.registerAtlas('characters', charsAlbedo);
    backend.registerAtlas('fallbacks', fallbacksAlbedo);

    backend.beginFrame(0.5, 0.016);
    backend.drawSprite({ source: crispDynSource, dx: 20, dy: 20, dw: 96, dh: 96 });
    backend.drawSprite({ source: smoothDynSource, dx: 140, dy: 20, dw: 128, dh: 128, pixelCrisp: false });
    backend.endFrame();

    const allTracked = [...gl._textures.values()];
    const findBySource = (src: unknown) => allTracked.find((t) => t.uploadedSource === src);

    // Every pixel-art atlas texture (albedo, normal, emissive) + crisp dynamic sprite must use GL_NEAREST + CLAMP_TO_EDGE
    for (const src of [
      terrainAlbedo,
      terrainNormal,
      terrainEmissive,
      propsAlbedo,
      charsAlbedo,
      fallbacksAlbedo,
      crispDynSource,
    ]) {
      const tracked = findBySource(src);
      expect(tracked).toBeDefined();
      expect(tracked?.minFilter).toBe(gl.NEAREST);
      expect(tracked?.magFilter).toBe(gl.NEAREST);
      expect(tracked?.wrapS).toBe(gl.CLAMP_TO_EDGE);
      expect(tracked?.wrapT).toBe(gl.CLAMP_TO_EDGE);
    }

    // Explicit pixelCrisp: false uses GL_LINEAR
    const smoothTracked = findBySource(smoothDynSource);
    expect(smoothTracked?.minFilter).toBe(gl.LINEAR);
    expect(smoothTracked?.magFilter).toBe(gl.LINEAR);

    // FBO targets (scene color, scene emissive, lit) must strictly retain GL_LINEAR filtering
    const fboTextures = allTracked.filter((t) => t.isFboAttachment);
    expect(fboTextures.length).toBeGreaterThanOrEqual(3);
    for (const fboTex of fboTextures) {
      expect(fboTex.minFilter).toBe(gl.LINEAR);
      expect(fboTex.magFilter).toBe(gl.LINEAR);
      expect(fboTex.wrapS).toBe(gl.CLAMP_TO_EDGE);
      expect(fboTex.wrapT).toBe(gl.CLAMP_TO_EDGE);
    }

    backend.dispose();
  });

  it('uploads tangent-space uHasNormal, uHasEmissive, and up to 24 real-time point lights during sprite draws', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: true });
    vi.stubGlobal('document', doc);

    const backend = new WebGL2Backend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: false,
    });
    const gl = initialCanvas.lastWebGL2Context!;

    const albedo = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
    const normal = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
    const emissive = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('terrain', albedo, normal, emissive);
    backend.setAtlasRegions('terrain', {
      cottage: { id: 'cottage', x: 0, y: 0, w: 64, h: 64 },
    });

    backend.beginFrame(2.0, 0.016);
    // Queue 30 point lights — both sprite pass and lighting pass must cap at MAX_POINT_LIGHTS (24)
    for (let i = 0; i < 30; i++) {
      backend.addPointLight({
        id: `pt-${i}`,
        x: 60 + (i % 6) * 100,
        y: 60 + Math.floor(i / 6) * 80,
        radius: 160,
        color: [1.0, 0.85, 0.5],
        intensity: 1.2,
        flickerSpeed: 3.0,
        flickerAmount: 0.1,
        screenSpace: i === 0,
      });
    }

    // Normal-mapped + emissive sprite (default useNormalMap !== false)
    backend.drawSprite({
      sheetId: 'terrain',
      regionId: 'cottage',
      dx: 100,
      dy: 100,
      dw: 64,
      dh: 64,
      depth: 1,
      rimColor: [0.6, 0.9, 1.0, 0.7],
      emissive: 0.35,
    });
    // Explicitly disable normal mapping on second sprite
    backend.drawSprite({
      sheetId: 'terrain',
      regionId: 'cottage',
      dx: 180,
      dy: 100,
      dw: 64,
      dh: 64,
      depth: 2,
      useNormalMap: false,
    });

    const stats = backend.endFrame();
    expect(stats.activeLights).toBe(MAX_POINT_LIGHTS);

    const uniform1iCalls = gl._calls.uniform1i.mock.calls.map(([loc, val]) => [
      (loc as { name: string } | null)?.name,
      val,
    ]);
    expect(uniform1iCalls).toContainEqual(['uHasNormal', 1]);
    expect(uniform1iCalls).toContainEqual(['uHasNormal', 0]);
    expect(uniform1iCalls).toContainEqual(['uHasEmissive', 1]);
    expect(uniform1iCalls).toContainEqual(['uLightCount', MAX_POINT_LIGHTS]);

    const uniform4fvCalls = gl._calls.uniform4fv.mock.calls.map(([loc, data]) => [
      (loc as { name: string } | null)?.name,
      (data as Float32Array).length,
    ]);
    expect(uniform4fvCalls).toContainEqual(['uLightPosRad[0]', MAX_POINT_LIGHTS * 4]);
    expect(uniform4fvCalls).toContainEqual(['uLightColInt[0]', MAX_POINT_LIGHTS * 4]);

    backend.dispose();
  });

  it('insets packed atlas sub-rect UVs in WebGL2Backend to prevent 1px neighbor-tile bleed seams while keeping full-sheet UVs [0,1]', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: true });
    vi.stubGlobal('document', doc);

    const backend = new WebGL2Backend();
    await backend.init(initialCanvas as unknown as HTMLCanvasElement, {
      dprCap: 2,
      reducedMotion: false,
      crtMode: false,
    });
    const gl = initialCanvas.lastWebGL2Context!;

    const terrainAtlas = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
    const standaloneSprite = { width: 48, height: 48 } as unknown as HTMLCanvasElement;
    backend.registerAtlas('terrain', terrainAtlas);
    backend.setAtlasRegions('terrain', {
      tile_0: { id: 'tile_0', x: 0, y: 0, w: 32, h: 32 },
      tile_8: { id: 'tile_8', x: 0, y: 32, w: 32, h: 32 },
    });

    const bufferUploads: Float32Array[] = [];
    (gl.bufferData as ReturnType<typeof vi.fn>).mockImplementation((_target: number, data: unknown) => {
      if (data instanceof Float32Array && data.length >= 20) {
        bufferUploads.push(new Float32Array(data));
      }
    });

    backend.beginFrame(1.0, 0.016);
    // Crisp packed sub-rect (tile_0 directly above tile_8 in 256x256 terrain atlas)
    backend.drawSprite({
      sheetId: 'terrain',
      regionId: 'tile_0',
      dx: 0,
      dy: 0,
      dw: 32,
      dh: 32,
      pixelCrisp: true,
      depth: 0,
    });
    // Smooth packed sub-rect
    backend.drawSprite({
      sheetId: 'terrain',
      regionId: 'tile_8',
      dx: 32,
      dy: 0,
      dw: 32,
      dh: 32,
      pixelCrisp: false,
      depth: 1,
    });
    // Full standalone dynamic texture (not a sub-rect)
    backend.drawSprite({
      source: standaloneSprite,
      dx: 64,
      dy: 0,
      dw: 48,
      dh: 48,
      pixelCrisp: true,
      depth: 2,
    });
    backend.endFrame();

    expect(bufferUploads.length).toBeGreaterThanOrEqual(3);

    // Upload 0: crisp tile_0 (0..32 in 256x256) -> inset by 0.125 texel on all 4 edges
    const crispTile = bufferUploads[0];
    const [cu0, cv0, cuSpan, cvSpan] = [crispTile[4], crispTile[5], crispTile[6], crispTile[7]];
    expect(cu0).toBeCloseTo(0.125 / 256, 6);
    expect(cv0).toBeCloseTo(0.125 / 256, 6);
    expect(cu0 + cuSpan).toBeCloseTo(31.875 / 256, 6);
    expect(cv0 + cvSpan).toBeCloseTo(31.875 / 256, 6);
    expect(cv0 + cvSpan).toBeLessThan(32 / 256);

    // Upload 1: smooth tile_8 (0..32, 32..64 in 256x256) -> inset by 0.5 texel
    const smoothTile = bufferUploads[1];
    const [su0, sv0, suSpan, svSpan] = [smoothTile[4], smoothTile[5], smoothTile[6], smoothTile[7]];
    expect(su0).toBeCloseTo(0.5 / 256, 6);
    expect(sv0).toBeCloseTo(32.5 / 256, 6);
    expect(su0 + suSpan).toBeCloseTo(31.5 / 256, 6);
    expect(sv0 + svSpan).toBeCloseTo(63.5 / 256, 6);

    // Upload 2: standalone full-texture dynamic sprite -> exact [0, 1] UVs
    const fullSprite = bufferUploads[2];
    expect(fullSprite[4]).toBe(0);
    expect(fullSprite[5]).toBe(0);
    expect(fullSprite[6]).toBe(1);
    expect(fullSprite[7]).toBe(1);

    backend.dispose();
  });
});

describe('RenderEngine backend negotiation, canvas swap & context-loss recovery', () => {
  it('selects Canvas2DBackend directly when preferredMode is canvas2d', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: true });
    vi.stubGlobal('document', doc);

    const engine = new RenderEngine();
    const caps = await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'canvas2d',
      reducedMotion: true,
      crtMode: false,
    });

    expect(engine.activeBackend.kind).toBe('canvas2d');
    expect(engine.requestedMode).toBe('canvas2d');
    expect(caps.kind).toBe('canvas2d');
    expect(caps.reducedMotion).toBe(true);
    expect(initialCanvas.boundContextType).toBe('2d');
    engine.dispose();
  });

  it('falls back to Canvas2DBackend and swaps canvas in-place when SwiftShader is detected in auto mode', async () => {
    const { initialCanvas, parent, doc } = createMockCanvasHarness({
      webgl2Available: true,
      webgl2Options: {
        rendererString: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
      },
    });
    vi.stubGlobal('document', doc);

    const events: Parameters<ContextLossListener>[0][] = [];
    const engine = createRenderEngine();
    engine.onContextEvent((e) => events.push(e));

    const caps = await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'auto',
      reducedMotion: false,
      crtMode: false,
    });

    expect(engine.activeBackend.kind).toBe('canvas2d');
    expect(caps.isSoftwareRasterizer).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('fallback');
    expect(events[0].previousBackend).toBe('webgl2');
    expect(events[0].activeBackend).toBe('canvas2d');

    // Original canvas bound WebGL2; parent must now hold a fresh <canvas> with identical attributes
    const swappedCanvas = parent.children[0];
    expect(swappedCanvas).not.toBe(initialCanvas);
    expect(swappedCanvas.boundContextType).toBe('2d');
    expect(swappedCanvas.id).toBe('starlight-canvas');
    expect(swappedCanvas.className).toBe('stage-canvas high-dpi');
    expect(swappedCanvas.style.cssText).toBe('width: 100%; height: 100%; display: block;');
    expect(swappedCanvas.getAttribute('aria-label')).toBe('Starlight Island Game Canvas');

    engine.dispose();
  });

  it('falls back to Canvas2D cleanly when WebGL2 is unavailable under webgl2 mode', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({ webgl2Available: false });
    vi.stubGlobal('document', doc);

    const events: Parameters<ContextLossListener>[0][] = [];
    const engine = createRenderEngine();
    engine.onContextEvent((e) => events.push(e));

    await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'webgl2',
      reducedMotion: false,
      crtMode: true,
    });

    expect(engine.activeBackend.kind).toBe('canvas2d');
    expect(events.some((e) => e.type === 'fallback')).toBe(true);
    engine.dispose();
  });

  it('handles webglcontextlost via simulateContextLoss with in-place DOM canvas swap, multi-sheet atlas & CRT preservation, zero-gap repaint, and webglcontextrestored recovery', async () => {
    const onLoseExt = vi.fn();
    const { initialCanvas, parent, doc } = createMockCanvasHarness({
      webgl2Available: true,
      baseURI: 'https://krunked-fpv.github.io/starlight_v2/',
      webgl2Options: {
        rendererString: 'ANGLE (NVIDIA GeForce RTX 4070 Direct3D11)',
        supportLoseContextExt: true,
        autoDispatchLostOnExt: true,
        onLoseContext: onLoseExt,
      },
    });
    vi.stubGlobal('document', doc);

    const mockManifest: AtlasManifest = {
      version: '2.1.0',
      seed: 20261124,
      generatedBy: 'bake-assets.mjs',
      sheets: {
        terrain: {
          id: 'terrain',
          albedoPath: './terrain-atlas.png',
          normalPath: './terrain-normal.png',
          emissivePath: './terrain-emissive.png',
          width: 384,
          height: 608,
          tileSize: 32,
          pixelCrisp: true,
          regions: { village_grass: { id: 'village_grass', x: 0, y: 0, w: 32, h: 32 } },
        },
        props: {
          id: 'props',
          albedoPath: './props-atlas.png',
          normalPath: './props-normal.png',
          emissivePath: './props-emissive.png',
          width: 384,
          height: 192,
          tileSize: 64,
          pixelCrisp: true,
          regions: { cottage: { id: 'cottage', x: 0, y: 0, w: 64, h: 64 } },
        },
        characters: {
          id: 'characters',
          albedoPath: './characters-atlas.png',
          width: 256,
          height: 256,
          tileSize: 32,
          pixelCrisp: true,
          regions: { violet_down: { id: 'violet_down', x: 0, y: 0, w: 32, h: 32 } },
        },
        fallbacks: {
          id: 'fallbacks',
          albedoPath: './fallbacks-atlas.png',
          width: 256,
          height: 256,
          tileSize: 64,
          pixelCrisp: true,
          regions: { mon_biped: { id: 'mon_biped', x: 0, y: 0, w: 64, h: 64 } },
        },
      },
      arenas: createFullMockArenas(),
      tileRegions: { '0': 'village_grass' },
      iconIds: ['icon-starball'],
      totalBytes: 42000,
    };

    const loadedImgUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => mockManifest })),
    );
    vi.stubGlobal('Image', createFakeImageClass(loadedImgUrls));
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const events: Parameters<ContextLossListener>[0][] = [];
    const engine = createRenderEngine();
    engine.onContextEvent((e) => events.push(e));

    await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'auto',
      reducedMotion: false,
      crtMode: true,
    });
    expect(engine.activeBackend.kind).toBe('webgl2');

    await engine.loadManifest('./atlases/manifest.json');

    // Set custom camera & biome grade before context loss to verify preservation
    const customGrade: BiomeColorGrade = {
      ...createDefaultColorGrade(),
      biomeId: 'ruins',
      bloomIntensity: 0.55,
    };
    engine.activeBackend.setCamera({ x: 144, y: 96, zoom: 1.25 });
    engine.activeBackend.setColorGrade(customGrade);

    // Track immediate synchronous repaint ticks (zero blank frames on swap & restore!)
    const immediateTickBackends: string[] = [];
    engine.startLoop((_dt, _elapsed, backend) => {
      immediateTickBackends.push(backend.kind);
      backend.beginFrame(5.0, 0.016);
      backend.drawSprite({ sheetId: 'terrain', regionId: 'village_grass', dx: 0, dy: 0, dw: 32, dh: 32 });
      backend.drawSprite({ sheetId: 'props', regionId: 'cottage', dx: 32, dy: 0, dw: 64, dh: 64 });
      backend.drawSprite({ sheetId: 'characters', regionId: 'violet_down', dx: 96, dy: 0, dw: 32, dh: 32 });
      backend.drawSprite({ sheetId: 'fallbacks', regionId: 'mon_biped', dx: 128, dy: 0, dw: 64, dh: 64 });
      backend.endFrame();
    });

    // Trigger context loss
    const triggered = engine.simulateContextLoss();
    expect(triggered).toBe(true);
    expect(onLoseExt).toHaveBeenCalledTimes(1);

    // Immediately hot-swapped to Canvas2DBackend on a fresh DOM canvas preserving attributes & repainted immediately
    expect(engine.activeBackend.kind).toBe('canvas2d');
    expect(engine.getStats().contextLostCount).toBe(1);
    expect(immediateTickBackends).toEqual(['canvas2d']);
    expect(events[0]).toMatchObject({
      type: 'lost',
      previousBackend: 'webgl2',
      activeBackend: 'canvas2d',
    });

    const swappedCanvas = parent.children[0];
    expect(swappedCanvas).not.toBe(initialCanvas);
    expect(swappedCanvas.boundContextType).toBe('2d');
    expect(swappedCanvas.id).toBe('starlight-canvas');
    expect(swappedCanvas.className).toBe('stage-canvas high-dpi');
    expect(swappedCanvas.style.cssText).toBe('width: 100%; height: 100%; display: block;');
    expect(swappedCanvas.getAttribute('aria-label')).toBe('Starlight Island Game Canvas');

    // All 4 multi-sheet atlases rendered on Canvas2D (terrain + props + characters + fallbacks + emissive layers)
    expect(swappedCanvas.last2DContext!.drawImage.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(engine.activeBackend.capabilities.crtMode).toBe(true);

    // Simulate context restoration on the original lost WebGL canvas
    initialCanvas.dispatchEvent(new CustomEvent('webglcontextrestored'));
    expect(engine.getStats().contextRestoredCount).toBe(1);
    expect(engine.activeBackend.kind).toBe('webgl2');
    expect(immediateTickBackends).toEqual(['canvas2d', 'webgl2']);
    expect(events[1]).toMatchObject({
      type: 'restored',
      previousBackend: 'canvas2d',
      activeBackend: 'webgl2',
    });

    // Verify restored WebGL2 canvas re-registered all 4 sheets with GL_NEAREST + normal/emissive maps
    const restoredCanvas = parent.children[0];
    const restoredGl = restoredCanvas.lastWebGL2Context!;
    const restoredUniform1i = restoredGl._calls.uniform1i.mock.calls.map(([loc, val]) => [
      (loc as { name: string } | null)?.name,
      val,
    ]);
    expect(restoredUniform1i).toContainEqual(['uHasNormal', 1]);
    expect(restoredUniform1i).toContainEqual(['uHasEmissive', 1]);
    expect(engine.activeBackend.capabilities.crtMode).toBe(true);

    engine.dispose();
  });

  it('resolves /starlight_v2/ subpath manifest URLs, preloads multi-sheet atlases + all 18 biome & skyhop arenas, and exposes getSheetImage/getArenaImage', async () => {
    const { initialCanvas, doc } = createMockCanvasHarness({
      webgl2Available: true,
      baseURI: 'https://krunked-fpv.github.io/starlight_v2/',
    });
    vi.stubGlobal('document', doc);

    // Verify subpath URL resolution helpers directly for both manifest-relative `./` and root-relative `./atlases/` paths
    const resolvedManifest = resolveManifestUrl('./atlases/manifest.json');
    expect(resolvedManifest).toBe('https://krunked-fpv.github.io/starlight_v2/atlases/manifest.json');
    expect(resolveManifestAssetUrl('./terrain-atlas.png', resolvedManifest)).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-atlas.png',
    );
    expect(resolveManifestAssetUrl('./atlases/terrain-normal.png', resolvedManifest)).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-normal.png',
    );
    expect(resolveManifestAssetUrl('./arenas/village-arena.png', resolvedManifest)).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/arenas/village-arena.png',
    );
    expect(resolveManifestAssetUrl('../arenas/skyhop-arena.png', resolvedManifest)).toBe(
      'https://krunked-fpv.github.io/starlight_v2/arenas/skyhop-arena.png',
    );

    const mockManifest: AtlasManifest = {
      version: '2.1.0',
      seed: 1337,
      generatedBy: 'bake-assets.mjs',
      sheets: {
        terrain: {
          id: 'terrain',
          albedoPath: './atlases/terrain-atlas.png',
          normalPath: './atlases/terrain-normal.png',
          emissivePath: './atlases/terrain-emissive.png',
          width: 256,
          height: 256,
          tileSize: 32,
          pixelCrisp: true,
          regions: {
            meadow_0: { id: 'meadow_0', x: 0, y: 0, w: 32, h: 32 },
          },
        },
        props: {
          id: 'props',
          albedoPath: './props-atlas.png',
          normalPath: './props-normal.png',
          emissivePath: './props-emissive.png',
          width: 256,
          height: 128,
          tileSize: 64,
          pixelCrisp: true,
          regions: {
            shrine: { id: 'shrine', x: 0, y: 0, w: 64, h: 64 },
          },
        },
        characters: {
          id: 'characters',
          albedoPath: './characters-atlas.png',
          width: 256,
          height: 256,
          tileSize: 32,
          regions: {},
        },
        fallbacks: {
          id: 'fallbacks',
          albedoPath: './fallbacks-atlas.png',
          width: 256,
          height: 256,
          tileSize: 64,
          regions: {},
        },
      },
      arenas: createFullMockArenas(),
      tileRegions: { '0': 'meadow_0' },
      biomeTileRowMap: { village: 0, crater: 17 },
      iconIds: ['icon-starball'],
      totalBytes: 64000,
    };

    const fetchedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => mockManifest,
        };
      }),
    );

    const loadedImgUrls: string[] = [];
    vi.stubGlobal('Image', createFakeImageClass(loadedImgUrls));

    const engine = createRenderEngine();
    await engine.init(initialCanvas as unknown as HTMLCanvasElement, {
      preferredMode: 'auto',
      reducedMotion: false,
      crtMode: false,
    });

    // Before loadManifest, getters return null
    expect(engine.getSheetImage('terrain')).toBeNull();
    expect(engine.getArenaImage('village')).toBeNull();
    expect(engine.getArenaImage('skyhop')).toBeNull();

    const manifest = await engine.loadManifest('./atlases/manifest.json');
    expect(manifest.version).toBe('2.1.0');
    expect(engine.getManifest()).toBe(manifest);
    expect(fetchedUrls[0]).toBe('https://krunked-fpv.github.io/starlight_v2/atlases/manifest.json');

    // Verify sheets loaded under /starlight_v2/ subpath and cached via getSheetImage
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-atlas.png',
    );
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-normal.png',
    );
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-emissive.png',
    );
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/props-atlas.png',
    );
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/characters-atlas.png',
    );
    expect(loadedImgUrls).toContain(
      'https://krunked-fpv.github.io/starlight_v2/atlases/fallbacks-atlas.png',
    );

    expect(engine.getSheetImage('terrain')?.src).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/terrain-atlas.png',
    );
    expect(engine.getSheetImage('props')?.src).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/props-atlas.png',
    );
    expect(engine.getSheetImage('characters')?.src).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/characters-atlas.png',
    );
    expect(engine.getSheetImage('fallbacks')?.src).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/fallbacks-atlas.png',
    );
    expect(engine.getSheetImage('unknown-sheet')).toBeNull();

    // Verify all 18 canonical biomes (village..crater) + skyhop arenas are preloaded & cached
    for (const biome of BIOME_IDS) {
      const arenaImg = engine.getArenaImage(biome);
      expect(arenaImg).not.toBeNull();
      expect(arenaImg?.src).toBe(
        `https://krunked-fpv.github.io/starlight_v2/atlases/arenas/${biome}-arena.png`,
      );
    }
    expect(engine.getArenaImage('skyhop')?.src).toBe(
      'https://krunked-fpv.github.io/starlight_v2/atlases/arenas/skyhop-arena.png',
    );

    // Swap backend to canvas2d and verify multi-sheet atlases + regions were automatically re-registered
    const kind = await engine.switchBackend('canvas2d', 'user toggle');
    expect(kind).toBe('canvas2d');

    engine.activeBackend.beginFrame(0.5, 0.016);
    engine.activeBackend.drawSprite({
      sheetId: 'terrain',
      regionId: 'meadow_0',
      dx: 10,
      dy: 20,
      dw: 32,
      dh: 32,
    });
    engine.activeBackend.drawSprite({
      sheetId: 'props',
      regionId: 'shrine',
      dx: 60,
      dy: 20,
      dw: 64,
      dh: 64,
    });
    const stats = engine.activeBackend.endFrame();
    expect(stats.drawCalls).toBeGreaterThanOrEqual(3); // clear + 2 sprites

    engine.dispose();
    expect(engine.getSheetImage('terrain')).toBeNull();
    expect(engine.getArenaImage('village')).toBeNull();
  });
});
