import type { BodyArchetype, DecodedSpriteFrame, DecodedSpriteFrames } from '../../contracts';
import { resolveSpeciesArchetype } from './raw/pokemon.js';

export interface SpriteLoadOptions {
  back?: boolean;
  shiny?: boolean;
  offlineOnly?: boolean;
  timeoutMs?: number;
}

/**
 * Pure-JS GIF89a Multi-Frame Decoder (zero external dependencies).
 * Supports Global/Local Color Tables, Graphic Control Extension transparency &
 * disposal methods (1 = keep, 2 = restore background, 3 = restore previous),
 * interlacing, and LZW decompression with clear/EOI codes.
 */
export interface RawGifFrame {
  width: number;
  height: number;
  delayMs: number;
  rgba: Uint8ClampedArray;
}

export function decodeGif89aBytes(bytes: Uint8Array): { width: number; height: number; frames: RawGifFrame[] } | null {
  if (bytes.length < 14) return null;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (sig !== 'GIF89a' && sig !== 'GIF87a') return null;

  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width <= 0 || height <= 0 || width > 1024 || height > 1024) return null;

  const packed = bytes[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 1 << ((packed & 0x07) + 1) : 0;
  let pos = 13;

  let gct: Uint8Array | null = null;
  if (hasGct) {
    if (pos + gctSize * 3 > bytes.length) return null;
    gct = bytes.subarray(pos, pos + gctSize * 3);
    pos += gctSize * 3;
  }

  const canvasBuf = new Uint8ClampedArray(width * height * 4);
  const frames: RawGifFrame[] = [];

  let delayMs = 100;
  let transparentIndex = -1;
  let disposal = 0;

  const readSubBlocks = (): Uint8Array => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (pos < bytes.length) {
      const len = bytes[pos++];
      if (len === 0) break;
      if (pos + len > bytes.length) break;
      chunks.push(bytes.subarray(pos, pos + len));
      total += len;
      pos += len;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return merged;
  };

  const skipSubBlocks = (): void => {
    while (pos < bytes.length) {
      const len = bytes[pos++];
      if (len === 0) break;
      pos = Math.min(bytes.length, pos + len);
    }
  };

  while (pos < bytes.length) {
    const blockId = bytes[pos++];
    if (blockId === 0x3b) break; // Trailer

    if (blockId === 0x21) {
      // Extension block
      if (pos >= bytes.length) break;
      const label = bytes[pos++];
      if (label === 0xf9 && pos + 5 <= bytes.length) {
        // Graphic Control Extension
        const blockSize = bytes[pos++];
        if (blockSize >= 4) {
          const gcePacked = bytes[pos];
          disposal = (gcePacked >> 2) & 0x07;
          const hasTransparent = (gcePacked & 0x01) !== 0;
          const rawDelay = bytes[pos + 1] | (bytes[pos + 2] << 8);
          delayMs = rawDelay > 0 ? Math.max(20, rawDelay * 10) : 100;
          transparentIndex = hasTransparent ? bytes[pos + 3] : -1;
        }
        pos += blockSize;
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
      continue;
    }

    if (blockId === 0x2c) {
      // Image Descriptor
      if (pos + 9 > bytes.length) break;
      const left = bytes[pos] | (bytes[pos + 1] << 8);
      const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const iw = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const ih = bytes[pos + 6] | (bytes[pos + 7] << 8);
      const imgPacked = bytes[pos + 8];
      pos += 9;

      const hasLct = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctSize = hasLct ? 1 << ((imgPacked & 0x07) + 1) : 0;

      let palette = gct;
      if (hasLct) {
        if (pos + lctSize * 3 > bytes.length) break;
        palette = bytes.subarray(pos, pos + lctSize * 3);
        pos += lctSize * 3;
      }

      if (pos >= bytes.length) break;
      const minCodeSize = bytes[pos++];
      const lzwData = readSubBlocks();
      if (!palette || minCodeSize < 2 || minCodeSize > 11) {
        delayMs = 100;
        transparentIndex = -1;
        disposal = 0;
        continue;
      }

      const indices = decompressGifLzw(lzwData, minCodeSize, iw * ih);
      const prevSnapshot = disposal === 3 ? new Uint8ClampedArray(canvasBuf) : null;

      // Paint frame onto persistent canvas buffer
      const paintRow = (srcRow: number, dstRow: number) => {
        const y = top + dstRow;
        if (y < 0 || y >= height) return;
        const srcBase = srcRow * iw;
        for (let xOff = 0; xOff < iw; xOff++) {
          const x = left + xOff;
          if (x < 0 || x >= width) continue;
          const colorIdx = indices[srcBase + xOff];
          if (colorIdx === transparentIndex) continue;
          const palOff = colorIdx * 3;
          if (palOff + 2 >= palette!.length) continue;
          const dstOff = (y * width + x) * 4;
          canvasBuf[dstOff] = palette![palOff];
          canvasBuf[dstOff + 1] = palette![palOff + 1];
          canvasBuf[dstOff + 2] = palette![palOff + 2];
          canvasBuf[dstOff + 3] = 255;
        }
      };

      if (interlaced) {
        const starts = [0, 4, 2, 1];
        const steps = [8, 8, 4, 2];
        let srcRow = 0;
        for (let pass = 0; pass < 4; pass++) {
          for (let dstRow = starts[pass]; dstRow < ih; dstRow += steps[pass]) {
            paintRow(srcRow++, dstRow);
          }
        }
      } else {
        for (let r = 0; r < ih; r++) {
          paintRow(r, r);
        }
      }

      frames.push({
        width,
        height,
        delayMs,
        rgba: new Uint8ClampedArray(canvasBuf),
      });

      // Apply disposal for next frame
      if (disposal === 2) {
        for (let r = 0; r < ih; r++) {
          const y = top + r;
          if (y < 0 || y >= height) continue;
          for (let c = 0; c < iw; c++) {
            const x = left + c;
            if (x < 0 || x >= width) continue;
            const dstOff = (y * width + x) * 4;
            canvasBuf[dstOff] = 0;
            canvasBuf[dstOff + 1] = 0;
            canvasBuf[dstOff + 2] = 0;
            canvasBuf[dstOff + 3] = 0;
          }
        }
      } else if (disposal === 3 && prevSnapshot) {
        canvasBuf.set(prevSnapshot);
      }

      delayMs = 100;
      transparentIndex = -1;
      disposal = 0;
      continue;
    }

    // Unknown block, bail cleanly
    break;
  }

  return frames.length > 0 ? { width, height, frames } : null;
}

function decompressGifLzw(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);

  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let nextCode = eoiCode + 1;

  for (let i = 0; i < clearCode; i++) {
    prefix[i] = -1;
    suffix[i] = i;
  }

  let bitPos = 0;
  const totalBits = data.length * 8;
  const readCode = (): number => {
    if (bitPos + codeSize > totalBits) return eoiCode;
    const byteIdx = bitPos >> 3;
    const bitOff = bitPos & 7;
    let val = data[byteIdx] | ((data[byteIdx + 1] ?? 0) << 8) | ((data[byteIdx + 2] ?? 0) << 16);
    val = (val >> bitOff) & codeMask;
    bitPos += codeSize;
    return val;
  };

  let outPos = 0;
  let prevCode = -1;
  let firstChar = 0;

  while (outPos < pixelCount) {
    const code = readCode();
    if (code === eoiCode) break;
    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
      nextCode = eoiCode + 1;
      prevCode = -1;
      continue;
    }

    let cur = code;
    let sp = 0;
    if (cur >= nextCode) {
      if (prevCode === -1) break;
      stack[sp++] = firstChar;
      cur = prevCode;
    }
    while (cur >= clearCode && sp < 4096) {
      stack[sp++] = suffix[cur];
      cur = prefix[cur];
      if (cur < 0) break;
    }
    if (cur < 0) break;
    firstChar = suffix[cur];
    stack[sp++] = firstChar;

    while (sp > 0 && outPos < pixelCount) {
      out[outPos++] = stack[--sp];
    }

    if (prevCode !== -1 && nextCode < 4096) {
      prefix[nextCode] = prevCode;
      suffix[nextCode] = firstChar;
      nextCode++;
      if (nextCode === codeMask + 1 && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }
    }
    prevCode = code;
  }

  return out;
}

/**
 * Resolves CORS-safe PokéAPI / Showdown sprite candidates while strictly avoiding known
 * missing Showdown `back/*.gif` 404s for Gen 6-9 (#650..1025).
 */
export function resolveCorsSpriteCandidates(
  speciesId: number,
  back: boolean,
  shiny: boolean,
): Array<{ url: string; kind: 'animated-gif' | 'static-png'; mirrorX?: boolean }> {
  const id = Math.max(1, Math.min(1025, Math.round(speciesId)));
  const frontDir = shiny ? 'shiny/' : '';
  const dir = `${back ? 'back/' : ''}${frontDir}`;

  if (id <= 649) {
    return [
      {
        url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${dir}${id}.gif`,
        kind: 'animated-gif',
      },
      {
        url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dir}${id}.png`,
        kind: 'static-png',
      },
      ...(back
        ? [{
            url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${frontDir}${id}.png`,
            kind: 'static-png' as const,
            mirrorX: true,
          }]
        : []),
    ];
  }

  // Gen 6..9 (#650..1025): Showdown front GIF (never broken Showdown back GIF!) -> official artwork
  return [
    {
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${frontDir}${id}.gif`,
      kind: 'animated-gif',
      mirrorX: back,
    },
    {
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${frontDir}${id}.png`,
      kind: 'static-png',
      mirrorX: back,
    },
  ];
}

function rawFramesToCanvases(raw: { width: number; height: number; frames: RawGifFrame[] }): DecodedSpriteFrame[] {
  if (typeof document === 'undefined') return [];
  return raw.frames.map((frame) => {
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.createImageData(frame.width, frame.height);
      imgData.data.set(frame.rgba);
      ctx.putImageData(imgData, 0, 0);
    }
    return { canvas, delayMs: frame.delayMs };
  });
}

async function decodeWithImageDecoder(bytes: Uint8Array, mime: string): Promise<DecodedSpriteFrame[] | null> {
  if (typeof document === 'undefined') return null;
  const GlobalDecoder = (globalThis as unknown as { ImageDecoder?: new (init: unknown) => {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode(opts: { frameIndex: number }): Promise<{ image: VideoFrame & { duration?: number } }>;
    close(): void;
  } }).ImageDecoder;

  if (typeof GlobalDecoder !== 'function') return null;

  try {
    const decoder = new GlobalDecoder({ data: bytes, type: mime });
    await decoder.tracks.ready;
    const frameCount = Math.min(96, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const frames: DecodedSpriteFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const result = await decoder.decode({ frameIndex: i });
      const img = result.image;
      const canvas = document.createElement('canvas');
      canvas.width = img.displayWidth || img.codedWidth || 64;
      canvas.height = img.displayHeight || img.codedHeight || 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img as unknown as CanvasImageSource, 0, 0);
      }
      const delayMs = img.duration ? Math.max(20, Math.round(img.duration / 1000)) : 100;
      img.close();
      frames.push({ canvas, delayMs });
    }
    decoder.close();
    return frames.length > 0 ? frames : null;
  } catch {
    return null;
  }
}

async function decodeStaticImageBlob(blob: Blob): Promise<DecodedSpriteFrame[] | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 64;
    canvas.height = img.naturalHeight || 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
    }
    return [{ canvas, delayMs: 1000 }];
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Single-canvas CORS-safe animated Pokémon sprite loader & frame cache.
 * Zero broken `<img>` elements, zero WebGL canvas taint, instant local pixel fallback offline.
 */
export class SpriteAssetLoader {
  private readonly cache = new Map<string, DecodedSpriteFrames>();
  private readonly inflight = new Map<string, Promise<DecodedSpriteFrames>>();
  private forceOffline = false;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options?: { forceOffline?: boolean }) {
    this.forceOffline = Boolean(options?.forceOffline);
  }

  setForceOffline(force: boolean): void {
    this.forceOffline = Boolean(force);
  }

  isForceOffline(): boolean {
    return this.forceOffline;
  }

  getVersion(): number {
    return this.version;
  }

  getInflightCount(): number {
    return this.inflight.size;
  }

  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyUpdate(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  private makeKey(speciesId: number, back: boolean, shiny: boolean): string {
    return `${Math.round(speciesId)}:${back ? 'b' : 'f'}:${shiny ? 's' : 'n'}`;
  }

  createOfflineFallback(speciesId: number, back: boolean, shiny: boolean): DecodedSpriteFrames {
    const rawArch = resolveSpeciesArchetype(speciesId) as BodyArchetype;
    const archetype: BodyArchetype = rawArch || 'biped';
    return {
      key: this.makeKey(speciesId, back, shiny),
      speciesId: Math.round(speciesId),
      back,
      shiny,
      width: 48,
      height: 48,
      frames: [],
      totalDurationMs: 1000,
      sourceKind: 'offline-pixel',
      archetype,
      mirrorX: back,
    };
  }

  getCached(speciesId: number, options: SpriteLoadOptions = {}): DecodedSpriteFrames | null {
    const back = Boolean(options.back);
    const shiny = Boolean(options.shiny);
    if (this.forceOffline || options.offlineOnly) {
      return this.createOfflineFallback(speciesId, back, shiny);
    }
    return this.cache.get(this.makeKey(speciesId, back, shiny)) ?? null;
  }

  /**
   * Resolves animated frames for a species. Never throws and never leaves an uncached rejected promise.
   */
  async loadSpeciesSprite(speciesId: number, options: SpriteLoadOptions = {}): Promise<DecodedSpriteFrames> {
    const id = Math.max(1, Math.min(1025, Math.round(speciesId)));
    const back = Boolean(options.back);
    const shiny = Boolean(options.shiny);
    const key = this.makeKey(id, back, shiny);

    const isNavigatorOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (this.forceOffline || options.offlineOnly || isNavigatorOffline || typeof fetch !== 'function') {
      return this.createOfflineFallback(id, back, shiny);
    }

    const cached = this.cache.get(key);
    if (cached) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const task = this.fetchAndDecode(id, back, shiny, key, options.timeoutMs ?? 2800)
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, task);
    return task;
  }

  /**
   * Picks the current animation frame for a given elapsed time (seconds) cleanly.
   */
  static selectFrame(decoded: DecodedSpriteFrames | null, elapsedSeconds: number): HTMLCanvasElement | null {
    if (!decoded || decoded.frames.length === 0) return null;
    if (decoded.frames.length === 1) return decoded.frames[0].canvas;
    const total = Math.max(1, decoded.totalDurationMs);
    const t = ((elapsedSeconds * 1000) % total + total) % total;
    let acc = 0;
    for (const frame of decoded.frames) {
      acc += frame.delayMs;
      if (t < acc) return frame.canvas;
    }
    return decoded.frames[decoded.frames.length - 1].canvas;
  }

  private async fetchAndDecode(
    speciesId: number,
    back: boolean,
    shiny: boolean,
    key: string,
    timeoutMs: number,
  ): Promise<DecodedSpriteFrames> {
    const candidates = resolveCorsSpriteCandidates(speciesId, back, shiny);
    const archetype = (resolveSpeciesArchetype(speciesId) as BodyArchetype) || 'biped';

    for (const cand of candidates) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const resp = await fetch(cand.url, {
          mode: 'cors',
          credentials: 'omit',
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);
        if (!resp.ok) continue;

        const buffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        let frames: DecodedSpriteFrame[] | null = null;
        if (cand.kind === 'animated-gif') {
          frames = await decodeWithImageDecoder(bytes, 'image/gif');
          if (!frames || frames.length === 0) {
            const rawGif = decodeGif89aBytes(bytes);
            if (rawGif) frames = rawFramesToCanvases(rawGif);
          }
        } else {
          frames = await decodeStaticImageBlob(new Blob([bytes], { type: 'image/png' }));
        }

        if (frames && frames.length > 0) {
          const totalDurationMs = frames.reduce((sum, f) => sum + f.delayMs, 0);
          const result: DecodedSpriteFrames = {
            key,
            speciesId,
            back,
            shiny,
            width: frames[0].canvas.width,
            height: frames[0].canvas.height,
            frames,
            totalDurationMs,
            sourceKind: cand.kind,
            archetype,
            mirrorX: cand.mirrorX,
          };
          this.cache.set(key, result);
          this.notifyUpdate();
          return result;
        }
      } catch {
        if (timer) clearTimeout(timer);
      }
    }

    const fallback = this.createOfflineFallback(speciesId, back, shiny);
    // Do not permanently cache fallback when online failed transiently; allow retry if online resumes
    return fallback;
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
