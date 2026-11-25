import type { AtlasRegion, DecodedSpriteFrames } from '../../contracts';

export const SILHOUETTE_CONTOUR_PAD = 1;

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
const hitFlashCanvasCache = new WeakMap<object, HTMLCanvasElement | null>();
const atlasContourCache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();
const atlasTintedCache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();

function markCanvasImmutable(canvas: HTMLCanvasElement): HTMLCanvasElement {
  (canvas as HTMLCanvasElement & { __starlightImmutable?: boolean }).__starlightImmutable = true;
  return canvas;
}

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
 * Synthesizes a tight, authentic HD-2D 1-texel pixel-art silhouette backing from RGBA pixel data:
 * - Cardinal 1-texel deep midnight-indigo ink outline (#090d1f) with subtle upper-edge warmth so
 *   both bright and dark sprites integrate naturally into every arena WITHOUT chunky grey sticker halos.
 * - Solid interior under alpha >= 196 sealed with deep ink to prevent subpixel gaps during lunge rotation.
 */
function buildCrispInkContourFromPixels(
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
    let edgeLumSum = 0;
    let edgeCount = 0;

    for (let y = 0; y < sh; y++) {
      const srcRow = y * sw * 4;
      const dstRow = (y + pad) * cw + pad;
      for (let x = 0; x < sw; x++) {
        const p = srcRow + x * 4;
        const a = srcData[p + 3];
        if (a >= 40) {
          solid[dstRow + x] = 1;
          if (a >= 196) {
            opaqueInterior[dstRow + x] = 1;
          }
          edgeLumSum += 0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2];
          edgeCount += 1;
        }
      }
    }

    // Detect very dark sprites (e.g., Umbreon, Darkrai) so their top silhouette catches an ultra-subtle moonlit rim
    const avgLum = edgeCount > 0 ? edgeLumSum / (edgeCount * 255) : 0.5;
    const isDarkSprite = avgLum < 0.28;

    const imgData = outCtx.createImageData(cw, ch);
    const out = imgData.data;

    for (let y = 0; y < ch; y++) {
      const row = y * cw;
      for (let x = 0; x < cw; x++) {
        const idx = row + x;
        const p = idx * 4;

        if (opaqueInterior[idx]) {
          // Seal interior beneath opaque sprite pixels so rotation never leaks background seams
          out[p] = 9;
          out[p + 1] = 12;
          out[p + 2] = 28;
          out[p + 3] = 235;
          continue;
        }

        if (solid[idx]) {
          // Semi-transparent sprite pixels (e.g. flames/smoke): keep unobstructed
          continue;
        }

        // Strict 1-texel cardinal contour ONLY (no thick blocky grey outer ring!)
        const belowSolid = y < ch - 1 && solid[idx + cw] === 1;
        const aboveSolid = y > 0 && solid[idx - cw] === 1;
        const leftSolid = x > 0 && solid[idx - 1] === 1;
        const rightSolid = x < cw - 1 && solid[idx + 1] === 1;

        if (belowSolid || aboveSolid || leftSolid || rightSolid) {
          if (isDarkSprite && belowSolid && !aboveSolid) {
            // Subtle cool starlight crown catch strictly along top contour of very dark sprites
            out[p] = 165;
            out[p + 1] = 192;
            out[p + 2] = 235;
            out[p + 3] = 115;
          } else {
            out[p] = 10;
            out[p + 1] = 13;
            out[p + 2] = 30;
            out[p + 3] = 210;
          }
          continue;
        }

        // Gentle corner softening pixel strictly where two adjacent cardinals meet (rounded pixel corners)
        const diagTL = x > 0 && y > 0 && solid[idx - cw - 1] === 1;
        const diagTR = x < cw - 1 && y > 0 && solid[idx - cw + 1] === 1;
        const diagBL = x > 0 && y < ch - 1 && solid[idx + cw - 1] === 1;
        const diagBR = x < cw - 1 && y < ch - 1 && solid[idx + cw + 1] === 1;
        if (diagTL || diagTR || diagBL || diagBR) {
          out[p] = 10;
          out[p + 1] = 13;
          out[p + 2] = 30;
          out[p + 3] = 92;
        }
      }
    }

    outCtx.putImageData(imgData, 0, 0);
    return markCanvasImmutable(outCanvas);
  } catch {
    return null;
  }
}

/**
 * Returns a cached (fw + 2) x (fh + 2) tight 1-texel pixel-art contour canvas for a live frame.
 * Tagged immutable for one-time WebGL2 VRAM upload; gracefully returns null in pure Node tests.
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
    const contour = buildCrispInkContourFromPixels(pixels.data, frame.width, frame.height);
    contourCanvasCache.set(frame, contour);
    return contour;
  } catch {
    contourCanvasCache.set(frame, null);
    return null;
  }
}

/**
 * Returns a cached crisp ivory-white pixel hit-flash mask matching the live frame's opaque silhouette.
 * Ensures even dark Pokémon (Umbreon, Gengar, Darkrai) produce an unmistakable arcade hit-flash.
 * WeakMap-cached per frame canvas and tagged immutable for one-time WebGL2 upload.
 */
export function getSpriteHitFlashCanvas(
  frame: HTMLCanvasElement | null | undefined,
): HTMLCanvasElement | null {
  if (!canReadCanvasPixels(frame)) return null;
  const cached = hitFlashCanvasCache.get(frame);
  if (cached !== undefined) return cached;

  try {
    const ctx = frame.getContext('2d', { willReadFrequently: true }) ?? frame.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function') {
      hitFlashCanvasCache.set(frame, null);
      return null;
    }
    const w = frame.width;
    const h = frame.height;
    const src = ctx.getImageData(0, 0, w, h).data;
    const outCanvas = createOffscreenCanvas(w, h);
    if (!outCanvas) {
      hitFlashCanvasCache.set(frame, null);
      return null;
    }
    const outCtx =
      outCanvas.getContext('2d', { willReadFrequently: true }) ?? outCanvas.getContext('2d');
    if (!outCtx || typeof outCtx.createImageData !== 'function') {
      hitFlashCanvasCache.set(frame, null);
      return null;
    }
    const imgData = outCtx.createImageData(w, h);
    const out = imgData.data;
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a < 28) continue;
      out[i] = 255;
      out[i + 1] = 249;
      out[i + 2] = 216;
      out[i + 3] = a;
    }
    outCtx.putImageData(imgData, 0, 0);
    markCanvasImmutable(outCanvas);
    hitFlashCanvasCache.set(frame, outCanvas);
    return outCanvas;
  } catch {
    hitFlashCanvasCache.set(frame, null);
    return null;
  }
}

/**
 * Returns a cached (region.w + 2) x (region.h + 2) tight ink contour canvas for an atlas region
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
    const contour = buildCrispInkContourFromPixels(pixels.data, region.w, region.h);
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
 * using hue-shifted 16-bit SNES/GBA shading ramps (cooler shadows, warm specular highlights) while
 * preserving crisp dark pixel outlines and pure white eye glints.
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
      if (lum < 0.17 || maxC < 50) continue;
      if (lum > 0.91 && sat < 0.15) continue;

      // Map bright highlight / secondary belly patches toward accentHex; main body toward primaryHex
      const useAccent = lum > 0.74 || sat < 0.23;
      const tr = useAccent ? ar : pr;
      const tg = useAccent ? ag : pg;
      const tb = useAccent ? ab : pb;

      // Hue-shifted 16-bit shading curve: cool deep indigo shadows, warm sunlit specular highlights
      const shade = 0.30 + lum * 0.96;
      const mixAmt = useAccent ? 0.64 : 0.80;
      let nr = r * (1 - mixAmt) + tr * shade * mixAmt;
      let ng = g * (1 - mixAmt) + tg * shade * mixAmt;
      let nb = b * (1 - mixAmt) + tb * shade * mixAmt;

      if (lum < 0.44) {
        const cool = (0.44 - lum) * 0.42;
        nr *= 1 - cool * 0.45;
        ng *= 1 - cool * 0.25;
        nb = nb + (72 - nb) * cool * 0.35;
      } else if (lum > 0.72) {
        const warm = (lum - 0.72) * 0.68;
        nr = nr + (255 - nr) * warm * 0.45;
        ng = ng + (248 - ng) * warm * 0.36;
        nb = nb + (224 - nb) * warm * 0.20;
      }

      if (shiny && lum > 0.54) {
        nr = nr * 0.78 + 255 * 0.22;
        ng = ng * 0.82 + 238 * 0.18;
        nb = nb * 0.86 + 150 * 0.14;
      }

      data[i] = Math.max(0, Math.min(255, Math.round(nr)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(ng)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(nb)));
    }

    ctx.putImageData(imgData, 0, 0);
    markCanvasImmutable(outCanvas);
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
