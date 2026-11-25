import type { AtlasRegion, DecodedSpriteFrames } from '../../contracts';

export const SILHOUETTE_CONTOUR_PAD = 2;

export interface SpriteOpaqueBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  contentW: number;
  contentH: number;
  frameW: number;
  frameH: number;
}

const opaqueBoundsByFrames = new WeakMap<DecodedSpriteFrames, SpriteOpaqueBounds | null>();
const opaqueBoundsByCanvas = new WeakMap<object, SpriteOpaqueBounds | null>();
const contourCanvasCache = new WeakMap<object, HTMLCanvasElement | null>();
const atlasContourCache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();
const atlasTintedCache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();

function parseHexRgb255(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [160, 180, 220];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canReadCanvasPixels(source: unknown): source is HTMLCanvasElement {
  if (!source || typeof source !== 'object') return false;
  const candidate = source as { width?: number; height?: number; getContext?: unknown };
  if (typeof candidate.getContext !== 'function') return false;
  if (typeof candidate.width !== 'number' || typeof candidate.height !== 'number') return false;
  return candidate.width > 0 && candidate.height > 0;
}

function createOffscreenCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  } catch {
    return null;
  }
}

function scanCanvasOpaqueBounds(canvas: HTMLCanvasElement): SpriteOpaqueBounds | null {
  try {
    const ctx =
      canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function') return null;
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[rowOff + x * 4 + 3] >= 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      contentW: maxX - minX + 1,
      contentH: maxY - minY + 1,
      frameW: w,
      frameH: h,
    };
  } catch {
    return null;
  }
}

/**
 * Measures the tight union opaque bounding box across a decoded sprite animation
 * so padded GIF canvases scale consistently and plant their feet directly on battle pads.
 * Returns null gracefully for mock objects in headless unit tests.
 */
export function measureSpriteOpaqueBounds(
  frames: DecodedSpriteFrames | null | undefined,
  fallbackFrame?: HTMLCanvasElement | null,
): SpriteOpaqueBounds | null {
  if (frames) {
    const cached = opaqueBoundsByFrames.get(frames);
    if (cached !== undefined) return cached;

    const list = frames.frames;
    if (!Array.isArray(list) || list.length === 0) {
      opaqueBoundsByFrames.set(frames, null);
      return null;
    }

    const maxSamples = Math.min(list.length, 8);
    let union: SpriteOpaqueBounds | null = null;
    for (let i = 0; i < maxSamples; i++) {
      const idx =
        maxSamples === 1
          ? 0
          : Math.min(list.length - 1, Math.round((i / (maxSamples - 1)) * (list.length - 1)));
      const frame = list[idx]?.canvas;
      if (!canReadCanvasPixels(frame)) continue;
      const b = scanCanvasOpaqueBounds(frame);
      if (!b) continue;
      if (!union) {
        union = { ...b };
      } else {
        union.minX = Math.min(union.minX, b.minX);
        union.minY = Math.min(union.minY, b.minY);
        union.maxX = Math.max(union.maxX, b.maxX);
        union.maxY = Math.max(union.maxY, b.maxY);
        union.contentW = union.maxX - union.minX + 1;
        union.contentH = union.maxY - union.minY + 1;
      }
    }

    opaqueBoundsByFrames.set(frames, union);
    return union;
  }

  if (canReadCanvasPixels(fallbackFrame)) {
    const cached = opaqueBoundsByCanvas.get(fallbackFrame);
    if (cached !== undefined) return cached;
    const measured = scanCanvasOpaqueBounds(fallbackFrame);
    opaqueBoundsByCanvas.set(fallbackFrame, measured);
    return measured;
  }

  return null;
}

/**
 * Synthesizes a dual-contrast pixel-art silhouette backing from RGBA pixel data:
 * - Inner 1-texel 8-neighbor ring: deep midnight ink (#090c1e) so light sprites pop off bright snow/lava/sand.
 * - Outer 1-texel 8-neighbor ring: subtle cool starlight rim-halo (#eef6ff) so dark sprites pop off dark forests/caves/rifts.
 * - Solid interior under alpha >= 196 filled with ink to eliminate subpixel gaps under lunge rotation.
 */
function buildDualContrastContourFromPixels(
  srcData: Uint8ClampedArray,
  sw: number,
  sh: number,
): HTMLCanvasElement | null {
  const pad = SILHOUETTE_CONTOUR_PAD;
  const cw = sw + pad * 2;
  const ch = sh + pad * 2;
  const outCanvas = createOffscreenCanvas(cw, ch);
  if (!outCanvas) return null;

  try {
    const outCtx =
      outCanvas.getContext('2d', { willReadFrequently: true }) ?? outCanvas.getContext('2d');
    if (!outCtx || typeof outCtx.createImageData !== 'function') return null;

    const solid = new Uint8Array(cw * ch);
    const opaqueInterior = new Uint8Array(cw * ch);
    for (let y = 0; y < sh; y++) {
      const srcRow = y * sw * 4;
      const dstRow = (y + pad) * cw + pad;
      for (let x = 0; x < sw; x++) {
        const a = srcData[srcRow + x * 4 + 3];
        if (a >= 36) {
          solid[dstRow + x] = 1;
          if (a >= 196) {
            opaqueInterior[dstRow + x] = 1;
          }
        }
      }
    }

    // Pass 1: 1-texel dark ink dilation around solid mask (cardinal = 2, diagonal = 1)
    const inkMask = new Uint8Array(cw * ch);
    for (let y = 1; y < ch - 1; y++) {
      const row = y * cw;
      for (let x = 1; x < cw - 1; x++) {
        const idx = row + x;
        if (solid[idx]) continue;
        if (
          solid[idx - 1] ||
          solid[idx + 1] ||
          solid[idx - cw] ||
          solid[idx + cw]
        ) {
          inkMask[idx] = 2;
        } else if (
          solid[idx - cw - 1] ||
          solid[idx - cw + 1] ||
          solid[idx + cw - 1] ||
          solid[idx + cw + 1]
        ) {
          inkMask[idx] = 1;
        }
      }
    }

    // Pass 2: 1-texel luminous starlight rim-halo outside the dark ink silhouette
    const imgData = outCtx.createImageData(cw, ch);
    const out = imgData.data;

    for (let y = 0; y < ch; y++) {
      const row = y * cw;
      for (let x = 0; x < cw; x++) {
        const idx = row + x;
        const p = idx * 4;

        if (opaqueInterior[idx]) {
          // Solid ink fill strictly beneath opaque sprite body to seal rotation seams
          out[p] = 9;
          out[p + 1] = 12;
          out[p + 2] = 30;
          out[p + 3] = 248;
          continue;
        }

        if (solid[idx]) {
          // Semi-transparent sprite pixels (e.g. flames/smoke): keep unobstructed
          continue;
        }

        const ink = inkMask[idx];
        if (ink > 0) {
          out[p] = 9;
          out[p + 1] = 12;
          out[p + 2] = 30;
          out[p + 3] = ink === 2 ? 248 : 220;
          continue;
        }

        // Check if bordering the dark ink ring to emit crisp luminous outer rim-halo
        const hasCardinalInk =
          (x > 0 && inkMask[idx - 1] > 0) ||
          (x < cw - 1 && inkMask[idx + 1] > 0) ||
          (y > 0 && inkMask[idx - cw] > 0) ||
          (y < ch - 1 && inkMask[idx + cw] > 0);

        if (hasCardinalInk) {
          out[p] = 228;
          out[p + 1] = 240;
          out[p + 2] = 255;
          out[p + 3] = 116;
          continue;
        }

        const hasDiagInk =
          (x > 0 && y > 0 && inkMask[idx - cw - 1] === 2) ||
          (x < cw - 1 && y > 0 && inkMask[idx - cw + 1] === 2) ||
          (x > 0 && y < ch - 1 && inkMask[idx + cw - 1] === 2) ||
          (x < cw - 1 && y < ch - 1 && inkMask[idx + cw + 1] === 2);

        if (hasDiagInk) {
          out[p] = 224;
          out[p + 1] = 236;
          out[p + 2] = 255;
          out[p + 3] = 56;
        }
      }
    }

    outCtx.putImageData(imgData, 0, 0);
    return outCanvas;
  } catch {
    return null;
  }
}

/**
 * Returns a cached (fw + 4) x (fh + 4) pixel-art dual-contrast contour canvas for a live frame.
 * Gracefully returns null in pure Node unit tests where mock frames lack getContext().
 */
export function getSpriteSilhouetteContour(
  frame: HTMLCanvasElement | null | undefined,
): HTMLCanvasElement | null {
  if (!canReadCanvasPixels(frame)) return null;
  const cached = contourCanvasCache.get(frame);
  if (cached !== undefined) return cached;

  try {
    const ctx = frame.getContext('2d', { willReadFrequently: true }) ?? frame.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function') {
      contourCanvasCache.set(frame, null);
      return null;
    }
    const pixels = ctx.getImageData(0, 0, frame.width, frame.height);
    const contour = buildDualContrastContourFromPixels(pixels.data, frame.width, frame.height);
    contourCanvasCache.set(frame, contour);
    return contour;
  } catch {
    contourCanvasCache.set(frame, null);
    return null;
  }
}

/**
 * Returns a cached (region.w + 4) x (region.h + 4) dual-contrast contour canvas for an atlas region
 * (used by OfflineSpriteRigSynthesizer so offline pixel rigs have identical figure-ground contrast).
 */
export function getAtlasRegionSilhouetteContour(
  sheet: HTMLImageElement | HTMLCanvasElement | null | undefined,
  region: AtlasRegion,
): HTMLCanvasElement | null {
  if (!sheet || typeof sheet !== 'object') return null;
  const key = `${region.x},${region.y},${region.w},${region.h}`;
  let byKey = atlasContourCache.get(sheet);
  if (byKey && byKey.has(key)) {
    return byKey.get(key) ?? null;
  }

  const scratch = createOffscreenCanvas(region.w, region.h);
  if (!scratch) return null;

  try {
    const sCtx =
      scratch.getContext('2d', { willReadFrequently: true }) ?? scratch.getContext('2d');
    if (!sCtx || typeof sCtx.getImageData !== 'function') return null;
    sCtx.imageSmoothingEnabled = false;
    sCtx.clearRect(0, 0, region.w, region.h);
    sCtx.drawImage(sheet, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    const pixels = sCtx.getImageData(0, 0, region.w, region.h);
    const contour = buildDualContrastContourFromPixels(pixels.data, region.w, region.h);
    if (!byKey) {
      byKey = new Map();
      atlasContourCache.set(sheet, byKey);
    }
    byKey.set(key, contour);
    return contour;
  } catch {
    if (!byKey) {
      byKey = new Map();
      atlasContourCache.set(sheet, byKey);
    }
    byKey.set(key, null);
    return null;
  }
}

/**
 * Palette-remaps an archetype fallback atlas region toward a specific Pokemon's primary/accent colors
 * while preserving crisp dark pixel outlines, eye whites, and 16-bit shading luminance ramps.
 * Returns null gracefully in pure Node unit tests where getImageData() is unavailable.
 */
export function getPaletteTintedAtlasRegion(
  sheet: HTMLImageElement | HTMLCanvasElement | null | undefined,
  region: AtlasRegion,
  primaryHex: string,
  accentHex: string,
  shiny = false,
): HTMLCanvasElement | null {
  if (!sheet || typeof sheet !== 'object') return null;
  const key = `${region.x},${region.y},${region.w},${region.h}|${primaryHex}|${accentHex}|${shiny ? 1 : 0}`;
  let byKey = atlasTintedCache.get(sheet);
  if (byKey && byKey.has(key)) {
    return byKey.get(key) ?? null;
  }

  const outCanvas = createOffscreenCanvas(region.w, region.h);
  if (!outCanvas) return null;

  try {
    const ctx =
      outCanvas.getContext('2d', { willReadFrequently: true }) ?? outCanvas.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function') return null;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, region.w, region.h);
    ctx.drawImage(sheet, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);

    const imgData = ctx.getImageData(0, 0, region.w, region.h);
    const data = imgData.data;
    const [pr, pg, pb] = parseHexRgb255(primaryHex);
    const [ar, ag, ab] = parseHexRgb255(accentHex);

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 20) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

      // Preserve crisp dark ink outlines & pupils, plus pure white eye speculars
      if (lum < 0.18 || maxC < 52) continue;
      if (lum > 0.90 && sat < 0.15) continue;

      // Map bright highlight / secondary belly patches toward accentHex; main body toward primaryHex
      const useAccent = lum > 0.72 || sat < 0.24;
      const tr = useAccent ? ar : pr;
      const tg = useAccent ? ag : pg;
      const tb = useAccent ? ab : pb;

      // Preserve hand-pixelled 16-bit light-to-shadow shading curve
      const shade = 0.34 + lum * 0.92;
      const mixAmt = useAccent ? 0.62 : 0.78;
      let nr = r * (1 - mixAmt) + tr * shade * mixAmt;
      let ng = g * (1 - mixAmt) + tg * shade * mixAmt;
      let nb = b * (1 - mixAmt) + tb * shade * mixAmt;

      if (shiny && lum > 0.58) {
        nr = nr * 0.82 + 255 * 0.18;
        ng = ng * 0.84 + 236 * 0.16;
        nb = nb * 0.88 + 148 * 0.12;
      }

      data[i] = Math.max(0, Math.min(255, Math.round(nr)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(ng)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(nb)));
    }

    ctx.putImageData(imgData, 0, 0);
    if (!byKey) {
      byKey = new Map();
      atlasTintedCache.set(sheet, byKey);
    }
    byKey.set(key, outCanvas);
    return outCanvas;
  } catch {
    if (!byKey) {
      byKey = new Map();
      atlasTintedCache.set(sheet, byKey);
    }
    byKey.set(key, null);
    return null;
  }
}
