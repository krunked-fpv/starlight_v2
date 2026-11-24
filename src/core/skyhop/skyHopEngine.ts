import type { SkyHopEntity, SkyHopState, TrainerProfile } from '../../contracts';
import { getSpecies } from '../catalog/speciesCatalog';

let entityCounter = 0;

export function createInitialSkyHopState(profile: TrainerProfile, reducedMotion: boolean): SkyHopState {
  const lead = profile.party[0];
  const sp = getSpecies(lead?.speciesId ?? 25);
  return {
    active: false,
    running: false,
    gameOver: false,
    partnerSpeciesId: sp.id,
    partnerType: sp.primaryType,
    playerX: 0.24,
    playerY: 0.48,
    playerVy: 0,
    bankAngle: 0,
    starDashCharge: 65,
    starDashActive: false,
    starDashRemaining: 0,
    auroraPhase: 0,
    cloudScroll: 0,
    score: 0,
    combo: 0,
    highScore: profile.skyHopHighScore,
    shields: 3,
    elapsedSeconds: 0,
    reducedMotion,
    entities: seedInitialEntities(),
  };
}

function seedInitialEntities(): SkyHopEntity[] {
  return [
    { id: 'sh-init-1', kind: 'star-shard', x: 0.56, y: 0.42, vx: -0.26, vy: 0, radius: 0.028, phase: 0.2 },
    { id: 'sh-init-2', kind: 'star-shard', x: 0.72, y: 0.36, vx: -0.26, vy: 0, radius: 0.028, phase: 1.1 },
    { id: 'sh-init-3', kind: 'plasma-vortex', x: 0.84, y: 0.64, vx: -0.22, vy: 0, radius: 0.052, phase: 0.7 },
    { id: 'sh-init-4', kind: 'dread-meteor', x: 0.96, y: 0.26, vx: -0.34, vy: 0.08, radius: 0.036, phase: 2.0 },
  ];
}

export function startSkyHopRun(state: SkyHopState, profile: TrainerProfile): void {
  const lead = profile.party[0];
  const sp = getSpecies(lead?.speciesId ?? 25);
  state.active = true;
  state.running = true;
  state.gameOver = false;
  state.partnerSpeciesId = sp.id;
  state.partnerType = sp.primaryType;
  state.playerX = 0.24;
  state.playerY = 0.48;
  state.playerVy = -0.18;
  state.bankAngle = -0.12;
  state.starDashCharge = 70;
  state.starDashActive = false;
  state.starDashRemaining = 0;
  state.score = 0;
  state.combo = 0;
  state.highScore = profile.skyHopHighScore;
  state.shields = 3;
  state.elapsedSeconds = 0;
  state.entities = seedInitialEntities();
}

export function triggerSkyHopFlap(state: SkyHopState): void {
  if (!state.running || state.gameOver) return;
  state.playerVy = -0.42;
}

export function triggerSkyHopStarDash(state: SkyHopState): boolean {
  if (!state.running || state.gameOver) return false;
  if (state.starDashCharge < 40 || state.starDashActive) return false;
  state.starDashActive = true;
  state.starDashRemaining = 1.85;
  state.starDashCharge = Math.max(0, state.starDashCharge - 40);
  state.playerVy *= 0.25;
  return true;
}

export function stepSkyHop(
  state: SkyHopState,
  dtSeconds: number,
  profile: TrainerProfile,
): { collectedShard: boolean; hitHazard: boolean } {
  let collectedShard = false;
  let hitHazard = false;

  const speedMult = state.starDashActive ? 1.85 : 1.0;
  state.auroraPhase += dtSeconds * (state.reducedMotion ? 0.18 : 0.65);
  state.cloudScroll += dtSeconds * 0.24 * speedMult;

  if (!state.running || state.gameOver) {
    state.playerY = 0.48 + Math.sin(state.auroraPhase * 2.2) * 0.03;
    state.bankAngle = Math.sin(state.auroraPhase * 2.2) * 0.08;
    return { collectedShard, hitHazard };
  }

  state.elapsedSeconds += dtSeconds;

  if (state.starDashActive) {
    state.starDashRemaining -= dtSeconds;
    if (state.starDashRemaining <= 0) {
      state.starDashActive = false;
      state.starDashRemaining = 0;
    }
  } else {
    state.starDashCharge = Math.min(100, state.starDashCharge + dtSeconds * 8);
  }

  // Gravity & gliding bank angle
  const gravity = state.starDashActive ? 0.28 : 0.92;
  state.playerVy = Math.max(-0.55, Math.min(0.62, state.playerVy + gravity * dtSeconds));
  state.playerY += state.playerVy * dtSeconds;

  // Soft aurora ceiling & cloud sea floor bounce
  if (state.playerY < 0.1) {
    state.playerY = 0.1;
    state.playerVy = Math.max(0, state.playerVy);
  } else if (state.playerY > 0.86) {
    state.playerY = 0.86;
    state.playerVy = -0.22;
  }

  const targetBank = Math.max(-0.48, Math.min(0.48, state.playerVy * 0.95));
  state.bankAngle += (targetBank - state.bankAngle) * Math.min(1, dtSeconds * 10);

  // Passive distance score
  state.score += Math.round(dtSeconds * 24 * speedMult);

  // Spawn fresh entities to keep the aurora sky rich & active
  if (state.entities.length < 7) {
    const roll = (Math.sin(state.elapsedSeconds * 13.7 + entityCounter * 2.3) + 1) * 0.5;
    const y = 0.16 + ((entityCounter * 0.29 + roll * 0.45) % 0.66);
    entityCounter += 1;
    if (roll < 0.48) {
      state.entities.push({
        id: `sh-${entityCounter}`,
        kind: 'star-shard',
        x: 1.08,
        y,
        vx: -0.28,
        vy: 0,
        radius: 0.028,
        phase: entityCounter * 0.7,
      });
    } else if (roll < 0.74) {
      state.entities.push({
        id: `sh-${entityCounter}`,
        kind: 'plasma-vortex',
        x: 1.12,
        y,
        vx: -0.23,
        vy: 0,
        radius: 0.052,
        phase: entityCounter * 1.1,
      });
    } else {
      state.entities.push({
        id: `sh-${entityCounter}`,
        kind: 'dread-meteor',
        x: 1.12,
        y: Math.max(0.14, y - 0.15),
        vx: -0.36,
        vy: 0.11,
        radius: 0.036,
        phase: entityCounter * 0.9,
      });
    }
  }

  // Update entities & collisions
  for (const ent of state.entities) {
    ent.x += ent.vx * speedMult * dtSeconds;
    ent.y += ent.vy * dtSeconds;
    ent.phase += dtSeconds * 4.2;

    const dx = ent.x - state.playerX;
    const dy = ent.y - state.playerY;
    const dist = Math.hypot(dx, dy);

    // Subtle Plasma Vortex gravity pull when nearby
    if (ent.kind === 'plasma-vortex' && !state.starDashActive && dist < 0.2 && dist > 0.01) {
      state.playerY += (dy / dist) * 0.14 * dtSeconds;
    }

    if (!ent.collected && dist < ent.radius + 0.042) {
      if (ent.kind === 'star-shard') {
        ent.collected = true;
        collectedShard = true;
        state.combo += 1;
        state.score += 45 + state.combo * 10;
        state.starDashCharge = Math.min(100, state.starDashCharge + 18);
        profile.inventory.starShards += 2;
      } else if (state.starDashActive) {
        // Shatter hazards while Star Dashing!
        ent.collected = true;
        state.score += 80;
        state.combo += 1;
      } else {
        ent.collected = true;
        hitHazard = true;
        state.combo = 0;
        state.shields -= 1;
        if (state.shields <= 0) {
          state.running = false;
          state.gameOver = true;
        }
      }
    }
  }

  state.entities = state.entities.filter((e) => !e.collected && e.x > -0.15 && e.y < 1.15);

  if (state.score > state.highScore) {
    state.highScore = state.score;
    profile.skyHopHighScore = state.score;
  }
  if (state.combo > profile.skyHopBestCombo) {
    profile.skyHopBestCombo = state.combo;
  }
  if (state.score >= 500 && !profile.badges.includes('badge-skyhop')) {
    profile.badges.push('badge-skyhop');
  }

  return { collectedShard, hitHazard };
}
