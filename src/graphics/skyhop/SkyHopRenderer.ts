import type {
  IOfflineSpriteRigSynthesizer,
  IRenderBackend,
  ISkyHopRenderer,
  OfflineRigDescriptor,
  SkyHopEntity,
  SkyHopState,
  SpeciesRecord,
} from '../../contracts';
import { BIOME_COLOR_GRADES, getSpecies, TYPE_PALETTES } from '../../core';

interface SlipstreamSample {
  x: number;
  y: number;
  age: number;
  dash: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function drawGlidingPartnerFallback(
  ctx: CanvasRenderingContext2D,
  species: SpeciesRecord,
  size: number,
  time: number,
  bankAngle: number,
  starDashActive: boolean,
  reducedMotion: boolean,
): void {
  const pal = TYPE_PALETTES[species.primaryType];
  const primary = species.palette[0] || pal.primary;
  const secondary = species.palette[1] || pal.secondary;
  const glow = species.palette[2] || pal.glow;
  const wingFlap = reducedMotion ? 0 : Math.sin(time * (starDashActive ? 14 : 7.5)) * size * 0.14;

  ctx.save();
  ctx.rotate(bankAngle);

  // Subtle aura behind gliding partner
  const aura = ctx.createRadialGradient(0, 0, size * 0.08, 0, 0, size * 0.72);
  aura.addColorStop(0, starDashActive ? 'rgba(124, 232, 255, 0.72)' : `${glow}55`);
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2);
  ctx.fill();

  // Trailing ribbon tail
  ctx.strokeStyle = glow;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, 0);
  ctx.quadraticCurveTo(-size * 0.58, -wingFlap * 0.6, -size * 0.85, wingFlap * 0.3);
  ctx.stroke();

  // Upper & lower swept aerodynamic wings
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.moveTo(size * 0.06, -size * 0.06);
  ctx.quadraticCurveTo(-size * 0.24, -size * 0.56 - wingFlap, -size * 0.52, -size * 0.22 - wingFlap * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.04, size * 0.08);
  ctx.quadraticCurveTo(-size * 0.2, size * 0.48 + wingFlap * 0.6, -size * 0.44, size * 0.2 + wingFlap * 0.4);
  ctx.closePath();
  ctx.fill();

  // Main sleek body
  const bodyGrad = ctx.createLinearGradient(-size * 0.35, -size * 0.25, size * 0.4, size * 0.25);
  bodyGrad.addColorStop(0, glow);
  bodyGrad.addColorStop(0.45, primary);
  bodyGrad.addColorStop(1, secondary);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.34, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Visor / eye highlight
  ctx.fillStyle = '#0d1533';
  ctx.beginPath();
  ctx.arc(size * 0.16, -size * 0.04, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size * 0.175, -size * 0.055, size * 0.022, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export class SkyHopRenderer implements ISkyHopRenderer {
  private rigSynthesizer: IOfflineSpriteRigSynthesizer | null = null;
  private trail: SlipstreamSample[] = [];
  private localTime = 0;
  private trailAccum = 0;
  private viewportW = 960;
  private viewportH = 540;

  constructor(options?: { rigSynthesizer?: IOfflineSpriteRigSynthesizer | null }) {
    this.rigSynthesizer = options?.rigSynthesizer ?? null;
  }

  setRigSynthesizer(synth: IOfflineSpriteRigSynthesizer | null): void {
    this.rigSynthesizer = synth;
  }

  update(state: SkyHopState, dtSeconds: number): void {
    const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, 0.05) : 0;
    this.localTime += dt;

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].age += dt;
      this.trail[i].x -= dt * (state.starDashActive ? 0.85 : 0.42);
      if (this.trail[i].age > 0.48 || this.trail[i].x < -0.1) {
        this.trail.splice(i, 1);
      }
    }

    this.trailAccum += dt;
    if (this.trailAccum >= 0.018) {
      this.trailAccum = 0;
      this.trail.push({
        x: state.playerX,
        y: state.playerY,
        age: 0,
        dash: state.starDashActive,
      });
      if (this.trail.length > 28) {
        this.trail.shift();
      }
    }
  }

  render(backend: IRenderBackend, state: SkyHopState): void {
    const reducedMotion = Boolean(state.reducedMotion || backend.capabilities.reducedMotion);
    const motion = reducedMotion ? 0.22 : 1.0;
    const t = state.auroraPhase || this.localTime;

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

    const baseGrade = BIOME_COLOR_GRADES['zephyr-peaks'];
    backend.setColorGrade({
      ...baseGrade,
      ambientStrength: state.starDashActive ? 0.92 : 0.82,
      bloomIntensity: state.starDashActive ? 0.62 : 0.44,
      vignetteStrength: state.starDashActive ? 0.28 : 0.2,
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
    backend.setCamera({
      x: 0,
      y: 0,
      zoom: state.starDashActive && !reducedMotion ? 1.02 : 1,
      rotation: reducedMotion ? 0 : state.bankAngle * 0.045,
      shakeX: state.starDashActive && !reducedMotion ? Math.sin(this.localTime * 42) * 2.2 : 0,
      shakeY: state.starDashActive && !reducedMotion ? Math.cos(this.localTime * 37) * 1.8 : 0,
    });

    // World Layer: Shifting Aurora Sky, Starfield, 3 Cloud Seas, Slipstream Tunnel, Entities, Gliding Partner
    backend.drawCustom2D((ctx, cw, ch) => {
      this.viewportW = cw;
      this.viewportH = ch;

      this.drawAuroraTwilightSky(ctx, cw, ch, state, t, motion, reducedMotion);
      this.drawCloudSeaLayer(ctx, cw, ch, state.cloudScroll * 0.34, 0.72, 0.2, '#243c78', '#89c4f4', 6);
      this.drawCloudSeaLayer(ctx, cw, ch, state.cloudScroll * 0.68, 0.81, 0.24, '#1b2e63', '#bae6fd', 5);

      if (state.starDashActive) {
        this.drawStarDashTunnel(ctx, cw, ch, state, reducedMotion);
      }

      // Render Entities (Star Shards, Plasma Vortices, Dread Meteors, Ring Boosts)
      for (const ent of state.entities) {
        if (ent.collected) continue;
        this.drawEntity(ctx, cw, ch, ent, reducedMotion);
      }

      // Wingtip slipstream ribbon trails
      this.drawSlipstreamTrail(ctx, cw, ch, state);

      // Banking/gliding lead partner rig
      const px = state.playerX * cw;
      const py = state.playerY * ch;
      const species = getSpecies(state.partnerSpeciesId);
      const rigSize = Math.max(44, Math.min(cw, ch) * 0.11);

      if (this.rigSynthesizer) {
        const pal = TYPE_PALETTES[species.primaryType];
        const rig: OfflineRigDescriptor = {
          speciesId: species.id,
          name: species.name,
          primaryType: species.primaryType,
          secondaryType: species.secondaryType,
          archetype: species.archetype,
          palette: species.palette,
        };
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(state.bankAngle);
        this.rigSynthesizer.renderRig(ctx, rig, {
          cx: 0,
          cy: 0,
          size: rigSize,
          time: this.localTime,
          facing: 'right',
          rimColor: state.starDashActive ? '#7ce8ff' : pal.glow,
          reducedMotion,
        });
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(px, py);
        drawGlidingPartnerFallback(
          ctx,
          species,
          rigSize,
          this.localTime,
          state.bankAngle,
          state.starDashActive,
          reducedMotion,
        );
        ctx.restore();
      }

      // Foreground near cloud sea mist
      this.drawCloudSeaLayer(ctx, cw, ch, state.cloudScroll * 1.18, 0.9, 0.28, '#13224d', '#e0f2fe', 5);
    }, 'world');

    // Dynamic Deferred PointLights (Player + Star Shards + Vortices + Meteors)
    const partnerRgb = TYPE_PALETTES[state.partnerType]?.rgb ?? [0.48, 0.91, 1.0];
    backend.addPointLight({
      id: 'skyhop-player-light',
      x: state.playerX * w,
      y: state.playerY * h,
      radius: state.starDashActive ? 220 : 145,
      color: state.starDashActive ? [0.55, 0.94, 1.0] : partnerRgb,
      intensity: state.starDashActive ? 1.55 : 1.05,
      screenSpace: true,
    });

    // Player slipstream particles
    const pTrailCount = state.starDashActive ? 6 : 2;
    for (let i = 0; i < pTrailCount; i++) {
      backend.drawParticle({
        x: state.playerX * w - 18 - i * 11,
        y: state.playerY * h + Math.sin(this.localTime * 12 + i) * 7,
        radius: state.starDashActive ? 11 - i : 6,
        color: state.starDashActive ? [0.52, 0.95, 1.0, 0.72] : [1.0, 0.86, 0.45, 0.55],
        additive: true,
        stretchX: state.starDashActive ? 2.4 : 1.5,
        stretchY: 0.65,
        rotation: state.bankAngle,
      });
    }

    let lightBudget = 1;
    for (const ent of state.entities) {
      if (ent.collected) continue;
      const ex = ent.x * w;
      const ey = ent.y * h;

      if (lightBudget < 22) {
        lightBudget += 1;
        if (ent.kind === 'star-shard' || ent.kind === 'ring-boost') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 105,
            color: [1.0, 0.88, 0.42],
            intensity: 1.05,
            flickerSpeed: 5.5,
            flickerAmount: 0.14,
            screenSpace: true,
          });
        } else if (ent.kind === 'plasma-vortex') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 135,
            color: [0.76, 0.42, 1.0],
            intensity: 1.2,
            screenSpace: true,
          });
        } else if (ent.kind === 'dread-meteor') {
          backend.addPointLight({
            id: `sh-light-${ent.id}`,
            x: ex,
            y: ey,
            radius: 120,
            color: [1.0, 0.45, 0.18],
            intensity: 1.25,
            flickerSpeed: 8,
            flickerAmount: 0.18,
            screenSpace: true,
          });
        }
      }

      if (ent.kind === 'dread-meteor') {
        for (let k = 0; k < 2; k++) {
          backend.drawParticle({
            x: ex + 16 + k * 14,
            y: ey - 6 - k * 4,
            radius: 9 - k * 2,
            color: [1.0, 0.48, 0.16, 0.72],
            additive: true,
            stretchX: 1.8,
            stretchY: 0.7,
            rotation: -0.25,
          });
        }
      } else if (ent.kind === 'plasma-vortex') {
        backend.drawParticle({
          x: ex + Math.cos(ent.phase * 2) * ent.radius * w * 0.7,
          y: ey + Math.sin(ent.phase * 2) * ent.radius * w * 0.7,
          radius: 7,
          color: [0.8, 0.48, 1.0, 0.78],
          additive: true,
        });
      } else if (ent.kind === 'star-shard') {
        backend.drawParticle({
          x: ex + Math.sin(ent.phase * 2.2) * 8,
          y: ey + Math.cos(ent.phase * 1.9) * 8,
          radius: 5,
          color: [1.0, 0.94, 0.62, 0.8],
          additive: true,
        });
      }
    }
  }

  private drawAuroraTwilightSky(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    state: SkyHopState,
    t: number,
    motion: number,
    reducedMotion: boolean,
  ): void {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05091c');
    sky.addColorStop(0.38, '#0f1f4c');
    sky.addColorStop(0.75, '#1d3c73');
    sky.addColorStop(1, '#315d8f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Shifting multi-ribbon Aurora Borealis curtains
    const ribbons: Array<{ yBase: number; colorA: string; colorB: string; amp: number; freq: number }> = [
      { yBase: 0.18, colorA: 'rgba(78, 242, 194, 0.34)', colorB: 'rgba(124, 232, 255, 0.0)', amp: 0.055, freq: 1.4 },
      { yBase: 0.28, colorA: 'rgba(124, 232, 255, 0.28)', colorB: 'rgba(179, 136, 255, 0.0)', amp: 0.048, freq: 1.9 },
      { yBase: 0.36, colorA: 'rgba(179, 136, 255, 0.26)', colorB: 'rgba(255, 150, 213, 0.0)', amp: 0.04, freq: 2.3 },
    ];

    ribbons.forEach((r, idx) => {
      const grad = ctx.createLinearGradient(0, h * (r.yBase - 0.12), 0, h * (r.yBase + 0.16));
      grad.addColorStop(0, r.colorB);
      grad.addColorStop(0.48, r.colorA);
      grad.addColorStop(1, r.colorB);
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, h * (r.yBase - 0.09));
      for (let i = 0; i <= 10; i++) {
        const nx = i / 10;
        const wave = Math.sin(nx * Math.PI * r.freq + t * 0.9 * motion + idx * 1.7) * h * r.amp;
        ctx.lineTo(nx * w, h * r.yBase + wave);
      }
      ctx.lineTo(w, h * (r.yBase + 0.15));
      ctx.lineTo(0, h * (r.yBase + 0.15));
      ctx.closePath();
      ctx.fill();
    });

    // Parallax twinkling starfield (stretches into speed streaks under Star Dash!)
    const starCount = 46;
    for (let i = 0; i < starCount; i++) {
      const baseX = (Math.sin(i * 127.1 + 0.7) * 0.5 + 0.5);
      const sx = (((baseX - state.cloudScroll * (0.08 + (i % 3) * 0.04)) % 1) + 1) % 1 * w;
      const sy = ((Math.sin(i * 311.7 + 2.3) * 0.5 + 0.5) * 0.72 + 0.03) * h;
      const twinkle = reducedMotion ? 0.75 : 0.4 + 0.6 * Math.sin(t * 2.4 + i * 1.9);
      ctx.fillStyle = `rgba(240, 248, 255, ${(0.3 + twinkle * 0.65).toFixed(3)})`;
      if (state.starDashActive) {
        ctx.fillRect(sx - 12, sy - 0.8, 24, 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, i % 6 === 0 ? 2.1 : 1.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawCloudSeaLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scroll: number,
    baseYNorm: number,
    heightNorm: number,
    shadowHex: string,
    rimHex: string,
    lobeCount: number,
  ): void {
    const baseY = h * baseYNorm;
    const span = w / lobeCount;
    const offset = ((scroll * w * 0.45) % span + span) % span;

    // Sunlit/moonlit rim puffs
    ctx.fillStyle = rimHex;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(-span, h);
    for (let i = -1; i <= lobeCount + 2; i++) {
      const cx = i * span - offset;
      const rad = span * 0.58;
      const cy = baseY - Math.sin(i * 1.6) * h * 0.025;
      ctx.arc(cx, cy, rad, Math.PI, Math.PI * 2);
    }
    ctx.lineTo(w + span, h);
    ctx.closePath();
    ctx.fill();

    // Volumetric cloud body
    ctx.globalAlpha = 0.88;
    const bodyGrad = ctx.createLinearGradient(0, baseY - h * 0.06, 0, baseY + h * heightNorm);
    bodyGrad.addColorStop(0, rimHex);
    bodyGrad.addColorStop(0.18, shadowHex);
    bodyGrad.addColorStop(1, '#09122e');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-span, h);
    for (let i = -1; i <= lobeCount + 2; i++) {
      const cx = i * span - offset;
      const rad = span * 0.56;
      const cy = baseY + 5 - Math.sin(i * 1.6) * h * 0.024;
      ctx.arc(cx, cy, rad, Math.PI, Math.PI * 2);
    }
    ctx.lineTo(w + span, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawStarDashTunnel(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    state: SkyHopState,
    reducedMotion: boolean,
  ): void {
    const cx = state.playerX * w;
    const cy = state.playerY * h;
    ctx.save();

    // Radial speedlines
    ctx.strokeStyle = 'rgba(155, 240, 255, 0.42)';
    ctx.lineWidth = 1.6;
    const lineCount = reducedMotion ? 8 : 16;
    for (let i = 0; i < lineCount; i++) {
      const sy = ((i + 0.5) / lineCount) * h;
      const len = 65 + ((i * 37) % 90);
      const lx = (((w - ((this.localTime * 900 + i * 140) % (w + len))) % (w + len)));
      ctx.beginPath();
      ctx.moveTo(lx, sy);
      ctx.lineTo(lx + len, sy);
      ctx.stroke();
    }

    // Supersonic slipstream cone around gliding partner
    const cone = ctx.createRadialGradient(cx + 12, cy, 8, cx - 24, cy, 110);
    cone.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    cone.addColorStop(0.45, 'rgba(124, 232, 255, 0.32)');
    cone.addColorStop(1, 'rgba(124, 232, 255, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.ellipse(cx - 12, cy, 110, 44, state.bankAngle, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawSlipstreamTrail(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    state: SkyHopState,
  ): void {
    if (this.trail.length < 2) return;
    ctx.save();
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const alpha = Math.max(0, 1 - b.age / 0.48) * (b.dash || state.starDashActive ? 0.85 : 0.48);
      ctx.strokeStyle = b.dash || state.starDashActive
        ? `rgba(124, 232, 255, ${alpha.toFixed(3)})`
        : `rgba(255, 213, 102, ${alpha.toFixed(3)})`;
      ctx.lineWidth = b.dash ? 4.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEntity(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    ent: SkyHopEntity,
    reducedMotion: boolean,
  ): void {
    const ex = ent.x * w;
    const ey = ent.y * h;
    const r = Math.max(12, ent.radius * Math.min(w, h));
    const phase = reducedMotion ? 0.5 : ent.phase;

    ctx.save();
    ctx.translate(ex, ey);

    if (ent.kind === 'star-shard') {
      // Gleaming multifaceted Star Shard
      ctx.rotate(phase * 0.45);
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.15);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, '#ffd566');
      grad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#fff9c4';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = i % 2 === 0 ? r * 1.05 : r * 0.46;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (ent.kind === 'plasma-vortex') {
      // Swirling Plasma Vortex with magnetic pull rings & spiral arms
      ctx.strokeStyle = 'rgba(179, 136, 255, 0.36)';
      ctx.lineWidth = 1.5;
      for (let ring = 1; ring <= 2; ring++) {
        const pullR = r * (1.25 + ring * 0.48) + Math.sin(phase * 2 + ring) * 3;
        ctx.beginPath();
        ctx.arc(0, 0, pullR, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.rotate(phase * 1.15);
      const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.1);
      coreGrad.addColorStop(0, '#13072e');
      coreGrad.addColorStop(0.48, '#7c3aed');
      coreGrad.addColorStop(1, 'rgba(232, 121, 249, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = 2.4;
      for (let arm = 0; arm < 3; arm++) {
        ctx.save();
        ctx.rotate((arm / 3) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.quadraticCurveTo(r * 0.55, -r * 0.65, r * 1.05, r * 0.15);
        ctx.stroke();
        ctx.restore();
      }
    } else if (ent.kind === 'dread-meteor') {
      // Flaming Dread Meteor with molten core & rocky facets
      const wakeGrad = ctx.createLinearGradient(0, 0, r * 2.4, -r * 0.8);
      wakeGrad.addColorStop(0, 'rgba(255, 107, 53, 0.72)');
      wakeGrad.addColorStop(1, 'rgba(255, 107, 53, 0)');
      ctx.fillStyle = wakeGrad;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.65);
      ctx.lineTo(r * 2.4, -r * 0.9);
      ctx.lineTo(r * 2.1, r * 0.25);
      ctx.lineTo(-r * 0.2, r * 0.65);
      ctx.closePath();
      ctx.fill();

      ctx.rotate(phase * 0.6);
      const rockGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 2, 0, 0, r);
      rockGrad.addColorStop(0, '#ffd166');
      rockGrad.addColorStop(0.42, '#ff6b35');
      rockGrad.addColorStop(1, '#2b1321');
      ctx.fillStyle = rockGrad;
      ctx.strokeStyle = '#ff9f43';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rad = r * (0.82 + (i % 2) * 0.24);
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // ring-boost
      ctx.strokeStyle = '#7ce8ff';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.55, r * 1.15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffd566';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.35, r * 0.88, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
