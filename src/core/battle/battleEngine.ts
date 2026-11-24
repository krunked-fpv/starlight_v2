import type {
  BattleCameraCue,
  BattleSceneState,
  BiomeId,
  EncounterTier,
  MoveRecord,
  PartyMember,
  StatusCondition,
  TrainerProfile,
} from '../../contracts';
import { BIOME_DESCRIPTORS } from '../data/biomes';
import { BADGE_DEFINITIONS } from '../data/badges';
import { getTypeEffectiveness, MOVES_BY_ID } from '../data/typePalettes';
import { createPartyMember, getSpecies } from '../catalog/speciesCatalog';

export interface MoveExecutionOutcome {
  damage: number;
  effectiveness: number;
  composureBroken: boolean;
  appliedStatus: StatusCondition | null;
  cameraCue: BattleCameraCue;
  message: string;
  defeatedTarget: boolean;
}

export function createBattleState(
  profile: TrainerProfile,
  biomeId: BiomeId,
  tier: EncounterTier,
  options?: { reducedMotion?: boolean; forceOfflineRig?: boolean },
): BattleSceneState {
  const biome = BIOME_DESCRIPTORS[biomeId];
  const playerMember = profile.party.find((m) => m.hp > 0) ?? profile.party[0];
  const playerSpecies = getSpecies(playerMember.speciesId);

  let enemySpeciesId = biome.wildSpeciesIds[0] ?? 25;
  let enemyLevel = Math.max(12, playerMember.level - 2);
  let enemyShiny = false;

  if (tier === 'shrine') {
    enemySpeciesId = biome.guardianSpeciesId;
    enemyLevel = Math.min(100, playerMember.level + 4);
  } else if (tier === 'rival') {
    enemySpeciesId = profile.slotId === 'slot0' ? 887 : 448;
    enemyLevel = Math.min(100, playerMember.level + 2);
  } else if (tier === 'rare') {
    enemySpeciesId = biome.wildSpeciesIds[biome.wildSpeciesIds.length - 1] ?? 151;
    enemyLevel = Math.min(100, playerMember.level + 1);
    enemyShiny = true;
  } else {
    const idx = Math.floor(Math.random() * biome.wildSpeciesIds.length);
    enemySpeciesId = biome.wildSpeciesIds[idx] ?? 25;
  }

  const enemyMember = createPartyMember(enemySpeciesId, enemyLevel, {
    uid: `foe-${tier}-${enemySpeciesId}-${Date.now()}`,
    shiny: enemyShiny,
    starRank: tier === 'shrine' ? 5 : tier === 'rare' ? 4 : 2,
    composure: 100,
  });
  const enemySpecies = getSpecies(enemySpeciesId);

  // Mark enemy seen in Pokédex
  const existingDex = profile.pokedex[enemySpeciesId];
  profile.pokedex[enemySpeciesId] = {
    seen: true,
    caught: existingDex?.caught ?? false,
    starRank: Math.max(existingDex?.starRank ?? 0, tier === 'shrine' ? 3 : 1),
    bond: existingDex?.bond ?? 0,
    shiny: existingDex?.shiny || enemyShiny,
    timesEncountered: (existingDex?.timesEncountered ?? 0) + 1,
  };

  const initialCue: BattleCameraCue =
    tier === 'shrine' ? 'shrineGuardian' : tier === 'rival' ? 'rivalIntro' : 'idle';

  const statusMessage =
    tier === 'shrine'
      ? `Shrine Guardian ${enemySpecies.name} descends into the ${biome.name} arena!`
      : tier === 'rival'
        ? `Rival challenges you with ${enemySpecies.name}!`
        : tier === 'rare'
          ? `A radiant rare ${enemySpecies.name} emerged from the Starfall shimmer!`
          : `Wild ${enemySpecies.name} appeared in ${biome.name}!`;

  return {
    active: true,
    biomeId,
    tier,
    turnNumber: 1,
    phase: 'shutter',
    player: {
      side: 'player',
      member: playerMember,
      species: playerSpecies,
      spriteLoaded: false,
      useOfflineRig: true,
      hitFlash: 0,
      lungeOffset: 0,
      recoilOffset: 0,
      status: playerMember.status,
      composureRatio: playerMember.composure / playerMember.maxComposure,
    },
    enemy: {
      side: 'enemy',
      member: enemyMember,
      species: enemySpecies,
      spriteLoaded: false,
      useOfflineRig: true,
      hitFlash: 0,
      lungeOffset: 0,
      recoilOffset: 0,
      status: 'none',
      composureRatio: 1,
    },
    shutter: {
      active: true,
      tier,
      progress: 0,
      duration: options?.reducedMotion ? 0.35 : tier === 'shrine' ? 1.05 : 0.78,
    },
    activeVfx: [],
    cameraCue: initialCue,
    cameraCueElapsed: 0,
    hitStopRemaining: 0,
    arenaLightingType: enemySpecies.primaryType,
    arenaLightingPulse: 0.9,
    elapsedSeconds: 0,
    reducedMotion: Boolean(options?.reducedMotion),
    forceOfflineRig: Boolean(options?.forceOfflineRig),
    statusMessage,
    canCapture: tier !== 'rival',
  };
}

export function executeBattleMove(
  attacker: PartyMember,
  defender: PartyMember,
  move: MoveRecord,
  attackerSide: 'player' | 'enemy',
): MoveExecutionOutcome {
  const atkSpecies = getSpecies(attacker.speciesId);
  const defSpecies = getSpecies(defender.speciesId);

  if (move.category === 'status') {
    attacker.composure = Math.min(attacker.maxComposure, attacker.composure + Math.max(20, move.composureShift));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(attacker.maxHp * 0.14));
    return {
      damage: 0,
      effectiveness: 1,
      composureBroken: false,
      appliedStatus: null,
      cameraCue: 'idle',
      message: `${atkSpecies.name} used ${move.name} and reinforced its Composure shield!`,
      defeatedTarget: false,
    };
  }

  const effectiveness = getTypeEffectiveness(move.type, defSpecies.primaryType, defSpecies.secondaryType);
  const stab =
    atkSpecies.primaryType === move.type || atkSpecies.secondaryType === move.type ? 1.25 : 1.0;

  // Composure shield mitigates 22% of incoming burst damage while active (> 0)
  const composureGuard = defender.composure > 0 ? 0.78 : 1.18;
  const rawDamage =
    (((2 * attacker.level) / 5 + 2) * move.power * (attacker.atk / Math.max(12, defender.def))) / 28 + 6;
  const damage = Math.max(4, Math.round(rawDamage * stab * effectiveness * composureGuard));

  const prevComposure = defender.composure;
  const composureDelta = Math.round(Math.abs(move.composureShift) * (effectiveness >= 2 ? 1.5 : 1));
  defender.composure = Math.max(0, defender.composure - composureDelta);
  const composureBroken = prevComposure > 0 && defender.composure === 0;

  defender.hp = Math.max(0, defender.hp - damage);

  let appliedStatus: StatusCondition | null = null;
  if (move.statusEffect && defender.status === 'none' && defender.hp > 0) {
    const chance = move.statusChance ?? 0.25;
    if (Math.random() < chance || composureBroken) {
      defender.status = move.statusEffect;
      appliedStatus = move.statusEffect;
    }
  }

  const effText =
    effectiveness >= 2 ? ' Super effective!' : effectiveness <= 0.5 ? ' Resisted.' : '';
  const breakText = composureBroken ? ' Composure SHATTERED!' : '';
  const statusText = appliedStatus ? ` Inflicted ${appliedStatus.toUpperCase()}!` : '';

  const heavy = effectiveness >= 2 || composureBroken || damage >= defender.maxHp * 0.35;
  const cameraCue: BattleCameraCue = heavy ? 'heavyHit' : 'hit';

  const prefix = attackerSide === 'player' ? atkSpecies.name : `Foe ${atkSpecies.name}`;
  return {
    damage,
    effectiveness,
    composureBroken,
    appliedStatus,
    cameraCue,
    message: `${prefix} unleashed ${move.name} for ${damage} DMG!${effText}${breakText}${statusText}`,
    defeatedTarget: defender.hp <= 0,
  };
}

export function attemptStarBallCapture(
  profile: TrainerProfile,
  battle: BattleSceneState,
): { caught: boolean; message: string; starRankAwarded: number } {
  if (!battle.canCapture) {
    return { caught: false, message: 'Rival Pokémon cannot be captured in a duel!', starRankAwarded: 0 };
  }
  if (profile.inventory.starBalls <= 0 && profile.inventory.pokeBalls <= 0) {
    return { caught: false, message: 'No Star Balls or Poké Balls remaining!', starRankAwarded: 0 };
  }

  const usedStarBall = profile.inventory.starBalls > 0;
  if (usedStarBall) {
    profile.inventory.starBalls -= 1;
  } else {
    profile.inventory.pokeBalls -= 1;
  }

  const foe = battle.enemy.member;
  const hpFactor = 1 - foe.hp / Math.max(1, foe.maxHp);
  const composureBonus = foe.composure <= 0 ? 0.32 : 0;
  const statusBonus = foe.status !== 'none' ? 0.16 : 0;
  const ballBonus = usedStarBall ? 0.38 : 0.2;
  const catchChance = Math.min(0.98, 0.28 + hpFactor * 0.45 + composureBonus + statusBonus + ballBonus);
  const caught = Math.random() <= catchChance || (usedStarBall && foe.hp / foe.maxHp < 0.65);

  if (caught) {
    const sp = battle.enemy.species;
    const prev = profile.pokedex[sp.id];
    const starRankAwarded = Math.min(5, Math.max(prev?.starRank ?? 0, usedStarBall ? 4 : 3) + (foe.composure <= 0 ? 1 : 0));
    profile.pokedex[sp.id] = {
      seen: true,
      caught: true,
      starRank: starRankAwarded,
      bond: Math.max(prev?.bond ?? 0, usedStarBall ? 85 : 65),
      shiny: prev?.shiny || foe.shiny,
      timesEncountered: (prev?.timesEncountered ?? 0) + 1,
    };
    if (profile.party.length < 6) {
      profile.party.push({ ...foe, hp: foe.maxHp, composure: 100, bond: 80, starRank: starRankAwarded });
    }
    return {
      caught: true,
      message: `Starlight Capture! ${sp.name} registered to the 1,025 Pokédex (Star Rank ${starRankAwarded})!`,
      starRankAwarded,
    };
  }

  return {
    caught: false,
    message: `${battle.enemy.species.name} broke free from the ${usedStarBall ? 'Star Ball' : 'Poké Ball'}! Break its Composure to boost capture odds.`,
    starRankAwarded: 0,
  };
}

export function awardVictoryRewards(profile: TrainerProfile, battle: BattleSceneState): string {
  const lead = battle.player.member;
  const xpGain = battle.tier === 'shrine' ? 140 : battle.tier === 'rival' ? 110 : 75;
  lead.xp += xpGain;
  lead.bond = Math.min(100, lead.bond + 6);
  lead.starRank = Math.min(5, lead.starRank + (lead.bond >= 100 ? 1 : 0));

  let leveledUp = false;
  while (lead.xp >= lead.xpToNext && lead.level < 100) {
    lead.xp -= lead.xpToNext;
    lead.level += 1;
    lead.maxHp += 4;
    lead.hp = Math.min(lead.maxHp, lead.hp + 6);
    lead.atk += 2;
    lead.def += 2;
    lead.spd += 2;
    lead.xpToNext = Math.round(lead.level * 60 + 80);
    leveledUp = true;
  }

  const sp = getSpecies(lead.speciesId);
  const dex = profile.pokedex[sp.id];
  if (dex) {
    dex.bond = Math.max(dex.bond, lead.bond);
    dex.starRank = Math.max(dex.starRank, lead.starRank);
  }

  const rewards: string[] = [`+${xpGain} XP`, '+15 Star Shards'];
  profile.inventory.starShards += 15;

  if (battle.tier === 'shrine') {
    const shrineId = `${battle.biomeId}-shrine`;
    if (!profile.clearedShrines.includes(shrineId)) {
      profile.clearedShrines.push(shrineId);
    }
    const biomeBadge = BADGE_DEFINITIONS.find((b) => b.category === 'elemental' && b.biomeId === battle.biomeId);
    if (biomeBadge && !profile.badges.includes(biomeBadge.id)) {
      profile.badges.push(biomeBadge.id);
      rewards.push(`Earned ${biomeBadge.name} Badge!`);
    }
  } else if (battle.tier === 'rival') {
    profile.rivalsDefeated += 1;
    if (!profile.badges.includes('badge-rival')) {
      profile.badges.push('badge-rival');
      rewards.push('Earned Rival Vanquisher Badge!');
    }
  }

  if (lead.bond >= 100 && !profile.badges.includes('badge-bond')) {
    profile.badges.push('badge-bond');
  }
  if (leveledUp) {
    rewards.push(`${sp.name} grew to Lv.${lead.level}!`);
  }

  return `Victory! ${rewards.join(' • ')}`;
}

export function chooseEnemyMove(battle: BattleSceneState): MoveRecord {
  const moves = battle.enemy.member.moves
    .map((id) => MOVES_BY_ID[id])
    .filter((m): m is MoveRecord => Boolean(m));
  if (moves.length === 0) return MOVES_BY_ID['starlight-pulse'];
  if (battle.enemy.member.composure < 25) {
    const guard = moves.find((m) => m.category === 'status');
    if (guard && Math.random() < 0.45) return guard;
  }
  const offensive = moves.filter((m) => m.category !== 'status');
  const pool = offensive.length > 0 ? offensive : moves;
  return pool[battle.turnNumber % pool.length];
}
