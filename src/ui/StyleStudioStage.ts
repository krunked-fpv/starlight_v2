import type {
  AuraId,
  BodyArchetype,
  CapeId,
  HeadgearId,
  IOfflineSpriteRigSynthesizer,
  OfflineRigDescriptor,
  OutfitId,
  SpeciesRecord,
  StyleLoadout,
  TrainerProfile,
  UIBridgeCallbacks,
} from '../contracts';
import {
  AURA_BY_ID,
  getSpecies,
  STYLE_AURAS,
  STYLE_CAPES,
  STYLE_HEADGEAR,
  STYLE_OUTFITS,
  TYPE_PALETTES,
} from '../core';
import { iconSvg, safeText } from './iconHelper';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawArchetypeSilhouette(
  ctx: CanvasRenderingContext2D,
  archetype: BodyArchetype,
  r: number,
  primary: string,
  secondary: string,
  glow: string,
  time: number,
  seed: number,
): void {
  const pulse = Math.sin(time * 2.4 + seed) * 0.06;

  // Back wings / fins / dorsal crests per archetype
  ctx.save();
  if (archetype === 'avian' || archetype === 'draconic') {
    const flap = Math.sin(time * 3.6 + seed) * r * 0.16;
    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.08);
    ctx.quadraticCurveTo(-r * 0.92, -r * 0.62 - flap, -r * 0.78, r * 0.12 - flap * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.08);
    ctx.quadraticCurveTo(r * 0.92, -r * 0.62 - flap, r * 0.78, r * 0.12 - flap * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (archetype === 'insectoid') {
    const flutter = Math.sin(time * 8 + seed) * r * 0.12;
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-r * 0.48, -r * 0.25 + flutter * 0.4, r * 0.36, r * 0.2, -0.45, 0, Math.PI * 2);
    ctx.ellipse(r * 0.48, -r * 0.25 - flutter * 0.4, r * 0.36, r * 0.2, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (archetype === 'ethereal') {
    ctx.strokeStyle = glow;
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (0.78 + pulse), r * (0.34 - pulse * 0.4), -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Main body volume with radial shading
  const bodyGrad = ctx.createRadialGradient(-r * 0.22, -r * 0.28, r * 0.08, 0, 0, r * 0.76);
  bodyGrad.addColorStop(0, glow);
  bodyGrad.addColorStop(0.42, primary);
  bodyGrad.addColorStop(1, secondary);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
  ctx.lineWidth = Math.max(1.4, r * 0.055);

  ctx.beginPath();
  if (archetype === 'crystalline') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r * 0.68 : r * 0.54;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (archetype === 'serpentine') {
    ctx.moveTo(-r * 0.48, r * 0.48);
    ctx.bezierCurveTo(-r * 0.62, 0, r * 0.42, r * 0.28, r * 0.14, -r * 0.48);
    ctx.bezierCurveTo(r * 0.44, -r * 0.56, r * 0.62, -r * 0.18, r * 0.24, r * 0.06);
    ctx.bezierCurveTo(r * 0.52, r * 0.34, -r * 0.12, r * 0.68, -r * 0.48, r * 0.48);
    ctx.closePath();
  } else if (archetype === 'aquatic') {
    ctx.ellipse(0, r * 0.04, r * 0.64, r * 0.42, -0.08, 0, Math.PI * 2);
  } else if (archetype === 'armored') {
    roundRectPath(ctx, -r * 0.54, -r * 0.52, r * 1.08, r * 1.02, r * 0.24);
  } else if (archetype === 'quadruped') {
    ctx.ellipse(0, r * 0.06, r * 0.56, r * 0.44, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, r * 0.5, r * 0.56, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  // Ears / horns / crest detail
  ctx.fillStyle = primary;
  if (archetype === 'quadruped' || archetype === 'biped' || archetype === 'draconic') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.36, -r * 0.3);
    ctx.lineTo(-r * 0.52, -r * 0.72);
    ctx.lineTo(-r * 0.12, -r * 0.44);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(r * 0.36, -r * 0.3);
    ctx.lineTo(r * 0.52, -r * 0.72);
    ctx.lineTo(r * 0.12, -r * 0.44);
    ctx.closePath();
    ctx.fill();
  } else if (archetype === 'aquatic') {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(-r * 0.56, r * 0.02);
    ctx.lineTo(-r * 0.88, -r * 0.24);
    ctx.lineTo(-r * 0.82, r * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // Expressive luminous eyes
  const eyeY = archetype === 'serpentine' ? -r * 0.28 : -r * 0.08;
  const eyeX = archetype === 'serpentine' ? r * 0.18 : r * 0.21;
  ctx.fillStyle = '#0d132c';
  ctx.beginPath();
  ctx.ellipse(-eyeX, eyeY, r * 0.09, r * 0.11, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeX, eyeY, r * 0.09, r * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-eyeX + r * 0.02, eyeY - r * 0.03, r * 0.036, 0, Math.PI * 2);
  ctx.arc(eyeX + r * 0.02, eyeY - r * 0.03, r * 0.036, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSpeciesPortrait(
  ctx: CanvasRenderingContext2D,
  species: SpeciesRecord,
  synth: IOfflineSpriteRigSynthesizer | null,
  options: {
    cx: number;
    cy: number;
    size: number;
    time: number;
    facing?: 'left' | 'right';
    shiny?: boolean;
    reducedMotion?: boolean;
    rimColor?: string;
  },
): void {
  const pal = TYPE_PALETTES[species.primaryType];
  const rig: OfflineRigDescriptor = {
    speciesId: species.id,
    name: species.name,
    primaryType: species.primaryType,
    secondaryType: species.secondaryType,
    archetype: species.archetype,
    palette: species.palette,
    shiny: options.shiny,
  };

  if (synth) {
    synth.renderRig(ctx, rig, {
      cx: options.cx,
      cy: options.cy,
      size: options.size,
      time: options.time,
      facing: options.facing ?? 'left',
      rimColor: options.rimColor ?? pal.glow,
      reducedMotion: options.reducedMotion,
    });
    return;
  }

  // Built-in procedural vector emblem fallback (compiles & renders cleanly standalone)
  const motionScale = options.reducedMotion ? 0 : 1;
  const bob = Math.sin(options.time * 2.6 + species.id * 0.37) * options.size * 0.035 * motionScale;
  const r = options.size * 0.42;
  const primary = options.shiny ? '#ffd566' : species.palette[0] || pal.primary;
  const secondary = options.shiny ? '#7ce8ff' : species.palette[1] || pal.secondary;
  const glow = options.shiny ? '#fff8d6' : species.palette[2] || pal.glow;

  ctx.save();
  ctx.translate(options.cx, options.cy + bob);
  if (options.facing === 'right') {
    ctx.scale(-1, 1);
  }

  // Soft elemental halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 1.15);
  halo.addColorStop(0, `${glow}44`);
  halo.addColorStop(0.6, `${primary}22`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
  ctx.fill();

  drawArchetypeSilhouette(ctx, species.archetype, r, primary, secondary, glow, options.time * motionScale, species.id);

  // Shiny prism glints
  if (options.shiny) {
    ctx.fillStyle = '#fff9c4';
    const glint = (gx: number, gy: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(gx, gy - s);
      ctx.lineTo(gx + s * 0.32, gy - s * 0.32);
      ctx.lineTo(gx + s, gy);
      ctx.lineTo(gx + s * 0.32, gy + s * 0.32);
      ctx.lineTo(gx, gy + s);
      ctx.lineTo(gx - s * 0.32, gy + s * 0.32);
      ctx.lineTo(gx - s, gy);
      ctx.lineTo(gx - s * 0.32, gy - s * 0.32);
      ctx.closePath();
      ctx.fill();
    };
    glint(-r * 0.72, -r * 0.62, r * 0.18);
    glint(r * 0.74, -r * 0.44, r * 0.14);
  }

  ctx.restore();
}

export function drawTrainerCharacter(
  ctx: CanvasRenderingContext2D,
  style: StyleLoadout,
  options: {
    cx: number;
    cy: number;
    scale?: number;
    time: number;
    facing?: 'left' | 'right' | 'front';
    reducedMotion?: boolean;
  },
): void {
  const s = options.scale ?? 1;
  const motion = options.reducedMotion ? 0 : 1;
  const t = options.time * motion;
  const bob = Math.sin(t * 2.8) * 2.2 * s;
  const outfit = STYLE_OUTFITS.find((o) => o.id === style.outfit) ?? STYLE_OUTFITS[0];
  const cape = STYLE_CAPES.find((c) => c.id === style.cape) ?? STYLE_CAPES[0];
  const headgear = STYLE_HEADGEAR.find((h) => h.id === style.headgear) ?? STYLE_HEADGEAR[0];
  const aura = AURA_BY_ID[style.aura] ?? STYLE_AURAS[0];

  ctx.save();
  ctx.translate(options.cx, options.cy);
  if (options.facing === 'left') {
    ctx.scale(-1, 1);
  }
  ctx.scale(s, s);

  // 1. Equipped Aura behind character
  if (aura.id !== 'none') {
    ctx.save();
    const auraGrad = ctx.createRadialGradient(0, -18, 6, 0, -18, 56);
    auraGrad.addColorStop(0, `${aura.primaryHex}66`);
    auraGrad.addColorStop(0.55, `${aura.secondaryHex}30`);
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, -18, 56, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = aura.primaryHex;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.72;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + t * 1.1;
      const rx = Math.cos(angle) * 34;
      const ry = -20 + Math.sin(angle) * 24;
      ctx.beginPath();
      ctx.arc(rx, ry, aura.id === 'sky-thunder' ? 2.6 : 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (aura.id === 'aurora') {
      ctx.strokeStyle = aura.secondaryHex;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -18, 38, 16, Math.sin(t * 0.8) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    } else if (aura.id === 'ember-crown') {
      ctx.fillStyle = aura.primaryHex;
      for (let i = 0; i < 4; i++) {
        const lift = ((t * 18 + i * 11) % 34);
        const px = Math.sin(i * 2.1 + t * 2) * 22;
        ctx.globalAlpha = Math.max(0.1, 0.85 - lift / 36);
        ctx.beginPath();
        ctx.arc(px, 6 - lift, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(4, 8, 22, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 32, 20, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, bob);

  // 2. Flowing Cape
  if (cape.id !== 'none') {
    const wave = Math.sin(t * 3.1) * 5;
    const capeGrad = ctx.createLinearGradient(-18, -16, 18, 28);
    capeGrad.addColorStop(0, cape.primaryHex);
    capeGrad.addColorStop(1, cape.secondaryHex);
    ctx.fillStyle = capeGrad;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, -16);
    ctx.quadraticCurveTo(-24 - wave * 0.4, 8, -22 + wave, 26);
    ctx.lineTo(22 + wave, 26);
    ctx.quadraticCurveTo(24 + wave * 0.4, 8, 12, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (cape.id === 'starweave') {
      ctx.fillStyle = '#fff8c4';
      ctx.fillRect(-10 + wave * 0.4, 4, 2.2, 2.2);
      ctx.fillRect(6 + wave * 0.5, 13, 2.2, 2.2);
    }
  }

  // 3. Legs & Boots
  ctx.fillStyle = '#1d2747';
  ctx.fillRect(-9, 10, 7, 15);
  ctx.fillRect(2, 10, 7, 15);
  ctx.fillStyle = outfit.secondaryHex;
  ctx.fillRect(-10, 22, 9, 7);
  ctx.fillRect(1, 22, 9, 7);

  // 4. Torso & Outfit Coat/Tunic
  const torsoGrad = ctx.createLinearGradient(-14, -18, 14, 14);
  torsoGrad.addColorStop(0, outfit.primaryHex);
  torsoGrad.addColorStop(1, '#121a3a');
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = outfit.secondaryHex;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  roundRectPath(ctx, -14, -18, 28, 30, 8);
  ctx.fill();
  ctx.stroke();

  // Outfit collar & emblem clasp
  ctx.fillStyle = outfit.secondaryHex;
  ctx.beginPath();
  ctx.moveTo(-6, -17);
  ctx.lineTo(0, -8);
  ctx.lineTo(6, -17);
  ctx.closePath();
  ctx.fill();

  // Arms
  ctx.fillStyle = outfit.primaryHex;
  ctx.beginPath();
  roundRectPath(ctx, -20, -14, 6, 20, 3);
  ctx.fill();
  ctx.beginPath();
  roundRectPath(ctx, 14, -14, 6, 20, 3);
  ctx.fill();

  // 5. Head & Hair
  ctx.fillStyle = '#f8d7be';
  ctx.beginPath();
  ctx.arc(0, -30, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.primaryAccent || '#30448a';
  ctx.beginPath();
  ctx.arc(0, -33, 12.6, Math.PI, Math.PI * 2);
  ctx.lineTo(12, -28);
  ctx.quadraticCurveTo(4, -34, 0, -29);
  ctx.quadraticCurveTo(-5, -34, -12, -28);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#151c3b';
  ctx.beginPath();
  ctx.arc(-4.2, -29, 1.8, 0, Math.PI * 2);
  ctx.arc(4.2, -29, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 6. Headgear
  if (headgear.id === 'star-beret') {
    ctx.fillStyle = headgear.primaryHex;
    ctx.beginPath();
    ctx.ellipse(1, -41, 14, 6.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = headgear.secondaryHex;
    ctx.beginPath();
    ctx.arc(6, -41, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (headgear.id === 'sky-goggles') {
    ctx.fillStyle = headgear.primaryHex;
    ctx.fillRect(-12, -41, 24, 5);
    ctx.fillStyle = headgear.secondaryHex;
    ctx.strokeStyle = headgear.primaryHex;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    roundRectPath(ctx, -10, -42, 8, 6.5, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    roundRectPath(ctx, 2, -42, 8, 6.5, 2);
    ctx.fill();
    ctx.stroke();
  } else if (headgear.id === 'lunar-circlet') {
    ctx.strokeStyle = headgear.primaryHex;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -38, 12, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = headgear.secondaryHex;
    ctx.beginPath();
    ctx.arc(0, -45, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (headgear.id === 'shrine-visor') {
    ctx.fillStyle = headgear.secondaryHex;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    roundRectPath(ctx, -11, -33, 22, 6, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export class StyleStudioStage {
  private canvas: HTMLCanvasElement | null = null;
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private callbacks: UIBridgeCallbacks | null = null;

  private currentProfile: TrainerProfile | null = null;
  private reducedMotion = false;
  private timeSec = 0;

  private outfitButtons = new Map<OutfitId, HTMLButtonElement>();
  private capeButtons = new Map<CapeId, HTMLButtonElement>();
  private headgearButtons = new Map<HeadgearId, HTMLButtonElement>();
  private auraButtons = new Map<AuraId, HTMLButtonElement>();
  private summaryLabel: HTMLElement | null = null;
  private lastMemo = '';

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.outfitButtons.clear();
    this.capeButtons.clear();
    this.headgearButtons.clear();
    this.auraButtons.clear();

    const doc = container.ownerDocument;
    container.innerHTML = `
      <div class="sl-modal-panel sl-glass" role="dialog" aria-modal="true" aria-label="Style Studio Dressing Room">
        <div class="sl-modal-header">
          <h2 class="sl-modal-title">
            ${iconSvg('icon-style', 'sl-icon-md')}
            <span>Style Studio Boutique</span>
          </h2>
          <button type="button" class="sl-btn" data-testid="style-close">Return to Island</button>
        </div>
        <div class="sl-style-body">
          <div class="sl-style-stage-wrap">
            <canvas class="sl-style-canvas" width="300" height="300" data-testid="style-stage-canvas" aria-label="Live Trainer Style Preview"></canvas>
            <div class="sl-pill" data-testid="style-loadout-summary">Starlight Voyager</div>
          </div>
          <div class="sl-style-controls">
            <section>
              <h3 class="sl-style-group-title">Outfits</h3>
              <div class="sl-style-options" data-group="outfits">
                ${STYLE_OUTFITS.map(
                  (o) => `
                  <button type="button" class="sl-style-option" data-testid="style-outfit-${o.id}" data-outfit-id="${o.id}">
                    <span class="sl-style-swatch" style="background: linear-gradient(135deg, ${o.primaryHex}, ${o.secondaryHex});"></span>
                    <span><strong>${safeText(o.name)}</strong><br><small>${safeText(o.description)}</small></span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>
            <section>
              <h3 class="sl-style-group-title">Capes</h3>
              <div class="sl-style-options" data-group="capes">
                ${STYLE_CAPES.map(
                  (c) => `
                  <button type="button" class="sl-style-option" data-testid="style-cape-${c.id}" data-cape-id="${c.id}">
                    <span class="sl-style-swatch" style="background: linear-gradient(135deg, ${c.primaryHex}, ${c.secondaryHex});"></span>
                    <span><strong>${safeText(c.name)}</strong><br><small>${safeText(c.description)}</small></span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>
            <section>
              <h3 class="sl-style-group-title">Headgear</h3>
              <div class="sl-style-options" data-group="headgear">
                ${STYLE_HEADGEAR.map(
                  (h) => `
                  <button type="button" class="sl-style-option" data-testid="style-headgear-${h.id}" data-headgear-id="${h.id}">
                    <span class="sl-style-swatch" style="background: linear-gradient(135deg, ${h.primaryHex}, ${h.secondaryHex});"></span>
                    <span><strong>${safeText(h.name)}</strong><br><small>${safeText(h.description)}</small></span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>
            <section>
              <h3 class="sl-style-group-title">Glowing Auras</h3>
              <div class="sl-style-options" data-group="auras">
                ${STYLE_AURAS.map(
                  (a) => `
                  <button type="button" class="sl-style-option" data-testid="style-aura-${a.id}" data-aura-id="${a.id}">
                    <span class="sl-style-swatch" style="background: linear-gradient(135deg, ${a.primaryHex}, ${a.secondaryHex});"></span>
                    <span><strong>${safeText(a.name)}</strong><br><small>${safeText(a.description)}</small></span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    this.canvas = container.querySelector('[data-testid="style-stage-canvas"]') as HTMLCanvasElement | null;
    this.summaryLabel = container.querySelector('[data-testid="style-loadout-summary"]') as HTMLElement | null;

    const closeBtn = container.querySelector('[data-testid="style-close"]') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });

    STYLE_OUTFITS.forEach((o) => {
      const btn = container.querySelector(`[data-outfit-id="${o.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.outfitButtons.set(o.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ outfit: o.id }));
      }
    });
    STYLE_CAPES.forEach((c) => {
      const btn = container.querySelector(`[data-cape-id="${c.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.capeButtons.set(c.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ cape: c.id }));
      }
    });
    STYLE_HEADGEAR.forEach((h) => {
      const btn = container.querySelector(`[data-headgear-id="${h.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.headgearButtons.set(h.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ headgear: h.id }));
      }
    });
    STYLE_AURAS.forEach((a) => {
      const btn = container.querySelector(`[data-aura-id="${a.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.auraButtons.set(a.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ aura: a.id }));
      }
    });

    // Ensure accessibility attribute on document root if absent
    void doc;
  }

  private applyPatch(
    patch: Partial<{
      outfit: OutfitId;
      cape: CapeId;
      headgear: HeadgearId;
      aura: AuraId;
    }>,
  ): void {
    if (this.currentProfile) {
      this.currentProfile = {
        ...this.currentProfile,
        style: {
          ...this.currentProfile.style,
          ...patch,
        },
      };
      this.syncControls(this.currentProfile);
      this.renderStageCanvas();
    }
    this.callbacks?.onUpdateStyle(patch);
  }

  sync(profile: TrainerProfile, reducedMotion: boolean, active: boolean, timeSec: number): void {
    this.currentProfile = profile;
    this.reducedMotion = reducedMotion;
    this.timeSec = timeSec;
    if (!active) return;

    this.syncControls(profile);
    this.renderStageCanvas();
  }

  private syncControls(profile: TrainerProfile): void {
    const key = [
      profile.style.outfit,
      profile.style.cape,
      profile.style.headgear,
      profile.style.aura,
      profile.unlocks.outfits.join(','),
      profile.unlocks.capes.join(','),
      profile.unlocks.headgear.join(','),
      profile.unlocks.auras.join(','),
    ].join('|');

    if (key === this.lastMemo) return;
    this.lastMemo = key;

    for (const [id, btn] of this.outfitButtons) {
      const unlocked = profile.unlocks.outfits.includes(id);
      const equipped = profile.style.outfit === id;
      btn.disabled = !unlocked;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.capeButtons) {
      const unlocked = profile.unlocks.capes.includes(id);
      const equipped = profile.style.cape === id;
      btn.disabled = !unlocked;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.headgearButtons) {
      const unlocked = profile.unlocks.headgear.includes(id);
      const equipped = profile.style.headgear === id;
      btn.disabled = !unlocked;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.auraButtons) {
      const unlocked = profile.unlocks.auras.includes(id);
      const equipped = profile.style.aura === id;
      btn.disabled = !unlocked;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }

    if (this.summaryLabel) {
      const outfitName = STYLE_OUTFITS.find((o) => o.id === profile.style.outfit)?.name ?? profile.style.outfit;
      const auraName = AURA_BY_ID[profile.style.aura]?.name ?? profile.style.aura;
      this.summaryLabel.textContent = `${profile.name} • ${outfitName} • ${auraName}`;
    }
  }

  renderStageCanvas(): void {
    if (!this.canvas || !this.currentProfile) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const w = this.canvas.width || 300;
    const h = this.canvas.height || 300;
    const t = this.reducedMotion ? 0 : this.timeSec;
    const profile = this.currentProfile;
    const aura = AURA_BY_ID[profile.style.aura];

    ctx.clearRect(0, 0, w, h);

    // Twilight dressing-room backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a102b');
    bg.addColorStop(0.62, '#1a2a60');
    bg.addColorStop(1, '#090e24');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle rising spotlight beam
    const beam = ctx.createLinearGradient(w * 0.5, 16, w * 0.5, h * 0.84);
    beam.addColorStop(0, 'rgba(124, 232, 255, 0.04)');
    beam.addColorStop(0.75, `${aura?.primaryHex ?? '#7ce8ff'}2e`);
    beam.addColorStop(1, 'rgba(255, 213, 102, 0.2)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, 10);
    ctx.lineTo(w * 0.66, 10);
    ctx.lineTo(w * 0.88, h * 0.82);
    ctx.lineTo(w * 0.12, h * 0.82);
    ctx.closePath();
    ctx.fill();

    // Animated celestial pedestal
    const pedX = w * 0.5;
    const pedY = h * 0.78;
    const pedGrad = ctx.createRadialGradient(pedX, pedY, 10, pedX, pedY, 110);
    pedGrad.addColorStop(0, 'rgba(124, 232, 255, 0.55)');
    pedGrad.addColorStop(0.65, 'rgba(59, 110, 245, 0.25)');
    pedGrad.addColorStop(1, 'rgba(9, 14, 36, 0.92)');
    ctx.fillStyle = pedGrad;
    ctx.strokeStyle = '#ffd566';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pedX, pedY, 106, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rotating constellation notches on pedestal rim
    ctx.fillStyle = '#fff59d';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.6;
      const rx = pedX + Math.cos(a) * 94;
      const ry = pedY + Math.sin(a) * 21;
      ctx.beginPath();
      ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active Trainer wearing Outfit + Cape + Headgear + Aura
    drawTrainerCharacter(ctx, profile.style, {
      cx: w * 0.38,
      cy: h * 0.62,
      scale: 1.55,
      time: t,
      facing: 'front',
      reducedMotion: this.reducedMotion,
    });

    // Lead Partner standing beside trainer
    const lead = profile.party[0];
    if (lead) {
      const species = getSpecies(lead.speciesId);
      drawSpeciesPortrait(ctx, species, this.rigSynthesizer, {
        cx: w * 0.68,
        cy: h * 0.64,
        size: 86,
        time: t,
        facing: 'left',
        shiny: lead.shiny,
        reducedMotion: this.reducedMotion,
      });
    }
  }

  dispose(): void {
    this.outfitButtons.clear();
    this.capeButtons.clear();
    this.headgearButtons.clear();
    this.auraButtons.clear();
    this.canvas = null;
    this.summaryLabel = null;
    this.callbacks = null;
  }
}
