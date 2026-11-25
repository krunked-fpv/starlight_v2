import type {
  AtlasManifest,
  DecodedSpriteFrames,
  DojoProfileState,
  IOfflineSpriteRigSynthesizer,
  ResolvedTrainerLook,
  TrainerAccessoryId,
  TrainerAuraId,
  TrainerStyleId,
  UIBridgeCallbacks,
} from '../contracts';
import {
  getAllTrainerAccessories,
  getAllTrainerAuras,
  getAllTrainerStyles,
  getCleanTrainerName,
  getResolvedTrainerLook,
  getSpeciesEntry,
} from '../core';
import {
  createIconSvg,
  drawPixelArchetypeSprite,
  renderPokemonPreviewCanvas,
  renderTrainerPortraitCanvas,
  safeText,
} from './iconHelper';

export interface StyleStudioAssets {
  manifest: AtlasManifest | null;
  charactersSheet: CanvasImageSource | null;
  fallbacksSheet: CanvasImageSource | null;
  leadFrames: DecodedSpriteFrames | null;
}

export function drawPixelTrainerStageCharacter(
  ctx: CanvasRenderingContext2D,
  look: ResolvedTrainerLook,
  options: {
    cx: number;
    cy: number;
    scale?: number;
    time: number;
    reducedMotion?: boolean;
    charactersSheet?: CanvasImageSource | null;
    manifest?: AtlasManifest | null;
  },
): void {
  const s = options.scale ?? 1;
  const motion = options.reducedMotion ? 0 : 1;
  const t = options.time * motion;
  const bob = Math.round(Math.sin(t * 2.8) * 2 * s);

  ctx.save();
  ctx.translate(Math.round(options.cx), Math.round(options.cy));
  ctx.imageSmoothingEnabled = false;

  // 1. Equipped Aura behind character (6 distinct pixel effects)
  if (look.aura !== 'none') {
    const auraColors: Record<TrainerAuraId, [string, string]> = {
      none: ['#94a3b8', '#64748b'],
      stars: ['#fde047', '#fef08a'],
      hearts: ['#f472b6', '#fbcfe8'],
      lightning: ['#38bdf8', '#fde047'],
      blossom: ['#fb7185', '#fbcfe8'],
      cosmic: ['#2dd4bf', '#c084fc'],
    };
    const [pCol, sCol] = auraColors[look.aura] ?? auraColors.stars;
    const rad = Math.round(48 * s);
    const auraGrad = ctx.createRadialGradient(0, -14 * s, 4, 0, -14 * s, rad);
    auraGrad.addColorStop(0, `${pCol}66`);
    auraGrad.addColorStop(0.6, `${sCol}28`);
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(-rad, -14 * s - rad, rad * 2, rad * 2);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * 1.4;
      const ox = Math.round(Math.cos(ang) * 28 * s);
      const oy = Math.round(-16 * s + Math.sin(ang) * 20 * s);
      ctx.fillStyle = i % 2 === 0 ? pCol : sCol;
      ctx.fillRect(ox - 2, oy - 2, 4, 4);
    }
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(4, 8, 22, 0.55)';
  ctx.fillRect(Math.round(-16 * s), Math.round(24 * s), Math.round(32 * s), Math.round(6 * s));

  ctx.translate(0, bob);

  // 2. Cape behind torso
  if (look.cape) {
    const sway = Math.round(Math.sin(t * 3.2) * 3 * s);
    ctx.fillStyle = look.accentDark;
    ctx.fillRect(Math.round(-17 * s + sway * 0.4), Math.round(-12 * s), Math.round(34 * s), Math.round(34 * s));
    ctx.fillStyle = look.outfitSecondary;
    ctx.fillRect(Math.round(-15 * s + sway * 0.4), Math.round(16 * s), Math.round(30 * s), Math.round(4 * s));
  }

  // 3. Curated Pixel JRPG Character Sprite from characters-atlas (with live outfit accent badge & crisp accessory overlay)
  const regionId = `${look.id}_down`;
  const charRegion = options.manifest?.sheets?.characters?.regions?.[regionId];
  const px = Math.max(2, Math.round(2.4 * s));

  if (options.charactersSheet && charRegion && charRegion.w > 0 && charRegion.h > 0) {
    const drawSize = Math.round(48 * s);
    const dx = Math.round(-drawSize * 0.5);
    const dy = Math.round(-drawSize * 0.52);

    // Draw crisp nearest-neighbor pixel trainer sprite
    ctx.drawImage(
      options.charactersSheet,
      charRegion.x,
      charRegion.y,
      charRegion.w,
      charRegion.h,
      dx,
      dy,
      drawSize,
      drawSize,
    );

    // Subtle outfit color sash / accent scarf when non-default outfit style is equipped
    if (look.styleId !== 'default') {
      ctx.fillStyle = look.outfitPrimary;
      ctx.fillRect(Math.round(-9 * s), Math.round(1 * s), Math.round(18 * s), Math.round(5 * s));
      ctx.fillStyle = look.outfitSecondary;
      ctx.fillRect(Math.round(-3 * s), Math.round(1 * s), Math.round(6 * s), Math.round(9 * s));
      ctx.fillStyle = look.accent;
      ctx.fillRect(Math.round(-9 * s), Math.round(1 * s), Math.round(18 * s), Math.round(2 * s));
    }

    // Crisp pixel accessory overlay anchored accurately to the sprite's head
    switch (look.accessory) {
      case 'crown':
        ctx.fillStyle = '#ffd566';
        ctx.fillRect(Math.round(-9 * s), Math.round(-26 * s), Math.round(18 * s), Math.round(4 * s));
        ctx.fillRect(Math.round(-9 * s), Math.round(-30 * s), Math.round(4 * s), Math.round(4 * s));
        ctx.fillRect(Math.round(-2 * s), Math.round(-31 * s), Math.round(4 * s), Math.round(5 * s));
        ctx.fillRect(Math.round(5 * s), Math.round(-30 * s), Math.round(4 * s), Math.round(4 * s));
        break;
      case 'wizard':
        ctx.fillStyle = look.accentDark;
        ctx.fillRect(Math.round(-14 * s), Math.round(-24 * s), Math.round(28 * s), Math.round(4 * s));
        ctx.fillRect(Math.round(-9 * s), Math.round(-33 * s), Math.round(18 * s), Math.round(9 * s));
        ctx.fillRect(Math.round(-4 * s), Math.round(-38 * s), Math.round(8 * s), Math.round(5 * s));
        ctx.fillStyle = '#ffd566';
        ctx.fillRect(Math.round(-9 * s), Math.round(-26 * s), Math.round(18 * s), Math.round(2 * s));
        break;
      case 'headband':
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(-11 * s), Math.round(-20 * s), Math.round(22 * s), Math.round(3 * s));
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(Math.round(9 * s), Math.round(-22 * s), Math.round(5 * s), Math.round(6 * s));
        break;
      case 'goggles':
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(Math.round(-11 * s), Math.round(-21 * s), Math.round(22 * s), Math.round(4 * s));
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(Math.round(-9 * s), Math.round(-21 * s), Math.round(7 * s), Math.round(4 * s));
        ctx.fillRect(Math.round(2 * s), Math.round(-21 * s), Math.round(7 * s), Math.round(4 * s));
        break;
      case 'halo':
        ctx.fillStyle = '#fff59d';
        ctx.fillRect(Math.round(-10 * s), Math.round(-31 * s), Math.round(20 * s), Math.round(3 * s));
        ctx.fillStyle = '#7ce8ff';
        ctx.fillRect(Math.round(-6 * s), Math.round(-31 * s), Math.round(12 * s), Math.round(2 * s));
        break;
      case 'visor':
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(Math.round(-10 * s), Math.round(-14 * s), Math.round(20 * s), Math.round(4 * s));
        break;
      case 'antlers':
        ctx.fillStyle = '#a16207';
        ctx.fillRect(Math.round(-12 * s), Math.round(-31 * s), Math.round(4 * s), Math.round(8 * s));
        ctx.fillRect(Math.round(8 * s), Math.round(-31 * s), Math.round(4 * s), Math.round(8 * s));
        ctx.fillStyle = '#f9a8d4';
        ctx.fillRect(Math.round(-14 * s), Math.round(-33 * s), Math.round(5 * s), Math.round(4 * s));
        ctx.fillRect(Math.round(9 * s), Math.round(-33 * s), Math.round(5 * s), Math.round(4 * s));
        break;
      case 'cap':
      default:
        break;
    }

    ctx.restore();
    return;
  }

  // Fallback headless-only pixel silhouette when atlas sheet is unavailable
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-4 * px, 4 * px, 3 * px, 5 * px);
  ctx.fillRect(1 * px, 4 * px, 3 * px, 5 * px);
  ctx.fillStyle = look.outfitSecondary;
  ctx.fillRect(-4 * px, 8 * px, 3 * px, 2 * px);
  ctx.fillRect(1 * px, 8 * px, 3 * px, 2 * px);

  ctx.fillStyle = look.outfitPrimary;
  ctx.fillRect(-5 * px, -4 * px, 10 * px, 8 * px);
  ctx.fillStyle = look.outfitSecondary;
  ctx.fillRect(-2 * px, -4 * px, 4 * px, 3 * px);
  ctx.fillStyle = look.outfitPrimary;
  ctx.fillRect(-7 * px, -3 * px, 2 * px, 6 * px);
  ctx.fillRect(5 * px, -3 * px, 2 * px, 6 * px);

  ctx.fillStyle = look.skin;
  ctx.fillRect(-4 * px, -11 * px, 8 * px, 7 * px);
  ctx.fillStyle = look.hair;
  ctx.fillRect(-5 * px, -13 * px, 10 * px, 3 * px);
  ctx.fillRect(-5 * px, -11 * px, 1 * px, 4 * px);
  ctx.fillRect(4 * px, -11 * px, 1 * px, 4 * px);

  ctx.fillStyle = '#10152e';
  ctx.fillRect(-2 * px, -8 * px, px, 2 * px);
  ctx.fillRect(1 * px, -8 * px, px, 2 * px);

  ctx.restore();
}

export class StyleStudioStage {
  private canvas: HTMLCanvasElement | null = null;
  private portraitCanvas: HTMLCanvasElement | null = null;
  private partnerTempCanvas: HTMLCanvasElement | null = null;
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private callbacks: UIBridgeCallbacks | null = null;

  private currentProfile: DojoProfileState | null = null;
  private currentAssets: StyleStudioAssets | null = null;
  private reducedMotion = false;
  private timeSec = 0;

  private nicknameInput: HTMLInputElement | null = null;
  private styleButtons = new Map<TrainerStyleId, HTMLButtonElement>();
  private accButtons = new Map<TrainerAccessoryId, HTMLButtonElement>();
  private auraButtons = new Map<TrainerAuraId, HTMLButtonElement>();
  private capeToggleBtn: HTMLButtonElement | null = null;
  private summaryLabel: HTMLElement | null = null;
  private lastMemo = '';

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.styleButtons.clear();
    this.accButtons.clear();
    this.auraButtons.clear();
    this.lastMemo = '';

    const styles = getAllTrainerStyles();
    const accessories = getAllTrainerAccessories();
    const auras = getAllTrainerAuras();

    container.innerHTML = `
      <div class="sl-style-body">
        <div class="sl-style-stage-wrap">
          <canvas class="sl-style-canvas" width="300" height="270" data-testid="style-stage-canvas" aria-label="Live Animated Trainer Preview"></canvas>
          <div style="display:flex; align-items:center; gap:10px; width:100%;">
            <canvas class="sl-portrait-canvas-sm" width="52" height="52" data-testid="style-portrait-canvas" aria-hidden="true"></canvas>
            <div class="sl-pill" style="flex:1; justify-content:center;" data-testid="style-loadout-summary">Violet</div>
          </div>

          <div class="sl-style-nickname-row">
            <input
              type="text"
              class="sl-input"
              maxlength="18"
              placeholder="Custom Trainer Nickname"
              data-testid="style-nickname-input"
              aria-label="Custom Trainer Nickname"
            />
            <button type="button" class="sl-btn sl-btn-cyan" data-testid="style-nickname-apply">
              <span>Apply</span>
            </button>
            <button type="button" class="sl-btn" data-testid="style-nickname-reset">
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div class="sl-style-controls">
          <section>
            <h3 class="sl-style-group-title">${createIconSvg('icon-style', 'sl-icon-sm')} 10 Trainer Outfits</h3>
            <div class="sl-style-options" data-group="outfits">
              ${styles
                .map(
                  (o) => `
                  <button type="button" class="sl-style-option" data-testid="style-outfit-${o.id}" data-style-id="${o.id}">
                    <span class="sl-style-swatch" style="background: linear-gradient(135deg, ${o.outfitPrimary}, ${o.outfitSecondary});"></span>
                    ${createIconSvg(o.iconId, 'sl-icon-sm')}
                    <span><strong>${safeText(o.name)}</strong></span>
                  </button>
                `,
                )
                .join('')}
            </div>
          </section>

          <section>
            <h3 class="sl-style-group-title">${createIconSvg('icon-hat', 'sl-icon-sm')} 8 Accessories &amp; Cape</h3>
            <div class="sl-style-options" data-group="accessories">
              ${accessories
                .map(
                  (a) => `
                  <button type="button" class="sl-style-option" data-testid="style-accessory-${a.id}" data-accessory-id="${a.id}">
                    ${createIconSvg(a.iconId, 'sl-icon-sm')}
                    <span><strong>${safeText(a.name)}</strong></span>
                  </button>
                `,
                )
                .join('')}
              <button type="button" class="sl-style-option" data-testid="style-cape-toggle" aria-pressed="false">
                ${createIconSvg('icon-cape', 'sl-icon-sm')}
                <span><strong>Starlight Cape</strong><br><small>Off</small></span>
              </button>
            </div>
          </section>

          <section>
            <h3 class="sl-style-group-title">${createIconSvg('icon-aura', 'sl-icon-sm')} 6 Glowing Auras</h3>
            <div class="sl-style-options" data-group="auras">
              ${auras
                .map(
                  (au) => `
                  <button type="button" class="sl-style-option" data-testid="style-aura-${au.id}" data-aura-id="${au.id}">
                    <span class="sl-style-swatch" style="background: ${au.color};"></span>
                    ${createIconSvg(au.iconId, 'sl-icon-sm')}
                    <span><strong>${safeText(au.name)}</strong></span>
                  </button>
                `,
                )
                .join('')}
            </div>
          </section>
        </div>
      </div>
    `;

    this.canvas = container.querySelector('[data-testid="style-stage-canvas"]');
    this.portraitCanvas = container.querySelector('[data-testid="style-portrait-canvas"]');
    this.summaryLabel = container.querySelector('[data-testid="style-loadout-summary"]');
    this.nicknameInput = container.querySelector('[data-testid="style-nickname-input"]');
    this.capeToggleBtn = container.querySelector('[data-testid="style-cape-toggle"]');

    styles.forEach((o) => {
      const btn = container.querySelector(`[data-style-id="${o.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.styleButtons.set(o.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ styleId: o.id }));
      }
    });
    accessories.forEach((a) => {
      const btn = container.querySelector(`[data-accessory-id="${a.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.accButtons.set(a.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ accessory: a.id }));
      }
    });
    auras.forEach((au) => {
      const btn = container.querySelector(`[data-aura-id="${au.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.auraButtons.set(au.id, btn);
        btn.addEventListener('click', () => this.applyPatch({ aura: au.id }));
      }
    });

    this.capeToggleBtn?.addEventListener('click', () => {
      const curCape = Boolean(this.currentProfile?.appearance?.cape);
      this.applyPatch({ cape: !curCape });
    });

    container.querySelector('[data-testid="style-nickname-apply"]')?.addEventListener('click', () => {
      if (this.nicknameInput) {
        this.applyPatch({ nickname: this.nicknameInput.value });
      }
    });

    container.querySelector('[data-testid="style-nickname-reset"]')?.addEventListener('click', () => {
      if (this.nicknameInput) this.nicknameInput.value = '';
      this.applyPatch({ nickname: '' });
    });
  }

  private applyPatch(
    patch: Partial<{
      styleId: TrainerStyleId;
      accessory: TrainerAccessoryId;
      cape: boolean;
      aura: TrainerAuraId;
      nickname: string;
    }>,
  ): void {
    if (this.currentProfile) {
      this.currentProfile = {
        ...this.currentProfile,
        appearance: {
          ...this.currentProfile.appearance,
          ...patch,
        },
      };
      this.syncControls(this.currentProfile);
      this.renderStageCanvas();
    }
    this.callbacks?.onUpdateAppearance(patch);
  }

  sync(
    profile: DojoProfileState,
    reducedMotion: boolean,
    active: boolean,
    timeSec: number,
    assets?: StyleStudioAssets,
  ): void {
    this.currentProfile = profile;
    this.reducedMotion = reducedMotion;
    this.timeSec = timeSec;
    this.currentAssets = assets ?? null;
    if (!active) return;

    this.syncControls(profile);
    this.renderStageCanvas();
  }

  private syncControls(profile: DojoProfileState): void {
    const app = profile.appearance;
    const key = [
      profile.trainerId,
      app.styleId,
      app.accessory,
      app.cape,
      app.aura,
      app.nickname ?? '',
    ].join('|');

    if (key === this.lastMemo) return;
    this.lastMemo = key;

    for (const [id, btn] of this.styleButtons) {
      const equipped = app.styleId === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.accButtons) {
      const equipped = app.accessory === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.auraButtons) {
      const equipped = app.aura === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    if (this.capeToggleBtn) {
      this.capeToggleBtn.classList.toggle('is-equipped', Boolean(app.cape));
      this.capeToggleBtn.setAttribute('aria-pressed', String(Boolean(app.cape)));
      const small = this.capeToggleBtn.querySelector('small');
      if (small) small.textContent = app.cape ? 'Equipped' : 'Off';
    }

    if (this.nicknameInput && this.nicknameInput.ownerDocument?.activeElement !== this.nicknameInput) {
      this.nicknameInput.value = app.nickname ?? '';
    }

    if (this.summaryLabel) {
      const name = getCleanTrainerName(profile, profile.trainerId);
      const styleName = getAllTrainerStyles().find((s) => s.id === app.styleId)?.name ?? app.styleId;
      const auraName = getAllTrainerAuras().find((a) => a.id === app.aura)?.name ?? app.aura;
      this.summaryLabel.textContent = `${name} • ${styleName} • ${auraName}`;
    }

    if (this.portraitCanvas) {
      renderTrainerPortraitCanvas(
        this.portraitCanvas,
        profile.trainerId,
        this.currentAssets?.charactersSheet ?? null,
        this.currentAssets?.manifest ?? null,
        profile.appearance,
      );
    }
  }

  renderStageCanvas(): void {
    if (!this.canvas || !this.currentProfile) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext('2d', { willReadFrequently: true }) ?? this.canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const w = this.canvas.width || 300;
    const h = this.canvas.height || 270;
    const t = this.reducedMotion ? 0 : this.timeSec;
    const profile = this.currentProfile;
    const look = getResolvedTrainerLook(profile.trainerId, profile.appearance);

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a102b');
    bg.addColorStop(0.62, '#1a2a60');
    bg.addColorStop(1, '#090e24');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Spotlight cone
    const beam = ctx.createLinearGradient(w * 0.5, 10, w * 0.5, h * 0.85);
    beam.addColorStop(0, 'rgba(124, 232, 255, 0.05)');
    beam.addColorStop(0.7, `${look.accent}38`);
    beam.addColorStop(1, 'rgba(255, 213, 102, 0.22)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(w * 0.32, 8);
    ctx.lineTo(w * 0.68, 8);
    ctx.lineTo(w * 0.88, h * 0.82);
    ctx.lineTo(w * 0.12, h * 0.82);
    ctx.closePath();
    ctx.fill();

    // Pixel-beveled celestial stage pedestal
    const pedX = Math.round(w * 0.5);
    const pedY = Math.round(h * 0.78);
    ctx.fillStyle = 'rgba(38, 62, 130, 0.65)';
    ctx.fillRect(pedX - 96, pedY - 12, 192, 24);
    ctx.strokeStyle = '#ffd566';
    ctx.lineWidth = 2;
    ctx.strokeRect(pedX - 96, pedY - 12, 192, 24);

    // Animated Trainer wearing Outfit + Accessory + Cape + Aura
    drawPixelTrainerStageCharacter(ctx, look, {
      cx: w * 0.36,
      cy: h * 0.61,
      scale: 1.6,
      time: t,
      reducedMotion: this.reducedMotion,
      charactersSheet: this.currentAssets?.charactersSheet,
      manifest: this.currentAssets?.manifest,
    });

    // Lead Partner standing beside trainer
    const lead = profile.team[0];
    if (lead) {
      const sp = getSpeciesEntry(lead.speciesId);
      const px = Math.round(w * 0.68);
      const py = Math.round(h * 0.62);
      if (this.rigSynthesizer) {
        this.rigSynthesizer.renderRig(
          ctx,
          {
            speciesId: sp.id,
            name: sp.name,
            primaryType: sp.type,
            archetype: sp.archetype,
            colorHex: sp.color,
            shiny: lead.isShiny,
          },
          {
            cx: px,
            cy: py,
            size: 82,
            time: t,
            facing: 'left',
            reducedMotion: this.reducedMotion,
          },
        );
      } else {
        if (!this.partnerTempCanvas && this.canvas.ownerDocument) {
          this.partnerTempCanvas = this.canvas.ownerDocument.createElement('canvas');
          this.partnerTempCanvas.width = 84;
          this.partnerTempCanvas.height = 84;
        }
        const tempCanvas = this.partnerTempCanvas;
        if (tempCanvas) {
          renderPokemonPreviewCanvas(
            tempCanvas,
            sp.id,
            this.currentAssets?.leadFrames ?? null,
            this.currentAssets?.fallbacksSheet ?? null,
            this.currentAssets?.manifest ?? null,
            lead.isShiny,
            t,
          );
          ctx.drawImage(tempCanvas, px - 42, py - 42);
        } else {
          drawPixelArchetypeSprite(ctx, sp.id, px - 36, py - 36, 72, lead.isShiny);
        }
      }
    }
  }

  dispose(): void {
    this.styleButtons.clear();
    this.accButtons.clear();
    this.auraButtons.clear();
    this.canvas = null;
    this.portraitCanvas = null;
    this.partnerTempCanvas = null;
    this.nicknameInput = null;
    this.capeToggleBtn = null;
    this.summaryLabel = null;
    this.callbacks = null;
  }
}
