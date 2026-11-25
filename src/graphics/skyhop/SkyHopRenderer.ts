import type {
  AtlasManifest,
  BiomeId,
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  ISkyHopRenderer,
  OfflineRigDescriptor,
  SkyHopEntity,
  SkyHopState,
} from '../../contracts';
import {
  getBiomeVisualProfile,
  getSpeciesEntry,
  SKYHOP_LOGICAL_H,
  SKYHOP_LOGICAL_W,
  SKYHOP_PALETTES,
  SpriteAssetLoader,
  TYPE_PALETTES,
} from '../../core';
import { drawPixelArchetypeSprite } from '../../ui/iconHelper';
import {
  SILHOUETTE_CONTOUR_PAD,
  getSpriteSilhouetteContour,
} from '../battle/SpriteSilhouette';

interface SlipstreamSample {
  x: number;
  y: number;
  age: number;
  dash: boolean;
  frame: HTMLCanvasElement | null;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function hexToRgb255(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [124, 232, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class SkyHopRenderer implements ISkyHopRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private manifest: AtlasManifest | null = null;
  private getArenaImage: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;

  private trail: SlipstreamSample[] = [];
  private localTime = 0;
  private trailAccum = 0;
  private cloudScroll = 0;
  private viewportW = 960;
  private viewportH = 540;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    this.rigSynthesizer = options?.rigSynthesizer ?? null;
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  attachAssets(
    manifest: AtlasManifest | null,
    getArenaImage?: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null,
    getSheetImage?: ((sheetId: string) => HTMLImageElement | null) | null,
  ): void {
    this.manifest = manifest;
    this.getArenaImage = getArenaImage ?? null;
    this.getSheetImage = getSheetImage ?? null;
  }

  update(state: SkyHopState, dtSeconds: number): void {
    const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, 0.05) : 0;
    this.localTime += dt;
    const isDashing = state.dashTimer > 0;
    this.cloudScroll += dt * (isDashing ? 2.6 : 1.0);

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].age += dt;
      this.trail[i].x -= dt * (isDashing ? 380 : 190);
      if (this.trail[i].age > 0.42 || this.trail[i].x < -40) {
        this.trail.splice(i, 1);
      }
    }

    this.trailAccum += dt;
    if (this.trailAccum >= 0.022) {
      this.trailAccum = 0;
      const frame = SpriteAssetLoader.selectFrame(state.partnerFrames, state.elapsedSeconds);
      this.trail.push({
        x: state.playerX,
        y: state.playerY,
        age: 0,
        dash: isDashing,
        frame,
      });
      if (this.trail.length > 22) {
        this.trail.shift();
      }
    }
  }

  render(backend: IRenderBackend, state: SkyHopState): void {
    const reducedMotion = Boolean(state.reducedMotion || backend.capabilities.reducedMotion);
    const motion = reducedMotion ? 0.22 : 1.0;
    const t = state.elapsedSeconds || this.localTime;
    const isDashing = state.dashTimer > 0;
    const palette = SKYHOP_PALETTES[Math.abs(state.skyIndex) % SKYHOP_PALETTES.length] ?? SKYHOP_PALETTES[0];

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
    const scaleX = w / SKYHOP_LOGICAL_W;
    const scaleY = h / SKYHOP_LOGICAL_H;

    const baseGrade = getBiomeVisualProfile('peak').colorGrade;
    backend.setColorGrade({
      ...baseGrade,
      ambientStrength: isDashing ? 0.94 : 0.84,
      bloomIntensity: isDashing ? 0.64 : 0.48,
      vignetteStrength: isDashing ? 0.28 : 0.2,
    });
    backend.setCanopyConfig({
      enabled: false,
      sunbeamIntensity: 0,
      sunbeamAngle: -0.4,
      sunbeamColor: [1, 0.95, 0.8],
      cloudSpeedX: 0,
      cloudSpeedY: 0,
      cloudOpacity: 0,
    });
    backend.setWaterConfig({
      enabled: false,
      time: t,
      skyTopColor: [0.08, 0.16, 0.4],
      skyBottomColor: [0.3, 0.56, 0.84],
      starlightIntensity: 0.5,
      waveAmplitude: 0.4,
      foamColor: [0.9, 0.96, 1],
    });

    const shakeAmp = state.shakeTimer > 0 ? 5.5 : isDashing ? 2.0 : 0;
    backend.setCamera({
      x: 0,
      y: 0,
      zoom: isDashing && !reducedMotion ? 1.02 : 1,
      rotation: reducedMotion ? 0 : state.bankAngle * 0.04,
      shakeX: shakeAmp > 0 && !reducedMotion ? Math.sin(this.localTime * 46) * shakeAmp : 0,
      shakeY: shakeAmp > 0 && !reducedMotion ? Math.cos(this.localTime * 39) * shakeAmp * 0.8 : 0,
    });

    const skyArena = this.getArenaImage?.('skyhop') ?? null;
    const fallbackSheet = this.getSheetImage?.('fallbacks') ?? null;

    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;
      const sx = cw / SKYHOP_LOGICAL_W;
      const sy = ch / SKYHOP_LOGICAL_H;
      ctx.imageSmoothingEnabled = false;

      // 1. Lush Sky-Hop Pixel Twilight Panorama + Dynamic Wave Sky Palette
      const sky = ctx.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, palette.top);
      sky.addColorStop(0.54, palette.mid);
      sky.addColorStop(1, palette.bottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, ch);

      if (skyArena && skyArena.naturalWidth > 0 && skyArena.naturalHeight > 0) {
        const bgScale = Math.max(cw / skyArena.naturalWidth, ch / skyArena.naturalHeight);
        const dw = Math.ceil(skyArena.naturalWidth * bgScale);
        const dh = Math.ceil(skyArena.naturalHeight * bgScale);
        ctx.save();
        ctx.globalAlpha = state.skyIndex === 0 ? 0.82 : 0.46;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(skyArena, Math.round((cw - dw) * 0.5), Math.round((ch - dh) * 0.5), dw, dh);
        ctx.restore();
      }

      // 2. Pixel-stepped Aurora Curtain Ribbons
      this.drawPixelAurora(ctx, cw, ch, palette.accent, t, motion, isDashing);

      // 3. Twinkling Pixel Starfield (stretches into speed streaks during Star Dash)
      for (let i = 0; i < 48; i++) {
        const baseX = Math.sin(i * 127.1 + 0.7) * 0.5 + 0.5;
        const starX = ((((baseX - this.cloudScroll * (0.06 + (i % 3) * 0.035)) % 1) + 1) % 1) * cw;
        const starY = ((Math.sin(i * 311.7 + 2.3) * 0.5 + 0.5) * 0.76 + 0.03) * ch;
        const twinkle = reducedMotion ? 0.75 : 0.4 + 0.6 * Math.sin(t * 2.5 + i * 1.9);
        ctx.fillStyle = `rgba(244, 248, 255, ${(0.3 + twinkle * 0.65).toFixed(3)})`;
        if (isDashing) {
          ctx.fillRect(Math.round(starX - 18), Math.round(starY), 26, 2);
        } else {
          const s = i % 6 === 0 ? 3 : 2;
          ctx.fillRect(Math.round(starX), Math.round(starY), s, s);
        }
      }

      // 4. Far & Mid Scrolling Pixel Cloud Seas
      this.drawPixelCloudSea(ctx, cw, ch, this.cloudScroll * 0.34, 0.76, '#1e3268', '#93c5fd', 8);
      this.drawPixelCloudSea(ctx, cw, ch, this.cloudScroll * 0.72, 0.85, '#152452', '#e0f2fe', 7);

      // 5. Star Dash Prismatic Speed Tunnel
      if (isDashing) {
        this.drawStarDashTunnel(ctx, cw, ch, state.playerX * sx, state.playerY * sy, state.bankAngle, reducedMotion);
      }

      // 6. Entities (Stars, Big Stars, Rainbow Comets, Storm Clouds, Plasma Orbs, Telegraphed Void Meteors, Hearts)
      for (const ent of state.entities) {
        this.drawEntity(ctx, cw, ch, sx, sy, ent, t, reducedMotion);
      }

      // 7. World Particles (dot / spark / star / ring)
      for (const p of state.particles) {
        const alpha = clamp(1 - p.life / Math.max(0.05, p.maxLife), 0, 1);
        const px = Math.round(p.x * sx);
        const py = Math.round(p.y * sy);
        const rad = Math.max(2, Math.round((p.maxSize ? p.size + (p.maxSize - p.size) * (p.life / p.maxLife) : p.size) * sx));
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.shape === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(px - Math.floor(rad * 0.5), py - Math.floor(rad * 0.5), rad, rad);
        }
        ctx.restore();
      }

      // 8. Glowing Starlight Pixel Afterimages
      this.drawSlipstreamAfterimages(ctx, sx, sy, state);

      // 9. Animated Lead Pokémon Sprite / Crisp Pixel Fallback
      const px = Math.round(state.playerX * sx);
      const py = Math.round(state.playerY * sy);
      const spriteSize = Math.round(Math.max(46, Math.min(cw, ch) * 0.13));

      // Magnet aura ring
      if (state.magnetTimer > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(124, 232, 255, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(px, py, spriteSize * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const blinkSkip = state.hitInvulnTimer > 0 && Math.floor(this.localTime * 18) % 2 === 1;
      if (!blinkSkip) {
        this.drawPartnerSprite(ctx, px, py, spriteSize, state, fallbackSheet, reducedMotion);
      }

      // 10. Foreground Near Cloud Sea Mist
      this.drawPixelCloudSea(ctx, cw, ch, this.cloudScroll * 1.24, 0.93, '#0e193b', '#f0f9ff', 6);
    }, 'world');

    // Deferred PointLights & Additive Particles (WebGL2 + Canvas2D parity!)
    const partnerRgb = TYPE_PALETTES[state.partnerType]?.rgb ?? [0.48, 0.91, 1.0];
    backend.addPointLight({
      id: 'skyhop-player-light',
      x: state.playerX * scaleX,
      y: state.playerY * scaleY,
      radius: isDashing ? 230 : 155,
      color: isDashing ? [0.55, 0.94, 1.0] : partnerRgb,
      intensity: isDashing ? 1.55 : 1.1,
      screenSpace: true,
    });

    const trailParticles = isDashing ? 6 : 2;
    for (let i = 0; i < trailParticles; i++) {
      backend.drawParticle({
        x: state.playerX * scaleX - 20 - i * 12,
        y: state.playerY * scaleY + Math.sin(this.localTime * 12 + i) * 7,
        radius: isDashing ? 11 - i : 6,
        color: isDashing ? [0.52, 0.95, 1.0, 0.76] : [1.0, 0.86, 0.45, 0.58],
        additive: true,
        stretchX: isDashing ? 2.4 : 1.5,
        stretchY: 0.65,
        rotation: state.bankAngle,
      });
    }

    let lightBudget = 1;
    for (const ent of state.entities) {
      const ex = clamp(ent.x, 0, SKYHOP_LOGICAL_W) * scaleX;
      const ey = ent.y * scaleY;

      if (lightBudget < 22) {
        lightBudget += 1;
        if (ent.kind === 'star' || ent.kind === 'bigstar' || ent.kind === 'comet') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: ent.kind === 'bigstar' ? 125 : 95,
            color: ent.kind === 'comet' ? [0.65, 0.92, 1.0] : [1.0, 0.88, 0.42],
            intensity: 1.05,
            flickerSpeed: 5.5,
            flickerAmount: 0.14,
            screenSpace: true,
          });
        } else if (ent.kind === 'storm_orb' || ent.kind === 'cloud') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 130,
            color: [0.76, 0.42, 1.0],
            intensity: 1.15,
            screenSpace: true,
          });
        } else if (ent.kind === 'void_meteor') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 135,
            color: [1.0, 0.42, 0.18],
            intensity: 1.3,
            flickerSpeed: 8.5,
            flickerAmount: 0.2,
            screenSpace: true,
          });
        } else if (ent.kind === 'heart') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 110,
            color: [1.0, 0.45, 0.72],
            intensity: 1.1,
            screenSpace: true,
          });
        }
      }

      if (ent.kind === 'comet' || ent.kind === 'void_meteor') {
        backend.drawParticle({
          x: ex + 16,
          y: ey,
          radius: 7,
          color: ent.kind === 'comet' ? [0.55, 0.92, 1.0, 0.76] : [1.0, 0.48, 0.18, 0.78],
          additive: true,
          stretchX: 2.0,
          stretchY: 0.7,
        });
      }
    }
  }

  private drawPartnerSprite(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    state: SkyHopState,
    fallbackSheet: HTMLImageElement | null,
    reducedMotion: boolean,
  ): void {
    const sp = getSpeciesEntry(state.partnerSpeciesId);
    const frameCanvas = SpriteAssetLoader.selectFrame(state.partnerFrames, state.elapsedSeconds);
    const pal = TYPE_PALETTES[sp.type] ?? TYPE_PALETTES.normal;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(reducedMotion ? 0 : state.bankAngle);
    ctx.imageSmoothingEnabled = false;

    // Soft glowing backing aura
    const aura = ctx.createRadialGradient(0, 0, size * 0.08, 0, 0, size * 0.7);
    aura.addColorStop(0, state.dashTimer > 0 ? 'rgba(124, 232, 255, 0.65)' : `${pal.glow}55`);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-size, -size, size * 2, size * 2);

    if (frameCanvas && frameCanvas.width > 0 && frameCanvas.height > 0) {
      const scale = Math.min(size / frameCanvas.width, size / frameCanvas.height);
      const dw = Math.round(frameCanvas.width * scale);
      const dh = Math.round(frameCanvas.height * scale);
      // Gen V front sprites face left; mirror horizontally so partner faces right in Sky-Hop flight!
      ctx.scale(-1, 1);
      const contour = getSpriteSilhouetteContour(frameCanvas);
      if (contour) {
        const padX = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dw) / frameCanvas.width));
        const padY = Math.max(1, Math.round((SILHOUETTE_CONTOUR_PAD * dh) / frameCanvas.height));
        ctx.drawImage(
          contour,
          Math.round(-dw * 0.5) - padX,
          Math.round(-dh * 0.5) - padY,
          dw + padX * 2,
          dh + padY * 2,
        );
      }
      ctx.drawImage(frameCanvas, Math.round(-dw * 0.5), Math.round(-dh * 0.5), dw, dh);
      ctx.restore();
      return;
    }

    if (this.rigSynthesizer) {
      const rig: OfflineRigDescriptor = {
        speciesId: sp.id,
        name: sp.name,
        primaryType: sp.type,
        archetype: sp.archetype,
        colorHex: sp.color,
        shiny: state.partnerShiny,
      };
      this.rigSynthesizer.renderRig(ctx, rig, {
        cx: 0,
        cy: 0,
        size,
        time: this.localTime,
        facing: 'right',
        rimColor: state.dashTimer > 0 ? '#7ce8ff' : pal.glow,
        reducedMotion,
      });
      ctx.restore();
      return;
    }

    const fbRegion = this.manifest?.sheets?.fallbacks?.regions?.[sp.archetype];
    if (fallbackSheet && fbRegion) {
      ctx.drawImage(
        fallbackSheet,
        fbRegion.x,
        fbRegion.y,
        fbRegion.w,
        fbRegion.h,
        Math.round(-size * 0.5),
        Math.round(-size * 0.5),
        size,
        size,
      );
    } else {
      drawPixelArchetypeSprite(
        ctx,
        sp.id,
        Math.round(-size * 0.5),
        Math.round(-size * 0.5),
        size,
        state.partnerShiny,
      );
    }

    ctx.restore();
  }

  private drawPixelAurora(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    accentHex: string,
    t: number,
    motion: number,
    isDashing: boolean,
  ): void {
    const [r, g, b] = hexToRgb255(accentHex);
    const step = Math.max(6, Math.round(cw / 96));
    const ribbons = [
      { yBase: 0.18, color: `rgba(${r}, ${g}, ${b}, ${isDashing ? 0.28 : 0.18})`, amp: 0.045, freq: 1.5 },
      { yBase: 0.30, color: `rgba(124, 232, 255, ${isDashing ? 0.24 : 0.14})`, amp: 0.04, freq: 2.1 },
    ];
    for (let idx = 0; idx < ribbons.length; idx++) {
      const rb = ribbons[idx];
      ctx.fillStyle = rb.color;
      for (let x = 0; x < cw; x += step) {
        const nx = x / cw;
        const wave = Math.sin(nx * Math.PI * rb.freq + t * 0.9 * motion + idx * 1.7) * ch * rb.amp;
        const ry = Math.round(ch * rb.yBase + wave);
        const rh = Math.round(ch * 0.09);
        ctx.fillRect(x, ry, step, rh);
      }
    }
  }

  private drawPixelCloudSea(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scroll: number,
    baseYNorm: number,
    bodyHex: string,
    rimHex: string,
    lobeCount: number,
  ): void {
    const baseY = Math.round(h * baseYNorm);
    const span = w / Math.max(4, lobeCount);
    const offset = ((scroll * w * 0.28) % span + span) % span;
    const step = 4;

    // Soft solid cloud deck foundation below billows
    ctx.fillStyle = bodyHex;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, baseY + 6, w, Math.max(0, h - baseY));

    for (let i = -1; i <= lobeCount + 2; i++) {
      const cx = Math.round(i * span - offset);
      const halfSpan = Math.round(span * 0.62);
      const puffH = Math.round(14 + Math.abs(Math.sin(i * 1.9)) * 16);

      // Stepped pixel dome (smooth rounded 16-bit cloud silhouette, zero flat blocks)
      const tiers = [
        { dy: -puffH, hw: Math.round(halfSpan * 0.34), h: step },
        { dy: -puffH + step, hw: Math.round(halfSpan * 0.56), h: step * 2 },
        { dy: -puffH + step * 3, hw: Math.round(halfSpan * 0.78), h: step * 2 },
        { dy: -puffH + step * 5, hw: halfSpan, h: puffH + 12 },
      ];

      ctx.fillStyle = rimHex;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(cx - tiers[0].hw, baseY + tiers[0].dy - 2, tiers[0].hw * 2, step);
      ctx.fillRect(cx - tiers[1].hw, baseY + tiers[1].dy - 2, tiers[1].hw * 2, step);

      ctx.fillStyle = bodyHex;
      ctx.globalAlpha = 0.62;
      for (const tier of tiers) {
        ctx.fillRect(cx - tier.hw, baseY + tier.dy, tier.hw * 2, tier.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawStarDashTunnel(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    bankAngle: number,
    reducedMotion: boolean,
  ): void {
    ctx.save();
    const colors = ['rgba(124, 232, 255, 0.5)', 'rgba(255, 213, 102, 0.45)', 'rgba(232, 121, 249, 0.42)'];
    const lineCount = reducedMotion ? 8 : 16;
    for (let i = 0; i < lineCount; i++) {
      const sy = Math.round(((i + 0.5) / lineCount) * h);
      const len = 56 + ((i * 37) % 88);
      const lx = Math.round((((w - ((this.localTime * 960 + i * 140) % (w + len))) % (w + len))));
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(lx, sy, len, 3);
    }

    const cone = ctx.createRadialGradient(cx + 10, cy, 8, cx - 22, cy, 110);
    cone.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    cone.addColorStop(0.45, 'rgba(124, 232, 255, 0.3)');
    cone.addColorStop(1, 'rgba(124, 232, 255, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.ellipse(cx - 12, cy, 108, 42, bankAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSlipstreamAfterimages(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    state: SkyHopState,
  ): void {
    if (this.trail.length === 0) return;
    const isDashing = state.dashTimer > 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < this.trail.length; i++) {
      const sample = this.trail[i];
      const alpha = clamp(1 - sample.age / 0.42, 0, 1) * (sample.dash || isDashing ? 0.48 : 0.25);
      const ax = Math.round(sample.x * sx);
      const ay = Math.round(sample.y * sy);
      ctx.globalAlpha = alpha;
      if (sample.frame && i % 2 === 0) {
        const s = 32;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.scale(-1, 1);
        ctx.drawImage(sample.frame, -s * 0.5, -s * 0.5, s, s);
        ctx.restore();
      } else {
        const box = sample.dash || isDashing ? 10 : 6;
        ctx.fillStyle = sample.dash || isDashing ? '#7ce8ff' : '#ffd566';
        ctx.fillRect(ax - box * 0.5, ay - box * 0.5, box, box);
      }
    }
    ctx.restore();
  }

  private drawEntity(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    sx: number,
    sy: number,
    ent: SkyHopEntity,
    t: number,
    reducedMotion: boolean,
  ): void {
    // Telegraph warning indicator at right screen edge when Void Meteor approaches off-screen
    if (ent.kind === 'void_meteor' && ent.x > SKYHOP_LOGICAL_W - 14) {
      const wy = clamp(Math.round(ent.y * sy), 24, ch - 24);
      const wx = cw - 24;
      const blink = Math.floor(t * 10) % 2 === 0;
      ctx.save();
      ctx.fillStyle = blink ? '#ff4d6d' : '#ffd566';
      ctx.fillRect(wx - 10, wy - 10, 20, 20);
      ctx.fillStyle = '#12071a';
      ctx.fillRect(wx - 2, wy - 6, 4, 7);
      ctx.fillRect(wx - 2, wy + 3, 4, 4);
      ctx.restore();
      return;
    }

    const ex = Math.round(ent.x * sx);
    const ey = Math.round(ent.y * sy);
    const r = Math.max(10, Math.round(ent.radius * Math.min(sx, sy)));
    const phase = reducedMotion ? 0 : ent.age * 3.5;

    ctx.save();
    ctx.translate(ex, ey);

    if (ent.kind === 'star' || ent.kind === 'bigstar') {
      const isBig = ent.kind === 'bigstar';
      const s = isBig ? Math.round(r * 0.42) : Math.round(r * 0.34);
      // Pixel star cross + golden core
      ctx.fillStyle = isBig ? 'rgba(255, 213, 102, 0.32)' : 'rgba(255, 240, 150, 0.22)';
      ctx.fillRect(-s * 3, -s * 3, s * 6, s * 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-s * 2, -s * 2, s * 4, s * 4);
      ctx.fillStyle = '#ffd566';
      ctx.fillRect(-s * 3, -s, s * 6, s * 2);
      ctx.fillRect(-s, -s * 3, s * 2, s * 6);
      ctx.fillStyle = '#fffde7';
      ctx.fillRect(-s, -s, s * 2, s * 2);
    } else if (ent.kind === 'comet') {
      // Rainbow Comet with prismatic pixel tail
      const tailColors = ['#ff70a6', '#ffd566', '#56e39f', '#7ce8ff', '#b388ff'];
      tailColors.forEach((col, idx) => {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(r * 0.3 + idx * 6), Math.round(-6 + idx * 2), 14 - idx * 2, 4);
      });
      ctx.fillStyle = '#7ce8ff';
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-r * 0.5, -r * 0.35, r, r * 0.7);
    } else if (ent.kind === 'cloud') {
      // Storm Thundercloud hazard
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-r, -r * 0.45, r * 2, r * 0.9);
      ctx.fillRect(-r * 0.65, -r * 0.85, r * 1.3, r * 0.6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-r * 0.85, -r * 0.35, r * 1.7, r * 0.55);
      // Yellow crackling lightning pixel bolt
      ctx.fillStyle = Math.sin(phase * 2) > 0 ? '#fde047' : '#38bdf8';
      ctx.fillRect(-3, r * 0.25, 6, 6);
      ctx.fillRect(-6, r * 0.55, 6, 5);
    } else if (ent.kind === 'storm_orb') {
      // Menacing Plasma Storm Orb
      ctx.fillStyle = 'rgba(168, 85, 247, 0.34)';
      ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
      ctx.fillStyle = '#581c87';
      ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
      ctx.fillStyle = '#f0abfc';
      const arcOff = Math.round(Math.sin(phase * 2) * r * 0.45);
      ctx.fillRect(arcOff - 3, -r, 6, 4);
      ctx.fillRect(-arcOff - 3, r - 4, 6, 4);
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(-4, -4, 8, 8);
    } else if (ent.kind === 'void_meteor') {
      // Flaming Dread/Void Meteor
      ctx.fillStyle = 'rgba(255, 107, 53, 0.48)';
      ctx.fillRect(0, -r * 0.7, r * 2.1, r * 1.4);
      ctx.fillStyle = '#ff9f43';
      ctx.fillRect(r * 0.4, -r * 0.4, r * 1.4, r * 0.8);
      ctx.fillStyle = '#2b1321';
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#ff6b35';
      ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
    } else if (ent.kind === 'heart') {
      // Pixel Healing Heart pickup
      const s = Math.max(3, Math.round(r * 0.28));
      ctx.fillStyle = 'rgba(255, 112, 166, 0.32)';
      ctx.fillRect(-s * 3, -s * 3, s * 6, s * 6);
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(-s * 2, -s * 2, s * 1.8, s * 1.5);
      ctx.fillRect(s * 0.2, -s * 2, s * 1.8, s * 1.5);
      ctx.fillRect(-s * 2.2, -s * 0.8, s * 4.4, s * 1.6);
      ctx.fillRect(-s * 1.2, s * 0.8, s * 2.4, s);
      ctx.fillRect(-s * 0.5, s * 1.8, s, s * 0.8);
      ctx.fillStyle = '#ffe4e6';
      ctx.fillRect(-s * 1.5, -s * 1.5, s, s);
    }

    ctx.restore();
  }
}
