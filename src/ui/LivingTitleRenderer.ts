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
    [0.12, 0.14],
    [0.18, 0.10],
    [0.24, 0.14],
    [0.21, 0.21],
    [0.12, 0.14],
  ],
  [
    [0.44, 0.09],
    [0.49, 0.15],
    [0.55, 0.11],
    [0.61, 0.17],
  ],
  [
    [0.75, 0.18],
    [0.80, 0.12],
    [0.87, 0.16],
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
    ctx.fillRect(px - s, py, s * 3, Math.max(1, Math.floor(s * 0.5)));
    ctx.fillRect(px, py - s, Math.max(1, Math.floor(s * 0.5)), s * 3);
  }
}

export class LivingTitleRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private manifest: AtlasManifest | null = null;
  private getArenaImage: ((id: BiomeId | 'skyhop') => HTMLImageElement | null) | null = null;
  private getSheetImage: ((sheetId: string) => HTMLImageElement | null) | null = null;

  private elapsedSeconds = 0;
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

  update(dtSeconds: number, reducedMotion = false): void {
    const clamped = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(0.05, dtSeconds)) : 0;
    this.elapsedSeconds += clamped * (reducedMotion ? 0.22 : 1.0);
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
      starlightIntensity: 0.94,
      waveAmplitude: reducedMotion ? 0.2 : 0.95,
      foamColor: villageProfile.waterConfig.foamColor,
    });

    const skyArena = this.getArenaImage?.('skyhop') ?? this.getArenaImage?.('village') ?? null;
    const charSheet = this.getSheetImage?.('characters') ?? null;
    const fallbackSheet = this.getSheetImage?.('fallbacks') ?? null;

    // World Layer: Crisp Pixel Panorama / Twilight Sky, Pixel Stars, Aurora Ribbons, Cliffs & Floating Lanterns
    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;
      const hy = Math.round(ch * 0.72);
      ctx.imageSmoothingEnabled = false;

      // 1. Base twilight sky gradient + crisp pixel panorama when loaded
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, '#070b1e');
      sky.addColorStop(0.42, '#132052');
      sky.addColorStop(0.78, '#283d7a');
      sky.addColorStop(1, '#4f4685');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, hy + 2);

      if (skyArena && skyArena.naturalWidth > 0 && skyArena.naturalHeight > 0) {
        const scale = Math.max(cw / skyArena.naturalWidth, hy / skyArena.naturalHeight);
        const dw = Math.ceil(skyArena.naturalWidth * scale);
        const dh = Math.ceil(skyArena.naturalHeight * scale);
        const dx = Math.round((cw - dw) * 0.5);
        const dy = Math.round((hy - dh) * 0.35);
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(skyArena, dx, dy, dw, dh);
        ctx.restore();
      }

      // 2. Pixel-stepped Aurora ribbons across the twilight canopy
      const pxStep = Math.max(4, Math.round(cw / 120));
      for (let band = 0; band < 2; band++) {
        ctx.fillStyle = band === 0 ? 'rgba(78, 242, 194, 0.14)' : 'rgba(179, 136, 255, 0.13)';
        for (let px = 0; px < cw; px += pxStep) {
          const wave = Math.sin(t * 0.55 * motion + (px / cw) * 6.5 + band * 2.1);
          const ribbonY = Math.round(ch * (0.16 + band * 0.08) + wave * ch * 0.032);
          const ribbonH = Math.round(ch * (0.065 + 0.02 * Math.cos(px * 0.02 + t * 0.4 * motion)));
          ctx.fillRect(px, ribbonY, pxStep, Math.max(8, ribbonH));
        }
      }

      // 3. Twinkling pixel starfield (square pixel stars + 4-point cross sparkles)
      for (let i = 0; i < 56; i++) {
        const sx = ((Math.sin(i * 127.1 + 1.3) * 0.5 + 0.5) * 0.96 + 0.02) * cw;
        const sy = ((Math.sin(i * 311.7 + 4.9) * 0.5 + 0.5) * 0.54 + 0.03) * ch;
        const twinkle = 0.45 + 0.55 * Math.sin(t * (1.8 + (i % 5) * 0.5) * motion + i * 2.1);
        const alpha = (0.32 + twinkle * 0.65).toFixed(3);
        const tint = i % 5 === 0 ? `rgba(255, 224, 130, ${alpha})` : `rgba(232, 246, 255, ${alpha})`;
        drawPixelStar(ctx, sx, sy, i % 7 === 0 ? 3 : 2, tint);
      }

      // 4. Connected Starlight Constellations
      ctx.save();
      ctx.strokeStyle = 'rgba(124, 232, 255, 0.28)';
      ctx.lineWidth = 1.2;
      for (const line of CONSTELLATIONS) {
        ctx.beginPath();
        line.forEach(([nx, ny], idx) => {
          const px = Math.round(nx * cw);
          const py = Math.round(ny * ch);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        for (const [nx, ny] of line) {
          drawPixelStar(ctx, nx * cw, ny * ch, 2, '#ffd566');
        }
      }
      ctx.restore();

      // 5. Pixel Moon + Glow
      const moonX = Math.round(cw * 0.8);
      const moonY = Math.round(ch * 0.18);
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 86);
      moonGlow.addColorStop(0, 'rgba(255, 248, 214, 0.72)');
      moonGlow.addColorStop(0.35, 'rgba(124, 232, 255, 0.22)');
      moonGlow.addColorStop(1, 'rgba(124, 232, 255, 0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(moonX - 86, moonY - 86, 172, 172);
      ctx.fillStyle = '#fff9df';
      ctx.fillRect(moonX - 18, moonY - 18, 36, 36);
      ctx.fillRect(moonX - 12, moonY - 22, 24, 44);
      ctx.fillRect(moonX - 22, moonY - 12, 44, 24);

      // 6. Silhouetted Pixel Island Cliffs & Observatory Ridge
      const stepW = Math.max(8, Math.round(cw / 64));
      ctx.fillStyle = '#121b42';
      for (let px = 0; px < cw; px += stepW) {
        const nx = px / cw;
        const ridge =
          Math.sin(nx * 5.2 + 0.6) * 0.055 +
          Math.cos(nx * 11.4) * 0.025 +
          (nx > 0.35 && nx < 0.65 ? 0.04 : 0);
        const topY = Math.round(hy - ch * Math.max(0.04, 0.08 + ridge));
        ctx.fillRect(px, topY, stepW + 1, hy - topY + 2);
      }

      // Observatory Dome Pixel Silhouette
      const obsX = Math.round(cw * 0.5);
      const obsY = Math.round(hy - ch * 0.14);
      ctx.fillStyle = '#192557';
      ctx.fillRect(obsX - 24, obsY - 12, 48, 24);
      ctx.fillRect(obsX - 18, obsY - 24, 36, 12);
      ctx.fillRect(obsX - 10, obsY - 30, 20, 6);
      ctx.fillStyle = '#7ce8ff';
      ctx.fillRect(obsX - 4, obsY - 22, 8, 8);

      // Harbor Boardwalk Pier
      ctx.fillStyle = '#261f38';
      ctx.fillRect(Math.round(cw * 0.1), hy - 6, Math.round(cw * 0.8), 10);
      ctx.fillStyle = '#423354';
      ctx.fillRect(Math.round(cw * 0.1), hy - 6, Math.round(cw * 0.8), 3);

      // 7. Floating Pixel Lanterns rising gently over the harbor
      for (let i = 0; i < 9; i++) {
        const laneX = cw * (0.08 + ((i * 0.11 + 0.04) % 0.84));
        const sway = Math.sin(t * 1.1 * motion + i * 1.7) * 10;
        const rise = ((t * 14 * motion + i * 48) % Math.max(120, hy * 0.72));
        const lx = Math.round(laneX + sway);
        const ly = Math.round(hy - 18 - rise);
        ctx.fillStyle = 'rgba(255, 213, 102, 0.28)';
        ctx.fillRect(lx - 6, ly - 6, 12, 14);
        ctx.fillStyle = '#ff9f43';
        ctx.fillRect(lx - 3, ly - 3, 6, 8);
        ctx.fillStyle = '#fff5b8';
        ctx.fillRect(lx - 2, ly - 1, 4, 4);
      }
    }, 'world');

    // 8. Shimmering Starlight Sea Water Quads (WebGL2 & Canvas2D Parity!)
    const waterBands = 3;
    const waterTotalH = Math.max(36, h - horizonY);
    const bandH = Math.max(12, waterTotalH / waterBands);
    for (let i = 0; i < waterBands; i++) {
      backend.drawWaterQuad(
        0,
        horizonY + i * bandH,
        w,
        bandH + 2,
        0.24 + i * 0.32,
        i === 0 ? 0.86 : 0.16,
      );
    }

    // 9. Warm Harbor Lantern, Moon, & Violet/Ozias Aura PointLights
    backend.addPointLight({
      id: 'title-moon',
      x: w * 0.8,
      y: h * 0.18,
      radius: 190,
      color: [0.65, 0.88, 1.0],
      intensity: 0.9,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-lantern-west',
      x: w * 0.2,
      y: horizonY - 26,
      radius: 170,
      color: [1.0, 0.8, 0.42],
      intensity: 1.1,
      flickerSpeed: 3.1,
      flickerAmount: 0.1,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-lantern-east',
      x: w * 0.78,
      y: horizonY - 26,
      radius: 170,
      color: [1.0, 0.82, 0.46],
      intensity: 1.1,
      flickerSpeed: 2.7,
      flickerAmount: 0.1,
      screenSpace: true,
    });

    const violetProfile = save.profiles.violet;
    const oziasProfile = save.profiles.ozias;
    const vAuraRgb = AURA_RGB_MAP[violetProfile?.appearance?.aura ?? 'none'] ?? AURA_RGB_MAP.stars;
    const oAuraRgb = AURA_RGB_MAP[oziasProfile?.appearance?.aura ?? 'none'] ?? AURA_RGB_MAP.lightning;

    backend.addPointLight({
      id: 'title-violet-aura',
      x: w * 0.27,
      y: horizonY - 28,
      radius: 150,
      color: vAuraRgb,
      intensity: save.activeTrainerId === 'violet' ? 1.25 : 0.8,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-ozias-aura',
      x: w * 0.73,
      y: horizonY - 28,
      radius: 150,
      color: oAuraRgb,
      intensity: save.activeTrainerId === 'ozias' ? 1.25 : 0.8,
      screenSpace: true,
    });

    // 10. Drifting Starlight Firefly Motes
    const moteCount = reducedMotion ? 6 : 14;
    for (let i = 0; i < moteCount; i++) {
      const mx = (((i * 0.17 + t * 0.03 * motion * ((i % 2) * 2 - 1)) % 1) + 1) % 1;
      const my = 0.42 + 0.32 * Math.sin(t * 0.7 * motion + i * 1.4);
      backend.drawParticle({
        x: mx * w,
        y: my * h,
        radius: 3 + (i % 3) * 1.2,
        color: i % 2 === 0 ? [1.0, 0.86, 0.48, 0.65] : [0.55, 0.92, 1.0, 0.62],
        additive: true,
      });
    }

    // 11. Post-Light Layer: Crisp Pixel Harbor Pedestals for Violet & Ozias + Lead Partners
    backend.drawCustom2D((ctx, cw, ch) => {
      const hy = Math.round(ch * 0.72);
      ctx.imageSmoothingEnabled = false;

      const drawPedestal = (
        profile: DojoProfileState,
        centerX: number,
        isSelected: boolean,
        facingPartner: 'left' | 'right',
      ) => {
        const pedY = hy + 4;
        const look = getResolvedTrainerLook(profile.trainerId, profile.appearance);
        ctx.save();

        // Pixel-stepped glowing pedestal
        ctx.fillStyle = isSelected ? 'rgba(255, 213, 102, 0.24)' : 'rgba(124, 232, 255, 0.14)';
        ctx.fillRect(Math.round(centerX - 66), pedY - 6, 132, 12);
        ctx.strokeStyle = isSelected ? '#ffd566' : look.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(centerX - 66), pedY - 6, 132, 12);

        // Trainer pixel sprite or portrait
        const trainerX = Math.round(centerX - 42);
        const trainerY = Math.round(pedY - 48);
        const regionId = `${profile.trainerId}_idle`;
        const region = this.manifest?.sheets?.characters?.regions?.[regionId];
        if (charSheet && region) {
          ctx.drawImage(charSheet, region.x, region.y, region.w, region.h, trainerX, trainerY, 40, 48);
        } else {
          // Crisp pixel trainer silhouette
          ctx.fillStyle = look.hair;
          ctx.fillRect(trainerX + 10, trainerY + 4, 20, 12);
          ctx.fillStyle = look.skin;
          ctx.fillRect(trainerX + 12, trainerY + 12, 16, 12);
          ctx.fillStyle = '#141a38';
          ctx.fillRect(trainerX + 14, trainerY + 17, 3, 3);
          ctx.fillRect(trainerX + 23, trainerY + 17, 3, 3);
          ctx.fillStyle = look.outfitPrimary;
          ctx.fillRect(trainerX + 10, trainerY + 24, 20, 14);
          ctx.fillStyle = look.outfitSecondary;
          ctx.fillRect(trainerX + 14, trainerY + 24, 12, 4);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(trainerX + 12, trainerY + 38, 6, 8);
          ctx.fillRect(trainerX + 22, trainerY + 38, 6, 8);
        }

        // Lead Partner (or starter preview if starter chosen)
        const lead = profile.team[0];
        if (lead) {
          const sp = getSpeciesEntry(lead.speciesId);
          const partnerCx = Math.round(centerX + 26);
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

      drawPedestal(violetProfile, cw * 0.27, save.activeTrainerId === 'violet', 'left');
      drawPedestal(oziasProfile, cw * 0.73, save.activeTrainerId === 'ozias', 'right');
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
