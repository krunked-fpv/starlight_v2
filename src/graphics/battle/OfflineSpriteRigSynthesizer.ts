import type {
  AtlasManifest,
  AtlasRegion,
  BodyArchetype,
  IOfflineSpriteRigSynthesizer,
  OfflineRigDescriptor,
} from '../../contracts';
import { TYPE_PALETTES } from '../../core';
import { clamp, mixHex } from './BattleArenas';
import {
  SILHOUETTE_CONTOUR_PAD,
  getAtlasRegionSilhouetteContour,
  getPaletteTintedAtlasRegion,
} from './SpriteSilhouette';

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

const GRID_SIZE = 24;

/**
 * High-density 24x24 pixel-art creature grids with 11-tone shading tokens:
 * O = dark midnight ink outline | D = deep hue-shifted shadow | S = mid shadow
 * P = primary body | L = lit midtone | H = warm specular highlight
 * A = accent primary | B = accent bright highlight | K = accent shadow
 * E = eye pupil ink | W = eye specular white | . = transparent
 */
const PIXEL_GRIDS: Record<BodyArchetype, readonly string[]> = {
  quadruped: [
    '....OO........OO........',
    '...OBAO......OBAO.......',
    '..OBAKO.....OBAKO.......',
    '..OBPKO.....OBPKO.......',
    '...OPPKOOOOOOPPKO.......',
    '...OHLLLLLLLLLLPO.......',
    '..OHLLPPPPPPPPLPO.......',
    '..OLPEWPPPPPEWPSO....OO.',
    '..OLPEEPPPPPEEPSO...OBBO',
    '..OPPPPPPPPPPPPPO..OBAAO',
    '...OPPSPPPPPPSPO..OBAAKO',
    '...OOOBBBBBBBBOO.OBAPKO.',
    '..OOBBAAAAAAAABBOOPPKO..',
    '..OBAAKKKKKKKAAABPPPO...',
    '...OOKKPPPPPPPKKPPPO....',
    '...OLPPPPPPPPPPPPPSO....',
    '...OPPPPPPPPPPPPSSO.....',
    '...OSSPPPPPPPPSSDO......',
    '...ODDOODDDDOODDO.......',
    '...OPPO.OPPO.OPPO.......',
    '...OPSO.OPSO.OPSO.......',
    '...OSSO.OSSO.OSSO.......',
    '..OADDOOADDOOADDO.......',
    '..OOOO..OOOO.OOOO.......',
  ],
  biped: [
    '........................',
    '........OOOO............',
    '.......OBAAAO...........',
    '......OBHLLHPO..........',
    '.....OHLLPPPPSO.........',
    '....OLPPPPPPPPSO........',
    '....OLPEWPPPEWPO........',
    '....OPPEEPPPEEPO........',
    '....OPPPPPPPPPPO........',
    '.....OPPSPPPSPO.........',
    '...OOOOPBBBBPOOO........',
    '..OLPOOBAAAABOPSO....OO.',
    '..OPSOOBAAAABOPDO...OBBO',
    '..OSSOOBKKKKBOPO...OBAAO',
    '...OO.OPPPPPPPPO..OBAKO.',
    '......OLPPPPPPPO.OOKPO..',
    '......OPPPSSPPPPOOPSO...',
    '......OSSDDDDSSPPSSO....',
    '......OPSO..OPSOOOO.....',
    '......OPSO..OPSO........',
    '......OSSO..OSSO........',
    '.....OADDO..OADDO.......',
    '.....OOOOO..OOOOO.......',
    '........................',
  ],
  winged: [
    '........................',
    '........................',
    '.......OOOOOO...........',
    '......OBHAAHBO..........',
    '.....OHLLPPPLHO......OO.',
    '....OLPPPPPPPPO.....OBBO',
    '....OLPEWPPPEPO....OBAAO',
    '...OBBPEEPPPEPO...OBAPLO',
    '...OAAOPPPPPPPO..OBAPLPO',
    '....OOOHLLLLPPO.OBAPLPSO',
    '......OLPPPPPPOOBAPPPPSO',
    '.....OLPBBBBBPPBAPPPSSDO',
    '....OLPBAAAAABPPPPPPSSO.',
    '....OPPBAAAAABPPPPPSSDO.',
    '....OSPPKKKKKPPPPPSSDO..',
    '.....OSSPPPPPPPPPSSDO...',
    '......OODSSPPPPSSDOO....',
    '.......OOODDDDDDOO......',
    '........OAO...OAO.......',
    '.......OBAO..OBAO.......',
    '.......OOOO..OOOO.......',
    '........................',
    '........................',
    '........................',
  ],
  serpentine: [
    '........................',
    '.....OOOOO..............',
    '....OBAAAAO.............',
    '...OBHLLPPPO............',
    '..OHLPEWPEWPO...........',
    '..OLPPEEPEEPO...........',
    '..OPPPPPPPPPO...........',
    '...OOBBAAAAPO...........',
    '....OOKKPPPPO......OOO..',
    '.....OHLPPPPO.....OBBBO.',
    '....OHLLPPPPO....OBAAAO.',
    '...OHLPPPPPPPO..OBAPPPPO',
    '...OLPPBBPPPPPOOBAPPPPSO',
    '...OPPBAAAPPPPPPPPPSSDO.',
    '...OSSPKKKPPSSSSPPSSDO..',
    '....OOSPPPPDOOOODDDDO...',
    '...OHLPPPPPO............',
    '...OLPPBBPPPPOOO........',
    '...OPPBAAAPPPPPPO.......',
    '....OSSKKKPPPPSSDO......',
    '.....OOSSSSSSSDDO.......',
    '.......OOOOOOOOO........',
    '........................',
    '........................',
  ],
  aquatic: [
    '........................',
    '........OOOOO...........',
    '......OOBBAAHOO.........',
    '.....OBBHLLLPPHO........',
    '...OOOBHLPPPPPPPO.......',
    '..OBAOOHLPEWPEWPO.......',
    '..OAKOOLPPEEPEEPO....OO.',
    '...OOOOPPPPPPPPPPO..OBBO',
    '......OHLPPPPPPPLPOOBAAO',
    '.....OHLPBBBBBBBPPPOBAKO',
    '....OHLPBAAAAAAABPPPPSO.',
    '....OLPPBAAAAAAABPPPSSO.',
    '....OPPPPKKKKKKKPPPSSDO.',
    '.....OSSPPPPPPPPPPSSDO..',
    '......OODSSPPPPPPSSDO...',
    '........OOOSSPPPSSO.....',
    '..........OPPPPO........',
    '.........OBAAABBO.......',
    '........OBAAKOABBO......',
    '........OOKO..OOKO......',
    '........OOO....OOO......',
    '........................',
    '........................',
    '........................',
  ],
  insectoid: [
    '........................',
    '........................',
    '....OO........OO........',
    '....OBO......OBO........',
    '.....OO......OO.....OOO.',
    '......OOOOOOOO.....OBBBO',
    '.....OHLLPPPPSO...OBAAAO',
    '....OLPEWPPPEWPO.OBAPPLO',
    '....OPPEEPPPEEPOOBAPPPPO',
    '.....OPPPPPPPPOOBAPPPPSO',
    '....OOBBAAAAABBOOPPPSSDO',
    '...OLPOBKKKKBOPPPPPSSDO.',
    '..OLPSOPPPPPPPPPPSSDO...',
    '..O.OOOPPPSSPPPPSDOO....',
    '.....O.OSSDDSSSDDO......',
    '....O..OPSO..OPSO.......',
    '...O...OPSO..OPSO.......',
    '.......OSSO..OSSO.......',
    '.......OOOO..OOOO.......',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  draconic: [
    '........................',
    '........................',
    '...OO......OO...........',
    '..OBAO....OBAO.....OOO..',
    '..OBKO....OBKO....OBBBO.',
    '...OHPOOOOHPO....OBAAAO.',
    '..OOHLLPPPPPO...OBAPLPO.',
    '.OHLLPEWPPPEWO..OBAPPPSO',
    '.OLPPPEEPPPEEO..OAPPPSSO',
    '..OOOPPPPPPPPPOOOOPPPDDO',
    '....OHLPBBBPPPPPPPPPSSO.',
    '...OHLPBAAAPPPPPPPPSSDO.',
    '..OLPPPBAAAPPPPPPPSSDO..',
    '..OPO.OPKKKPPPPPPSSDO...',
    '..OO..OPPPSSPPPPSSDO....',
    '......OSSDDDDDDSSDO.....',
    '......OPSO....OPSO......',
    '......OPSO....OPSO......',
    '.....OADDO...OADDO......',
    '.....OOOOO...OOOOO......',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  construct: [
    '........................',
    '........................',
    '......OOOOOOOOOO........',
    '.....OHHHHHHHHHHO.......',
    '....OHLLPPPPPPPLHO......',
    '....OLPPPPPPPPPPPO......',
    '...OOHPPEBWWBEPPPOO.....',
    '..OHPOOPPEAAEEPPOPHO....',
    '..OLPOOPPPPPPPPPOPSO....',
    '.OHLPOOPPPBBPPPOPPPSO...',
    '.OLPPOOPPBAAABPOPPPSO...',
    '.OPPSOOPPBAAABPOPSSDO...',
    '.OSSDOOPPPKKKPPOPSSDO...',
    '..OODOOPPPPPPPPOPDDO....',
    '...OO..OPSSSSPO..OO.....',
    '.......OODDDDOO.........',
    '......OPSO..OPSO........',
    '......OPSO..OPSO........',
    '......OSSO..OSSO........',
    '.....OADDO..OADDO.......',
    '.....OOOOO..OOOOO.......',
    '........................',
    '........................',
    '........................',
  ],
  amorphous: [
    '........................',
    '........................',
    '.........OOOOO..........',
    '........OBAAAAO.........',
    '.......OBHLLPPPO........',
    '......OHLLPPPPPPO.......',
    '.....OHLPPPPPPPPPO......',
    '....OHLPPPPPPPPPPPO.....',
    '....OLPEWPPPPPEWPPO.....',
    '....OLPEEPPPPPEEPPO.....',
    '....OPPPPPPPPPPPPPO.....',
    '...OHLPPPBBBBBPPPLHO....',
    '...OLPPPBAAAAABPPPSO....',
    '...OPPPPPKKKKKPPPPSO....',
    '...OSSPPPPPPPPPPPSSO....',
    '....OSSPPPPPPPPPSSDO....',
    '.....OODSSPPPPSSDDO.....',
    '.......OODDDDDDDOO......',
    '...OO....OOOOOOO....OO..',
    '..OBAO.............OBAO.',
    '...OO...............OO..',
    '........................',
    '........................',
    '........................',
  ],
  flora: [
    '........................',
    '...OOOOO......OOOOO.....',
    '..OBAAAAO....OBAAAAO....',
    '.OBBAAAABO..OBBAAAABO...',
    '..OBKKAAHO..OHAAKKBO....',
    '....OOOHHO..OHHOOO......',
    '.......OOOOOOOO.........',
    '.....OOHLLPPPPLHOO......',
    '....OHLPPPPPPPPPLHO.....',
    '....OLPEWPPPPPEWPPO.....',
    '....OLPEEPPPPPEEPPO.....',
    '....OPPPPPPPPPPPPPO.....',
    '...OOBBAAAAAAAAABBOO....',
    '..OBAKKPPPPPPPPPKKABO...',
    '...OO.OLPPPPPPPPO.OO....',
    '......OPPPPPPPPSO.......',
    '......OSSPPPPPSSO.......',
    '.....OHO.OSSDDO.OHO.....',
    '....OHOO.OPSO...OHOO....',
    '....OOO..OSSO....OOO....',
    '.........OOOO...........',
    '........................',
    '........................',
    '........................',
  ],
  crystalline: [
    '........................',
    '..........OOO...........',
    '.........OBBBO..........',
    '........OBAAABO.........',
    '...OO..OHHLLLHHO..OO....',
    '..OBAO.OHLLPPPSO.OBAO...',
    '..OAKOOHLLPPPPPSO.OKO...',
    '...OOOHLPBBBBPPPSO.OO...',
    '.....OHLPBAAABPPPSO.....',
    '....OHLPPEWPEWPPPSO.....',
    '....OLPPPEEPEEPPPSO.....',
    '....OLPPPBBBBBPPPSO.....',
    '....OPPPPBKKKBPPPSO.....',
    '.....OPPPPPPPPPPSSO.....',
    '.....OSSPPPPPPPSSDO.....',
    '......OSSPPPPPSSDO......',
    '...OO..OSSPPPSSDO..OO...',
    '..OBAO..OSSPSSDO..OBAO..',
    '..OAKO...OSSDDO...OAKO..',
    '...OO.....ODDO.....OO...',
    '...........OO...........',
    '........................',
    '........................',
    '........................',
  ],
};

interface PixelRun {
  row: number;
  col: number;
  len: number;
  code: string;
}

interface CompiledArchetypeGrid {
  runs: PixelRun[];
  rimRuns: Array<{ row: number; col: number; len: number }>;
  crestAnchor: { col: number; row: number };
}

/**
 * Precompiles horizontal pixel runs and exterior rim-halo runs once at module load
 * so offline rig rendering performs zero neighbor scans per frame.
 */
function compileArchetypeGrids(): Record<BodyArchetype, CompiledArchetypeGrid> {
  const out = {} as Record<BodyArchetype, CompiledArchetypeGrid>;
  for (const arch of FALLBACK_ARCHETYPE_ORDER) {
    const grid = PIXEL_GRIDS[arch];
    const rows = grid.length;
    const cols = grid[0]?.length ?? GRID_SIZE;
    const runs: PixelRun[] = [];
    const rimRuns: Array<{ row: number; col: number; len: number }> = [];
    let topBodyRow = rows;
    let topBodyColSum = 0;
    let topBodyCount = 0;

    for (let r = 0; r < rows; r++) {
      const line = grid[r];
      let c = 0;
      while (c < cols) {
        const ch = line[c] ?? '.';
        if (ch === '.') {
          c += 1;
          continue;
        }
        if (r < topBodyRow && ch !== 'O') {
          topBodyRow = r;
        }
        if (r === topBodyRow && ch !== 'O') {
          topBodyColSum += c;
          topBodyCount += 1;
        }
        let end = c + 1;
        while (end < cols && line[end] === ch) {
          end += 1;
        }
        runs.push({ row: r, col: c, len: end - c, code: ch });
        c = end;
      }
    }

    // Precompute merged horizontal runs for the 1-cell luminous exterior rim halo
    for (let r = -1; r <= rows; r++) {
      let c = -1;
      while (c <= cols) {
        const cur = r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : '.';
        const touchesBody =
          cur === '.' &&
          ((r > 0 && c >= 0 && c < cols && grid[r - 1][c] !== '.') ||
            (r + 1 < rows && c >= 0 && c < cols && grid[r + 1][c] !== '.') ||
            (c > 0 && r >= 0 && r < rows && grid[r][c - 1] !== '.') ||
            (c + 1 < cols && r >= 0 && r < rows && grid[r][c + 1] !== '.'));
        if (!touchesBody) {
          c += 1;
          continue;
        }
        const start = c;
        c += 1;
        while (c <= cols) {
          const nextCur = r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : '.';
          const nextTouches =
            nextCur === '.' &&
            ((r > 0 && c >= 0 && c < cols && grid[r - 1][c] !== '.') ||
              (r + 1 < rows && c >= 0 && c < cols && grid[r + 1][c] !== '.') ||
              (c > 0 && r >= 0 && r < rows && grid[r][c - 1] !== '.') ||
              (c + 1 < cols && r >= 0 && r < rows && grid[r][c + 1] !== '.'));
          if (!nextTouches) break;
          c += 1;
        }
        rimRuns.push({ row: r, col: start, len: c - start });
      }
    }

    const crestCol =
      topBodyCount > 0 ? Math.round(topBodyColSum / topBodyCount) : Math.floor(cols * 0.42);
    out[arch] = {
      runs,
      rimRuns,
      crestAnchor: {
        col: clamp(crestCol, 3, cols - 4),
        row: clamp(topBodyRow + 1, 2, rows - 5),
      },
    };
  }
  return out;
}

const COMPILED_GRIDS = compileArchetypeGrids();

interface ResolvedPixelPalette {
  outline: string;
  deepShadow: string;
  shadow: string;
  primary: string;
  light: string;
  highlight: string;
  accent: string;
  accentBright: string;
  accentShadow: string;
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
  // Authentic 16-bit hue-shifted shading: cool indigo shadows, warm cream highlights
  const shadow = mixHex(primary, mixHex(typePal.dark, '#26235c', 0.35), 0.46);
  const deepShadow = mixHex(shadow, '#141238', 0.52);
  const light = mixHex(primary, '#fff8e8', 0.28);
  const highlight = mixHex(primary, '#fffdf4', 0.58);
  const accentBright = mixHex(accent, '#ffffff', 0.48);
  const accentShadow = mixHex(accent, mixHex(typePal.dark, '#1e1a44', 0.45), 0.46);
  const outline = mixHex(typePal.dark, '#0f0c24', 0.72);

  return {
    outline,
    deepShadow,
    shadow,
    primary,
    light,
    highlight,
    accent,
    accentBright,
    accentShadow,
    eye: '#141128',
    eyeWhite: '#ffffff',
  };
}

function resolveCodeColor(code: string, pal: ResolvedPixelPalette, isHitFlash: boolean): string {
  if (isHitFlash) return code === 'O' ? '#fff4b8' : '#ffffff';
  switch (code) {
    case 'O':
      return pal.outline;
    case 'D':
      return pal.deepShadow;
    case 'S':
      return pal.shadow;
    case 'P':
      return pal.primary;
    case 'L':
      return pal.light;
    case 'H':
      return pal.highlight;
    case 'A':
      return pal.accent;
    case 'B':
      return pal.accentBright;
    case 'K':
      return pal.accentShadow;
    case 'E':
      return pal.eye;
    case 'W':
      return pal.eyeWhite;
    default:
      return pal.primary;
  }
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
 * High-Craft Pixel-Art Offline Companion Synthesizer.
 * Renders crisp 48x48 palette-remapped sprites from `fallbacks-atlas.png` when attached,
 * and falls back to bespoke 24x24 multi-tone pixel-grid creatures (ZERO ovals/curves!)
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
    const archetype: BodyArchetype = COMPILED_GRIDS[rig.archetype] ? rig.archetype : 'biped';
    const compiled = COMPILED_GRIDS[archetype];
    const px = Math.max(2, Math.floor(drawSize / GRID_SIZE));
    const totalW = px * GRID_SIZE;
    const ox = -Math.round(totalW * 0.5);
    const oy = -Math.round(totalW * 0.5);

    // Precompiled exterior luminous starlight rim-halo (pure fillRect, zero ovals, zero neighbor loops)
    if (!isHitFlash && ctx.globalAlpha >= 0.5) {
      ctx.fillStyle = 'rgba(232, 244, 255, 0.46)';
      const rimRuns = compiled.rimRuns;
      for (let i = 0; i < rimRuns.length; i++) {
        const rr = rimRuns[i];
        ctx.fillRect(ox + rr.col * px, oy + rr.row * px, rr.len * px, px);
      }
    }

    const runs = compiled.runs;
    let lastColor = '';
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const color = resolveCodeColor(run.code, pal, isHitFlash);
      if (color !== lastColor) {
        ctx.fillStyle = color;
        lastColor = color;
      }
      ctx.fillRect(ox + run.col * px, oy + run.row * px, run.len * px, px);
    }

    // Species-seeded pixel crest / cheek gem accents so species within the same archetype stay distinctive
    if (!isHitFlash) {
      const h = hashSpecies(rig.speciesId);
      const { col, row } = compiled.crestAnchor;
      if ((h & 3) === 1) {
        ctx.fillStyle = pal.accentBright;
        ctx.fillRect(ox + col * px, oy + row * px, px * 2, px);
      } else if ((h & 3) === 2) {
        ctx.fillStyle = pal.accent;
        ctx.fillRect(ox + (col - 1) * px, oy + (row + 1) * px, px, px);
        ctx.fillStyle = pal.accentBright;
        ctx.fillRect(ox + col * px, oy + row * px, px, px);
      } else if ((h & 3) === 3) {
        ctx.fillStyle = pal.highlight;
        ctx.fillRect(ox + col * px, oy + (row + 1) * px, px, px);
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
    const h = hashSpecies(rig.speciesId);
    const phase = ((h & 63) / 63) * Math.PI * 2;
    const motionScale = options.reducedMotion ? 0.14 : 1.0;
    const t = options.time * motionScale;

    const pixelUnit = Math.max(2, Math.round(size / 24));
    const bobPx = options.reducedMotion
      ? 0
      : Math.round(Math.sin(t * 3.4 + phase) * 1.4) * pixelUnit;

    const hitFlash = clamp(options.hitFlash ?? 0, 0, 1);
    const dirSign = options.facing === 'right' ? -1 : 1;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(options.cx), Math.round(options.cy - bobPx));
    if (dirSign < 0) {
      ctx.scale(-1, 1);
    }

    const auraPx = Math.max(2, Math.round(size / 18));
    const sheet = this.fallbackSheet;
    const region = isDrawableSheet(sheet) ? this.resolveRegion(rig.archetype) : null;

    if (sheet && region && isDrawableSheet(sheet)) {
      const drawSize = Math.max(48, Math.round(size / 4) * 4);
      const halfDraw = Math.round(drawSize * 0.5);

      // Dual-contrast pixel-art silhouette contour behind the 48x48 archetype sprite
      if (ctx.globalAlpha >= 0.5) {
        const contour = getAtlasRegionSilhouetteContour(sheet, region);
        if (contour) {
          const padPx = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * drawSize) / Math.max(1, region.w)));
          ctx.drawImage(
            contour,
            0,
            0,
            contour.width,
            contour.height,
            -halfDraw - padPx,
            -halfDraw - padPx,
            drawSize + padPx * 2,
            drawSize + padPx * 2,
          );
        }
      }

      const tintedSprite = getPaletteTintedAtlasRegion(
        sheet,
        region,
        pal.primary,
        pal.accent,
        Boolean(rig.shiny),
      );
      if (tintedSprite) {
        ctx.drawImage(
          tintedSprite,
          0,
          0,
          tintedSprite.width,
          tintedSprite.height,
          -halfDraw,
          -halfDraw,
          drawSize,
          drawSize,
        );
      } else {
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
      }

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
      const drawSize = Math.max(48, Math.round(size));
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

    // Crisp 24x24 pixel-art SVG data URL fallback (run-length merged for compact SVGs)
    const pal = resolvePixelPalette(rig);
    const archetype: BodyArchetype = COMPILED_GRIDS[rig.archetype] ? rig.archetype : 'biped';
    const runs = COMPILED_GRIDS[archetype].runs;
    const rects: string[] = [];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const fill = resolveCodeColor(run.code, pal, false);
      rects.push(`<rect x="${run.col}" y="${run.row}" width="${run.len}" height="1" fill="${fill}"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${GRID_SIZE} ${GRID_SIZE}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
