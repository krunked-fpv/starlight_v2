import type {
  BallKind,
  BattleCombatantSnapshot,
  BattleCombatantVisual,
  BattleSceneState,
  BiomeId,
  BodyArchetype,
  ElementalType,
  EncounterTier,
  EncounterTraitId,
} from '../../contracts';
import {
  BALANCE,
  computeBattleXpReward,
  computeBenchXpShare,
} from './raw/balance.js';
import {
  Pokemon,
  calculateCatchAttempt,
  calculateDamage,
  createPokemon,
  evaluateEntryAbility,
  evaluateTurnEndAbility,
  getBattleShardReward,
  getBondTier,
  getScaledRivalParty,
  getScaledShrineGuard,
  getScaledShrineTrial,
  resolveSpeciesArchetype,
  rollWildPokemon,
} from './raw/pokemon.js';
import { ENCOUNTER_TRAITS, RIVAL_TRAINERS, SHRINES } from './raw/config.js';
import type { StarlightStorageBridge } from '../save/saveHydrator';
import type { SpriteAssetLoader } from './spriteLoader';
import { getAbilityEntry, getMoveEntry, getSpeciesEntry } from './catalog';
import { stripEmojis } from './emojiSanitizer';

export interface BattleStartOptions {
  biomeId: BiomeId;
  tier: EncounterTier;
  shrineId?: string;
  rivalId?: string;
  depthTier?: number;
  isRarePatch?: boolean;
  forceSpeciesId?: number;
  reducedMotion?: boolean;
  forceOfflineRig?: boolean;
}

export interface BattleActionOutcome {
  vfxEvents: Array<{
    type: ElementalType;
    fromSide: 'player' | 'enemy';
    targetSide: 'player' | 'enemy';
    power: number;
    effectiveness: number;
    category: 'attack' | 'heal' | 'buff' | 'shield';
    composureBraced: boolean;
    isCrit: boolean;
    duration: number;
  }>;
  sfx: Array<'hit' | 'super-hit' | 'heal' | 'catch-throw' | 'catch-success' | 'victory' | 'badge' | 'evolve'>;
  moveSfxId?: string;
  moveSfxFx?: string;
  battleEnded?: 'victory' | 'defeat' | 'caught' | 'fled';
  newBadgeIds?: string[];
}

function toCombatantSnapshot(mon: Pokemon): BattleCombatantSnapshot {
  const sp = getSpeciesEntry(mon.speciesId);
  const ab = getAbilityEntry(mon.abilityId);
  const moves = mon.getMoveObjects().slice(0, 4).map((rawMove) => {
    const entry = getMoveEntry(rawMove.id);
    const pp = mon.getMovePp(entry.id);
    return {
      ...entry,
      currentPp: pp.current,
      maxPp: pp.max,
    };
  });

  return {
    uid: mon.uid,
    speciesId: mon.speciesId,
    name: sp.name,
    displayName: stripEmojis(mon.displayName || sp.name),
    type: sp.type,
    level: mon.level,
    hp: mon.hp,
    maxHp: mon.maxHp,
    atk: mon.atk,
    def: mon.def,
    spd: mon.spd,
    xp: mon.xp,
    xpToNext: mon.xpToNext,
    bond: mon.bond,
    upgradeTier: mon.upgradeTier,
    isShiny: Boolean(mon.isShiny),
    isElite: Boolean(mon.isElite),
    encounterTrait: (mon.encounterTrait as EncounterTraitId | null) ?? null,
    abilityId: mon.abilityId,
    abilityName: ab?.name ?? null,
    archetype: (resolveSpeciesArchetype(mon.speciesId) as BodyArchetype) || 'biped',
    colorHex: sp.color,
    battleStages: {
      atk: mon.battleStages?.atk ?? 0,
      def: mon.battleStages?.def ?? 0,
      spd: mon.battleStages?.spd ?? 0,
    },
    shieldTurns: mon.shieldTurns ?? 0,
    moves,
  };
}

function createEmptyVisual(side: 'player' | 'enemy', mon: Pokemon, forceOfflineRig: boolean): BattleCombatantVisual {
  return {
    side,
    mon: toCombatantSnapshot(mon),
    frames: null,
    useOfflineRig: forceOfflineRig,
    hitFlash: 0,
    lungeOffset: 0,
    recoilOffset: 0,
    bracedFlash: 0,
    buffFlash: 0,
    healFlash: 0,
    abilityBanner: null,
    captureProgress: 0,
    captureShakes: 0,
    captureBallKind: 'poke',
  };
}

export class DojoBattleController {
  private readonly storage: StarlightStorageBridge;
  private readonly sprites: SpriteAssetLoader;
  private state: BattleSceneState;
  private playerMon: Pokemon;
  private enemyParty: Pokemon[] = [];
  private enemyIndex = 0;

  constructor(storage: StarlightStorageBridge, sprites: SpriteAssetLoader) {
    this.storage = storage;
    this.sprites = sprites;
    this.playerMon = createPokemon(25, 5, 'starter');
    const dummyEnemy = createPokemon(10, 4, 'forest');
    this.enemyParty = [dummyEnemy];
    this.state = {
      active: false,
      biomeId: 'forest',
      tier: 'wild',
      isBoss: false,
      isTrainerBattle: false,
      rivalId: null,
      rivalName: null,
      rivalTotalMons: 1,
      rivalRemainingMons: 1,
      shrineId: null,
      shrineTrialNumber: 0,
      turnNumber: 1,
      phase: 'command',
      player: createEmptyVisual('player', this.playerMon, false),
      enemy: createEmptyVisual('enemy', dummyEnemy, false),
      shutter: { active: false, tier: 'wild', progress: 1, duration: 0.45 },
      activeVfx: [],
      cameraCue: 'idle',
      cameraCueElapsed: 0,
      hitStopRemaining: 0,
      arenaLightingType: null,
      arenaLightingPulse: 0,
      elapsedSeconds: 0,
      reducedMotion: false,
      forceOfflineRig: false,
      statusMessage: '',
      battleLog: [],
      canCapture: true,
      canRun: true,
    };
  }

  getState(): BattleSceneState {
    return this.state;
  }

  isActive(): boolean {
    return this.state.active;
  }

  private getCurrentEnemy(): Pokemon {
    return this.enemyParty[this.enemyIndex] ?? this.enemyParty[0];
  }

  private pushLog(line: string): void {
    const clean = stripEmojis(line);
    this.state.statusMessage = clean;
    this.state.battleLog = [...this.state.battleLog.slice(-14), clean];
  }

  private syncCombatantSprites(): void {
    const pMon = this.playerMon;
    const eMon = this.getCurrentEnemy();
    const offline = this.state.forceOfflineRig || this.sprites.isForceOffline();

    this.state.player.mon = toCombatantSnapshot(pMon);
    this.state.enemy.mon = toCombatantSnapshot(eMon);
    this.state.player.useOfflineRig = offline;
    this.state.enemy.useOfflineRig = offline;

    const cachedPlayer = this.sprites.getCached(pMon.speciesId, { back: true, shiny: pMon.isShiny, offlineOnly: offline });
    const cachedEnemy = this.sprites.getCached(eMon.speciesId, { back: false, shiny: eMon.isShiny, offlineOnly: offline });
    if (cachedPlayer) this.state.player.frames = cachedPlayer;
    if (cachedEnemy) this.state.enemy.frames = cachedEnemy;

    void this.sprites.loadSpeciesSprite(pMon.speciesId, { back: true, shiny: pMon.isShiny, offlineOnly: offline }).then((f) => {
      if (this.playerMon.speciesId === pMon.speciesId) {
        this.state.player.frames = f;
        this.state.player.useOfflineRig = offline || f.sourceKind === 'offline-pixel';
      }
    });
    void this.sprites.loadSpeciesSprite(eMon.speciesId, { back: false, shiny: eMon.isShiny, offlineOnly: offline }).then((f) => {
      if (this.getCurrentEnemy().speciesId === eMon.speciesId) {
        this.state.enemy.frames = f;
        this.state.enemy.useOfflineRig = offline || f.sourceKind === 'offline-pixel';
      }
    });
  }

  private applyEntryAbility(mon: Pokemon, side: 'player' | 'enemy'): void {
    const res = evaluateEntryAbility(mon);
    if (!res) return;
    mon.abilityEntryTriggered = true;
    mon.applyStageBoost(res.stat, res.stages);
    if (res.grantShield) {
      mon.shieldTurns = Math.max(mon.shieldTurns, res.shieldTurns || 1);
    }
    const vis = side === 'player' ? this.state.player : this.state.enemy;
    vis.abilityBanner = {
      name: stripEmojis(res.ability.name),
      summary: stripEmojis(res.summary),
      elapsed: 0,
    };
    vis.buffFlash = 1;
    this.pushLog(`${stripEmojis(mon.displayName)}'s ${stripEmojis(res.ability.name)} activated (${stripEmojis(res.summary)})!`);
  }

  startEncounter(opts: BattleStartOptions): BattleSceneState {
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const healthy = team.find((m) => m && !m.isFainted) ?? team[0] ?? createPokemon(25, 5, 'starter');
    healthy.resetBattleState();
    this.playerMon = healthy;

    let biomeId: BiomeId = opts.biomeId;
    let isBoss = false;
    let isTrainerBattle = false;
    let rivalId: string | null = null;
    let rivalName: string | null = null;
    let shrineId: string | null = null;
    let shrineTrialNumber = 0;

    if (opts.tier === 'rival') {
      const rivalList = Object.values(RIVAL_TRAINERS);
      const rival = rivalList.find((r) => r.id === opts.rivalId)
        ?? rivalList.find((r) => r.biome === biomeId)
        ?? rivalList[0];
      isTrainerBattle = true;
      isBoss = true;
      rivalId = rival.id;
      rivalName = stripEmojis(rival.name);
      biomeId = (rival.biome as BiomeId) || biomeId;
      const scaledParty = getScaledRivalParty(rival, profile);
      this.enemyParty = scaledParty.map((spec) =>
        createPokemon(spec.speciesId, spec.level, biomeId, { upgradeTier: spec.upgradeTier }),
      );
    } else if (opts.tier === 'shrine' || opts.tier === 'shrine-trial') {
      const shrineList = Object.values(SHRINES);
      const shrine = shrineList.find((s) => s.id === opts.shrineId)
        || shrineList.find((s) => s.biome === biomeId)
        || shrineList[0];
      isBoss = true;
      shrineId = shrine.id;
      biomeId = (shrine.biome as BiomeId) || biomeId;
      if (opts.tier === 'shrine-trial') {
        const trial = getScaledShrineTrial(shrine, profile);
        shrineTrialNumber = trial.trialNumber;
        this.enemyParty = [
          createPokemon(trial.guardianId, trial.level, biomeId, {
            upgradeTier: trial.upgradeTier,
            isElite: true,
            encounterTrait: 'apex',
          }),
        ];
      } else {
        const guard = getScaledShrineGuard(shrine, profile);
        this.enemyParty = [
          createPokemon(guard.guardianId, guard.level, biomeId, {
            upgradeTier: guard.upgradeTier,
            isElite: true,
            moveIds: guard.moveIds,
          }),
        ];
      }
    } else if (opts.forceSpeciesId) {
      const lv = Math.max(2, Math.min(50, this.playerMon.level));
      this.enemyParty = [createPokemon(opts.forceSpeciesId, lv, biomeId, { isElite: opts.tier === 'rare' })];
    } else {
      const wild = rollWildPokemon(biomeId === 'village' ? 'forest' : biomeId, profile, {
        depthTier: opts.depthTier ?? 0,
        isRarePatch: opts.tier === 'rare' || Boolean(opts.isRarePatch),
      });
      this.enemyParty = [wild];
    }

    this.enemyIndex = 0;
    const foe = this.getCurrentEnemy();
    foe.resetBattleState();

    // Mark enemy seen in Pokédex
    this.storage.manager.recordSeen(foe.speciesId, true);
    if (foe.isShiny) {
      this.storage.manager.recordShinyEncounter(true);
    }

    const offline = Boolean(opts.forceOfflineRig || this.sprites.isForceOffline());
    const reduced = Boolean(opts.reducedMotion);
    const shutterDuration = reduced ? 0.18 : opts.tier === 'shrine' || opts.tier === 'shrine-trial' ? 0.65 : 0.45;

    this.state = {
      active: true,
      biomeId,
      tier: opts.tier,
      isBoss,
      isTrainerBattle,
      rivalId,
      rivalName,
      rivalTotalMons: this.enemyParty.length,
      rivalRemainingMons: this.enemyParty.length,
      shrineId,
      shrineTrialNumber,
      turnNumber: 1,
      phase: 'shutter',
      player: createEmptyVisual('player', this.playerMon, offline),
      enemy: createEmptyVisual('enemy', foe, offline),
      shutter: { active: true, tier: opts.tier, progress: 0, duration: shutterDuration },
      activeVfx: [],
      cameraCue: isBoss ? (isTrainerBattle ? 'rivalIntro' : 'shrineGuardian') : 'idle',
      cameraCueElapsed: 0,
      hitStopRemaining: 0,
      arenaLightingType: getSpeciesEntry(foe.speciesId).type,
      arenaLightingPulse: 0.75,
      elapsedSeconds: 0,
      reducedMotion: reduced,
      forceOfflineRig: offline,
      statusMessage: '',
      battleLog: [],
      canCapture: !isTrainerBattle,
      canRun: !isTrainerBattle,
    };

    const foeName = stripEmojis(foe.displayName);
    if (isTrainerBattle && rivalName) {
      this.pushLog(`${rivalName} challenged you and sent out Lv.${foe.level} ${foeName}!`);
    } else if (shrineId) {
      const label = shrineTrialNumber > 0 ? `Astral Trial #${shrineTrialNumber} Guardian` : 'Shrine Guardian';
      this.pushLog(`${label} Lv.${foe.level} ${foeName} emerged!`);
    } else {
      const traitPrefix = foe.encounterTrait && ENCOUNTER_TRAITS[foe.encounterTrait]
        ? `${stripEmojis(ENCOUNTER_TRAITS[foe.encounterTrait].label)} `
        : '';
      this.pushLog(`A wild ${traitPrefix}Lv.${foe.level} ${foeName} appeared!`);
    }

    this.applyEntryAbility(this.playerMon, 'player');
    this.applyEntryAbility(foe, 'enemy');
    this.syncCombatantSprites();
    return this.state;
  }

  toggleOfflineRig(): boolean {
    this.state.forceOfflineRig = !this.state.forceOfflineRig;
    this.syncCombatantSprites();
    return this.state.forceOfflineRig;
  }

  private executeSingleMove(
    attacker: Pokemon,
    defender: Pokemon,
    moveId: string,
    attackerSide: 'player' | 'enemy',
    outcome: BattleActionOutcome,
  ): void {
    const move = getMoveEntry(moveId);
    attacker.consumeMovePp(move.id);
    const atkVis = attackerSide === 'player' ? this.state.player : this.state.enemy;
    const defVis = attackerSide === 'player' ? this.state.enemy : this.state.player;
    const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';

    outcome.moveSfxId = move.id;
    outcome.moveSfxFx = move.fx;

    const result = calculateDamage(attacker, defender, move, {
      applyAbilities: true,
      applyComposure: true,
      applyEncounterTraits: true,
      defenderSide,
      isBoss: this.state.isBoss,
    });

    if (result.category === 'heal') {
      const healed = attacker.healAmount(result.heal);
      atkVis.healFlash = 1;
      outcome.sfx.push('heal');
      outcome.vfxEvents.push({
        type: move.type,
        fromSide: attackerSide,
        targetSide: attackerSide,
        power: 40,
        effectiveness: 1,
        category: 'heal',
        composureBraced: false,
        isCrit: false,
        duration: 0.65,
      });
      this.pushLog(`${stripEmojis(attacker.displayName)} used ${move.name} and recovered ${healed} HP!`);
      return;
    }

    if (result.category === 'buff' || result.category === 'shield') {
      const boost = attacker.applyStageBoost(result.buffStat || 'atk', result.buffStages || 1);
      if (result.grantShield) {
        attacker.shieldTurns = Math.max(attacker.shieldTurns, 2);
        if (result.heal > 0) attacker.healAmount(result.heal);
      }
      atkVis.buffFlash = 1;
      outcome.sfx.push('heal');
      outcome.vfxEvents.push({
        type: move.type,
        fromSide: attackerSide,
        targetSide: attackerSide,
        power: 50,
        effectiveness: 1,
        category: result.category,
        composureBraced: false,
        isCrit: false,
        duration: 0.65,
      });
      const statWord = boost.stat === 'atk' ? 'Attack' : boost.stat === 'def' ? 'Defense' : 'Speed';
      const extra = result.grantShield ? ' and raised a Starlight Shield' : '';
      this.pushLog(`${stripEmojis(attacker.displayName)} used ${move.name}! ${statWord} rose${extra}!`);
      return;
    }

    if (result.missed) {
      this.pushLog(`${stripEmojis(attacker.displayName)} used ${move.name}, but it missed!`);
      return;
    }

    // Apply damage
    const dealt = defender.takeDamage(result.damage);
    atkVis.lungeOffset = attackerSide === 'player' ? 1 : -1;
    defVis.hitFlash = 1;
    defVis.recoilOffset = 1;
    if (result.composureCapped) {
      defVis.bracedFlash = 1;
    }

    if (result.attackerAbilityTrigger) {
      atkVis.abilityBanner = {
        name: stripEmojis(result.attackerAbilityTrigger.ability.name),
        summary: stripEmojis(result.attackerAbilityTrigger.summary),
        elapsed: 0,
      };
      if (result.attackerAbilityTrigger.drainHeal) {
        attacker.healAmount(result.attackerAbilityTrigger.drainHeal);
        atkVis.healFlash = 0.8;
      }
    }
    if (result.defenderAbilityTrigger) {
      defVis.abilityBanner = {
        name: stripEmojis(result.defenderAbilityTrigger.ability.name),
        summary: stripEmojis(result.defenderAbilityTrigger.summary),
        elapsed: 0,
      };
      if (result.defenderAbilityTrigger.counterBoostStat) {
        defender.applyStageBoost(result.defenderAbilityTrigger.counterBoostStat, 1);
      }
    }

    // Bond endure check for player Pokémon
    if (defenderSide === 'player' && defender.isFainted) {
      const bondTier = getBondTier(defender.bond);
      if (bondTier.endureChance > 0 && Math.random() < bondTier.endureChance) {
        defender.hp = 1;
        defVis.bracedFlash = 1;
        this.pushLog(`${stripEmojis(defender.displayName)} toughed it out for you with 1 HP!`);
      }
    }

    // Decrement shield turns after taking a hit
    if (defender.shieldTurns > 0) {
      defender.shieldTurns = Math.max(0, defender.shieldTurns - 1);
    }

    const superEff = result.effectiveness >= 1.5;
    outcome.sfx.push(superEff || result.isCrit ? 'super-hit' : 'hit');
    outcome.vfxEvents.push({
      type: move.type,
      fromSide: attackerSide,
      targetSide: defenderSide,
      power: move.power,
      effectiveness: result.effectiveness,
      category: 'attack',
      composureBraced: result.composureCapped,
      isCrit: result.isCrit,
      duration: superEff || result.isCrit ? 0.82 : 0.62,
    });

    this.state.arenaLightingType = move.type;
    this.state.arenaLightingPulse = 1;
    this.state.hitStopRemaining = this.state.reducedMotion ? 0 : superEff || result.isCrit ? 0.08 : 0.04;
    this.state.cameraCue = superEff || result.isCrit ? 'heavyHit' : 'hit';
    this.state.cameraCueElapsed = 0;

    const tags: string[] = [];
    if (superEff) tags.push('Super Effective!');
    else if (result.effectiveness < 1) tags.push('Not very effective...');
    if (result.isCrit) tags.push('Critical hit!');
    if (result.composureCapped) tags.push('BRACED!');
    this.pushLog(`${stripEmojis(attacker.displayName)} used ${move.name} for ${dealt} dmg! ${tags.join(' ')}`.trim());
  }

  private pickEnemyMove(enemy: Pokemon): string {
    const moves = enemy.getMoveObjects();
    const usable = moves.filter((m) => enemy.getMovePp(m.id).current > 0);
    const pool = usable.length > 0 ? usable : moves;
    if (pool.length === 0) return 'tackle';
    if (enemy.hp < enemy.maxHp * 0.4) {
      const healMove = pool.find((m) => m.category === 'heal');
      if (healMove && Math.random() < 0.45) return healMove.id;
    }
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx].id;
  }

  private applyTurnEndAbilities(): void {
    for (const [mon, vis] of [
      [this.playerMon, this.state.player],
      [this.getCurrentEnemy(), this.state.enemy],
    ] as const) {
      if (mon.isFainted) continue;
      const res = evaluateTurnEndAbility(mon);
      if (!res) continue;
      if (res.heal > 0) {
        mon.healAmount(res.heal);
        vis.healFlash = 0.8;
      }
      if (res.boostStat) {
        mon.applyStageBoost(res.boostStat, res.boostStages || 1);
        vis.buffFlash = 0.8;
      }
      vis.abilityBanner = {
        name: stripEmojis(res.ability.name),
        summary: stripEmojis(res.summary),
        elapsed: 0,
      };
    }
  }

  private awardVictoryRewards(caught: boolean, outcome: BattleActionOutcome): void {
    const enemy = this.getCurrentEnemy();
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [this.playerMon];

    const bondTier = getBondTier(this.playerMon.bond);
    const traitMult = enemy.encounterTrait && ENCOUNTER_TRAITS[enemy.encounterTrait]
      ? ENCOUNTER_TRAITS[enemy.encounterTrait].xpMult
      : 1;
    const scale = this.state.isBoss ? 1.35 : 1.0;

    const xpRes = computeBattleXpReward(this.playerMon, enemy, {
      scale,
      bondMult: bondTier.xpMult,
      traitMult,
    });
    const lvRes = this.playerMon.gainXp(xpRes.xp);
    this.playerMon.gainBond(caught ? 6 : 4);

    // Smart bench XP share
    for (const bench of team) {
      if (!bench || bench === this.playerMon || bench.isFainted) continue;
      const share = computeBenchXpShare(bench, this.playerMon, enemy, xpRes.baseXp);
      bench.gainXp(share.xp);
      bench.gainBond(2);
    }

    const shards = getBattleShardReward(enemy, {
      isShrine: Boolean(this.state.shrineId),
      isTrainer: this.state.isTrainerBattle,
      caught,
    });
    this.storage.manager.addStarShards(shards, false);

    const newBadgeIds: string[] = [];
    const winBadges = this.storage.manager.recordBattleWin() || [];
    for (const b of winBadges) newBadgeIds.push(b.id);

    if (this.state.shrineId) {
      if (this.state.tier === 'shrine-trial') {
        const trialRes = this.storage.manager.recordShrineTrialWin(this.state.shrineId, { starShards: 3, starBalls: 1 });
        for (const b of trialRes.newBadges || []) newBadgeIds.push(b.id);
      } else {
        const shrine = SHRINES[this.state.shrineId];
        if (shrine?.reward) this.storage.manager.addRewards(shrine.reward, false);
        const shrineBadges = this.storage.manager.markShrineCleared(this.state.shrineId) || [];
        for (const b of shrineBadges) newBadgeIds.push(b.id);
      }
    }

    if (this.state.rivalId) {
      const rival = Object.values(RIVAL_TRAINERS).find((r) => r.id === this.state.rivalId);
      const rivalRes = this.storage.manager.markRivalDefeated(this.state.rivalId, rival?.rewards ?? { starShards: 3, greatBalls: 2 });
      for (const b of rivalRes.newBadges || []) newBadgeIds.push(b.id);
    }

    this.storage.saveSync();

    const pendingEvo = this.playerMon.getPendingLevelEvolution();
    if (pendingEvo) {
      this.state.evolutionTarget = {
        fromId: pendingEvo.fromId,
        toId: pendingEvo.toId,
        toName: stripEmojis(pendingEvo.toSpecies.name),
      };
    }

    this.state.rewardSummary = {
      xpGained: xpRes.xp,
      shardsGained: shards,
      newBadges: [...new Set(newBadgeIds)],
      caught,
      leveledUp: lvRes.leveledUp,
    };

    outcome.sfx.push(caught ? 'catch-success' : 'victory');
    if (newBadgeIds.length > 0) outcome.sfx.push('badge');
    outcome.newBadgeIds = [...new Set(newBadgeIds)];
    outcome.battleEnded = caught ? 'caught' : 'victory';
    this.state.phase = pendingEvo ? 'evolving' : 'victory';
    if (pendingEvo) {
      this.state.cameraCue = 'evolution';
      this.state.cameraCueElapsed = 0;
    }

    const lvMsg = lvRes.leveledUp ? ` ${stripEmojis(this.playerMon.displayName)} grew to Lv.${this.playerMon.level}!` : '';
    this.pushLog(`Victory! +${xpRes.xp} XP & +${shards} Star Shards!${lvMsg}`);
  }

  private handleEnemyFainted(outcome: BattleActionOutcome): boolean {
    const enemy = this.getCurrentEnemy();
    if (!enemy.isFainted) return false;

    this.pushLog(`${stripEmojis(enemy.displayName)} fainted!`);
    if (this.enemyIndex + 1 < this.enemyParty.length) {
      this.enemyIndex += 1;
      const nextFoe = this.getCurrentEnemy();
      nextFoe.resetBattleState();
      this.state.rivalRemainingMons = this.enemyParty.length - this.enemyIndex;
      this.storage.manager.recordSeen(nextFoe.speciesId, true);
      this.pushLog(`${this.state.rivalName || 'Rival'} sent out Lv.${nextFoe.level} ${stripEmojis(nextFoe.displayName)}!`);
      this.applyEntryAbility(nextFoe, 'enemy');
      this.syncCombatantSprites();
      return false;
    }

    this.state.rivalRemainingMons = 0;
    this.awardVictoryRewards(false, outcome);
    return true;
  }

  private handlePlayerFainted(outcome: BattleActionOutcome): boolean {
    if (!this.playerMon.isFainted) return false;
    this.pushLog(`${stripEmojis(this.playerMon.displayName)} fainted!`);

    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const nextHealthy = team.find((m) => m && !m.isFainted);
    if (nextHealthy) {
      nextHealthy.resetBattleState();
      this.playerMon = nextHealthy;
      this.pushLog(`Go, ${stripEmojis(nextHealthy.displayName)}!`);
      this.applyEntryAbility(nextHealthy, 'player');
      this.syncCombatantSprites();
      return false;
    }

    // All fainted -> gentle Starlight Village heal recall
    this.storage.manager.healTeam(true);
    this.storage.manager.warpToSafeZone();
    this.state.phase = 'defeat';
    outcome.battleEnded = 'defeat';
    this.pushLog('Your team rested up safely at Starlight Village Healing Fountain!');
    return true;
  }

  performMove(moveId: string): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active || (this.state.phase !== 'command' && this.state.phase !== 'shutter')) {
      return outcome;
    }
    this.state.shutter.active = false;
    this.state.phase = 'command';

    const enemy = this.getCurrentEnemy();
    const enemyMoveId = this.pickEnemyMove(enemy);
    const playerFirst = this.playerMon.getEffectiveSpd() >= enemy.getEffectiveSpd();

    if (playerFirst) {
      this.executeSingleMove(this.playerMon, enemy, moveId, 'player', outcome);
      if (this.handleEnemyFainted(outcome)) {
        this.syncCombatantSprites();
        return outcome;
      }
      this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
      if (this.handlePlayerFainted(outcome)) {
        this.syncCombatantSprites();
        return outcome;
      }
    } else {
      this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
      if (this.handlePlayerFainted(outcome)) {
        this.syncCombatantSprites();
        return outcome;
      }
      this.executeSingleMove(this.playerMon, enemy, moveId, 'player', outcome);
      if (this.handleEnemyFainted(outcome)) {
        this.syncCombatantSprites();
        return outcome;
      }
    }

    this.applyTurnEndAbilities();
    this.state.turnNumber += 1;
    this.storage.saveSync();
    this.syncCombatantSprites();
    return outcome;
  }

  throwBall(kind: BallKind): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active || !this.state.canCapture) return outcome;
    if (this.state.phase === 'victory' || this.state.phase === 'defeat') return outcome;

    this.state.shutter.active = false;
    const ballKey = kind === 'star' ? 'starBalls' : kind === 'great' ? 'greatBalls' : null;
    if (ballKey && !this.storage.manager.useItem(ballKey)) {
      this.pushLog(`No ${kind === 'star' ? 'Star Balls' : 'Great Balls'} left!`);
      return outcome;
    }

    const ballBonus = kind === 'star' ? 2.8 : kind === 'great' ? 1.55 : 1.0;
    const enemy = this.getCurrentEnemy();
    const attempt = calculateCatchAttempt(enemy, ballBonus);

    this.state.enemy.captureBallKind = kind;
    this.state.enemy.captureShakes = attempt.shakes;
    this.state.enemy.captureProgress = 1;
    this.state.cameraCue = 'starBall';
    this.state.cameraCueElapsed = 0;
    outcome.sfx.push('catch-throw');

    if (attempt.caught) {
      const catchRes = this.storage.manager.recordCaught(enemy);
      this.pushLog(`Gotcha! ${stripEmojis(enemy.displayName)} joined your ${catchRes.destination}!`);
      this.awardVictoryRewards(true, outcome);
      if (catchRes.newBadges?.length) {
        outcome.newBadgeIds = [
          ...(outcome.newBadgeIds ?? []),
          ...catchRes.newBadges.map((b: { id: string }) => b.id),
        ];
      }
      this.syncCombatantSprites();
      return outcome;
    }

    this.pushLog(`Oh no! ${stripEmojis(enemy.displayName)} broke free after ${attempt.shakes} shakes!`);
    const enemyMoveId = this.pickEnemyMove(enemy);
    this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
    this.handlePlayerFainted(outcome);
    this.state.turnNumber += 1;
    this.syncCombatantSprites();
    return outcome;
  }

  usePotion(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active) return outcome;
    if (!this.storage.manager.useItem('potions')) {
      this.pushLog('No Potions left in your bag!');
      return outcome;
    }
    const healAmt = Math.max(
      BALANCE.combat.potionMinHeal,
      Math.round(this.playerMon.maxHp * BALANCE.combat.potionHealRatio),
    );
    const healed = this.playerMon.healAmount(healAmt);
    this.state.player.healFlash = 1;
    outcome.sfx.push('heal');
    this.pushLog(`Used a Potion! ${stripEmojis(this.playerMon.displayName)} restored ${healed} HP!`);

    const enemy = this.getCurrentEnemy();
    const enemyMoveId = this.pickEnemyMove(enemy);
    this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
    this.handlePlayerFainted(outcome);
    this.state.turnNumber += 1;
    this.syncCombatantSprites();
    return outcome;
  }

  switchTeamMember(teamIdx: number): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const target = team[teamIdx];
    if (!target || target.isFainted || target === this.playerMon) return outcome;

    target.resetBattleState();
    this.playerMon = target;
    this.pushLog(`Switched in ${stripEmojis(target.displayName)}!`);
    this.applyEntryAbility(target, 'player');

    const enemy = this.getCurrentEnemy();
    const enemyMoveId = this.pickEnemyMove(enemy);
    this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
    this.handlePlayerFainted(outcome);
    this.state.turnNumber += 1;
    this.syncCombatantSprites();
    return outcome;
  }

  confirmEvolution(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.evolutionTarget) return outcome;
    const res = this.storage.manager.evolvePokemon(this.playerMon.uid, this.state.evolutionTarget.toId);
    if (res) {
      outcome.sfx.push('evolve');
      this.pushLog(`Congratulations! Evolved into ${stripEmojis(res.evolution.newName)}!`);
      this.state.evolutionTarget = undefined;
      this.state.phase = 'victory';
      this.syncCombatantSprites();
    }
    return outcome;
  }

  flee(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.canRun) {
      this.pushLog('Cannot flee from a Trainer Duel!');
      return outcome;
    }
    this.state.active = false;
    outcome.battleEnded = 'fled';
    this.pushLog('Got away safely!');
    return outcome;
  }

  closeBattle(): void {
    this.state.active = false;
    this.state.phase = 'command';
  }

  update(dtSeconds: number): void {
    if (!this.state.active) return;
    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.state.elapsedSeconds += dt;
    this.state.cameraCueElapsed += dt;

    if (this.state.shutter.active) {
      this.state.shutter.progress = Math.min(1, this.state.shutter.progress + dt / Math.max(0.08, this.state.shutter.duration));
      if (this.state.shutter.progress >= 1) {
        this.state.shutter.active = false;
        if (this.state.phase === 'shutter') {
          this.state.phase = 'command';
        }
      }
    }

    if (this.state.hitStopRemaining > 0) {
      this.state.hitStopRemaining = Math.max(0, this.state.hitStopRemaining - dt);
    }

    this.state.arenaLightingPulse = Math.max(0, this.state.arenaLightingPulse - dt * 1.4);

    for (const vis of [this.state.player, this.state.enemy]) {
      vis.hitFlash = Math.max(0, vis.hitFlash - dt * 3.8);
      vis.lungeOffset *= Math.pow(0.005, dt);
      vis.recoilOffset *= Math.pow(0.005, dt);
      vis.bracedFlash = Math.max(0, vis.bracedFlash - dt * 1.6);
      vis.buffFlash = Math.max(0, vis.buffFlash - dt * 1.8);
      vis.healFlash = Math.max(0, vis.healFlash - dt * 1.8);
      if (vis.abilityBanner) {
        vis.abilityBanner.elapsed += dt;
        if (vis.abilityBanner.elapsed > 2.4) vis.abilityBanner = null;
      }
    }
  }
}
