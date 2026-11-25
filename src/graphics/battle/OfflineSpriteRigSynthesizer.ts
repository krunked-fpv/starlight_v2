import type {
  AtlasManifest,
  AtlasRegion,
  BodyArchetype,
  IOfflineSpriteRigSynthesizer,
  OfflineRigDescriptor,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core';
import { clamp, hexToRgba, mixHex } from './BattleArenas';

const FALLBACK_ARCHETYPE_ORDER: readonly BodyArchetype[] = [
  'quadruped',
  'biped',
  'winged',
  'serpentine',
  'crystalline',
  'amorphous',
  'insectoid',
  'draconic',
  'construct',
  'flora',
  'aquatic',
];

const PIXEL_GRIDS: Record<BodyArchetype, readonly string[]> = {
  quadruped: [
    '..OO......OO....',
    '.OHPO....OPHO...',
    '.OPSPO..OPPSO...',
    '..OPOOOOOPPSO...',
    '.OHPPPPPPPPO....',
    '.OPEWPPPEWPO..OO',
    '.OPEEPPPEEPO.OAO',
    '.OPPPPPPPPPOOAHO',
    '..OAAAAAAAO.OAPO',
    '..OPPPPPPPPOOPO.',
    '..OPPPPPPPPPPO..',
    '..OSSPPPPPPSSO..',
    '..OPO.OPO.OPO...',
    '..OPO.OPO.OPO...',
    '..OSO.OSO.OSO...',
    '..OOO.OOO.OOO...',
  ],
  biped: [
    '......OOO.......',
    '.....OAAAO......',
    '....OOHPHPO.....',
    '...OHPPPPPSO....',
    '..OPEWPPPEWPO...',
    '..OPEEPPPEEPO...',
    '...OPPPPPPSO....',
    '..OOOPAAAPOOO...',
    '.OPOHAAAAAHOPO..',
    '.OSOPAAAAAPOSO..',
    '..O.OPPPPPPO.OO.',
    '....OPSSSSPO.OAO',
    '....OPO..OPOOAO.',
    '....OPO..OPOOO..',
    '...OSSO..OSSO...',
    '...OOOO..OOOO...',
  ],
  winged: [
    '.....OOOO.......',
    '....OHAAHO......',
    '...OHPPPPPO...OO',
    '..OPEWPPPEPO.OAO',
    '.OAAPPEEPPPOOHPO',
    '..OOOPPPPPOOHPPO',
    '....OHPPPOOHPPSO',
    '...OOHPPPPPPPSO.',
    '..OHPAAAAAAAPSO.',
    '..OSPPPPPPPPPSO.',
    '...OSSPPPPPPSSO.',
    '....OOSPPPSSOO..',
    '.....OPO..OPO...',
    '....OAO....OAO..',
    '....OOO....OOO..',
    '................',
  ],
  serpentine: [
    '...OOOO.........',
    '..OAAAAO........',
    '.OHPPPPPO.......',
    '.OPEWPEWPO......',
    '.OPEEPEEPO......',
    '..OPPPPPPO......',
    '...OAAAAPO......',
    '....OPPPPO..OOO.',
    '...OHPPPPO.OAAHO',
    '..OHPPPPPOOPPPPO',
    '..OPPPSSPPPPSSO.',
    '..OPSO..OSSSSO..',
    '..OPPPPO........',
    '...OPPPPPPPO....',
    '....OSSSSSSO....',
    '.....OOOOOO.....',
  ],
  aquatic: [
    '......OOOO......',
    '....OOHAAHOO....',
    '..OOOHPPPPPO....',
    '.OAOOHPEWPEWO...',
    '.OAOOOPPEEPPO.OO',
    '..OOOPPPPPPPOOAO',
    '....OHPPPPPPPHPO',
    '...OHPAAAAAAAPPO',
    '...OPPPPPPPPPSO.',
    '....OSSPPPPSSOO.',
    '.....OOSPPPO....',
    '......OPOPO.....',
    '.....OAO.OAO....',
    '.....OOO.OOO....',
    '................',
    '................',
  ],
  insectoid: [
    '..OO......OO....',
    '...O......O.....',
    '....OOOOOO...OOO',
    '...OHPPPPSO.OAAO',
    '..OPEWPEWPO.OAHO',
    '..OPEEPEEPOOOAPO',
    '...OPPPPPOOHPPSO',
    '..OOHAAHOOHPPPO.',
    '.OPOHPPPPPPPSO..',
    '.O.OOPSSSSSSO...',
    '..O.OPO..OPO....',
    '.O..OPO..OPO....',
    '....OSO..OSO....',
    '....OOO..OOO....',
    '................',
    '................',
  ],
  draconic: [
    '..OO....OO......',
    '..OAO..OAO..OOO.',
    '..OHPOOHPO.OAAHO',
    '.OOOHPPPPO.OHPPO',
    'OHPPPEWPEWPO.OPO',
    'OPPPPEEPEEPO.OPO',
    '.OOOPPPPPPOOOOPO',
    '...OHPAAAPPPPHPO',
    '..OOPPAAAPPPPPO.',
    '.OPPOPAAAPPPPO..',
    '.O.O.OPSSSSSO...',
    '.....OPO..OPO...',
    '....OSSO..OSSO..',
    '....OOOO..OOOO..',
    '................',
    '................',
  ],
  construct: [
    '....OOOOOOOO....',
    '...OHHHHHHHHO...',
    '...OHPPPPPPPO...',
    '..OOHPEAAAEPO...',
    '..OPOPPPPPPOPO..',
    '.OHPOPPAAAPPOPO.',
    '.OPPOPPAAAPPOPO.',
    '.OSPOPPPPPPOPSO.',
    '.O.O.OPPPPO.O.O.',
    '.....OPSSPO.....',
    '....OPO..OPO....',
    '....OPO..OPO....',
    '...OSSO..OSSO...',
    '...OOOO..OOOO...',
    '................',
    '................',
  ],
  amorphous: [
    '......OOOO......',
    '.....OAAAAO.....',
    '....OHPPPPHO....',
    '...OHPPPPPPPO...',
    '..OHPPPPPPPPPO..',
    '..OPEWPPPEWPPO..',
    '..OPEEPPPEEPPO..',
    '..OPPPPPPPPPPO..',
    '..OPPPAAAAPPPO..',
    '.OHPPPPPPPPPPHO.',
    '.OSPPPPPPPPPPSO.',
    '..OSSPPPPPPSSO..',
    '...OOSSSSSSOO...',
    '.....OOOOOO.....',
    '..OO........OO..',
    '.OAO........OAO.',
  ],
  flora: [
    '..OOOO....OOOO..',
    '.OAAAAO..OAAAAO.',
    '..OAAHO..OHAAO..',
    '....OHO..OHO....',
    '.....OOOOOO.....',
    '...OOHPPPPPHO...',
    '..OHPPPPPPPPPO..',
    '..OPEWPPPEWPPO..',
    '..OPEEPPPEEPPO..',
    '..OAAAAAAAAAO...',
    '...OPPPPPPPPO...',
    '...OSSPPPPSSO...',
    '..OHO.OPO.OHO...',
    '..OOO.OSO.OOO...',
    '......OOO.......',
    '................',
  ],
  crystalline: [
    '.......OO.......',
    '......OAAO......',
    '..OO..OHHO..OO..',
    '.OAO.OHPPHO.OAO.',
    '..OOOHPPPPHO.OO.',
    '...OHPAAAAPHO...',
    '..OHPPEWPEWPHO..',
    '..OPPPEEPEEPPO..',
    '..OPPPAAAAPPPO..',
    '...OPPPPPPPPO...',
    '...OSPPPPPPPO...',
    '....OSPPPPSO....',
    '..OO.OSSSSO.OO..',
    '.OAO..OSSO..OAO.',
    '..OO...OO....OO.',
    '................',
  ],
};

interface ResolvedPixelPalette {
  outline: string;
  primary: string;
  highlight: string;
  shadow: string;
  accent: string;
  eye: string;
  eyeWhite: string;
}

function hashSpecies(speciesId: number): number {
  let h = Math.imul(Math.max(1, speciesId) ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function resolvePixelPalette(rig: OfflineRigDescriptor): ResolvedPixelPalette {
  const typePal = TYPE_PALETTES[rig.primaryType] ?? TYPE_PALETTES.normal;
  const legacyPalette = (rig as unknown as { palette?: string[] }).palette;
  const basePrimary = rig.colorHex || legacyPalette?.[0] || typePal.primary;
  const primary = rig.shiny ? mixHex(basePrimary, '#ffe678', 0.34) : basePrimary;
  const accent = rig.shiny ? '#82f5ff' : typePal.glow;
  const shadow = mixHex(primary, typePal.dark, 0.52);
  const highlight = mixHex(primary, '#ffffff', 0.42);
  const outline = mixHex(typePal.dark, '#171330', 0.65);

  return {
    outline,
    primary,
    highlight,
    shadow,
    accent,
    eye: '#171330',
    eyeWhite: '#ffffff',
  };
}

function isDrawableSheet(
  sheet: HTMLImageElement | HTMLCanvasElement | null,
): sheet is HTMLImageElement | HTMLCanvasElement {
  if (!sheet) return false;
  if ('complete' in sheet && typeof sheet.complete === 'boolean' && !sheet.complete) {
    return false;
  }
  const w =
    'naturalWidth' in sheet && typeof sheet.naturalWidth === 'number' && sheet.naturalWidth > 0
      ? sheet.naturalWidth
      : sheet.width;
  const h =
    'naturalHeight' in sheet && typeof sheet.naturalHeight === 'number' && sheet.naturalHeight > 0
      ? sheet.naturalHeight
      : sheet.height;
  return w > 0 && h > 0;
}

function drawPixelStarSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unit: number,
  color: string,
): void {
  const s = Math.max(1, Math.round(unit));
  const x = Math.round(cx / s) * s;
  const y = Math.round(cy / s) * s;
  ctx.fillStyle = color;
  ctx.fillRect(x - s, y, s * 3, s);
  ctx.fillRect(x, y - s, s, s * 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, s, s);
}

/**
 * Pixel-Art Offline Companion Synthesizer.
 * Renders crisp 48x48 sprites from `fallbacks-atlas.png` when attached, and
 * falls back to bespoke 16x16 pixel-grid creature emblems (ZERO ovals/bean-dogs!)
 * in headless or pre-manifest environments.
 */
export class OfflineSpriteRigSynthesizer implements IOfflineSpriteRigSynthesizer {
  private fallbackSheet: HTMLImageElement | HTMLCanvasElement | null = null;
  private manifest: AtlasManifest | null = null;
  private flashCanvas: HTMLCanvasElement | null = null;
  private flashCtx: CanvasRenderingContext2D | null = null;

  attachFallbackSheet(
    sheet: HTMLImageElement | HTMLCanvasElement | null,
    manifest: AtlasManifest | null,
  ): void {
    this.fallbackSheet = sheet;
    this.manifest = manifest;
  }

  private resolveRegion(archetype: BodyArchetype): AtlasRegion | null {
    const sheetDesc = this.manifest?.sheets?.fallbacks;
    const regions = sheetDesc?.regions;
    if (regions) {
      const direct =
        regions[archetype] ??
        regions[`fallbacks:${archetype}`] ??
        regions[`fallback:${archetype}`] ??
        regions[`fallback-${archetype}`] ??
        regions[`archetype:${archetype}`];
      if (direct) return direct;
    }

    if (isDrawableSheet(this.fallbackSheet)) {
      const sheetW =
        'naturalWidth' in this.fallbackSheet && this.fallbackSheet.naturalWidth > 0
          ? this.fallbackSheet.naturalWidth
          : this.fallbackSheet.width;
      const sheetH =
        'naturalHeight' in this.fallbackSheet && this.fallbackSheet.naturalHeight > 0
          ? this.fallbackSheet.naturalHeight
          : this.fallbackSheet.height;
      const cell = sheetDesc?.tileSize || 48;
      const cols = Math.max(1, Math.floor(sheetW / cell));
      const idx = FALLBACK_ARCHETYPE_ORDER.indexOf(archetype);
      if (idx >= 0) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        if ((row + 1) * cell <= sheetH) {
          return {
            id: archetype,
            x: col * cell,
            y: row * cell,
            w: cell,
            h: cell,
          };
        }
      }
    }

    return null;
  }

  private ensureFlashBuffer(w: number, h: number): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    if (!this.flashCanvas) {
      this.flashCanvas = document.createElement('canvas');
      this.flashCtx =
        typeof this.flashCanvas.getContext === 'function'
          ? (this.flashCanvas.getContext('2d', { willReadFrequently: true }) ?? this.flashCanvas.getContext('2d'))
          : null;
    }
    if (!this.flashCanvas || !this.flashCtx) return null;
    if (this.flashCanvas.width !== w) this.flashCanvas.width = w;
    if (this.flashCanvas.height !== h) this.flashCanvas.height = h;
    return this.flashCtx;
  }

  private renderPixelGridEmblem(
    ctx: CanvasRenderingContext2D,
    rig: OfflineRigDescriptor,
    drawSize: number,
    pal: ResolvedPixelPalette,
    isHitFlash: boolean,
  ): void {
    const archetype: BodyArchetype = PIXEL_GRIDS[rig.archetype] ? rig.archetype : 'biped';
    const grid = PIXEL_GRIDS[archetype];
    const px = Math.max(2, Math.floor(drawSize / 16));
    const totalW = px * 16;
    const ox = -Math.round(totalW * 0.5);
    const oy = -Math.round(totalW * 0.5);

    const colorForCode = (code: string): string | null => {
      if (code === '.') return null;
      if (isHitFlash) return code === 'O' ? '#fff4b8' : '#ffffff';
      switch (code) {
        case 'O':
          return pal.outline;
        case 'P':
          return pal.primary;
        case 'H':
          return pal.highlight;
        case 'S':
          return pal.shadow;
        case 'A':
          return pal.accent;
        case 'E':
          return pal.eye;
        case 'W':
          return pal.eyeWhite;
        default:
          return pal.primary;
      }
    };

    for (let row = 0; row < grid.length; row++) {
      const line = grid[row];
      let col = 0;
      while (col < line.length) {
        const ch = line[col];
        const color = colorForCode(ch);
        if (!color) {
          col += 1;
          continue;
        }
        // Merge horizontal pixel runs of identical color for crisp edge alignment & fewer draw calls
        let runEnd = col + 1;
        while (runEnd < line.length && line[runEnd] === ch) {
          runEnd += 1;
        }
        ctx.fillStyle = color;
        ctx.fillRect(ox + col * px, oy + row * px, (runEnd - col) * px, px);
        col = runEnd;
      }
    }

    // Subtle species-seeded pixel cheek / forehead mark
    if (!isHitFlash) {
      const h = hashSpecies(rig.speciesId);
      if ((h & 1) === 1) {
        ctx.fillStyle = pal.accent;
        ctx.fillRect(ox + 6 * px, oy + 7 * px, px, px);
      }
    }
  }

  renderRig(
    ctx: CanvasRenderingContext2D,
    rig: OfflineRigDescriptor,
    options: {
      cx: number;
      cy: number;
      size: number;
      time: number;
      facing: 'left' | 'right';
      hitFlash?: number;
      rimColor?: string;
      reducedMotion?: boolean;
    },
  ): void {
    const size = Math.max(24, options.size);
    const pal = resolvePixelPalette(rig);
    const typePal = TYPE_PALETTES[rig.primaryType] ?? TYPE_PALETTES.normal;
    const h = hashSpecies(rig.speciesId);
    const phase = ((h & 63) / 63) * Math.PI * 2;
    const motionScale = options.reducedMotion ? 0.14 : 1.0;
    const t = options.time * motionScale;

    const pixelUnit = Math.max(2, Math.round(size / 24));
    const bobPx = options.reducedMotion
      ? 0
      : Math.round(Math.sin(t * 3.4 + phase) * 1.4) * pixelUnit;

    const hitFlash = clamp(options.hitFlash ?? 0, 0, 1);
    const rimHex = options.rimColor || typePal.glow;
    const dirSign = options.facing === 'right' ? -1 : 1;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(options.cx), Math.round(options.cy - bobPx));
    if (dirSign < 0) {
      ctx.scale(-1, 1);
    }

    // Pixel-stepped elemental aura / rim highlights behind creature
    const auraPx = Math.max(2, Math.round(size / 18));
    const half = Math.round((size * 0.44) / auraPx) * auraPx;
    ctx.fillStyle = hexToRgba(rimHex, 0.24);
    ctx.fillRect(-half, -Math.round(half * 0.65), half * 2, Math.round(half * 1.3));
    ctx.fillStyle = hexToRgba(pal.primary, 0.22);
    ctx.fillRect(-Math.round(half * 0.72), -half, Math.round(half * 1.44), half * 2);

    const sheet = this.fallbackSheet;
    const region = isDrawableSheet(sheet) ? this.resolveRegion(rig.archetype) : null;

    if (sheet && region && isDrawableSheet(sheet)) {
      const drawSize = Math.max(48, Math.round(size / 4) * 4);
      const halfDraw = Math.round(drawSize * 0.5);
      ctx.drawImage(
        sheet,
        region.x,
        region.y,
        region.w,
        region.h,
        -halfDraw,
        -halfDraw,
        drawSize,
        drawSize,
      );

      // Species-tinted pixel shoulder/crown marker pixels so different species of same archetype feel distinct
      ctx.fillStyle = hexToRgba(pal.primary, 0.75);
      ctx.fillRect(-halfDraw + auraPx, -halfDraw + auraPx, auraPx, auraPx);

      // Pixel-crisp hit-flash silhouette overlay
      if (hitFlash > 0.04) {
        const fCtx = this.ensureFlashBuffer(region.w, region.h);
        if (fCtx && this.flashCanvas) {
          fCtx.save();
          fCtx.clearRect(0, 0, region.w, region.h);
          fCtx.imageSmoothingEnabled = false;
          fCtx.globalCompositeOperation = 'source-over';
          fCtx.drawImage(sheet, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
          fCtx.globalCompositeOperation = 'source-in';
          fCtx.fillStyle = '#fff9d6';
          fCtx.fillRect(0, 0, region.w, region.h);
          fCtx.restore();

          ctx.save();
          ctx.globalAlpha = hitFlash * 0.88;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(this.flashCanvas, -halfDraw, -halfDraw, drawSize, drawSize);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = hitFlash * 0.75;
          drawPixelStarSparkle(ctx, 0, 0, auraPx * 2, '#fff9d6');
          ctx.restore();
        }
      }
    } else {
      const drawSize = Math.max(32, Math.round(size));
      this.renderPixelGridEmblem(ctx, rig, drawSize, pal, false);
      if (hitFlash > 0.04) {
        ctx.save();
        ctx.globalAlpha = hitFlash * 0.88;
        this.renderPixelGridEmblem(ctx, rig, drawSize, pal, true);
        ctx.restore();
      }
    }

    // Shiny golden & starlight pixel sparkles orbiting the creature
    if (rig.shiny) {
      const orbitR = size * 0.44;
      for (let s = 0; s < 4; s++) {
        const a = t * 2.2 + (s / 4) * Math.PI * 2;
        const sx = Math.cos(a) * orbitR;
        const sy = Math.sin(a * 1.25) * orbitR * 0.68 - size * 0.06;
        drawPixelStarSparkle(
          ctx,
          sx,
          sy,
          Math.max(2, Math.round(size / 36)),
          s % 2 === 0 ? '#ffe66d' : '#7be8ff',
        );
      }
    }

    ctx.restore();
  }

  toDataUrl(rig: OfflineRigDescriptor, size = 160): string {
    const safeSize = Math.max(32, Math.round(size));
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = safeSize;
        canvas.height = safeSize;
        const ctx = typeof canvas.getContext === 'function'
          ? (canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d'))
          : null;
        if (ctx && typeof canvas.toDataURL === 'function') {
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, safeSize, safeSize);
          this.renderRig(ctx, rig, {
            cx: safeSize * 0.5,
            cy: safeSize * 0.52,
            size: safeSize * 0.78,
            time: 0.45,
            facing: 'left',
            rimColor: TYPE_PALETTES[rig.primaryType]?.glow,
            reducedMotion: true,
          });
          const url = canvas.toDataURL('image/png');
          if (typeof url === 'string' && url.startsWith('data:')) {
            return url;
          }
        }
      } catch {
        // Fall through to crisp SVG pixel grid in pure Node / headless test contexts
      }
    }

    // Crisp 16x16 pixel-art SVG data URL fallback
    const pal = resolvePixelPalette(rig);
    const archetype: BodyArchetype = PIXEL_GRIDS[rig.archetype] ? rig.archetype : 'biped';
    const grid = PIXEL_GRIDS[archetype];
    const rects: string[] = [];
    for (let y = 0; y < 16; y++) {
      const row = grid[y];
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const fill =
          ch === 'O'
            ? pal.outline
            : ch === 'P'
              ? pal.primary
              : ch === 'H'
                ? pal.highlight
                : ch === 'S'
                  ? pal.shadow
                  : ch === 'A'
                    ? pal.accent
                    : ch === 'E'
                      ? pal.eye
                      : pal.eyeWhite;
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
