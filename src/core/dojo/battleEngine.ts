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
  getTypeEffectiveness,
  resolveSpeciesArchetype,
  rollWildPokemon,
} from './raw/pokemon.js';
import { ENCOUNTER_TRAITS, EVOLUTION_ITEMS, RIVAL_TRAINERS, SHRINES } from './raw/config.js';
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
  moveSfxEvents?: Array<{ moveId: string; type: string; side: 'player' | 'enemy' }>;
  battleEnded?: 'victory' | 'defeat' | 'caught' | 'fled';
  newBadgeIds?: string[];
}

const STRUGGLE_MOVE = {
  id: 'struggle',
  name: 'Struggle',
  type: 'normal' as ElementalType,
  power: 35,
  accuracy: 100,
  pp: 1,
  damageClass: 'physical' as const,
  category: 'attack' as const,
  fx: 'impact',
};

const BIOME_DROP_GEMS: Record<string, () => string> = {
  forest: () => 'leaf_gem',
  cave: () => 'moon_gem',
  water: () => 'water_gem',
  volcano: () => (Math.random() < 0.5 ? 'fire_gem' : 'thunder_gem'),
  peak: () => 'ice_gem',
  grove: () => 'astral_gem',
  desert: () => (Math.random() < 0.5 ? 'prism_gem' : 'sun_gem'),
  marsh: () => (Math.random() < 0.5 ? 'dusk_gem' : 'leaf_gem'),
  sanctum: () => (Math.random() < 0.5 ? 'prism_gem' : 'astral_gem'),
  canyon: () => (Math.random() < 0.5 ? 'thunder_gem' : 'sun_gem'),
  reef: () => (Math.random() < 0.5 ? 'water_gem' : 'moon_gem'),
  ruins: () => (Math.random() < 0.5 ? 'chrono_gem' : 'dusk_gem'),
  rift: () => (Math.random() < 0.5 ? 'nebula_gem' : 'astral_gem'),
  faeveldt: () => 'pixie_gem',
  atoll: () => 'alola_gem',
  highlands: () => 'crown_gem',
  crater: () => 'tera_gem',
};

function toCombatantSnapshot(mon: Pokemon): BattleCombatantSnapshot {
  const sp = getSpeciesEntry(mon.speciesId);
  const ab = getAbilityEntry(mon.abilityId);
  const rawMoves = mon.getMoveObjects().slice(0, 4).map((rawMove) => {
    const entry = getMoveEntry(rawMove.id);
    const pp = mon.getMovePp(entry.id);
    return {
      ...entry,
      currentPp: pp.current,
      maxPp: pp.max,
    };
  });
  const hasUsablePp = rawMoves.some((m) => m.currentPp > 0);
  const moves = hasUsablePp
    ? rawMoves
    : [{ ...STRUGGLE_MOVE, currentPp: 1, maxPp: 1 }];

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
  private playerBuddyEndured = false;

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
    this.playerBuddyEndured = false;

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
      canCapture: !isTrainerBattle && !shrineId,
      canRun: true,
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
    const isStruggle = moveId === 'struggle';
    const move = isStruggle ? STRUGGLE_MOVE : getMoveEntry(moveId);
    if (!isStruggle) {
      attacker.consumeMovePp(move.id);
    }
    const atkVis = attackerSide === 'player' ? this.state.player : this.state.enemy;
    const defVis = attackerSide === 'player' ? this.state.enemy : this.state.player;
    const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';

    if (!outcome.moveSfxId) {
      outcome.moveSfxId = move.id;
      outcome.moveSfxFx = move.type;
    }
    if (!outcome.moveSfxEvents) outcome.moveSfxEvents = [];
    outcome.moveSfxEvents.push({ moveId: move.id, type: move.type, side: attackerSide });

    const result = calculateDamage(attacker, defender, move, {
      applyAbilities: true,
      applyComposure: true,
      applyEncounterTraits: true,
      defenderSide,
      isBoss: Boolean(this.state.shrineId),
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
    const prevHp = defender.hp;
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

    // Bond endure check for player Pokémon (once per active mon, requires Trusted Buddy 60+ bond & prevHp > 1)
    if (defenderSide === 'player' && defender.isFainted && prevHp > 1 && !this.playerBuddyEndured) {
      const bondTier = getBondTier(defender.bond);
      if (defender.bond >= 60 && bondTier.endureChance > 0 && Math.random() < bondTier.endureChance) {
        defender.hp = 1;
        this.playerBuddyEndured = true;
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
    if (usable.length === 0) return 'struggle';

    const hpRatio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
    if (hpRatio <= 0.42) {
      const healMove = usable.find((m) => m.category === 'heal');
      if (healMove && Math.random() < 0.55) return healMove.id;
    }

    const defenderType = this.playerMon.type || 'normal';
    const scored = usable.map((m) => {
      let score = 10;
      if (m.category === 'heal') {
        score = hpRatio < 0.6 ? 45 : 4;
      } else if (m.category === 'shield') {
        score = (enemy.shieldTurns ?? 0) === 0 ? 52 : 8;
      } else if (m.category === 'buff') {
        const stat = (m.buffStat || 'atk') as 'atk' | 'def' | 'spd';
        const curStage = enemy.battleStages?.[stat] ?? 0;
        score = curStage < 2 && this.state.turnNumber <= 3 ? 44 : 10;
      } else {
        const eff = getTypeEffectiveness(m.type, defenderType);
        const stab = m.type === enemy.type ? 1.25 : 1.0;
        score = Math.max(12, (Number(m.power) || 40) * eff * stab);
      }
      return { id: m.id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 1 || Math.random() < 0.62) {
      return scored[0].id;
    }
    const topPool = scored.slice(0, Math.min(3, scored.length));
    const total = topPool.reduce((s, item) => s + item.score, 0);
    let roll = Math.random() * total;
    for (const item of topPool) {
      roll -= item.score;
      if (roll <= 0) return item.id;
    }
    return topPool[0].id;
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

  private awardPartialFaintXp(defeatedEnemy: Pokemon, outcome: BattleActionOutcome): void {
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [this.playerMon];
    const bondTier = getBondTier(this.playerMon.bond);
    const xpRes = computeBattleXpReward(this.playerMon, defeatedEnemy, {
      scale: 1.0,
      bondMult: bondTier.xpMult,
      traitMult: 1,
    });
    const lvRes = this.playerMon.gainXp(xpRes.xp);
    for (const bench of team) {
      if (!bench || bench === this.playerMon || bench.isFainted) continue;
      const share = computeBenchXpShare(bench, this.playerMon, defeatedEnemy, xpRes.baseXp);
      bench.gainXp(share.xp);
    }
    const badges = this.storage.manager.evaluateBadges(false) || [];
    if (badges.length > 0) {
      const ids = badges.map((b: { id: string }) => b.id);
      outcome.newBadgeIds = [...new Set([...(outcome.newBadgeIds ?? []), ...ids])];
      outcome.sfx.push('badge');
    }
    const lvMsg = lvRes.leveledUp ? ` ${stripEmojis(this.playerMon.displayName)} grew to Lv.${this.playerMon.level}!` : '';
    this.pushLog(`Earned +${xpRes.xp} XP!${lvMsg}`);
  }

  private rollVictoryTrailDrop(): string | null {
    if (this.state.isTrainerBattle) return null;
    const dropChance = this.state.shrineId ? 0.9 : 0.45;
    if (Math.random() >= dropChance) return null;

    const dropBiome = this.state.biomeId;
    const gemId = BIOME_DROP_GEMS[dropBiome]?.() ?? null;
    const roll = Math.random();
    if (gemId && roll < 0.34) {
      this.storage.manager.addRewards({ gems: { [gemId]: 1 } }, false);
      const gemName = stripEmojis(EVOLUTION_ITEMS[gemId]?.name || 'Evolution Gem');
      return `a ${gemName}`;
    }
    if (roll < 0.58) {
      this.storage.manager.addRewards({ starBalls: 1 }, false);
      return 'a Star Ball';
    }
    if (roll < 0.8) {
      this.storage.manager.addRewards({ greatBalls: 1 }, false);
      return 'a Great Ball';
    }
    this.storage.manager.addRewards({ potions: 1 }, false);
    return 'a Berry Potion';
  }

  private awardVictoryRewards(caught: boolean, outcome: BattleActionOutcome, excludeBenchUid?: string): void {
    const enemy = this.getCurrentEnemy();
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [this.playerMon];

    const bondTier = getBondTier(this.playerMon.bond);
    const traitMult = enemy.encounterTrait && ENCOUNTER_TRAITS[enemy.encounterTrait]
      ? ENCOUNTER_TRAITS[enemy.encounterTrait].xpMult
      : 1;
    const scale = caught ? 0.6 : this.state.isBoss ? 1.35 : 1.0;

    const xpRes = computeBattleXpReward(this.playerMon, enemy, {
      scale,
      bondMult: bondTier.xpMult,
      traitMult,
    });
    const lvRes = this.playerMon.gainXp(xpRes.xp);
    this.playerMon.gainBond(caught ? 6 : 4);
    if (caught && enemy.encounterTrait === 'curious') {
      this.playerMon.gainBond(4);
      enemy.gainBond(4);
    }
    if (caught) {
      this.storage.manager.addCheerCharges(1, false);
    }

    // Smart bench XP share (never awards catch XP to the newly caught Pokémon itself!)
    for (const bench of team) {
      if (!bench || bench === this.playerMon || bench.isFainted) continue;
      if (excludeBenchUid && bench.uid === excludeBenchUid) continue;
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

    const newBadgeIds: string[] = [...(outcome.newBadgeIds ?? [])];
    const winBadges = this.storage.manager.recordBattleWin() || [];
    for (const b of winBadges) newBadgeIds.push(b.id);

    if (this.state.shrineId) {
      if (this.state.tier === 'shrine-trial') {
        const trialRes = this.storage.manager.recordShrineTrialWin(this.state.shrineId, { starShards: 3, starBalls: 1 });
        for (const b of trialRes.newBadges || []) newBadgeIds.push(b.id);
      } else {
        const alreadyCleared = Boolean(profile?.shrinesCleared?.includes(this.state.shrineId));
        const shrine = Object.values(SHRINES).find((s) => s.id === this.state.shrineId);
        if (!alreadyCleared && shrine?.reward) {
          this.storage.manager.addRewards(shrine.reward, false);
        }
        const shrineBadges = this.storage.manager.markShrineCleared(this.state.shrineId) || [];
        for (const b of shrineBadges) newBadgeIds.push(b.id);
      }
    }

    if (this.state.rivalId) {
      const rival = Object.values(RIVAL_TRAINERS).find((r) => r.id === this.state.rivalId);
      const isRematch = Boolean(profile?.rivalsDefeated?.includes(this.state.rivalId));
      const rivalRewards = isRematch
        ? (rival?.rematchRewards ?? { greatBalls: 1, potions: 1 })
        : (rival?.rewards ?? { starShards: 3, greatBalls: 2 });
      const rivalRes = this.storage.manager.markRivalDefeated(this.state.rivalId, rivalRewards);
      for (const b of rivalRes.newBadges || []) newBadgeIds.push(b.id);
    }

    let trailDropLabel: string | null = null;
    if (!caught) {
      trailDropLabel = this.rollVictoryTrailDrop();
    }

    const postBadges = this.storage.manager.evaluateBadges(false) || [];
    for (const b of postBadges) newBadgeIds.push(b.id);

    this.storage.saveSync();

    const pendingEvo = this.playerMon.getPendingLevelEvolution();
    if (pendingEvo) {
      this.state.evolutionTarget = {
        fromId: pendingEvo.fromId,
        toId: pendingEvo.toId,
        toName: stripEmojis(pendingEvo.toSpecies.name),
      };
    }

    const uniqueBadges = [...new Set(newBadgeIds)];
    this.state.rewardSummary = {
      xpGained: xpRes.xp,
      shardsGained: shards,
      newBadges: uniqueBadges,
      caught,
      leveledUp: lvRes.leveledUp,
      trailDrop: trailDropLabel,
    };

    outcome.sfx.push(caught ? 'catch-success' : 'victory');
    if (uniqueBadges.length > 0) outcome.sfx.push('badge');
    outcome.newBadgeIds = uniqueBadges;
    outcome.battleEnded = caught ? 'caught' : 'victory';
    this.state.phase = pendingEvo ? 'evolving' : 'victory';
    if (pendingEvo) {
      this.state.cameraCue = 'evolution';
      this.state.cameraCueElapsed = 0;
    }

    const lvMsg = lvRes.leveledUp ? ` ${stripEmojis(this.playerMon.displayName)} grew to Lv.${this.playerMon.level}!` : '';
    const dropMsg = trailDropLabel ? ` Found ${trailDropLabel} on the victory trail!` : '';
    this.pushLog(`Victory! +${xpRes.xp} XP & +${shards} Star Shards!${lvMsg}${dropMsg}`);
  }

  private handleEnemyFainted(outcome: BattleActionOutcome): 'none' | 'switched' | 'victory' {
    const enemy = this.getCurrentEnemy();
    if (!enemy.isFainted) return 'none';

    this.pushLog(`${stripEmojis(enemy.displayName)} fainted!`);
    if (this.enemyIndex + 1 < this.enemyParty.length) {
      this.awardPartialFaintXp(enemy, outcome);
      this.enemyIndex += 1;
      const nextFoe = this.getCurrentEnemy();
      nextFoe.resetBattleState();
      this.state.rivalRemainingMons = this.enemyParty.length - this.enemyIndex;
      this.storage.manager.recordSeen(nextFoe.speciesId, true);
      this.pushLog(`${this.state.rivalName || 'Rival'} sent out Lv.${nextFoe.level} ${stripEmojis(nextFoe.displayName)}!`);
      this.applyEntryAbility(nextFoe, 'enemy');
      this.syncCombatantSprites();
      return 'switched';
    }

    this.state.rivalRemainingMons = 0;
    this.awardVictoryRewards(false, outcome);
    return 'victory';
  }

  private handlePlayerFainted(outcome: BattleActionOutcome): 'none' | 'forced-switch' | 'defeat' {
    if (!this.playerMon.isFainted) return 'none';
    this.pushLog(`${stripEmojis(this.playerMon.displayName)} fainted!`);

    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const hasHealthyBench = team.some((m) => m && !m.isFainted && m !== this.playerMon);
    if (hasHealthyBench) {
      this.state.phase = 'forced-switch';
      this.pushLog('Choose your next Pokémon!');
      this.syncCombatantSprites();
      return 'forced-switch';
    }

    // All fainted -> gentle Starlight Village heal recall
    this.storage.manager.healTeam(true);
    this.storage.manager.warpToSafeZone();
    this.state.phase = 'defeat';
    outcome.sfx.push('heal');
    outcome.battleEnded = 'defeat';
    this.pushLog('Your team rested up safely at Starlight Village Healing Fountain!');
    return 'defeat';
  }

  performMove(moveId: string): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active || (this.state.phase !== 'command' && this.state.phase !== 'shutter')) {
      return outcome;
    }

    const effectiveMoveId =
      moveId === 'struggle' || !this.playerMon.hasAnyMovePp() ? 'struggle' : moveId;
    if (effectiveMoveId !== 'struggle' && this.playerMon.getMovePp(effectiveMoveId).current <= 0) {
      this.pushLog('No PP left for that move! Choose another move.');
      return outcome;
    }

    this.state.shutter.active = false;
    this.state.phase = 'command';

    const enemy = this.getCurrentEnemy();
    const enemyMoveId = this.pickEnemyMove(enemy);
    const playerFirst = this.playerMon.getEffectiveSpd() >= enemy.getEffectiveSpd();

    if (playerFirst) {
      this.executeSingleMove(this.playerMon, enemy, effectiveMoveId, 'player', outcome);
      const enemyFaint = this.handleEnemyFainted(outcome);
      if (enemyFaint !== 'none') {
        if (enemyFaint === 'switched') {
          this.state.turnNumber += 1;
          this.storage.saveSync();
        }
        this.syncCombatantSprites();
        return outcome;
      }
      this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
      const playerFaint = this.handlePlayerFainted(outcome);
      if (playerFaint !== 'none') {
        if (playerFaint === 'forced-switch') {
          this.state.turnNumber += 1;
          this.storage.saveSync();
        }
        this.syncCombatantSprites();
        return outcome;
      }
    } else {
      this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
      const playerFaint = this.handlePlayerFainted(outcome);
      if (playerFaint !== 'none') {
        if (playerFaint === 'forced-switch') {
          this.state.turnNumber += 1;
          this.storage.saveSync();
        }
        this.syncCombatantSprites();
        return outcome;
      }
      this.executeSingleMove(this.playerMon, enemy, effectiveMoveId, 'player', outcome);
      const enemyFaint = this.handleEnemyFainted(outcome);
      if (enemyFaint !== 'none') {
        if (enemyFaint === 'switched') {
          this.state.turnNumber += 1;
          this.storage.saveSync();
        }
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
    if (!this.state.active || (this.state.phase !== 'command' && this.state.phase !== 'shutter')) {
      return outcome;
    }
    if (!this.state.canCapture) {
      this.pushLog(
        this.state.shrineId
          ? 'Shrine Guardians cannot be caught! Defeat them to earn their Shrine blessing!'
          : 'You cannot catch another Trainer\'s Pokémon!',
      );
      return outcome;
    }

    this.state.shutter.active = false;
    this.state.phase = 'command';
    const ballKey = kind === 'star' ? 'starBalls' : kind === 'great' ? 'greatBalls' : null;
    if (ballKey && !this.storage.manager.useItem(ballKey)) {
      this.pushLog(`No ${kind === 'star' ? 'Star Balls' : 'Great Balls'} left!`);
      return outcome;
    }

    const ballBonus = kind === 'star' ? 2.0 : kind === 'great' ? 1.45 : 1.0;
    const enemy = this.getCurrentEnemy();
    const attempt = calculateCatchAttempt(enemy, ballBonus);

    this.state.enemy.captureBallKind = kind;
    this.state.enemy.captureShakes = attempt.shakes;
    this.state.enemy.captureProgress = 1;
    this.state.cameraCue = 'starBall';
    this.state.cameraCueElapsed = 0;
    outcome.sfx.push('catch-throw');

    if (attempt.caught) {
      enemy.hp = Math.max(1, enemy.hp);
      const catchRes = this.storage.manager.recordCaught(enemy);
      if (catchRes.newBadges?.length) {
        outcome.newBadgeIds = [
          ...(outcome.newBadgeIds ?? []),
          ...catchRes.newBadges.map((b: { id: string }) => b.id),
        ];
      }
      this.pushLog(`Gotcha! ${stripEmojis(enemy.displayName)} joined your ${catchRes.destination}!`);
      this.awardVictoryRewards(true, outcome, enemy.uid);
      this.syncCombatantSprites();
      return outcome;
    }

    this.pushLog(`Oh no! ${stripEmojis(enemy.displayName)} broke free after ${attempt.shakes} shakes!`);
    const enemyMoveId = this.pickEnemyMove(enemy);
    this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
    const faintRes = this.handlePlayerFainted(outcome);
    if (faintRes === 'none') {
      this.applyTurnEndAbilities();
    }
    this.state.turnNumber += 1;
    this.storage.saveSync();
    this.syncCombatantSprites();
    return outcome;
  }

  usePotion(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active || (this.state.phase !== 'command' && this.state.phase !== 'shutter')) {
      return outcome;
    }
    if (this.playerMon.hp >= this.playerMon.maxHp) {
      this.pushLog(`${stripEmojis(this.playerMon.displayName)}'s HP is already full!`);
      return outcome;
    }
    if (!this.storage.manager.useItem('potions')) {
      this.pushLog('No Potions left in your bag!');
      return outcome;
    }

    this.state.shutter.active = false;
    this.state.phase = 'command';
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
    const faintRes = this.handlePlayerFainted(outcome);
    if (faintRes === 'none') {
      this.applyTurnEndAbilities();
    }
    this.state.turnNumber += 1;
    this.storage.saveSync();
    this.syncCombatantSprites();
    return outcome;
  }

  switchTeamMember(teamIdx: number): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    const wasForced = this.state.phase === 'forced-switch';
    if (
      !this.state.active
      || (this.state.phase !== 'command' && this.state.phase !== 'shutter' && !wasForced)
    ) {
      return outcome;
    }
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const target = team[teamIdx];
    if (!target || target.isFainted || target === this.playerMon) return outcome;

    this.state.shutter.active = false;
    this.state.phase = 'command';
    target.resetBattleState();
    this.playerMon = target;
    this.playerBuddyEndured = false;
    this.pushLog(wasForced ? `Go, ${stripEmojis(target.displayName)}!` : `Switched in ${stripEmojis(target.displayName)}!`);
    this.applyEntryAbility(target, 'player');

    // Forced switch after faint gives the player a clean send-out without a free enemy hit (v1 parity)
    if (wasForced) {
      this.storage.saveSync();
      this.syncCombatantSprites();
      return outcome;
    }

    const enemy = this.getCurrentEnemy();
    const enemyMoveId = this.pickEnemyMove(enemy);
    this.executeSingleMove(enemy, this.playerMon, enemyMoveId, 'enemy', outcome);
    const faintRes = this.handlePlayerFainted(outcome);
    if (faintRes === 'none') {
      this.applyTurnEndAbilities();
    }
    this.state.turnNumber += 1;
    this.storage.saveSync();
    this.syncCombatantSprites();
    return outcome;
  }

  confirmEvolution(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.evolutionTarget) return outcome;
    const res = this.storage.manager.evolvePokemon(this.playerMon.uid, this.state.evolutionTarget.toId);
    if (res) {
      outcome.sfx.push('evolve');
      const evoBadges: string[] = Array.isArray(res.newBadges)
        ? res.newBadges.map((b: { id: string }) => b.id)
        : [];
      if (evoBadges.length > 0) {
        outcome.sfx.push('badge');
        outcome.newBadgeIds = [...new Set([...(outcome.newBadgeIds ?? []), ...evoBadges])];
        if (this.state.rewardSummary) {
          this.state.rewardSummary = {
            ...this.state.rewardSummary,
            newBadges: [...new Set([...this.state.rewardSummary.newBadges, ...evoBadges])],
          };
        }
      }
      this.pushLog(`Congratulations! Evolved into ${stripEmojis(res.evolution.newName)}!`);
      this.state.evolutionTarget = undefined;
      this.state.phase = 'victory';
      this.syncCombatantSprites();
    }
    return outcome;
  }

  flee(): BattleActionOutcome {
    const outcome: BattleActionOutcome = { vfxEvents: [], sfx: [] };
    if (!this.state.active || (this.state.phase !== 'command' && this.state.phase !== 'shutter')) {
      return outcome;
    }
    if (!this.state.canRun) {
      this.pushLog('Cannot flee from this battle!');
      return outcome;
    }
    this.state.active = false;
    outcome.battleEnded = 'fled';
    this.pushLog(
      this.state.shrineId
        ? 'Stepped back safely from the Shrine!'
        : this.state.isTrainerBattle
          ? 'Stepped back safely from the duel!'
          : 'Got away safely!',
    );
    return outcome;
  }

  closeBattle(): void {
    this.state.active = false;
    this.state.phase = 'command';
  }

  update(dtSeconds: number, options?: { skipVisualTimers?: boolean }): void {
    if (!this.state.active) return;
    if (options?.skipVisualTimers) return;
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
