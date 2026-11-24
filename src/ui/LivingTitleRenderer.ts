import type {
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  StarlightSaveState,
  TrainerProfile,
} from '../contracts';
import { AURA_BY_ID, BIOME_COLOR_GRADES, getSpecies } from '../core';
import { drawSpeciesPortrait, drawTrainerCharacter } from './StyleStudioStage';

const CONSTELLATIONS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [
    [0.14, 0.16],
    [0.19, 0.12],
    [0.25, 0.15],
    [0.23, 0.22],
    [0.14, 0.16],
  ],
  [
    [0.44, 0.11],
    [0.49, 0.17],
    [0.55, 0.13],
    [0.61, 0.19],
  ],
  [
    [0.74, 0.21],
    [0.79, 0.14],
    [0.86, 0.18],
    [0.83, 0.26],
  ],
];

export function renderProfileCardPreview(
  canvas: HTMLCanvasElement,
  profile: TrainerProfile,
  synth: IOfflineSpriteRigSynthesizer | null,
  timeSec: number,
  reducedMotion: boolean,
): void {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return;

  const w = canvas.width || 92;
  const h = canvas.height || 84;
  const t = reducedMotion ? 0 : timeSec;

  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#101b47');
  bg.addColorStop(1, '#090f28');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Horizon floor glow
  ctx.fillStyle = 'rgba(124, 232, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.84, w * 0.42, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  drawTrainerCharacter(ctx, profile.style, {
    cx: w * 0.34,
    cy: h * 0.62,
    scale: 0.72,
    time: t,
    facing: 'front',
    reducedMotion,
  });

  const lead = profile.party[0];
  if (lead) {
    const sp = getSpecies(lead.speciesId);
    drawSpeciesPortrait(ctx, sp, synth, {
      cx: w * 0.7,
      cy: h * 0.64,
      size: 40,
      time: t,
      facing: 'left',
      shiny: lead.shiny,
      reducedMotion,
    });
  }
}

export class LivingTitleRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private elapsedSeconds = 0;
  private viewportW = 960;
  private viewportH = 540;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    this.rigSynthesizer = options?.rigSynthesizer ?? null;
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
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

    // Resolve viewport dims cleanly from Canvas2D or active canvas
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
    const horizonY = h * 0.7;

    backend.setCamera({ x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0, rotation: 0 });
    backend.setColorGrade(BIOME_COLOR_GRADES['starlight-village']);
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
      skyTopColor: [0.06, 0.1, 0.26],
      skyBottomColor: [0.24, 0.34, 0.62],
      starlightIntensity: 0.92,
      waveAmplitude: reducedMotion ? 0.25 : 1.0,
      foamColor: [0.88, 0.96, 1.0],
    });

    // World Layer: Twilight Sky, Aurora, Constellations, Lunar Clouds, Island Village Silhouettes
    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;
      const hy = ch * 0.7;

      // 1. Twilight sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, '#070b1e');
      sky.addColorStop(0.42, '#132052');
      sky.addColorStop(0.78, '#2b4482');
      sky.addColorStop(1, '#58508a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, hy + 2);

      // 2. Soft Aurora ribbons across the twilight canopy
      for (let band = 0; band < 2; band++) {
        ctx.save();
        const ribbonGrad = ctx.createLinearGradient(0, ch * 0.08, cw, ch * 0.34);
        ribbonGrad.addColorStop(0, band === 0 ? 'rgba(78, 242, 194, 0.0)' : 'rgba(179, 136, 255, 0.0)');
        ribbonGrad.addColorStop(0.5, band === 0 ? 'rgba(78, 242, 194, 0.16)' : 'rgba(124, 232, 255, 0.14)');
        ribbonGrad.addColorStop(1, 'rgba(179, 136, 255, 0.0)');
        ctx.fillStyle = ribbonGrad;
        ctx.beginPath();
        ctx.moveTo(0, ch * (0.22 + band * 0.08));
        for (let i = 0; i <= 8; i++) {
          const px = (i / 8) * cw;
          const py =
            ch * (0.18 + band * 0.07) +
            Math.sin(t * 0.45 * motion + i * 0.8 + band * 2.1) * ch * 0.04;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(cw, ch * 0.38);
        ctx.lineTo(0, ch * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Twinkling starfield
      for (let i = 0; i < 48; i++) {
        const sx = ((Math.sin(i * 127.1 + 1.3) * 0.5 + 0.5) * 0.96 + 0.02) * cw;
        const sy = ((Math.sin(i * 311.7 + 4.9) * 0.5 + 0.5) * 0.55 + 0.03) * ch;
        const twinkle = 0.45 + 0.55 * Math.sin(t * (1.8 + (i % 5) * 0.5) * motion + i * 2.1);
        ctx.fillStyle = `rgba(240, 248, 255, ${(0.3 + twinkle * 0.65).toFixed(3)})`;
        const rad = i % 7 === 0 ? 2.0 : 1.25;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Connected Starlight Constellations
      ctx.save();
      ctx.strokeStyle = 'rgba(124, 232, 255, 0.32)';
      ctx.lineWidth = 1.1;
      for (const line of CONSTELLATIONS) {
        ctx.beginPath();
        line.forEach(([nx, ny], idx) => {
          const px = nx * cw;
          const py = ny * ch;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        ctx.fillStyle = '#ffe082';
        for (const [nx, ny] of line) {
          ctx.beginPath();
          ctx.arc(nx * cw, ny * ch, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 5. Luminous Moon & Drifting Lunar Clouds
      const moonX = cw * 0.78;
      const moonY = ch * 0.19;
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 12, moonX, moonY, 96);
      moonGlow.addColorStop(0, 'rgba(255, 248, 214, 0.85)');
      moonGlow.addColorStop(0.32, 'rgba(155, 232, 255, 0.28)');
      moonGlow.addColorStop(1, 'rgba(155, 232, 255, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 96, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff9df';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
      ctx.fill();

      // Parallax lunar clouds
      for (let i = 0; i < 5; i++) {
        const speed = (10 + (i % 3) * 6) * motion;
        const cx = (((i * 0.24 * cw + t * speed) % (cw + 220)) - 110);
        const cy = ch * (0.2 + (i % 3) * 0.08);
        const cloudW = 110 + (i % 2) * 55;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(202, 224, 255, 0.16)' : 'rgba(156, 184, 238, 0.12)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, cloudW, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - cloudW * 0.36, cy + 4, cloudW * 0.55, 13, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + cloudW * 0.34, cy + 3, cloudW * 0.6, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Far Starlight Island Mountain Ridges + Observatory Dome
      ctx.fillStyle = '#141e47';
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(cw * 0.12, hy - ch * 0.12);
      ctx.lineTo(cw * 0.28, hy - ch * 0.05);
      ctx.lineTo(cw * 0.48, hy - ch * 0.16);
      ctx.lineTo(cw * 0.68, hy - ch * 0.06);
      ctx.lineTo(cw * 0.86, hy - ch * 0.14);
      ctx.lineTo(cw, hy - ch * 0.07);
      ctx.lineTo(cw, hy + 2);
      ctx.closePath();
      ctx.fill();

      // Observatory Dome Silhouette atop center-left ridge
      const obsX = cw * 0.48;
      const obsY = hy - ch * 0.16;
      ctx.fillStyle = '#1b285c';
      ctx.fillRect(obsX - 24, obsY - 12, 48, 22);
      ctx.beginPath();
      ctx.arc(obsX, obsY - 12, 22, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9be8ff';
      ctx.fillRect(obsX - 4, obsY - 28, 8, 12);

      // 7. Cozy Starlight Village Harbor Silhouettes & Warm Lit Windows
      ctx.fillStyle = '#0e1635';
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.quadraticCurveTo(cw * 0.22, hy - 34, cw * 0.48, hy - 14);
      ctx.quadraticCurveTo(cw * 0.74, hy - 36, cw, hy - 10);
      ctx.lineTo(cw, hy + 6);
      ctx.lineTo(0, hy + 6);
      ctx.closePath();
      ctx.fill();

      const cottages = [
        { x: cw * 0.18, y: hy - 22, w: 54, h: 32 },
        { x: cw * 0.29, y: hy - 18, w: 46, h: 28 },
        { x: cw * 0.67, y: hy - 22, w: 56, h: 34 },
        { x: cw * 0.79, y: hy - 18, w: 44, h: 28 },
      ];
      for (const c of cottages) {
        ctx.fillStyle = '#182146';
        ctx.fillRect(c.x - c.w * 0.5, c.y - c.h, c.w, c.h);
        // Pitched roof
        ctx.fillStyle = '#262f5c';
        ctx.beginPath();
        ctx.moveTo(c.x - c.w * 0.58, c.y - c.h);
        ctx.lineTo(c.x, c.y - c.h - 18);
        ctx.lineTo(c.x + c.w * 0.58, c.y - c.h);
        ctx.closePath();
        ctx.fill();

        // Warm lit cottage windows
        ctx.fillStyle = '#ffd479';
        ctx.fillRect(c.x - c.w * 0.28, c.y - c.h * 0.62, 10, 10);
        ctx.fillRect(c.x + c.w * 0.1, c.y - c.h * 0.62, 10, 10);
      }

      // Center harbor boardwalk pier
      ctx.fillStyle = '#2d2538';
      ctx.fillRect(cw * 0.12, hy - 4, cw * 0.76, 12);
    }, 'world');

    // 8. Shimmering Starlight Sea Water Quads (WebGL2 & Canvas2D Parity!)
    const waterBands = 3;
    const waterTotalH = h - horizonY;
    const bandH = Math.max(12, waterTotalH / waterBands);
    for (let i = 0; i < waterBands; i++) {
      backend.drawWaterQuad(
        0,
        horizonY + i * bandH,
        w,
        bandH + 2,
        0.22 + i * 0.34,
        i === 0 ? 0.85 : 0.15,
      );
    }

    // 9. Warm Village Lantern & Trainer Aura PointLights
    backend.addPointLight({
      id: 'title-moon',
      x: w * 0.78,
      y: h * 0.19,
      radius: 190,
      color: [0.65, 0.88, 1.0],
      intensity: 0.9,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-cottage-west',
      x: w * 0.22,
      y: horizonY - 24,
      radius: 170,
      color: [1.0, 0.8, 0.42],
      intensity: 1.15,
      flickerSpeed: 3.2,
      flickerAmount: 0.1,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-cottage-east',
      x: w * 0.74,
      y: horizonY - 24,
      radius: 170,
      color: [1.0, 0.82, 0.46],
      intensity: 1.15,
      flickerSpeed: 2.8,
      flickerAmount: 0.1,
      screenSpace: true,
    });

    const slot0Aura = AURA_BY_ID[save.profiles.slot0.style.aura];
    const slot1Aura = AURA_BY_ID[save.profiles.slot1.style.aura];
    backend.addPointLight({
      id: 'title-slot0-aura',
      x: w * 0.26,
      y: horizonY - 34,
      radius: 150,
      color: slot0Aura?.lightRgb ?? [0.5, 0.85, 1.0],
      intensity: save.activeSlot === 'slot0' ? 1.25 : 0.75,
      screenSpace: true,
    });
    backend.addPointLight({
      id: 'title-slot1-aura',
      x: w * 0.74,
      y: horizonY - 34,
      radius: 150,
      color: slot1Aura?.lightRgb ?? [1.0, 0.72, 0.42],
      intensity: save.activeSlot === 'slot1' ? 1.25 : 0.75,
      screenSpace: true,
    });

    // 10. Drifting starlight firefly particles
    const moteCount = reducedMotion ? 6 : 14;
    for (let i = 0; i < moteCount; i++) {
      const mx = (((i * 0.17 + t * 0.035 * motion * ((i % 2) * 2 - 1)) % 1) + 1) % 1;
      const my = 0.45 + 0.35 * Math.sin(t * 0.7 * motion + i * 1.4);
      backend.drawParticle({
        x: mx * w,
        y: my * h,
        radius: 3 + (i % 3) * 1.5,
        color: i % 2 === 0 ? [1.0, 0.86, 0.48, 0.68] : [0.55, 0.92, 1.0, 0.65],
        additive: true,
      });
    }

    // 11. Post-Light Layer: Animated Dual Trainer + Lead Partner Harbor Previews
    backend.drawCustom2D((ctx, cw, ch) => {
      const hy = ch * 0.7;
      const drawSlotPreview = (
        profile: TrainerProfile,
        centerX: number,
        isSelected: boolean,
        facingPartner: 'left' | 'right',
      ) => {
        const pedY = hy + 6;
        ctx.save();
        // Luminous pier ring under active profile
        ctx.fillStyle = isSelected ? 'rgba(255, 213, 102, 0.24)' : 'rgba(124, 232, 255, 0.14)';
        ctx.strokeStyle = isSelected ? '#ffd566' : 'rgba(124, 232, 255, 0.45)';
        ctx.lineWidth = isSelected ? 2.2 : 1.2;
        ctx.beginPath();
        ctx.ellipse(centerX, pedY, 74, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const trainerX = centerX - 24;
        const partnerX = centerX + 30;

        drawTrainerCharacter(ctx, profile.style, {
          cx: trainerX,
          cy: pedY - 26,
          scale: 0.92,
          time: t,
          facing: 'front',
          reducedMotion,
        });

        const lead = profile.party[0];
        if (lead) {
          const sp = getSpecies(lead.speciesId);
          drawSpeciesPortrait(ctx, sp, this.rigSynthesizer, {
            cx: partnerX,
            cy: pedY - 24,
            size: 54,
            time: t,
            facing: facingPartner,
            shiny: lead.shiny,
            reducedMotion,
          });
        }
        ctx.restore();
      };

      drawSlotPreview(save.profiles.slot0, cw * 0.26, save.activeSlot === 'slot0', 'left');
      drawSlotPreview(save.profiles.slot1, cw * 0.74, save.activeSlot === 'slot1', 'right');
    }, 'post-light');
  }
}
