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
  getPlayerLevel,
  getResolvedTrainerLook,
  getSpeciesEntry,
  SpriteAssetLoader,
  TOTAL_SPECIES_COUNT,
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

  // Grounded elliptical shadow disc (matches live partner shadow)
  ctx.fillStyle = 'rgba(4, 8, 22, 0.56)';
  ctx.beginPath();
  ctx.ellipse(0, Math.round(25 * s), Math.round(17 * s), Math.round(4.5 * s), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, bob);

  // 2. Cape behind torso
  if (look.cape) {
    const sway = Math.round(Math.sin(t * 3.2) * 3 * s);
    ctx.fillStyle = look.accentDark;
    ctx.fillRect(Math.round(-17 * s + sway * 0.4), Math.round(-12 * s), Math.round(34 * s), Math.round(34 * s));
    ctx.fillStyle = look.outfitSecondary;
    ctx.fillRect(Math.round(-15 * s + sway * 0.4), Math.round(16 * s), Math.round(30 * s), Math.round(4 * s));
  }

  // 3. Curated Pixel JRPG Character Sprite from characters-atlas
  const regionId = `${look.id}_down`;
  const charRegion = options.manifest?.sheets?.characters?.regions?.[regionId];
  const px = Math.max(2, Math.round(2.4 * s));

  if (options.charactersSheet && charRegion && charRegion.w > 0 && charRegion.h > 0) {
    const drawSize = Math.round(48 * s);
    const dx = Math.round(-drawSize * 0.5);
    const dy = Math.round(-drawSize * 0.52);

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

    if (look.styleId !== 'default') {
      ctx.fillStyle = look.outfitPrimary;
      ctx.fillRect(Math.round(-9 * s), Math.round(1 * s), Math.round(18 * s), Math.round(5 * s));
      ctx.fillStyle = look.outfitSecondary;
      ctx.fillRect(Math.round(-3 * s), Math.round(1 * s), Math.round(6 * s), Math.round(9 * s));
      ctx.fillStyle = look.accent;
      ctx.fillRect(Math.round(-9 * s), Math.round(1 * s), Math.round(18 * s), Math.round(2 * s));
    }

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
  private statsGridEl: HTMLElement | null = null;
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
        <div class="sl-style-stage-wrap sl-pixel-card">
          <canvas class="sl-style-canvas" width="268" height="206" data-testid="style-stage-canvas" aria-label="Live Animated Trainer Preview"></canvas>
          <div class="sl-style-portrait-row">
            <canvas class="sl-portrait-canvas-sm" width="48" height="48" data-testid="style-portrait-canvas" aria-hidden="true"></canvas>
            <div class="sl-pill sl-pill-gold" style="flex:1; justify-content:center; overflow:hidden; text-overflow:ellipsis;" data-testid="style-loadout-summary">Violet</div>
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
            <div class="sl-style-nickname-btns">
              <button type="button" class="sl-btn sl-btn-cyan" data-testid="style-nickname-apply">
                <span>Apply</span>
              </button>
              <button type="button" class="sl-btn" data-testid="style-nickname-reset">
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div class="sl-style-stats-box">
            <h4 class="sl-style-group-title" style="font-size:12px;">
              ${createIconSvg('icon-trophy', 'sl-icon-sm')}
              <span>Adventure Record</span>
            </h4>
            <div class="sl-style-stats-grid sl-num" data-testid="style-adventure-stats"></div>
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
                    <span>${safeText(o.name)}</span>
                  </button>
                `,
                )
                .join('')}
            </div>
          </section>

          <section>
            <h3 class="sl-style-group-title">${createIconSvg('icon-hat', 'sl-icon-sm')} 8 Accessories &amp; Starlight Cape</h3>
            <div class="sl-style-options" data-group="accessories">
              ${accessories
                .map(
                  (a) => `
                  <button type="button" class="sl-style-option" data-testid="style-accessory-${a.id}" data-accessory-id="${a.id}">
                    ${createIconSvg(a.iconId, 'sl-icon-sm')}
                    <span>${safeText(a.name)}</span>
                  </button>
                `,
                )
                .join('')}
              <button type="button" class="sl-style-option" data-testid="style-cape-toggle" aria-pressed="false">
                ${createIconSvg('icon-cape', 'sl-icon-sm')}
                <span data-cape-label>Cape: Off</span>
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
                    <span>${safeText(au.name)}</span>
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
    this.statsGridEl = container.querySelector('[data-testid="style-adventure-stats"]');

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
    const caughtCount = Object.values(profile.pokedex.caught).filter((n) => Number(n) > 0).length;
    const key = [
      profile.trainerId,
      app.styleId,
      app.accessory,
      app.cape,
      app.aura,
      app.nickname ?? '',
      caughtCount,
      profile.badges.length,
      profile.shrinesCleared.length,
      profile.questsCompleted.length,
      profile.chestsOpened.length,
      profile.arcade.highScore,
      profile.stats.battlesWon,
    ].join('|');

    if (key === this.lastMemo) return;
    this.lastMemo = key;

    for (const [id, btn] of this.styleButtons) {
      const equipped = app.styleId === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.classList.toggle('is-active', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.accButtons) {
      const equipped = app.accessory === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.classList.toggle('is-active', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    for (const [id, btn] of this.auraButtons) {
      const equipped = app.aura === id;
      btn.classList.toggle('is-equipped', equipped);
      btn.classList.toggle('is-active', equipped);
      btn.setAttribute('aria-pressed', String(equipped));
    }
    if (this.capeToggleBtn) {
      const capeOn = Boolean(app.cape);
      this.capeToggleBtn.classList.toggle('is-equipped', capeOn);
      this.capeToggleBtn.classList.toggle('is-active', capeOn);
      this.capeToggleBtn.setAttribute('aria-pressed', String(capeOn));
      const lbl = this.capeToggleBtn.querySelector('[data-cape-label]');
      if (lbl) lbl.textContent = capeOn ? 'Cape: On' : 'Cape: Off';
    }

    if (this.nicknameInput && this.nicknameInput.ownerDocument?.activeElement !== this.nicknameInput) {
      this.nicknameInput.value = app.nickname ?? '';
    }

    if (this.summaryLabel) {
      const name = getCleanTrainerName(profile, profile.trainerId);
      const styleName = getAllTrainerStyles().find((s) => s.id === app.styleId)?.name ?? app.styleId;
      this.summaryLabel.textContent = `${name} • ${styleName}`;
    }

    if (this.statsGridEl) {
      const trainerLv = getPlayerLevel(profile);
      const items = [
        { label: 'Trainer Lv', val: String(trainerLv) },
        { label: 'Pokédex', val: `${caughtCount}/${TOTAL_SPECIES_COUNT}` },
        { label: 'Badges', val: `${profile.badges.length}/28` },
        { label: 'Shrines', val: `${profile.shrinesCleared.length}/20` },
        { label: 'Quests', val: `${profile.questsCompleted.length}/23` },
        { label: 'Chests', val: `${profile.chestsOpened.length}/36` },
        { label: 'Rivals', val: `${profile.rivalsDefeated.length}/17` },
        { label: 'Battles Won', val: String(profile.stats.battlesWon) },
        { label: 'Shinies', val: String(profile.stats.shiniesFound) },
        { label: 'Sky-Hop Best', val: String(profile.arcade.highScore) },
      ];
      this.statsGridEl.innerHTML = items
        .map(
          (it) => `
          <div class="sl-style-stat-cell">
            <span class="sl-style-stat-k">${safeText(it.label)}</span>
            <strong class="sl-style-stat-v">${safeText(it.val)}</strong>
          </div>
        `,
        )
        .join('');
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

    const w = this.canvas.width || 280;
    const h = this.canvas.height || 248;
    const t = this.reducedMotion ? 0 : this.timeSec;
    const profile = this.currentProfile;
    const look = getResolvedTrainerLook(profile.trainerId, profile.appearance);

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a102b');
    bg.addColorStop(0.58, '#1a285c');
    bg.addColorStop(1, '#080c20');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Warm boutique spotlight cone
    const beam = ctx.createLinearGradient(w * 0.5, 6, w * 0.5, h * 0.85);
    beam.addColorStop(0, 'rgba(255, 240, 189, 0.06)');
    beam.addColorStop(0.65, `${look.accent}32`);
    beam.addColorStop(1, 'rgba(245, 205, 109, 0.22)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, 6);
    ctx.lineTo(w * 0.7, 6);
    ctx.lineTo(w * 0.88, h * 0.82);
    ctx.lineTo(w * 0.12, h * 0.82);
    ctx.closePath();
    ctx.fill();

    // Soft glowing circular showcase stage pedestal
    const pedX = Math.round(w * 0.5);
    const pedY = Math.round(h * 0.79);
    ctx.save();
    ctx.fillStyle = 'rgba(30, 48, 108, 0.72)';
    ctx.beginPath();
    ctx.ellipse(pedX, pedY, w * 0.38, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 205, 109, 0.78)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Animated Trainer wearing Outfit + Accessory + Cape + Aura
    drawPixelTrainerStageCharacter(ctx, look, {
      cx: w * 0.34,
      cy: h * 0.60,
      scale: 1.38,
      time: t,
      reducedMotion: this.reducedMotion,
      charactersSheet: this.currentAssets?.charactersSheet,
      manifest: this.currentAssets?.manifest,
    });

    // Lead Partner standing beside trainer — ALWAYS prefer live animated leadFrames FIRST!
    const lead = profile.team[0];
    if (lead) {
      const sp = getSpeciesEntry(lead.speciesId);
      const px = Math.round(w * 0.67);
      const py = Math.round(h * 0.62);
      const liveFrame = SpriteAssetLoader.selectFrame(this.currentAssets?.leadFrames ?? null, t);

      if (liveFrame && liveFrame.width > 0 && liveFrame.height > 0) {
        const maxDraw = 74;
        const scale = Math.min(maxDraw / liveFrame.width, maxDraw / liveFrame.height);
        const dw = Math.max(16, Math.round(liveFrame.width * scale));
        const dh = Math.max(16, Math.round(liveFrame.height * scale));
        const bob = this.reducedMotion ? 0 : Math.round(Math.sin(t * 3.1 + 0.8) * 2);
        const dx = Math.round(px - dw * 0.5);
        const dy = Math.round(pedY - 6 - dh + bob);
        ctx.save();
        ctx.fillStyle = 'rgba(4, 8, 22, 0.52)';
        ctx.beginPath();
        ctx.ellipse(px, pedY - 3, dw * 0.36, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(liveFrame, dx, dy, dw, dh);
        ctx.restore();
      } else if (this.rigSynthesizer) {
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
            size: 80,
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
            null,
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
    this.statsGridEl = null;
    this.callbacks = null;
  }
}
