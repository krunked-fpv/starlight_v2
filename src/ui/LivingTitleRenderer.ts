import type {
  AtlasManifest,
  BiomeId,
  DojoProfileState,
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  OfflineRigDescriptor,
  StarlightSaveState,
} from '../contracts';
import {
  getBiomeVisualProfile,
  getResolvedTrainerLook,
  getSpeciesEntry,
  TYPE_PALETTES,
} from '../core';
import { drawPixelArchetypeSprite, renderTrainerPortraitCanvas } from './iconHelper';

const CONSTELLATIONS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [
    [0.09, 0.16],
    [0.15, 0.11],
    [0.21, 0.15],
    [0.18, 0.23],
    [0.09, 0.16],
  ],
  [
    [0.42, 0.08],
    [0.48, 0.14],
    [0.54, 0.10],
    [0.60, 0.16],
  ],
  [
    [0.74, 0.17],
    [0.80, 0.10],
    [0.87, 0.15],
    [0.84, 0.24],
  ],
];

const AURA_RGB_MAP: Record<string, [number, number, number]> = {
  none: [0.48, 0.90, 1.0],
  stars: [1.0, 0.88, 0.36],
  hearts: [0.96, 0.45, 0.71],
  lightning: [0.22, 0.74, 0.97],
  blossom: [0.98, 0.44, 0.52],
  cosmic: [0.18, 0.83, 0.75],
};

// Pre-computed deterministic star positions (zero Math.sin per static star in hot loop)
const TWINKLE_STARS: ReadonlyArray<{ nx: number; ny: number; phase: number; speed: number; warm: boolean; big: boolean }> =
  Array.from({ length: 24 }, (_, i) => ({
    nx: ((Math.sin(i * 127.1 + 1.7) * 0.5 + 0.5) * 0.94 + 0.03),
    ny: ((Math.sin(i * 311.7 + 4.3) * 0.5 + 0.5) * 0.48 + 0.03),
    phase: i * 1.93,
    speed: 1.5 + (i % 5) * 0.42,
    warm: i % 3 === 0,
    big: i % 6 === 0,
  }));

const PIER_LAMP_X_FRACS: ReadonlyArray<number> = [0.14, 0.27, 0.40, 0.60, 0.73, 0.86];

// 4x4 Bayer threshold matrix for crisp authentic HD-2D pixel dithering
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const SKY_PALETTE: ReadonlyArray<string> = [
  '#060918',
  '#0a1029',
  '#101a40',
  '#182658',
  '#23326c',
  '#323876',
  '#49407a',
  '#684a7a',
  '#8c5a74',
  '#b6786a',
];

function drawPixelStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  const px = Math.round(x);
  const py = Math.round(y);
  const s = Math.max(1, Math.round(size));
  ctx.fillStyle = color;
  ctx.fillRect(px, py, s, s);
  if (s >= 2) {
    const arm = Math.max(1, Math.floor(s * 0.5));
    ctx.fillRect(px - s, py + Math.floor((s - arm) * 0.5), s * 3, arm);
    ctx.fillRect(px + Math.floor((s - arm) * 0.5), py - s, arm, s * 3);
  }
}

function drawDottedLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 0) return;
  ctx.fillStyle = color;
  for (let s = 0; s <= steps; s += 3) {
    const px = Math.round(x0 + (dx * s) / steps);
    const py = Math.round(y0 + (dy * s) / steps);
    ctx.fillRect(px, py, 1, 1);
  }
}

export class LivingTitleRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private manifest: AtlasManifest | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;

  private elapsedSeconds = 0;
  private viewportW = 960;
  private viewportH = 540;

  // Offscreen high-fidelity pixel-art background cache (eliminates per-frame static sky/cliff/architecture cost!)
  private staticCacheCanvas: HTMLCanvasElement | null = null;
  private staticCacheKey = '';

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    this.rigSynthesizer = options?.rigSynthesizer ?? null;
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  attachAssets(
    manifest: AtlasManifest | null,
    _getArenaImage?: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    this.getSheetImage = getSheetImage ?? null;
    this.staticCacheKey = '';
  }

  update(dtSeconds: number, reducedMotion = false): void {
    const clamped = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(0.05, dtSeconds)) : 0;
    this.elapsedSeconds += clamped * (reducedMotion ? 0.22 : 1.0);
  }

  /**
   * Builds the high-fidelity pixel-art Starlight Island Harbor panorama onto a cached
   * offscreen pixel canvas (480x270 logical HD-2D pixel grid) whenever viewport ratio or
   * sky backdrop changes. Blitting this cache takes < 0.15ms per frame!
   */
  private ensureStaticBackdropCache(
    hostCtx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
  ): HTMLCanvasElement | null {
    const pw = 480;
    const ph = Math.max(200, Math.min(360, Math.round((pw * ch) / Math.max(1, cw))));
    const cacheKey = `${pw}x${ph}`;
    if (this.staticCacheCanvas && this.staticCacheKey === cacheKey) {
      return this.staticCacheCanvas;
    }

    const doc = hostCtx.canvas?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') return null;

    if (!this.staticCacheCanvas) {
      this.staticCacheCanvas = doc.createElement('canvas');
    }
    const cache = this.staticCacheCanvas;
    cache.width = pw;
    cache.height = ph;
    const c = cache.getContext('2d');
    if (!c) return null;

    this.staticCacheKey = cacheKey;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, pw, ph);

    const hy = Math.round(ph * 0.72);

    // 1. Ordered Bayer-dithered HD-2D twilight sky gradient (crisp pixel bands!)
    const palLast = SKY_PALETTE.length - 1;
    const bandStep = 2;
    for (let y = 0; y < hy + 2; y += bandStep) {
      const tNorm = Math.min(1, y / Math.max(1, hy));
      const curved = Math.pow(tNorm, 1.18) * palLast;
      const idx = Math.min(palLast - 1, Math.floor(curved));
      const frac = curved - idx;
      c.fillStyle = SKY_PALETTE[idx];
      c.fillRect(0, y, pw, bandStep);
      if (frac > 0.12) {
        c.fillStyle = SKY_PALETTE[idx + 1];
        const rowB = BAYER4[(y >> 1) & 3];
        for (let x = 0; x < pw; x += 2) {
          if (frac * 16 > rowB[(x >> 1) & 3]) {
            c.fillRect(x, y, 2, bandStep);
          }
        }
      }
    }

    // 2. Dithered Pixel Aurora Borealis Veil in the upper twilight sky (pure pixel art — zero blurry raster double-moon!)
    for (let x = 0; x < pw; x += 2) {
      const nx = x / pw;
      const arch1 = Math.round(ph * (0.14 + 0.08 * Math.sin(nx * 5.2 - 0.6)));
      const arch2 = Math.round(ph * (0.21 + 0.06 * Math.cos(nx * 6.4 + 0.9)));
      const span1 = Math.round(14 + 8 * Math.sin(nx * 9.0));
      const span2 = Math.round(11 + 6 * Math.cos(nx * 7.5 + 1.2));
      for (let dy = 0; dy < span1; dy += 2) {
        const py = arch1 + dy;
        const fade = Math.sin((dy / span1) * Math.PI) * (0.35 + 0.65 * Math.sin(nx * Math.PI));
        if (fade * 16 > BAYER4[(py >> 1) & 3][(x >> 1) & 3] + 5) {
          c.fillStyle = dy < span1 * 0.45 ? 'rgba(92, 238, 198, 0.24)' : 'rgba(122, 186, 255, 0.18)';
          c.fillRect(x, py, 2, 2);
        }
      }
      for (let dy = 0; dy < span2; dy += 2) {
        const py = arch2 + dy;
        const fade = Math.sin((dy / span2) * Math.PI) * (0.25 + 0.75 * Math.sin(nx * Math.PI));
        if (fade * 16 > BAYER4[((py >> 1) + 2) & 3][(x >> 1) & 3] + 6) {
          c.fillStyle = 'rgba(184, 134, 255, 0.18)';
          c.fillRect(x, py, 2, 2);
        }
      }
    }

    // 3. Dense Static Pixel Starfield (warm gold, ice blue, soft lavender pinpoints)
    for (let i = 0; i < 110; i++) {
      const sx = Math.round(((Math.sin(i * 91.7 + 0.5) * 0.5 + 0.5) * 0.98 + 0.01) * pw);
      const sy = Math.round(((Math.sin(i * 233.3 + 2.9) * 0.5 + 0.5) * 0.56 + 0.02) * ph);
      const colors = ['#dceeff', '#fff0bc', '#c8d6ff', '#ffd6ea'];
      c.fillStyle = colors[i % colors.length];
      c.fillRect(sx, sy, 1, 1);
      if (i % 13 === 0) {
        c.fillStyle = 'rgba(255, 240, 190, 0.45)';
        c.fillRect(sx - 1, sy, 3, 1);
        c.fillRect(sx, sy - 1, 1, 3);
      }
    }

    // 4. Connected Celestial Constellations (fine pixel-dotted lines + gold star nodes)
    for (const line of CONSTELLATIONS) {
      for (let i = 0; i < line.length - 1; i++) {
        drawDottedLine(
          c,
          Math.round(line[i][0] * pw),
          Math.round(line[i][1] * ph),
          Math.round(line[i + 1][0] * pw),
          Math.round(line[i + 1][1] * ph),
          'rgba(130, 224, 255, 0.32)',
        );
      }
      for (const [nx, ny] of line) {
        const px = Math.round(nx * pw);
        const py = Math.round(ny * ph);
        c.fillStyle = '#ffe296';
        c.fillRect(px, py, 2, 2);
        c.fillStyle = 'rgba(255, 244, 200, 0.45)';
        c.fillRect(px - 1, py, 4, 1);
        c.fillRect(px, py - 1, 1, 4);
      }
    }

    // 5. Pixel-Art Crescent Moon & Dithered Silver-Gold Aura (Upper-Left Sky)
    const moonX = Math.round(pw * 0.16);
    const moonY = Math.round(ph * 0.19);
    const moonR = 14;
    for (let dy = -26; dy <= 26; dy++) {
      for (let dx = -26; dx <= 26; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= moonR * moonR) {
          const cutX = dx - 6;
          const cutY = dy + 3;
          const inShadow = cutX * cutX + cutY * cutY <= (moonR - 1) * (moonR - 1);
          if (!inShadow) {
            const rim = d2 > (moonR - 2.4) * (moonR - 2.4);
            const crater = (dx === -7 && dy === 2) || (dx === -4 && dy === 7) || (dx === -9 && dy === -3);
            c.fillStyle = crater ? '#e6c982' : rim ? '#fffef0' : '#f9e6a8';
            c.fillRect(moonX + dx, moonY + dy, 1, 1);
          } else if (((dx + dy) & 1) === 0 && d2 < (moonR - 1) * (moonR - 1)) {
            c.fillStyle = 'rgba(30, 44, 96, 0.32)';
            c.fillRect(moonX + dx, moonY + dy, 1, 1);
          }
        } else if (d2 <= 676) {
          const dist = Math.sqrt(d2);
          const norm = 1 - (dist - moonR) / (26 - moonR);
          if (norm * 16 > BAYER4[(moonY + dy + 64) & 3][(moonX + dx + 64) & 3] + 5) {
            c.fillStyle = norm > 0.55 ? 'rgba(255, 242, 198, 0.28)' : 'rgba(130, 210, 255, 0.16)';
            c.fillRect(moonX + dx, moonY + dy, 1, 1);
          }
        }
      }
    }

    // 6. Crisp North-Star Beacon (Upper-Right Balance)
    const beaconX = Math.round(pw * 0.87);
    const beaconY = Math.round(ph * 0.14);
    c.fillStyle = 'rgba(130, 230, 255, 0.16)';
    c.fillRect(beaconX - 9, beaconY, 19, 1);
    c.fillRect(beaconX, beaconY - 9, 1, 19);
    c.fillStyle = 'rgba(255, 236, 170, 0.42)';
    c.fillRect(beaconX - 5, beaconY, 11, 1);
    c.fillRect(beaconX, beaconY - 5, 1, 11);
    c.fillStyle = '#fff9df';
    c.fillRect(beaconX - 1, beaconY - 1, 3, 3);

    // 7. Sculpted Multi-Puff Moonlit Cumulus Cloud Banks behind the Island Horizon
    const drawCumulusBank = (baseX: number, baseY: number, puffs: ReadonlyArray<[number, number, number]>) => {
      // Paint from deepest twilight shadow up to moonlit silver-lavender crest
      const drawLayer = (dyOffset: number, radiusShrink: number, color: string) => {
        c.fillStyle = color;
        for (const [ox, oy, r] of puffs) {
          const rr = Math.max(2, r - radiusShrink);
          const cx = baseX + ox;
          const cy = baseY + oy + dyOffset;
          for (let dy = -rr; dy <= Math.min(rr, baseY - cy + 2); dy++) {
            const span = Math.round(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
            if (span > 0) {
              c.fillRect(cx - span, cy + dy, span * 2, 1);
            }
          }
        }
      };
      drawLayer(0, 0, '#2a3061');
      drawLayer(-1, 1, '#43467d');
      drawLayer(-3, 2, '#69669c');
      // Soft silver-moonlight upper rim on cloud domes
      c.fillStyle = '#a89fc7';
      for (const [ox, oy, r] of puffs) {
        const rr = Math.max(2, r - 2);
        const cx = baseX + ox;
        const cy = baseY + oy - 3;
        for (let dy = -rr; dy <= -Math.floor(rr * 0.45); dy++) {
          const span = Math.round(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
          if (span > 1) {
            c.fillRect(cx - span + 1, cy + dy, Math.max(1, span * 2 - 2), 1);
          }
        }
      }
      // Flat atmospheric cloud underside tuck
      c.fillStyle = '#1e2450';
      const minX = baseX + Math.min(...puffs.map(([ox, , r]) => ox - r)) + 4;
      const maxX = baseX + Math.max(...puffs.map(([ox, , r]) => ox + r)) - 4;
      c.fillRect(minX, baseY, Math.max(4, maxX - minX), 3);
    };
    drawCumulusBank(Math.round(pw * 0.12), Math.round(hy - 22), [
      [-28, -2, 11],
      [-12, -8, 15],
      [6, -11, 16],
      [24, -6, 13],
      [38, -2, 9],
    ]);
    drawCumulusBank(Math.round(pw * 0.36), Math.round(hy - 30), [
      [-22, -2, 10],
      [-6, -7, 13],
      [11, -9, 14],
      [25, -4, 10],
    ]);
    drawCumulusBank(Math.round(pw * 0.72), Math.round(hy - 28), [
      [-28, -3, 11],
      [-11, -9, 15],
      [8, -12, 16],
      [26, -6, 12],
      [40, -2, 9],
    ]);
    drawCumulusBank(Math.round(pw * 0.93), Math.round(hy - 20), [
      [-24, -4, 11],
      [-8, -9, 14],
      [10, -6, 12],
    ]);

    // 8. Distant Floating Starlight Sky-Isles (signature Starlight Island fantasy!)
    const drawSkyIsle = (ix: number, iy: number, iw: number) => {
      c.fillStyle = '#2a376e';
      c.fillRect(ix - iw, iy, iw * 2, 3);
      c.fillStyle = '#18214a';
      for (let row = 1; row <= Math.floor(iw * 0.65); row++) {
        const span = Math.max(1, iw - Math.floor(row * 1.45));
        c.fillRect(ix - span, iy + 2 + row, span * 2, 1);
      }
      // Tiny glowing crystal spire atop sky-isle
      c.fillStyle = '#7ce8ff';
      c.fillRect(ix, iy - 3, 2, 3);
      c.fillStyle = '#fff5c2';
      c.fillRect(ix, iy - 4, 1, 1);
    };
    drawSkyIsle(Math.round(pw * 0.11), Math.round(ph * 0.39), 11);
    drawSkyIsle(Math.round(pw * 0.89), Math.round(ph * 0.36), 9);

    // 9. 3-Layer Parallax Mountain & Pine-Forest Island Horizon
    // Far Misty Peaks
    for (let x = 0; x < pw; x++) {
      const nx = x / pw;
      const peak =
        Math.sin(nx * 6.8 + 0.5) * 14 +
        Math.cos(nx * 14.2 - 0.8) * 7 +
        (nx > 0.32 && nx < 0.68 ? Math.sin(((nx - 0.32) / 0.36) * Math.PI) * 18 : 0);
      const topY = Math.round(hy - 22 - Math.max(0, peak));
      c.fillStyle = '#1a2452';
      c.fillRect(x, topY, 1, hy - topY);
      // Moonlit ridge snow/rim highlight on left slopes
      if (peak > 8) {
        c.fillStyle = '#475996';
        c.fillRect(x, topY, 1, 2);
      }
    }

    // Mid-Ground Pine Forested Island Ridge
    for (let x = 0; x < pw; x++) {
      const nx = x / pw;
      const ridge =
        Math.sin(nx * 4.9 + 1.1) * 9 +
        Math.cos(nx * 11.7) * 4 +
        (nx > 0.36 && nx < 0.64 ? 10 : 0);
      const baseY = Math.round(hy - 12 - Math.max(0, ridge));
      c.fillStyle = '#10183a';
      c.fillRect(x, baseY, 1, hy - baseY);
      // Crisp pixel pine treetop silhouette every 5px outside central observatory plateau
      if (x % 5 === 0 && (nx < 0.42 || nx > 0.58)) {
        const treeH = 5 + ((x * 7) % 4);
        c.fillStyle = '#0c1330';
        for (let tr = 0; tr < treeH; tr++) {
          const half = Math.floor((tr / treeH) * 2.5);
          c.fillRect(x - half, baseY - treeH + tr, half * 2 + 1, 1);
        }
      }
    }

    // 10. Grand Starlight Observatory Citadel on Central Peak
    const obsX = Math.round(pw * 0.5);
    const obsBaseY = hy - 14;
    // Stone terrace foundation
    c.fillStyle = '#1d264f';
    c.fillRect(obsX - 38, obsBaseY - 8, 76, 12);
    c.fillStyle = '#334178';
    c.fillRect(obsX - 38, obsBaseY - 8, 76, 2);
    // Flanking observatory wings
    c.fillStyle = '#19224a';
    c.fillRect(obsX - 30, obsBaseY - 17, 16, 11);
    c.fillRect(obsX + 14, obsBaseY - 17, 16, 11);
    c.fillStyle = '#4b5a94';
    c.fillRect(obsX - 31, obsBaseY - 18, 18, 2);
    c.fillRect(obsX + 13, obsBaseY - 18, 18, 2);
    // Main cylindrical tower
    c.fillStyle = '#222d5c';
    c.fillRect(obsX - 15, obsBaseY - 26, 30, 20);
    c.fillStyle = '#3d4c85';
    c.fillRect(obsX - 15, obsBaseY - 26, 4, 20);
    // Brass gallery ring
    c.fillStyle = '#d4a34a';
    c.fillRect(obsX - 16, obsBaseY - 26, 32, 2);
    c.fillStyle = '#ffebad';
    c.fillRect(obsX - 16, obsBaseY - 27, 32, 1);
    // Ribbed Brass & Sapphire Observatory Dome
    const domeR = 13;
    for (let dy = -domeR; dy <= 0; dy++) {
      const span = Math.round(Math.sqrt(domeR * domeR - dy * dy));
      c.fillStyle = dy < -9 ? '#6b7eb8' : dy < -4 ? '#3f518c' : '#28366b';
      c.fillRect(obsX - span, obsBaseY - 27 + dy, span * 2, 1);
      // Gilded dome ribs
      c.fillStyle = '#dfb15b';
      c.fillRect(obsX - span, obsBaseY - 27 + dy, 1, 1);
      c.fillRect(obsX + span - 1, obsBaseY - 27 + dy, 1, 1);
      if (Math.abs(dy) < domeR - 1) {
        c.fillRect(obsX, obsBaseY - 27 + dy, 1, 1);
      }
    }
    // Spire finial & starlight beacon atop dome
    c.fillStyle = '#ffe599';
    c.fillRect(obsX, obsBaseY - 45, 1, 6);
    c.fillStyle = '#7ce8ff';
    c.fillRect(obsX - 1, obsBaseY - 46, 3, 2);
    // Illuminated telescope aperture & warm golden windows
    c.fillStyle = '#7ce8ff';
    c.fillRect(obsX - 3, obsBaseY - 36, 6, 5);
    c.fillStyle = '#e0fbff';
    c.fillRect(obsX - 2, obsBaseY - 35, 4, 2);
    const winCoords: Array<[number, number]> = [
      [obsX - 9, obsBaseY - 20],
      [obsX - 1, obsBaseY - 20],
      [obsX + 7, obsBaseY - 20],
      [obsX - 25, obsBaseY - 13],
      [obsX - 19, obsBaseY - 13],
      [obsX + 18, obsBaseY - 13],
      [obsX + 24, obsBaseY - 13],
    ];
    for (const [wx, wy] of winCoords) {
      c.fillStyle = '#ffbf47';
      c.fillRect(wx, wy, 3, 4);
      c.fillStyle = '#fff5bd';
      c.fillRect(wx + 1, wy + 1, 1, 2);
    }

    // Cozy Harbor Village Cottages flanking the ridge with warm glowing windows
    const cottages: Array<[number, number, number]> = [
      [Math.round(pw * 0.22), hy - 8, 12],
      [Math.round(pw * 0.30), hy - 9, 10],
      [Math.round(pw * 0.70), hy - 9, 11],
      [Math.round(pw * 0.79), hy - 8, 13],
    ];
    for (const [cx, cy, cwCot] of cottages) {
      c.fillStyle = '#1b1d3c';
      c.fillRect(cx - Math.floor(cwCot / 2), cy - 6, cwCot, 7);
      c.fillStyle = '#48345c';
      c.fillRect(cx - Math.floor(cwCot / 2) - 1, cy - 8, cwCot + 2, 2);
      c.fillStyle = '#6e4e78';
      c.fillRect(cx - Math.floor(cwCot / 2) + 1, cy - 10, cwCot - 2, 2);
      c.fillStyle = '#ffd670';
      c.fillRect(cx - 2, cy - 4, 2, 2);
      c.fillRect(cx + 2, cy - 4, 2, 2);
    }

    // 11. Handcrafted Timber Harbor Boardwalk Pier + Pilings + Ornate Brass Streetlamps
    const pierLeft = Math.round(pw * 0.04);
    const pierW = Math.round(pw * 0.92);
    const pierY = hy - 3;
    // Wooden support pilings descending into water
    c.fillStyle = '#191326';
    for (let px = pierLeft + 8; px < pierLeft + pierW - 6; px += 22) {
      c.fillRect(px, pierY + 4, 4, 14);
      c.fillStyle = '#332540';
      c.fillRect(px, pierY + 4, 1, 12);
      c.fillStyle = '#191326';
    }
    // Pier railing posts
    for (let px = pierLeft + 4; px < pierLeft + pierW; px += 16) {
      c.fillStyle = '#2b2038';
      c.fillRect(px, pierY - 5, 2, 5);
    }
    c.fillStyle = '#4f3b5c';
    c.fillRect(pierLeft, pierY - 4, pierW, 1);
    // Boardwalk timber deck with plank bevels
    c.fillStyle = '#5e4763';
    c.fillRect(pierLeft, pierY, pierW, 1);
    c.fillStyle = '#3b2c47';
    c.fillRect(pierLeft, pierY + 1, pierW, 3);
    c.fillStyle = '#21182e';
    c.fillRect(pierLeft, pierY + 4, pierW, 2);
    for (let px = pierLeft + 6; px < pierLeft + pierW; px += 8) {
      c.fillStyle = '#251b33';
      c.fillRect(px, pierY + 1, 1, 3);
    }

    // 6 Ornate Brass Harbor Lamp Posts along the boardwalk
    for (const frac of PIER_LAMP_X_FRACS) {
      const lx = Math.round(pw * frac);
      const ly = pierY - 12;
      // Soft dithered warm amber lantern halo
      for (let dy = -9; dy <= 9; dy++) {
        for (let dx = -9; dx <= 9; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 <= 81 && d2 > 6) {
            const norm = 1 - Math.sqrt(d2) / 9;
            if (norm * 16 > BAYER4[(ly + dy + 64) & 3][(lx + dx + 64) & 3] + 6) {
              c.fillStyle = 'rgba(255, 210, 110, 0.22)';
              c.fillRect(lx + dx, ly + dy, 1, 1);
            }
          }
        }
      }
      // Lamp post & brass finial
      c.fillStyle = '#1b162b';
      c.fillRect(lx, ly + 3, 2, 10);
      c.fillStyle = '#c89742';
      c.fillRect(lx - 1, ly - 1, 4, 1);
      c.fillRect(lx - 1, ly + 3, 4, 1);
      // Warm glowing lantern core
      c.fillStyle = '#ffbe4a';
      c.fillRect(lx - 1, ly, 4, 3);
      c.fillStyle = '#fff9d2';
      c.fillRect(lx, ly + 1, 2, 1);
    }

    // 12. Deep Twilight Harbor Sea Base below Horizon
    for (let y = hy + 2; y < ph; y += 2) {
      const frac = (y - hy) / Math.max(1, ph - hy);
      c.fillStyle = frac < 0.25 ? '#162854' : frac < 0.6 ? '#0f1c40' : '#09112b';
      c.fillRect(0, y, pw, 2);
    }

    (cache as HTMLCanvasElement & { __starlightImmutable?: boolean }).__starlightImmutable = true;
    return cache;
  }

  render(
    backend: IRenderBackend,
    saveOrOptions: StarlightSaveState | { save: StarlightSaveState; reducedMotion?: boolean },
    reducedMotionArg?: boolean,
  ): void {
    const save = 'save' in saveOrOptions ? saveOrOptions.save : saveOrOptions;
    const reducedMotion =
      reducedMotionArg ??
      ('save' in saveOrOptions ? saveOrOptions.reducedMotion : undefined) ??
      save.settings.reducedMotion;

    const t = this.elapsedSeconds;
    const motion = reducedMotion ? 0.2 : 1.0;

    const ctx2d = backend.getCanvas2DContext();
    if (ctx2d?.canvas) {
      const dpr = Math.max(1, backend.capabilities.dpr || 1);
      const cw = ctx2d.canvas.clientWidth || ctx2d.canvas.width / dpr;
      const ch = ctx2d.canvas.clientHeight || ctx2d.canvas.height / dpr;
      if (cw > 0 && ch > 0) {
        this.viewportW = cw;
        this.viewportH = ch;
      }
    } else if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.viewportW = window.innerWidth;
      this.viewportH = window.innerHeight;
    }

    const w = this.viewportW;
    const h = this.viewportH;
    const horizonY = h * 0.72;
    const villageProfile = getBiomeVisualProfile('village');

    backend.setCamera({ x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0, rotation: 0 });
    backend.setColorGrade(villageProfile.colorGrade);
    backend.setCanopyConfig({
      enabled: false,
      sunbeamIntensity: 0,
      sunbeamAngle: -0.4,
      sunbeamColor: [1, 0.94, 0.78],
      cloudSpeedX: 0,
      cloudSpeedY: 0,
      cloudOpacity: 0,
    });
    backend.setWaterConfig({
      enabled: true,
      time: t,
      skyTopColor: villageProfile.waterConfig.skyTopColor,
      skyBottomColor: villageProfile.waterConfig.skyBottomColor,
      starlightIntensity: 0.92,
      waveAmplitude: reducedMotion ? 0.2 : 0.85,
      foamColor: villageProfile.waterConfig.foamColor,
    });

    const charSheet = this.getSheetImage?.('characters') ?? null;
    const fallbackSheet = this.getSheetImage?.('fallbacks') ?? null;

    // World Layer: Blit cached HD-2D Pixel Vista + Ultra-lightweight Animated Aurora, Stars & Lanterns
    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;
      const hy = Math.round(ch * 0.72);
      ctx.imageSmoothingEnabled = false;

      // 1. Single-blit cached high-fidelity HD-2D pixel vista!
      const cached = this.ensureStaticBackdropCache(ctx, cw, ch);
      if (cached) {
        ctx.drawImage(cached, 0, 0, cw, ch);
      } else {
        ctx.fillStyle = '#0d1534';
        ctx.fillRect(0, 0, cw, ch);
      }

      // 2. Subtle pixel-stepped Aurora Veil (only 28 coarse vertical slices = zero lag!)
      const sliceCount = 28;
      const sliceW = Math.ceil(cw / sliceCount);
      for (let band = 0; band < 2; band++) {
        ctx.fillStyle = band === 0 ? 'rgba(92, 238, 198, 0.085)' : 'rgba(176, 134, 255, 0.08)';
        for (let s = 0; s < sliceCount; s++) {
          const px = s * sliceW;
          const nx = s / sliceCount;
          const wave = Math.sin(t * 0.52 * motion + nx * 6.2 + band * 2.3);
          const ribbonY = Math.round(ch * (0.14 + band * 0.075) + wave * ch * 0.026);
          const ribbonH = Math.round(ch * (0.055 + 0.018 * Math.cos(nx * 9 + t * 0.36 * motion)));
          ctx.fillRect(px, ribbonY, sliceW, Math.max(8, ribbonH));
        }
      }

      // 3. Dynamic Twinkling Bright Stars (24 precomputed nodes)
      for (let i = 0; i < TWINKLE_STARS.length; i++) {
        const st = TWINKLE_STARS[i];
        const pulse = 0.35 + 0.65 * Math.sin(t * st.speed * motion + st.phase);
        if (pulse < 0.48) continue;
        const alpha = (0.3 + pulse * 0.65).toFixed(2);
        const col = st.warm ? `rgba(255, 232, 150, ${alpha})` : `rgba(220, 245, 255, ${alpha})`;
        drawPixelStar(ctx, st.nx * cw, st.ny * ch, st.big ? 3 : 2, col);
      }

      // 4. Occasional gentle shooting star across the upper twilight sky
      if (!reducedMotion) {
        const cycle = (t * 0.14) % 1;
        if (cycle < 0.16) {
          const prog = cycle / 0.16;
          const sx = Math.round(cw * (0.64 + prog * 0.22));
          const sy = Math.round(ch * (0.06 + prog * 0.14));
          const fade = Math.sin(prog * Math.PI);
          ctx.fillStyle = `rgba(255, 245, 200, ${(0.85 * fade).toFixed(2)})`;
          ctx.fillRect(sx, sy, 4, 2);
          ctx.fillStyle = `rgba(140, 232, 255, ${(0.45 * fade).toFixed(2)})`;
          ctx.fillRect(sx - 10, sy - 5, 10, 2);
          ctx.fillStyle = `rgba(140, 232, 255, ${(0.2 * fade).toFixed(2)})`;
          ctx.fillRect(sx - 20, sy - 10, 10, 1);
        }
      }

      // 5. Floating Pixel Sky-Lanterns drifting peacefully above the harbor
      for (let i = 0; i < 8; i++) {
        const laneX = cw * (0.07 + ((i * 0.125 + 0.03) % 0.86));
        const sway = Math.sin(t * 0.95 * motion + i * 1.8) * 9;
        const rise = (t * 12 * motion + i * 54) % Math.max(110, hy * 0.68);
        const lx = Math.round(laneX + sway);
        const ly = Math.round(hy - 20 - rise);
        ctx.fillStyle = 'rgba(255, 208, 102, 0.22)';
        ctx.fillRect(lx - 5, ly - 5, 12, 13);
        ctx.fillStyle = '#e58734';
        ctx.fillRect(lx - 2, ly - 2, 6, 7);
        ctx.fillStyle = '#fff3b8';
        ctx.fillRect(lx - 1, ly, 4, 3);
      }

      // 6. Gentle twilight sea base bands under water shader
      const seaH = Math.max(24, ch - hy);
      const seaColors = ['#132550', '#0e1d42', '#0a1533', '#070f26'];
      const sbH = Math.ceil(seaH / seaColors.length);
      for (let sb = 0; sb < seaColors.length; sb++) {
        ctx.fillStyle = seaColors[sb];
        ctx.fillRect(0, hy + sb * sbH, cw, sbH + 1);
      }

      // 7. Subtle breathing beacon glint atop the Starlight Observatory spire
      const spirePulse = 0.55 + 0.45 * Math.sin(t * 2.4 * motion);
      const obsTipX = Math.round(cw * 0.5);
      const obsTipY = Math.round(hy - (ch / 270) * 60);
      ctx.fillStyle = `rgba(148, 240, 255, ${(0.32 * spirePulse).toFixed(2)})`;
      ctx.fillRect(obsTipX - 6, obsTipY - 1, 12, 3);
      ctx.fillRect(obsTipX - 1, obsTipY - 6, 3, 12);
    }, 'world');

    // 8. Single unified Starlight Sea water shader pass (blended softly so reflections gleam!)
    backend.drawWaterQuad(0, horizonY, w, Math.max(36, h - horizonY), 0.24, 0.14);

    // 8. Atmospheric PointLights (Moon, Harbor Lanterns, Trainer Auras)
    backend.addPointLight({
      id: 'title-moon',
      x: w * 0.16,
      y: h * 0.19,
      radius: 210,
      color: [0.82, 0.9, 1.0],
      intensity: 0.85,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-observatory',
      x: w * 0.5,
      y: horizonY - 46,
      radius: 170,
      color: [0.68, 0.9, 1.0],
      intensity: 0.75,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-lantern-west',
      x: w * 0.27,
      y: horizonY - 22,
      radius: 155,
      color: [1.0, 0.8, 0.42],
      intensity: 1.0,
      flickerSpeed: 3.1,
      flickerAmount: 0.08,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-lantern-east',
      x: w * 0.73,
      y: horizonY - 22,
      radius: 155,
      color: [1.0, 0.82, 0.46],
      intensity: 1.0,
      flickerSpeed: 2.7,
      flickerAmount: 0.08,
      screenSpace: true,
    });

    const violetProfile = save.profiles.violet;
    const oziasProfile = save.profiles.ozias;
    const vAuraRgb = AURA_RGB_MAP[violetProfile?.appearance?.aura ?? 'none'] ?? AURA_RGB_MAP.stars;
    const oAuraRgb = AURA_RGB_MAP[oziasProfile?.appearance?.aura ?? 'none'] ?? AURA_RGB_MAP.lightning;

    backend.addPointLight({
      id: 'title-violet-aura',
      x: w * 0.09,
      y: horizonY - 24,
      radius: 135,
      color: vAuraRgb,
      intensity: save.activeTrainerId === 'violet' ? 1.15 : 0.72,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-ozias-aura',
      x: w * 0.91,
      y: horizonY - 24,
      radius: 135,
      color: oAuraRgb,
      intensity: save.activeTrainerId === 'ozias' ? 1.15 : 0.72,
      screenSpace: true,
    });

    // 9. Gentle Starlight Firefly Motes
    const moteCount = reducedMotion ? 5 : 10;
    for (let i = 0; i < moteCount; i++) {
      const mx = (((i * 0.19 + t * 0.025 * motion * ((i % 2) * 2 - 1)) % 1) + 1) % 1;
      const my = 0.4 + 0.3 * Math.sin(t * 0.65 * motion + i * 1.4);
      backend.drawParticle({
        x: mx * w,
        y: my * h,
        radius: 2.5 + (i % 3) * 1.1,
        color: i % 2 === 0 ? [1.0, 0.86, 0.48, 0.58] : [0.55, 0.92, 1.0, 0.54],
        additive: true,
      });
    }

    // 10. Post-Light Layer: Shimmering Harbor Water Reflections + Crisp Pier Alcoves for Violet & Ozias
    backend.drawCustom2D((ctx, cw, ch) => {
      const hy = Math.round(ch * 0.72);
      const seaH = Math.max(24, ch - hy);
      ctx.imageSmoothingEnabled = false;

      // Crisp horizon shoreline shimmer line
      ctx.fillStyle = 'rgba(165, 228, 255, 0.34)';
      ctx.fillRect(0, hy + 1, cw, 2);

      // Lunar silver-gold reflection column dancing on the harbor waves (left side under crescent moon)
      const moonColX = Math.round(cw * 0.16);
      for (let i = 0; i < 14; i++) {
        const yFrac = (i + 0.4) / 14;
        const py = Math.round(hy + 6 + yFrac * (seaH - 10));
        const sway = Math.sin(t * 2.0 * motion + i * 1.35) * (5 + yFrac * 15);
        const pwBar = Math.round(16 + yFrac * 38 + Math.sin(t * 2.7 * motion + i) * 5);
        const alpha = ((0.32 + 0.14 * Math.sin(t * 2.2 * motion + i)) * (1 - yFrac * 0.34)).toFixed(2);
        ctx.fillStyle = `rgba(255, 242, 198, ${alpha})`;
        ctx.fillRect(Math.round(moonColX + sway - pwBar * 0.5), py, pwBar, 2);
      }

      // Warm golden reflection pillars shimmering beneath all 6 brass harbor streetlamps
      for (let l = 0; l < PIER_LAMP_X_FRACS.length; l++) {
        const lx = Math.round(cw * PIER_LAMP_X_FRACS[l]);
        for (let r = 0; r < 7; r++) {
          const yOff = 6 + r * Math.max(6, Math.round(seaH * 0.11));
          const drift = Math.sin(t * 2.3 * motion + l * 1.7 + r * 0.95) * (3 + r * 1.6);
          const rw = Math.max(4, 16 - r * 2);
          const a = (0.42 - r * 0.05).toFixed(2);
          ctx.fillStyle = `rgba(255, 210, 114, ${a})`;
          ctx.fillRect(Math.round(lx + drift - rw * 0.5), hy + yOff, rw, 2);
        }
      }

      // Gentle starlight glints & wave crests rippling across the dark sea
      for (let i = 0; i < 22; i++) {
        const wx = Math.round(((i * 97.3 + t * 8 * motion) % cw));
        const wy = Math.round(hy + 8 + ((i * 23.7) % Math.max(14, seaH - 14)));
        const gl = (0.14 + 0.15 * Math.abs(Math.sin(t * 1.6 * motion + i))).toFixed(2);
        ctx.fillStyle = i % 3 === 0 ? `rgba(255, 232, 160, ${gl})` : `rgba(176, 232, 255, ${gl})`;
        ctx.fillRect(wx, wy, 10 + (i % 4) * 5, 2);
      }

      const drawPedestal = (
        profile: DojoProfileState,
        centerX: number,
        isSelected: boolean,
        facingPartner: 'left' | 'right',
      ) => {
        const pedY = hy + 2;
        const look = getResolvedTrainerLook(profile.trainerId, profile.appearance);
        ctx.save();

        // Stepped stone-and-brass harbor lantern dais (no muddy radial blur box!)
        const rx = Math.round(centerX);
        ctx.fillStyle = 'rgba(5, 8, 20, 0.68)';
        ctx.fillRect(rx - 44, pedY - 3, 88, 7);
        ctx.fillStyle = isSelected ? '#e8c468' : '#7e6746';
        ctx.fillRect(rx - 42, pedY + 3, 84, 2);
        ctx.fillStyle = isSelected ? '#fff3c4' : `${look.accent}aa`;
        ctx.fillRect(rx - 28, pedY + 2, 56, 1);

        // Trainer pixel sprite
        const trainerX = Math.round(centerX - 24);
        const trainerY = Math.round(pedY - 50);
        const regionId = `${profile.trainerId}_idle`;
        const region = this.manifest?.sheets?.characters?.regions?.[regionId];
        if (charSheet && region) {
          ctx.drawImage(charSheet, region.x, region.y, region.w, region.h, trainerX, trainerY, 44, 52);
        } else {
          ctx.fillStyle = look.hair;
          ctx.fillRect(trainerX + 12, trainerY + 4, 20, 12);
          ctx.fillStyle = look.skin;
          ctx.fillRect(trainerX + 14, trainerY + 12, 16, 12);
          ctx.fillStyle = '#141a38';
          ctx.fillRect(trainerX + 16, trainerY + 17, 3, 3);
          ctx.fillRect(trainerX + 25, trainerY + 17, 3, 3);
          ctx.fillStyle = look.outfitPrimary;
          ctx.fillRect(trainerX + 12, trainerY + 24, 20, 14);
          ctx.fillStyle = look.outfitSecondary;
          ctx.fillRect(trainerX + 16, trainerY + 24, 12, 4);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(trainerX + 14, trainerY + 38, 6, 8);
          ctx.fillRect(trainerX + 24, trainerY + 38, 6, 8);
        }

        // Lead Partner standing beside trainer
        const lead = profile.team[0];
        if (lead) {
          const sp = getSpeciesEntry(lead.speciesId);
          const partnerCx = Math.round(centerX + (facingPartner === 'left' ? 32 : -32));
          const partnerCy = Math.round(pedY - 24);
          if (this.rigSynthesizer) {
            const rig: OfflineRigDescriptor = {
              speciesId: sp.id,
              name: sp.name,
              primaryType: sp.type,
              archetype: sp.archetype,
              colorHex: sp.color,
              shiny: lead.isShiny,
            };
            this.rigSynthesizer.renderRig(ctx, rig, {
              cx: partnerCx,
              cy: partnerCy,
              size: 48,
              time: t,
              facing: facingPartner,
              rimColor: TYPE_PALETTES[sp.type].glow,
              reducedMotion,
            });
          } else {
            const fbRegion = this.manifest?.sheets?.fallbacks?.regions?.[sp.archetype];
            if (fallbackSheet && fbRegion) {
              ctx.drawImage(fallbackSheet, fbRegion.x, fbRegion.y, fbRegion.w, fbRegion.h, partnerCx - 22, partnerCy - 22, 44, 44);
            } else {
              drawPixelArchetypeSprite(ctx, sp.id, partnerCx - 22, partnerCy - 22, 44, lead.isShiny);
            }
          }
        }
        ctx.restore();
      };

      if (cw >= 1040) {
        drawPedestal(violetProfile, Math.max(66, cw * 0.088), save.activeTrainerId === 'violet', 'left');
        drawPedestal(oziasProfile, Math.min(cw - 66, cw * 0.912), save.activeTrainerId === 'ozias', 'right');
      } else if (cw >= 720) {
        drawPedestal(violetProfile, cw * 0.09, save.activeTrainerId === 'violet', 'left');
        drawPedestal(oziasProfile, cw * 0.91, save.activeTrainerId === 'ozias', 'right');
      }
    }, 'post-light');
  }
}

export function renderTitleTrainerAvatar(
  canvas: HTMLCanvasElement,
  profile: DojoProfileState,
  charactersSheet: CanvasImageSource | null,
  manifest: AtlasManifest | null,
): void {
  renderTrainerPortraitCanvas(canvas, profile.trainerId, charactersSheet, manifest, profile.appearance);
}
