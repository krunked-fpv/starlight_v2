import type {
  BallKind,
  BattleCameraCue,
  BattleCombatantSnapshot,
  BattleCombatantVisual,
  BattleEnemyPartyPip,
  BattlePace,
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
  battlePace?: BattlePace;
}

export type BattleSfxEvent =
  | 'move-select'
  | 'windup'
  | 'hit'
  | 'super-hit'
  | 'miss'
  | 'heal'
  | 'buff'
  | 'shield'
  | 'brace'
  | 'endure'
  | 'faint'
  | 'shiny'
  | 'catch-throw'
  | 'star-shimmer'
  | 'catch-absorb'
  | 'catch-bounce'
  | 'catch-shake'
  | 'catch-breakout'
  | 'catch-success'
  | 'level-up'
  | 'victory'
  | 'badge'
  | 'evo-start'
  | 'evolve';

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
  sfx: BattleSfxEvent[];
  moveSfxId?: string;
  moveSfxFx?: string;
  moveSfxEvents?: Array<{ moveId: string; type: string; side: 'player' | 'enemy' }>;
  crySpeciesIds?: number[];
  abilitySfx?: Array<{ abilityId: string; type: ElementalType }>;
  shakeIndex?: number;
  battleEnded?: 'victory' | 'defeat' | 'caught' | 'fled';
  newBadgeIds?: string[];
}

interface BattleTimelineStep {
  duration: number;
  elapsed: number;
  started: boolean;
  onStart?: () => void;
  onProgress?: (t: number) => void;
  onComplete?: () => void;
}

interface PaceTimings {
  introHold: number;
  windup: number;
  impactHold: number;
  abilityHold: number;
  interTurn: number;
  faintHold: number;
  sendOutHold: number;
  hpDrainSec: number;
  ballThrow: number;
  ballAbsorb: number;
  ballWobble: number;
  ballResolve: number;
}

const PACE_PRESETS: Record<BattlePace, PaceTimings> = {
  cinema: {
    introHold: 0.52,
    windup: 0.56,
    impactHold: 0.72,
    abilityHold: 0.52,
    interTurn: 0.48,
    faintHold: 0.6,
    sendOutHold: 0.48,
    hpDrainSec: 0.42,
    ballThrow: 0.38,
    ballAbsorb: 0.28,
    ballWobble: 0.46,
    ballResolve: 0.52,
  },
  classic: {
    introHold: 0.4,
    windup: 0.42,
    impactHold: 0.54,
    abilityHold: 0.4,
    interTurn: 0.34,
    faintHold: 0.46,
    sendOutHold: 0.38,
    hpDrainSec: 0.32,
    ballThrow: 0.3,
    ballAbsorb: 0.24,
    ballWobble: 0.36,
    ballResolve: 0.4,
  },
  fast: {
    introHold: 0.24,
    windup: 0.24,
    impactHold: 0.34,
    abilityHold: 0.26,
    interTurn: 0.22,
    faintHold: 0.3,
    sendOutHold: 0.26,
    hpDrainSec: 0.2,
    ballThrow: 0.22,
    ballAbsorb: 0.16,
    ballWobble: 0.24,
    ballResolve: 0.26,
  },
};

const ACTION_COOLDOWN_SEC = 0.18;

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

function createEmptyOutcome(): BattleActionOutcome {
  return { vfxEvents: [], sfx: [] };
}

function hasOutcomePayload(o: BattleActionOutcome): boolean {
  return (
    o.vfxEvents.length > 0
    || o.sfx.length > 0
    || Boolean(o.moveSfxEvents && o.moveSfxEvents.length > 0)
    || Boolean(o.moveSfxId)
    || Boolean(o.crySpeciesIds && o.crySpeciesIds.length > 0)
    || Boolean(o.abilitySfx && o.abilitySfx.length > 0)
    || Boolean(o.battleEnded)
    || Boolean(o.newBadgeIds && o.newBadgeIds.length > 0)
  );
}

function mergeOutcome(target: BattleActionOutcome, src: BattleActionOutcome): void {
  if (src.vfxEvents.length > 0) target.vfxEvents.push(...src.vfxEvents);
  if (src.sfx.length > 0) target.sfx.push(...src.sfx);
  if (src.moveSfxId && !target.moveSfxId) {
    target.moveSfxId = src.moveSfxId;
    target.moveSfxFx = src.moveSfxFx;
  }
  if (src.moveSfxEvents && src.moveSfxEvents.length > 0) {
    if (!target.moveSfxEvents) target.moveSfxEvents = [];
    target.moveSfxEvents.push(...src.moveSfxEvents);
  }
  if (src.crySpeciesIds && src.crySpeciesIds.length > 0) {
    if (!target.crySpeciesIds) target.crySpeciesIds = [];
    target.crySpeciesIds.push(...src.crySpeciesIds);
  }
  if (src.abilitySfx && src.abilitySfx.length > 0) {
    if (!target.abilitySfx) target.abilitySfx = [];
    target.abilitySfx.push(...src.abilitySfx);
  }
  if (src.shakeIndex !== undefined) target.shakeIndex = src.shakeIndex;
  if (src.battleEnded) target.battleEnded = src.battleEnded;
  if (src.newBadgeIds && src.newBadgeIds.length > 0) {
    target.newBadgeIds = [...new Set([...(target.newBadgeIds ?? []), ...src.newBadgeIds])];
  }
}

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
  const snap = toCombatantSnapshot(mon);
  const xpRatio = Math.max(0, Math.min(1, snap.xp / Math.max(1, snap.xpToNext)));
  return {
    side,
    mon: snap,
    frames: null,
    useOfflineRig: forceOfflineRig,
    displayedHp: snap.hp,
    displayedXpRatio: xpRatio,
    faintDrop: 0,
    sendOutProgress: 1,
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

function statShortLabel(stat: string): string {
  if (stat === 'atk') return 'ATK';
  if (stat === 'def') return 'DEF';
  if (stat === 'spd') return 'SPD';
  return 'STAT';
}

function statFullLabel(stat: string): string {
  if (stat === 'atk') return 'Attack';
  if (stat === 'def') return 'Defense';
  if (stat === 'spd') return 'Speed';
  return 'Power';
}

function isSameMon(a: Pokemon | null | undefined, b: Pokemon | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b || (Boolean(a.uid) && a.uid === b.uid);
}

export class DojoBattleController {
  private readonly storage: StarlightStorageBridge;
  private readonly sprites: SpriteAssetLoader;
  private state: BattleSceneState;
  private playerMon: Pokemon;
  private enemyParty: Pokemon[] = [];
  private enemyIndex = 0;
  private playerBuddyEndured = false;

  private battlePace: BattlePace = 'cinema';
  private stepQueue: BattleTimelineStep[] = [];
  private pendingOutcome: BattleActionOutcome = createEmptyOutcome();
  private actionCooldownRemaining = 0;
  private floatingTextSeq = 0;
  private introScheduled = false;
  private defeatRecoveryPending = false;

  // Multi-mon battle tracking & post-battle metadata for StarlightApp dialogue
  private cumulativeXpGained = 0;
  private leveledUpInBattle = false;
  private wasRivalRematchAtStart = false;
  private wasShrineClearedAtStart = false;

  constructor(storage: StarlightStorageBridge, sprites: SpriteAssetLoader) {
    this.storage = storage;
    this.sprites = sprites;
    this.battlePace = this.storage.getSettings().battlePace || 'cinema';
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
      enemyPartyPips: [],
      shrineId: null,
      shrineTrialNumber: 0,
      turnNumber: 1,
      phase: 'command',
      inputLocked: false,
      activeActionLabel: null,
      player: createEmptyVisual('player', this.playerMon, false),
      enemy: createEmptyVisual('enemy', dummyEnemy, false),
      shutter: { active: false, tier: 'wild', progress: 1, duration: 0.45 },
      activeVfx: [],
      floatingTexts: [],
      cameraCue: 'idle',
      cameraCueSeq: 0,
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

  setBattlePace(pace: BattlePace): void {
    this.battlePace = PACE_PRESETS[pace] ? pace : 'cinema';
  }

  getLastEncounterMeta(): {
    rivalId: string | null;
    rivalName: string | null;
    wasRivalRematch: boolean;
    shrineId: string | null;
    shrineTrialNumber: number;
    wasShrineClearedBefore: boolean;
    phase: BattleSceneState['phase'];
  } {
    return {
      rivalId: this.state.rivalId,
      rivalName: this.state.rivalName,
      wasRivalRematch: this.wasRivalRematchAtStart,
      shrineId: this.state.shrineId,
      shrineTrialNumber: this.state.shrineTrialNumber,
      wasShrineClearedBefore: this.wasShrineClearedAtStart,
      phase: this.state.phase,
    };
  }

  drainStepOutcome(): BattleActionOutcome | null {
    if (!hasOutcomePayload(this.pendingOutcome)) return null;
    const out = this.pendingOutcome;
    this.pendingOutcome = createEmptyOutcome();
    return out;
  }

  private getTimings(): PaceTimings {
    const base = PACE_PRESETS[this.battlePace] ?? PACE_PRESETS.cinema;
    if (!this.state.reducedMotion) return base;
    const s = 0.58;
    return {
      introHold: Math.max(0.14, base.introHold * s),
      windup: Math.max(0.12, base.windup * s),
      impactHold: Math.max(0.18, base.impactHold * s),
      abilityHold: Math.max(0.16, base.abilityHold * s),
      interTurn: Math.max(0.12, base.interTurn * s),
      faintHold: Math.max(0.2, base.faintHold * s),
      sendOutHold: Math.max(0.18, base.sendOutHold * s),
      hpDrainSec: Math.max(0.16, base.hpDrainSec * s),
      ballThrow: Math.max(0.14, base.ballThrow * s),
      ballAbsorb: Math.max(0.12, base.ballAbsorb * s),
      ballWobble: Math.max(0.16, base.ballWobble * s),
      ballResolve: Math.max(0.18, base.ballResolve * s),
    };
  }

  private setPhase(phase: BattleSceneState['phase'], actionLabel: string | null = null): void {
    this.state.phase = phase;
    this.state.inputLocked =
      phase === 'shutter'
      || phase === 'intro'
      || phase === 'player-acting'
      || phase === 'enemy-acting'
      || phase === 'animating'
      || phase === 'capturing';
    this.state.activeActionLabel = actionLabel;
  }

  private triggerCameraCue(cue: BattleCameraCue): void {
    this.state.cameraCue = cue;
    this.state.cameraCueSeq += 1;
    this.state.cameraCueElapsed = 0;
  }

  private spawnFloatingText(
    side: 'player' | 'enemy',
    text: string,
    color = '#ffffff',
    size = 20,
    delay = 0,
    duration = 1.25,
    offsetY = 0,
  ): void {
    const clean = stripEmojis(text).trim();
    if (!clean) return;
    this.floatingTextSeq += 1;
    this.state.floatingTexts.push({
      id: `ft-${this.floatingTextSeq}`,
      side,
      text: clean,
      color,
      size,
      elapsed: 0,
      delay: Math.max(0, delay),
      duration: Math.max(0.35, duration),
      offsetY,
    });
    if (this.state.floatingTexts.length > 18) {
      this.state.floatingTexts.splice(0, this.state.floatingTexts.length - 18);
    }
  }

  private enqueueStep(step: Omit<BattleTimelineStep, 'elapsed' | 'started'>): void {
    this.stepQueue.push({
      ...step,
      elapsed: 0,
      started: false,
    });
  }

  private clearTimeline(): void {
    this.stepQueue.length = 0;
  }

  private getCurrentEnemy(): Pokemon {
    return this.enemyParty[this.enemyIndex] ?? this.enemyParty[0];
  }

  private pushLog(line: string): void {
    const clean = stripEmojis(line);
    this.state.statusMessage = clean;
    this.state.battleLog = [...this.state.battleLog.slice(-14), clean];
  }

  private buildEnemyPartyPips(): BattleEnemyPartyPip[] {
    return this.enemyParty.map((m, idx) => ({
      speciesId: m.speciesId,
      name: stripEmojis(m.displayName || m.name),
      level: m.level,
      fainted: Boolean(m.isFainted),
      active: idx === this.enemyIndex && !m.isFainted,
    }));
  }

  private syncCombatantSprites(snapDisplayedHp = false): void {
    const pMon = this.playerMon;
    const eMon = this.getCurrentEnemy();
    const offline = this.state.forceOfflineRig || this.sprites.isForceOffline();

    this.state.player.mon = toCombatantSnapshot(pMon);
    this.state.enemy.mon = toCombatantSnapshot(eMon);
    this.state.player.useOfflineRig = offline;
    this.state.enemy.useOfflineRig = offline;
    this.state.enemyPartyPips = this.buildEnemyPartyPips();

    if (snapDisplayedHp) {
      this.state.player.displayedHp = pMon.hp;
      this.state.enemy.displayedHp = eMon.hp;
      this.state.player.displayedXpRatio = Math.max(0, Math.min(1, pMon.xp / Math.max(1, pMon.xpToNext)));
    }

    const cachedPlayer = this.sprites.getCached(pMon.speciesId, { back: true, shiny: pMon.isShiny, offlineOnly: offline });
    const cachedEnemy = this.sprites.getCached(eMon.speciesId, { back: false, shiny: eMon.isShiny, offlineOnly: offline });
    if (cachedPlayer) this.state.player.frames = cachedPlayer;
    if (cachedEnemy) this.state.enemy.frames = cachedEnemy;

    void this.sprites.loadSpeciesSprite(pMon.speciesId, { back: true, shiny: pMon.isShiny, offlineOnly: offline }).then((f) => {
      const curOffline = this.state.forceOfflineRig || this.sprites.isForceOffline();
      if (isSameMon(this.playerMon, pMon) && this.playerMon.speciesId === pMon.speciesId && curOffline === offline) {
        this.state.player.frames = f;
        this.state.player.useOfflineRig = offline || f.sourceKind === 'offline-pixel';
      }
    });
    void this.sprites.loadSpeciesSprite(eMon.speciesId, { back: false, shiny: eMon.isShiny, offlineOnly: offline }).then((f) => {
      const curOffline = this.state.forceOfflineRig || this.sprites.isForceOffline();
      const curEnemy = this.getCurrentEnemy();
      if (isSameMon(curEnemy, eMon) && curEnemy.speciesId === eMon.speciesId && curOffline === offline) {
        this.state.enemy.frames = f;
        this.state.enemy.useOfflineRig = offline || f.sourceKind === 'offline-pixel';
      }
    });
  }

  private applyEntryAbilityNow(mon: Pokemon, side: 'player' | 'enemy'): boolean {
    const res = evaluateEntryAbility(mon);
    if (!res) return false;
    mon.abilityEntryTriggered = true;
    mon.applyStageBoost(res.stat, res.stages);
    if (res.grantShield) {
      mon.shieldTurns = Math.max(mon.shieldTurns, res.shieldTurns || 1);
    }
    const vis = side === 'player' ? this.state.player : this.state.enemy;
    const abilityName = stripEmojis(res.ability.name);
    const summary = stripEmojis(res.summary);
    vis.abilityBanner = {
      name: abilityName,
      summary,
      elapsed: 0,
    };
    vis.buffFlash = 1;
    const statShort = statShortLabel(res.stat);
    this.spawnFloatingText(
      side,
      res.grantShield ? `${statShort} +${res.stages} & SHIELD!` : `${statShort} +${res.stages}!`,
      res.grantShield ? '#67e8f9' : '#fde047',
      17,
      0,
      1.3,
      -12,
    );
    this.pendingOutcome.sfx.push(res.grantShield ? 'shield' : 'buff');
    if (!this.pendingOutcome.abilitySfx) this.pendingOutcome.abilitySfx = [];
    this.pendingOutcome.abilitySfx.push({
      abilityId: res.abilityId,
      type: (res.ability.type || mon.type || 'normal') as ElementalType,
    });
    this.pushLog(`${stripEmojis(mon.displayName)}'s ${abilityName} activated (${summary})!`);
    this.syncCombatantSprites();
    return true;
  }

  private setIdleCommandPrompt(): void {
    const pName = stripEmojis(this.playerMon.displayName || this.playerMon.name);
    const hasPp = this.playerMon.hasAnyMovePp();
    const prefix = `Turn ${this.state.turnNumber}: `;
    this.state.statusMessage = hasPp
      ? `${prefix}What will ${pName} do?`
      : `${prefix}${pName} is out of PP! Choose any move to Struggle!`;
  }

  private returnToCommand(clearCooldown = true): void {
    if (!this.state.active) return;
    if (this.playerMon.isFainted || this.getCurrentEnemy().isFainted) return;
    this.state.player.faintDrop = 0;
    this.state.enemy.faintDrop = 0;
    this.state.player.sendOutProgress = 1;
    this.state.enemy.sendOutProgress = 1;
    this.setPhase('command', null);
    if (clearCooldown) {
      this.actionCooldownRemaining = 0;
    }
    this.setIdleCommandPrompt();
    this.syncCombatantSprites(true);
  }

  private scheduleIntroSequence(): void {
    if (this.introScheduled) return;
    this.introScheduled = true;
    const t = this.getTimings();
    const foe = this.getCurrentEnemy();

    this.enqueueStep({
      duration: t.introHold,
      onStart: () => {
        this.setPhase('intro', 'Battle Start');
        this.state.player.sendOutProgress = 0;
        this.state.enemy.sendOutProgress = 0;
        if (!this.pendingOutcome.crySpeciesIds) this.pendingOutcome.crySpeciesIds = [];
        this.pendingOutcome.crySpeciesIds.push(foe.speciesId);
        if (foe.isShiny || foe.isElite) {
          this.pendingOutcome.sfx.push('shiny');
        }
        if (!this.state.shrineId && !this.state.isTrainerBattle && foe.encounterTrait && ENCOUNTER_TRAITS[foe.encounterTrait]) {
          const traitMeta = ENCOUNTER_TRAITS[foe.encounterTrait];
          const traitColor =
            foe.encounterTrait === 'curious'
              ? '#67e8f9'
              : foe.encounterTrait === 'treasure'
                ? '#fde047'
                : foe.encounterTrait === 'spirited'
                  ? '#38bdf8'
                  : '#fb7185';
          this.spawnFloatingText(
            'enemy',
            stripEmojis(traitMeta.label).toUpperCase(),
            traitColor,
            16,
            0.05,
            1.35,
            -26,
          );
        }
      },
      onProgress: (p) => {
        this.state.player.sendOutProgress = p;
        this.state.enemy.sendOutProgress = p;
      },
      onComplete: () => {
        this.state.player.sendOutProgress = 1;
        this.state.enemy.sendOutProgress = 1;
      },
    });

    // Check player entry ability
    if (evaluateEntryAbility(this.playerMon)) {
      this.enqueueStep({
        duration: t.abilityHold,
        onStart: () => {
          this.applyEntryAbilityNow(this.playerMon, 'player');
        },
      });
    }

    // Check enemy entry ability
    if (evaluateEntryAbility(foe)) {
      this.enqueueStep({
        duration: t.abilityHold,
        onStart: () => {
          this.applyEntryAbilityNow(foe, 'enemy');
        },
      });
    }

    this.enqueueStep({
      duration: 0,
      onStart: () => {
        this.returnToCommand(true);
      },
    });
  }

  startEncounter(opts: BattleStartOptions): BattleSceneState {
    if (this.defeatRecoveryPending) {
      this.completeDefeatRecovery();
    }
    this.clearTimeline();
    this.pendingOutcome = createEmptyOutcome();
    this.introScheduled = false;
    this.defeatRecoveryPending = false;
    this.actionCooldownRemaining = 0;
    this.cumulativeXpGained = 0;
    this.leveledUpInBattle = false;

    const settings = this.storage.getSettings();
    this.battlePace = opts.battlePace ?? settings.battlePace ?? 'cinema';

    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const healthy = team.find((m) => m && !m.isFainted) ?? team[0] ?? createPokemon(25, 5, 'starter');
    // GAMEPLAY-02 parity: never enter combat with a 0-HP fainted lead (v1 battle.js:1106-1108)
    if (healthy.isFainted || healthy.hp <= 0) {
      healthy.healFull();
    }
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

    this.wasRivalRematchAtStart = false;
    this.wasShrineClearedAtStart = false;

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
      this.wasRivalRematchAtStart = Boolean(profile?.rivalsDefeated?.includes(rival.id));
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
      this.wasShrineClearedAtStart = Boolean(profile?.shrinesCleared?.includes(shrine.id));
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
        // COMBAT-04 parity: first-clear Shrine Guardians are NOT marked isElite (v1 main.js:2988)
        const guard = getScaledShrineGuard(shrine, profile);
        this.enemyParty = [
          createPokemon(guard.guardianId, guard.level, biomeId, {
            upgradeTier: guard.upgradeTier,
            isElite: false,
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

    for (const enemyMon of this.enemyParty) {
      enemyMon.resetBattleState();
    }
    this.enemyIndex = 0;
    const foe = this.getCurrentEnemy();

    this.storage.manager.recordSeen(foe.speciesId, true);
    if (foe.isShiny) {
      this.storage.manager.recordShinyEncounter(true);
    }

    const offline = Boolean(opts.forceOfflineRig || this.sprites.isForceOffline());
    const reduced = Boolean(opts.reducedMotion);
    const shutterDuration = reduced ? 0.18 : opts.tier === 'shrine' || opts.tier === 'shrine-trial' ? 0.65 : 0.45;
    const initialCue: BattleCameraCue = isBoss ? (isTrainerBattle ? 'rivalIntro' : 'shrineGuardian') : 'idle';

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
      enemyPartyPips: this.buildEnemyPartyPips(),
      shrineId,
      shrineTrialNumber,
      turnNumber: 1,
      phase: 'shutter',
      inputLocked: true,
      activeActionLabel: 'Encounter!',
      player: createEmptyVisual('player', this.playerMon, offline),
      enemy: createEmptyVisual('enemy', foe, offline),
      shutter: { active: true, tier: opts.tier, progress: 0, duration: shutterDuration },
      activeVfx: [],
      floatingTexts: [],
      cameraCue: initialCue,
      cameraCueSeq: 1,
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
    const playerName = stripEmojis(this.playerMon.displayName);
    if (isTrainerBattle && rivalName) {
      this.pushLog(`${rivalName} challenged you and sent out Lv.${foe.level} ${foeName}! Go, ${playerName}!`);
    } else if (shrineId) {
      const label = shrineTrialNumber > 0 ? `Astral Trial #${shrineTrialNumber} Guardian` : 'Shrine Guardian';
      this.pushLog(`${label} Lv.${foe.level} ${foeName} emerged! Go, ${playerName}!`);
    } else {
      const traitPrefix = foe.encounterTrait && ENCOUNTER_TRAITS[foe.encounterTrait]
        ? `${stripEmojis(ENCOUNTER_TRAITS[foe.encounterTrait].label)} `
        : '';
      this.pushLog(`A wild ${traitPrefix}Lv.${foe.level} ${foeName} appeared! Go, ${playerName}!`);
    }

    this.syncCombatantSprites(true);
    return this.state;
  }

  toggleOfflineRig(): boolean {
    this.state.forceOfflineRig = !this.state.forceOfflineRig;
    this.syncCombatantSprites();
    return this.state.forceOfflineRig;
  }

  canAcceptPlayerCommand(): boolean {
    return (
      this.state.active
      && this.state.phase === 'command'
      && !this.state.inputLocked
      && this.stepQueue.length === 0
      && this.actionCooldownRemaining <= 0
    );
  }

  /**
   * Exact v1 Starlight Island Enemy AI (`C:\dojo\js\battle.js:8312-8403`).
   * Wild AI filters wasteful heals/re-shields/>+1 buffs then picks variety;
   * Rival & Shrine AI stabilizes at 25-55% HP and picks smart super-effective / non-resisted attacks.
   */
  private chooseEnemyMove(enemy: Pokemon): string {
    if (!enemy || enemy.isFainted || !this.playerMon || this.playerMon.isFainted) {
      return 'struggle';
    }
    const allMoves = enemy.getMoveObjects();
    if (allMoves.length === 0) return 'struggle';
    const moves = allMoves.filter((m) => enemy.getMovePp(m.id).current > 0);
    if (moves.length === 0) return 'struggle';

    const maxHp = Math.max(1, Number(enemy.maxHp) || 1);
    const hpRatio = Math.max(0, Math.min(1, (Number(enemy.hp) || 0) / maxHp));
    const isShielded = (Number(enemy.shieldTurns) || 0) > 0;
    const isBossOrRival = Boolean(this.state.isTrainerBattle || this.state.shrineId);
    const isAstralTrial = this.state.tier === 'shrine-trial';
    const buffCap = isAstralTrial ? 2 : 1;

    const attacks = moves.filter((m) => m.category === 'attack' || !m.category);
    const heals = moves.filter((m) => m.category === 'heal');
    const shields = moves.filter((m) => m.category === 'shield');
    const buffs = moves.filter((m) => m.category === 'buff');
    const pickRandom = <T>(list: T[]): T =>
      list[Math.min(list.length - 1, Math.floor(Math.random() * list.length))];

    const isBuffAllowed = (move: { buffStat?: string }) => {
      const stat = (move.buffStat || 'atk') as 'atk' | 'def' | 'spd';
      const stage = Number(enemy.battleStages?.[stat] || 0);
      return stage < buffCap && hpRatio >= 0.35;
    };

    // Wild AI: natural variety without wasteful heals (>60% HP), endless shield/DEF stalling, or >+1 buff stacking
    if (!isBossOrRival) {
      const defStage = Number(enemy.battleStages?.def || 0);
      const sensibleMoves = moves.filter((m) => {
        if (m.category === 'heal') return hpRatio <= 0.6;
        if (m.category === 'shield') return !isShielded && defStage < 2 && hpRatio <= 0.85;
        if (m.category === 'buff') return isBuffAllowed(m);
        return true;
      });
      const pool = sensibleMoves.length > 0 ? sensibleMoves : (attacks.length > 0 ? attacks : moves);
      return pickRandom(pool).id;
    }

    // Rival & Shrine AI: fair tactical pacing without mindless buff-stacking loops
    const allowedHeals = hpRatio <= 0.6 ? heals : [];
    const allowedShields = !isShielded ? shields : [];
    const allowedBuffs = buffs.filter(isBuffAllowed);

    // Prefer tactical heal or shield in the 25%-55% stabilization window
    if (hpRatio >= 0.25 && hpRatio <= 0.55) {
      const tacticalDefense = [...heals, ...allowedShields];
      if (tacticalDefense.length > 0 && Math.random() < 0.65) {
        if (heals.length > 0 && hpRatio <= 0.4) {
          return pickRandom(heals).id;
        }
        return pickRandom(tacticalDefense).id;
      }
    }

    const pickSmartAttack = () => {
      if (attacks.length === 0) return null;
      const scored = attacks.map((m) => ({
        move: m,
        eff: getTypeEffectiveness(m.type, this.playerMon.type || 'normal'),
      }));
      const superEffective = scored.filter((entry) => entry.eff > 1).map((entry) => entry.move);
      const nonResisted = scored.filter((entry) => entry.eff >= 1).map((entry) => entry.move);
      const nonImmune = scored.filter((entry) => entry.eff > 0).map((entry) => entry.move);

      if (Math.random() < 0.65) {
        if (superEffective.length > 0) return pickRandom(superEffective);
        if (nonResisted.length > 0) return pickRandom(nonResisted);
        if (nonImmune.length > 0) return pickRandom(nonImmune);
        return pickRandom(attacks);
      }
      return pickRandom(nonImmune.length > 0 ? nonImmune : attacks);
    };

    const allowedUtility = [...allowedBuffs, ...allowedShields, ...allowedHeals];
    if (attacks.length > 0) {
      if (allowedUtility.length > 0 && Math.random() < 0.25) {
        return pickRandom(allowedUtility).id;
      }
      const picked = pickSmartAttack();
      if (picked) return picked.id;
    }

    return pickRandom(allowedUtility.length > 0 ? allowedUtility : moves).id;
  }

  private enqueueTurnEndAbility(side: 'player' | 'enemy', mon: Pokemon): void {
    const t = this.getTimings();
    this.enqueueStep({
      duration: 0,
      onStart: () => {
        if (!mon || mon.isFainted || mon.hp <= 0) return;
        const res = evaluateTurnEndAbility(mon);
        if (!res) return;

        const vis = side === 'player' ? this.state.player : this.state.enemy;
        const monName = stripEmojis(mon.displayName);
        const abName = stripEmojis(res.ability.name);

        let gained = 0;
        if (res.heal > 0 && mon.hp < mon.maxHp) {
          gained = mon.healAmount(res.heal);
        }
        let boosted = false;
        if (res.boostStat) {
          const boostRes = mon.applyStageBoost(res.boostStat, res.boostStages || 1);
          boosted = boostRes ? boostRes.changed !== false : true;
        }
        if (gained <= 0 && !boosted) return;

        vis.abilityBanner = {
          name: abName,
          summary: stripEmojis(res.summary),
          elapsed: 0,
        };
        if (gained > 0) {
          vis.healFlash = 0.9;
          this.pendingOutcome.sfx.push('heal');
          this.spawnFloatingText(side, `+${gained} HP`, '#86efac', 19, 0, 1.3, -12);
        }
        if (boosted && res.boostStat) {
          vis.buffFlash = 0.9;
          this.pendingOutcome.sfx.push('buff');
          this.spawnFloatingText(
            side,
            `${statShortLabel(res.boostStat)} +${res.boostStages || 1}!`,
            '#fde047',
            18,
            0,
            1.3,
            gained > 0 ? -34 : -12,
          );
        }
        if (!this.pendingOutcome.abilitySfx) this.pendingOutcome.abilitySfx = [];
        this.pendingOutcome.abilitySfx.push({
          abilityId: res.abilityId,
          type: (res.ability.type || mon.type || 'normal') as ElementalType,
        });
        const detail = gained > 0
          ? `restored ${gained} HP`
          : `boosted ${statFullLabel(res.boostStat || 'spd')}`;
        this.pushLog(`${monName}'s ${abName} ${detail}!`);
        this.syncCombatantSprites();
        this.storage.saveSync();

        // Insert brief visual beat right after this step so player sees the heal/boost
        this.stepQueue.splice(1, 0, {
          duration: t.abilityHold,
          elapsed: 0,
          started: false,
        });
      },
    });
  }

  private awardPartialFaintXp(defeatedEnemy: Pokemon): void {
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [this.playerMon];
    const bondTier = getBondTier(this.playerMon.bond);
    const xpRes = computeBattleXpReward(this.playerMon, defeatedEnemy, {
      scale: 1.0,
      bondMult: bondTier.xpMult,
      traitMult: 1,
    });
    const lvRes = this.playerMon.gainXp(xpRes.xp);
    this.cumulativeXpGained += xpRes.xp;
    if (lvRes.leveledUp) {
      this.leveledUpInBattle = true;
      this.pendingOutcome.sfx.push('level-up');
      this.spawnFloatingText('player', `LEVEL UP! Lv.${this.playerMon.level}`, '#fde047', 21, 0, 1.5, -24);
    }
    for (const bench of team) {
      if (!bench || isSameMon(bench, this.playerMon) || bench.isFainted) continue;
      const share = computeBenchXpShare(bench, this.playerMon, defeatedEnemy, xpRes.baseXp);
      bench.gainXp(share.xp);
    }
    const badges = this.storage.manager.evaluateBadges(false) || [];
    if (badges.length > 0) {
      const ids = badges.map((b: { id: string }) => b.id);
      this.pendingOutcome.newBadgeIds = [...new Set([...(this.pendingOutcome.newBadgeIds ?? []), ...ids])];
      this.pendingOutcome.sfx.push('badge');
    }
    const lvMsg = lvRes.leveledUp ? ` ${stripEmojis(this.playerMon.displayName)} grew to Lv.${this.playerMon.level}!` : '';
    this.pushLog(`Earned +${xpRes.xp} XP!${lvMsg}`);
    this.syncCombatantSprites();
    this.storage.saveSync();
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
      return gemName;
    }
    if (roll < 0.58) {
      this.storage.manager.addRewards({ starBalls: 1 }, false);
      return 'Star Ball';
    }
    if (roll < 0.8) {
      this.storage.manager.addRewards({ greatBalls: 1 }, false);
      return 'Great Ball';
    }
    this.storage.manager.addRewards({ potions: 1 }, false);
    return 'Berry Potion';
  }

  private awardVictoryRewards(
    caught: boolean,
    excludeBenchUid?: string,
    catchDestination?: 'team' | 'box',
  ): void {
    const enemy = this.getCurrentEnemy();
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [this.playerMon];

    const bondTier = getBondTier(this.playerMon.bond);
    const isWildOnly = !this.state.shrineId && !this.state.isTrainerBattle;
    const isSpiritedWild = isWildOnly && enemy.encounterTrait === 'spirited';
    const traitMult = isSpiritedWild ? (ENCOUNTER_TRAITS.spirited?.xpMult ?? 1.15) : 1.0;
    // COMBAT-11 parity: v1 uses 0.6 for catch and 1.0 for ALL KOs (wild, rival, shrine)
    const scale = caught ? 0.6 : 1.0;

    const xpRes = computeBattleXpReward(this.playerMon, enemy, {
      scale,
      bondMult: bondTier.xpMult,
      traitMult,
    });
    const lvRes = this.playerMon.gainXp(xpRes.xp);
    const totalXp = this.cumulativeXpGained + xpRes.xp;
    const anyLeveledUp = this.leveledUpInBattle || lvRes.leveledUp;

    // COMBAT-11 parity: v1 grants +4 bond on both KO & catch (+4 extra for Curious wild)
    this.playerMon.gainBond(4);
    if (caught && isWildOnly && enemy.encounterTrait === 'curious') {
      this.playerMon.gainBond(4);
      enemy.gainBond(4);
    }
    if (caught) {
      this.storage.manager.addCheerCharges(1, false);
    }

    // Smart bench XP share (never awards catch XP to the newly caught Pokémon itself!)
    for (const bench of team) {
      if (!bench || isSameMon(bench, this.playerMon) || bench.isFainted) continue;
      if (excludeBenchUid && bench.uid === excludeBenchUid) continue;
      const share = computeBenchXpShare(bench, this.playerMon, enemy, xpRes.baseXp);
      bench.gainXp(share.xp);
      bench.gainBond(2);
    }

    const shards = getBattleShardReward(enemy, {
      isShrine: Boolean(this.state.shrineId),
      isTrainer: this.state.isTrainerBattle,
      caught,
      includeTraitBonus: isWildOnly,
    });
    this.storage.manager.addStarShards(shards, false);

    const newBadgeIds: string[] = [...(this.pendingOutcome.newBadgeIds ?? [])];
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
      xpGained: totalXp,
      shardsGained: shards,
      newBadges: uniqueBadges,
      caught,
      leveledUp: anyLeveledUp,
      trailDrop: trailDropLabel,
    };

    // Clear stale damage floating texts & ability ribbons before victory/evolution banner
    this.state.player.abilityBanner = null;
    this.state.enemy.abilityBanner = null;
    this.state.floatingTexts = caught
      ? this.state.floatingTexts.filter((ft) => ft.text === 'GOTCHA!' || ft.text.startsWith('Curious'))
      : [];

    if (lvRes.leveledUp && !pendingEvo) {
      this.spawnFloatingText('player', `LEVEL UP! Lv.${this.playerMon.level}`, '#fde047', 22, 0, 1.55, -24);
    }
    this.pendingOutcome.sfx.push(caught ? 'catch-success' : 'victory');
    if (lvRes.leveledUp && !caught) {
      this.pendingOutcome.sfx.push('level-up');
    }
    if (uniqueBadges.length > 0) this.pendingOutcome.sfx.push('badge');
    this.pendingOutcome.newBadgeIds = uniqueBadges;
    this.pendingOutcome.battleEnded = caught ? 'caught' : 'victory';

    const shardLabel = shards === 1 ? '1 Star Shard' : `${shards} Star Shards`;
    if (pendingEvo) {
      this.setPhase('evolving', 'Evolution!');
      this.triggerCameraCue('evolution');
      this.pendingOutcome.sfx.push('evo-start');
      this.pushLog(`What?! ${stripEmojis(this.playerMon.displayName)} is glowing with Starlight energy!`);
    } else {
      this.setPhase('victory', caught ? 'Caught!' : 'Victory!');
      const lvMsg = anyLeveledUp ? ` ${stripEmojis(this.playerMon.displayName)} grew to Lv.${this.playerMon.level}!` : '';
      const dropMsg = trailDropLabel ? ` Found a ${trailDropLabel} on the victory trail!` : '';
      if (caught) {
        const destLabel = catchDestination === 'box' ? 'Storage Box' : 'team';
        this.pushLog(`Gotcha! ${stripEmojis(enemy.displayName)} joined your ${destLabel}! (+${totalXp} XP & +${shardLabel}!)${lvMsg}`);
      } else {
        this.pushLog(`Victory! +${totalXp} XP & +${shardLabel}!${lvMsg}${dropMsg}`);
      }
    }
    this.syncCombatantSprites(true);
  }

  private scheduleEnemyFaintSequence(): void {
    const t = this.getTimings();
    const defeatedEnemy = this.getCurrentEnemy();
    const hasNextEnemy = this.enemyIndex + 1 < this.enemyParty.length;

    // Clear any remaining queued second-attacker steps on faint!
    this.clearTimeline();

    // Step A: Enemy faint drop & faint SFX
    this.enqueueStep({
      duration: t.faintHold,
      onStart: () => {
        this.setPhase('animating', 'Fainted');
        this.pendingOutcome.sfx.push('faint');
        this.pushLog(`${stripEmojis(defeatedEnemy.displayName)} fainted!`);
        this.syncCombatantSprites();
      },
      onProgress: (p) => {
        this.state.enemy.faintDrop = p;
      },
      onComplete: () => {
        this.state.enemy.faintDrop = 1;
      },
    });

    if (hasNextEnemy) {
      // Step B: Partial faint XP beat
      this.enqueueStep({
        duration: t.interTurn,
        onStart: () => {
          this.awardPartialFaintXp(defeatedEnemy);
        },
      });

      // Step C: Rival sends out next Pokémon + cry + sendout animation
      this.enqueueStep({
        duration: t.sendOutHold,
        onStart: () => {
          this.enemyIndex += 1;
          const nextFoe = this.getCurrentEnemy();
          nextFoe.resetBattleState();
          this.state.rivalRemainingMons = this.enemyParty.length - this.enemyIndex;
          this.state.enemy.faintDrop = 0;
          this.state.enemy.sendOutProgress = 0;
          this.state.enemy.displayedHp = nextFoe.hp;
          this.state.enemy.hitFlash = 0;
          this.state.enemy.lungeOffset = 0;
          this.state.enemy.recoilOffset = 0;
          this.state.enemy.bracedFlash = 0;
          this.state.enemy.buffFlash = 0;
          this.state.enemy.healFlash = 0;
          this.state.enemy.abilityBanner = null;
          this.state.enemy.captureProgress = 0;
          this.storage.manager.recordSeen(nextFoe.speciesId, true);
          this.pendingOutcome.sfx.push('catch-throw');
          if (!this.pendingOutcome.crySpeciesIds) this.pendingOutcome.crySpeciesIds = [];
          this.pendingOutcome.crySpeciesIds.push(nextFoe.speciesId);
          if (nextFoe.isShiny || nextFoe.isElite) {
            this.pendingOutcome.sfx.push('shiny');
          }
          this.pushLog(`${this.state.rivalName || 'Rival'} sent out Lv.${nextFoe.level} ${stripEmojis(nextFoe.displayName)}!`);
          this.syncCombatantSprites();
        },
        onProgress: (p) => {
          this.state.enemy.sendOutProgress = p;
        },
        onComplete: () => {
          this.state.enemy.sendOutProgress = 1;
        },
      });

      // Step D: Entry ability for newly sent rival mon (if any) + unlock command
      this.enqueueStep({
        duration: 0,
        onStart: () => {
          const nextFoe = this.getCurrentEnemy();
          if (evaluateEntryAbility(nextFoe)) {
            this.applyEntryAbilityNow(nextFoe, 'enemy');
            this.stepQueue.splice(1, 0, {
              duration: t.abilityHold,
              elapsed: 0,
              started: false,
            });
          }
        },
      });

      this.enqueueStep({
        duration: 0,
        onStart: () => {
          this.state.turnNumber += 1;
          this.storage.saveSync();
          this.returnToCommand(true);
        },
      });
      return;
    }

    // Final foe defeated -> Victory rewards
    this.enqueueStep({
      duration: 0,
      onStart: () => {
        this.state.rivalRemainingMons = 0;
        this.awardVictoryRewards(false);
      },
    });
  }

  private schedulePlayerFaintSequence(): void {
    const t = this.getTimings();
    this.clearTimeline();

    this.enqueueStep({
      duration: t.faintHold,
      onStart: () => {
        this.setPhase('animating', 'Fainted');
        this.pendingOutcome.sfx.push('faint');
        this.pushLog(`${stripEmojis(this.playerMon.displayName)} fainted!`);
        this.syncCombatantSprites();
      },
      onProgress: (p) => {
        this.state.player.faintDrop = p;
      },
      onComplete: () => {
        this.state.player.faintDrop = 1;
      },
    });

    this.enqueueStep({
      duration: 0,
      onStart: () => {
        const profile = this.storage.manager.getActiveProfile();
        const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
        const hasHealthyBench = team.some((m) => m && !m.isFainted && !isSameMon(m, this.playerMon));
        if (hasHealthyBench) {
          this.setPhase('forced-switch', 'Choose Next Partner');
          this.state.turnNumber += 1;
          this.storage.saveSync();
          this.pushLog('Choose your next Pokémon!');
          this.syncCombatantSprites();
          return;
        }

        // All fainted -> keep HP at 0 on Defeat screen (v1 battle.js:9875-9879 parity);
        // healTeam(true) + warpToSafeZone() execute cleanly on closeBattle()!
        this.defeatRecoveryPending = true;
        this.state.floatingTexts = [];
        this.state.player.abilityBanner = null;
        this.state.enemy.abilityBanner = null;
        this.state.player.displayedHp = 0;
        this.state.player.faintDrop = 1;
        this.setPhase('defeat', 'Retreating...');
        this.pendingOutcome.battleEnded = 'defeat';
        this.pushLog('Your team needs a quick rest! Returning to Starlight Village Healing Fountain...');
        this.syncCombatantSprites(true);
      },
    });
  }

  /**
   * Queues one complete move action (Announce/Windup -> Impact/Damage/Floating Text -> Faint Check -> Turn-End Ability).
   */
  private enqueueMoveSequence(
    attackerSide: 'player' | 'enemy',
    moveIdOrProvider: string | (() => string),
  ): void {
    const t = this.getTimings();
    let resolvedMoveId = typeof moveIdOrProvider === 'string' ? moveIdOrProvider : '';
    let resolvedIsStruggle = false;

    // Beat 1: Announce move + windup/lunge + attack VFX & move SFX
    this.enqueueStep({
      duration: t.windup,
      onStart: () => {
        const attacker = attackerSide === 'player' ? this.playerMon : this.getCurrentEnemy();
        const defender = attackerSide === 'player' ? this.getCurrentEnemy() : this.playerMon;
        if (!attacker || !defender || attacker.isFainted || defender.isFainted) {
          return;
        }

        if (typeof moveIdOrProvider === 'function') {
          resolvedMoveId = moveIdOrProvider();
        }
        resolvedIsStruggle = resolvedMoveId === 'struggle' || !attacker.hasAnyMovePp();
        const move = resolvedIsStruggle ? STRUGGLE_MOVE : getMoveEntry(resolvedMoveId);

        if (!resolvedIsStruggle) {
          attacker.consumeMovePp(move.id);
        } else {
          this.spawnFloatingText(attackerSide, '0 PP -> STRUGGLE!', '#fde047', 16, 0, 1.25, -24);
        }

        this.setPhase(
          attackerSide === 'player' ? 'player-acting' : 'enemy-acting',
          attackerSide === 'player' ? 'Your Turn' : 'Foe Acting',
        );

        const atkVis = attackerSide === 'player' ? this.state.player : this.state.enemy;
        atkVis.lungeOffset = attackerSide === 'player' ? 0.65 : -0.65;

        if (!this.pendingOutcome.moveSfxId) {
          this.pendingOutcome.moveSfxId = move.id;
          this.pendingOutcome.moveSfxFx = move.type;
        }
        if (!this.pendingOutcome.moveSfxEvents) this.pendingOutcome.moveSfxEvents = [];
        this.pendingOutcome.moveSfxEvents.push({ moveId: move.id, type: move.type, side: attackerSide });
        this.pendingOutcome.sfx.push('windup');

        this.pushLog(`${stripEmojis(attacker.displayName)} used ${move.name}!`);
        this.syncCombatantSprites();
      },
    });

    // Beat 2: Resolve damage/heal/buff/shield, floating popups, hit-stop, camera shake & HP drain
    this.enqueueStep({
      duration: t.impactHold,
      onStart: () => {
        const attacker = attackerSide === 'player' ? this.playerMon : this.getCurrentEnemy();
        const defender = attackerSide === 'player' ? this.getCurrentEnemy() : this.playerMon;
        if (!attacker || !defender || attacker.isFainted || defender.isFainted) {
          return;
        }

        const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';
        const atkVis = attackerSide === 'player' ? this.state.player : this.state.enemy;
        const defVis = attackerSide === 'player' ? this.state.enemy : this.state.player;
        const move = resolvedIsStruggle ? STRUGGLE_MOVE : getMoveEntry(resolvedMoveId);
        const atkName = stripEmojis(attacker.displayName);

        // COMBAT-04 parity: apply abilities, Composure, and wild Apex encounter trait boost
        const rawResult = calculateDamage(attacker, defender, move, {
          applyAbilities: true,
          applyComposure: true,
          applyEncounterTraits: true,
          defenderSide,
          isBoss: Boolean(this.state.shrineId),
        });

        // COMBAT-07 parity: Struggle overrides 0x immunity & effectiveness to 1.0 (v1 battle.js:8516-8525)
        const result = resolvedIsStruggle
          ? {
              ...rawResult,
              effectiveness: 1,
              composureCapped: rawResult.effectiveness === 0 ? false : Boolean(rawResult.composureCapped),
              damage: rawResult.effectiveness === 0
                ? Math.max(Number(rawResult.damage) || 1, Math.max(2, Math.round(((attacker.level || 5) + 4) * 0.45)))
                : Math.max(1, Number(rawResult.damage) || 1),
            }
          : rawResult;

        if (result.category === 'heal') {
          const healed = attacker.healAmount(result.heal);
          if (healed > 0) {
            atkVis.healFlash = 1;
            this.pendingOutcome.sfx.push('heal');
            this.pendingOutcome.vfxEvents.push({
              type: move.type,
              fromSide: attackerSide,
              targetSide: attackerSide,
              power: 40,
              effectiveness: 1,
              category: 'heal',
              composureBraced: false,
              isCrit: false,
              duration: Math.max(0.32, t.impactHold + 0.16),
            });
            this.spawnFloatingText(attackerSide, `+${healed} HP`, '#86efac', 21, 0, 1.35, -10);
            this.pushLog(`${atkName} recovered ${healed} HP!`);
          } else {
            this.pushLog(`${atkName}'s HP is already full!`);
          }
          this.syncCombatantSprites();
          this.storage.saveSync();
          return;
        }

        if (result.category === 'buff' || result.category === 'shield') {
          const boost = attacker.applyStageBoost(result.buffStat || (result.category === 'shield' ? 'def' : 'atk'), result.buffStages || 1);
          let healed = 0;
          if (result.grantShield) {
            attacker.shieldTurns = Math.max(attacker.shieldTurns, 2);
            if (result.heal > 0) healed = attacker.healAmount(result.heal);
          }
          atkVis.buffFlash = 1;
          if (healed > 0) atkVis.healFlash = 0.85;
          this.pendingOutcome.sfx.push(result.grantShield ? 'shield' : 'buff');
          this.pendingOutcome.vfxEvents.push({
            type: move.type,
            fromSide: attackerSide,
            targetSide: attackerSide,
            power: 50,
            effectiveness: 1,
            category: result.category,
            composureBraced: false,
            isCrit: false,
            duration: Math.max(0.34, t.impactHold + 0.16),
          });
          const statShort = statShortLabel(boost.stat);
          this.spawnFloatingText(
            attackerSide,
            result.grantShield ? 'SHIELD UP!' : `${statShort} +${result.buffStages || 1}!`,
            result.grantShield ? '#67e8f9' : '#fde047',
            19,
            0,
            1.35,
            -12,
          );
          if (healed > 0) {
            this.spawnFloatingText(attackerSide, `+${healed} HP`, '#86efac', 17, 0.08, 1.3, -34);
          }
          if (result.grantShield) {
            this.pushLog(`${atkName} raised a Starlight Shield!${healed > 0 ? ` (+${healed} HP)` : ''}`);
          } else if (!boost.changed) {
            this.pushLog(`${atkName}'s ${statFullLabel(boost.stat)} can't go any higher!`);
          } else {
            this.pushLog(`${atkName}'s ${statFullLabel(boost.stat)} rose!`);
          }
          this.syncCombatantSprites();
          this.storage.saveSync();
          return;
        }

        if (result.missed) {
          this.pendingOutcome.sfx.push('miss');
          this.spawnFloatingText(defenderSide, 'MISSED!', '#cbd5e1', 20, 0, 1.3, -10);
          this.pushLog(`${atkName}'s ${move.name} missed!`);
          this.syncCombatantSprites();
          return;
        }

        // Apply attack damage
        const prevHp = defender.hp;
        const dealt = defender.takeDamage(result.damage);
        atkVis.lungeOffset = attackerSide === 'player' ? 1 : -1;
        defVis.hitFlash = 1;
        defVis.recoilOffset = 1;

        if (result.composureCapped) {
          defVis.bracedFlash = 1;
          this.pendingOutcome.sfx.push('brace');
        }

        // Offensive ability trigger (+ siphon drain with visual/audio/log)
        if (result.attackerAbilityTrigger) {
          const atkTrig = result.attackerAbilityTrigger;
          atkVis.abilityBanner = {
            name: stripEmojis(atkTrig.ability.name),
            summary: stripEmojis(atkTrig.summary),
            elapsed: 0,
          };
          if (!this.pendingOutcome.abilitySfx) this.pendingOutcome.abilitySfx = [];
          this.pendingOutcome.abilitySfx.push({
            abilityId: atkTrig.abilityId,
            type: (atkTrig.ability.type || attacker.type || 'normal') as ElementalType,
          });
          if (atkTrig.drainHeal && attacker.hp > 0 && attacker.hp < attacker.maxHp) {
            const drained = attacker.healAmount(atkTrig.drainHeal);
            if (drained > 0) {
              atkVis.healFlash = 0.85;
              this.pendingOutcome.sfx.push('heal');
              this.spawnFloatingText(attackerSide, `+${drained} HP`, '#86efac', 18, 0.08, 1.3, -16);
            }
          }
        }

        // Defensive ability trigger (+ counter stat boost ONLY if defender survived!)
        if (result.defenderAbilityTrigger) {
          const defTrig = result.defenderAbilityTrigger;
          defVis.abilityBanner = {
            name: stripEmojis(defTrig.ability.name),
            summary: stripEmojis(defTrig.summary),
            elapsed: 0,
          };
          if (!this.pendingOutcome.abilitySfx) this.pendingOutcome.abilitySfx = [];
          this.pendingOutcome.abilitySfx.push({
            abilityId: defTrig.abilityId,
            type: (defTrig.ability.type || defender.type || 'normal') as ElementalType,
          });
          if (defTrig.counterBoostStat && !defender.isFainted && defender.hp > 0) {
            const cStages = Number.isFinite(Number(defTrig.counterBoostStages))
              ? Number(defTrig.counterBoostStages)
              : 1;
            defender.applyStageBoost(defTrig.counterBoostStat, cStages);
            defVis.buffFlash = 0.9;
            this.pendingOutcome.sfx.push('buff');
            this.spawnFloatingText(
              defenderSide,
              `${statShortLabel(defTrig.counterBoostStat)} +${cStages}!`,
              '#c084fc',
              17,
              0.12,
              1.3,
              -42,
            );
          }
        }

        // Bond endure check for player Pokémon (once per active mon, bond >= 60 & prevHp > 1)
        let buddyEndured = false;
        if (defenderSide === 'player' && defender.isFainted && prevHp > 1 && !this.playerBuddyEndured) {
          const bondTier = getBondTier(defender.bond);
          if (defender.bond >= 60 && bondTier.endureChance > 0 && Math.random() < bondTier.endureChance) {
            defender.hp = 1;
            this.playerBuddyEndured = true;
            buddyEndured = true;
            defVis.bracedFlash = 1;
            this.pendingOutcome.sfx.push('endure');
            this.spawnFloatingText('player', 'ENDURED! 1 HP', '#f472b6', 18, 0.08, 1.45, -36);
          }
        }

        // Decrement defender shield turns after taking a hit
        if (defender.shieldTurns > 0) {
          defender.shieldTurns = Math.max(0, defender.shieldTurns - 1);
        }

        const superEff = result.effectiveness > 1;
        const resisted = result.effectiveness < 1;
        this.pendingOutcome.sfx.push(superEff || result.isCrit ? 'super-hit' : 'hit');
        this.pendingOutcome.vfxEvents.push({
          type: move.type,
          fromSide: attackerSide,
          targetSide: defenderSide,
          power: move.power,
          effectiveness: result.effectiveness,
          category: 'attack',
          composureBraced: result.composureCapped,
          isCrit: result.isCrit,
          duration: Math.max(0.34, t.impactHold + (superEff || result.isCrit ? 0.24 : 0.12)),
        });

        this.state.arenaLightingType = move.type;
        this.state.arenaLightingPulse = 1;
        this.state.hitStopRemaining = this.state.reducedMotion ? 0 : superEff || result.isCrit ? 0.08 : 0.045;
        this.triggerCameraCue(superEff || result.isCrit ? 'heavyHit' : 'hit');

        // Floating damage number + callout stack (COMBAT-05)
        const dmgColor = result.isCrit ? '#fde047' : superEff ? '#fb923c' : '#ffffff';
        this.spawnFloatingText(defenderSide, `-${dealt}`, dmgColor, result.isCrit ? 26 : 22, 0, 1.35, -8);
        let tagY = -34;
        if (superEff) {
          this.spawnFloatingText(defenderSide, 'SUPER EFFECTIVE!', '#fde047', 15, 0.05, 1.4, tagY);
          tagY -= 20;
        } else if (resisted) {
          this.spawnFloatingText(defenderSide, 'NOT VERY EFFECTIVE', '#cbd5e1', 13, 0.05, 1.35, tagY);
          tagY -= 18;
        }
        if (result.isCrit) {
          this.spawnFloatingText(defenderSide, 'CRITICAL HIT!', '#fb923c', 16, 0.09, 1.4, tagY);
        }

        // Crisp single-beat narration (COMBAT-12)
        if (buddyEndured) {
          this.pushLog(`${stripEmojis(defender.displayName)} toughed it out at 1 HP for you!`);
        } else if (result.composureCapped && !defender.isFainted) {
          const defName = stripEmojis(defender.displayName);
          this.pushLog(
            defenderSide === 'player'
              ? `${defName} braced the heavy opening hit! (-${dealt} HP)`
              : !this.state.shrineId && !this.state.isTrainerBattle
                ? `${defName} hung on (-${dealt} HP) — ready to catch!`
                : `${atkName} dealt ${dealt} dmg! BRACED!`,
          );
        } else {
          const tags: string[] = [];
          if (superEff) tags.push("It's super effective!");
          else if (resisted) tags.push("It's not very effective...");
          if (result.isCrit) tags.push('Critical hit!');
          const suffix = tags.length > 0 ? ` ${tags.join(' ')}` : '';
          this.pushLog(`${atkName}'s ${move.name} dealt ${dealt} dmg!${suffix}`);
        }

        this.syncCombatantSprites();
        this.storage.saveSync();
      },
    });

    // Beat 3: Faint check -> if defender fainted, cut off remaining turn steps cleanly
    this.enqueueStep({
      duration: 0,
      onStart: () => {
        const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';
        const defender = defenderSide === 'enemy' ? this.getCurrentEnemy() : this.playerMon;
        if (defender.isFainted) {
          if (defenderSide === 'enemy') {
            this.scheduleEnemyFaintSequence();
          } else {
            this.schedulePlayerFaintSequence();
          }
        }
      },
    });

    // Beat 4: Attacker's own turn-end ability (COMBAT-08 parity: per-attacker, only when alive)
    const attackerRef = attackerSide === 'player' ? this.playerMon : this.getCurrentEnemy();
    this.enqueueTurnEndAbility(attackerSide, attackerRef);
  }

  private kickoffImmediateStep(): BattleActionOutcome {
    // Advance by 0s so Step 0's `onStart` runs synchronously right on click, locking phase & emitting initial audio/VFX!
    if (this.stepQueue.length > 0 && !this.stepQueue[0].started) {
      const head = this.stepQueue[0];
      head.started = true;
      head.onStart?.();
      if (this.stepQueue[0] === head && head.duration <= 0) {
        head.onProgress?.(1);
        this.stepQueue.shift();
        head.onComplete?.();
      }
    }
    const out = this.drainStepOutcome();
    return out ?? createEmptyOutcome();
  }

  performMove(moveId: string): BattleActionOutcome {
    if (!this.canAcceptPlayerCommand()) {
      return createEmptyOutcome();
    }

    const effectiveMoveId =
      moveId === 'struggle' || !this.playerMon.hasAnyMovePp() ? 'struggle' : moveId;
    if (effectiveMoveId !== 'struggle' && this.playerMon.getMovePp(effectiveMoveId).current <= 0) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog('No PP left for that move! Choose another move.');
      return createEmptyOutcome();
    }

    this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
    this.pendingOutcome.sfx.push('move-select');

    const t = this.getTimings();
    const enemy = this.getCurrentEnemy();
    const playerFirst = this.playerMon.getEffectiveSpd() >= enemy.getEffectiveSpd();

    if (playerFirst) {
      this.setPhase('player-acting', 'Your Turn');
      this.enqueueMoveSequence('player', effectiveMoveId);
      this.enqueueStep({ duration: t.interTurn });
      this.enqueueMoveSequence('enemy', () => this.chooseEnemyMove(this.getCurrentEnemy()));
      this.enqueueStep({ duration: t.interTurn });
    } else {
      this.setPhase('enemy-acting', 'Foe Acting');
      this.enqueueMoveSequence('enemy', () => this.chooseEnemyMove(this.getCurrentEnemy()));
      this.enqueueStep({ duration: t.interTurn });
      this.enqueueMoveSequence('player', effectiveMoveId);
      this.enqueueStep({ duration: t.interTurn });
    }

    this.enqueueStep({
      duration: 0,
      onStart: () => {
        if (!this.playerMon.isFainted && !this.getCurrentEnemy().isFainted) {
          this.state.turnNumber += 1;
          this.storage.saveSync();
          this.returnToCommand(true);
        }
      },
    });

    return this.kickoffImmediateStep();
  }

  throwBall(kind: BallKind): BattleActionOutcome {
    if (!this.canAcceptPlayerCommand()) {
      return createEmptyOutcome();
    }
    if (!this.state.canCapture) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog(
        this.state.shrineId
          ? 'Shrine Guardians cannot be caught! Defeat them to earn their Shrine blessing!'
          : 'You cannot catch another Trainer\'s Pokémon!',
      );
      return createEmptyOutcome();
    }

    const ballKey = kind === 'star' ? 'starBalls' : kind === 'great' ? 'greatBalls' : null;
    if (ballKey && !this.storage.manager.useItem(ballKey)) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog(`No ${kind === 'star' ? 'Star Balls' : 'Great Balls'} left!`);
      return createEmptyOutcome();
    }

    this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
    const t = this.getTimings();
    const ballName = kind === 'star' ? 'Star Ball' : kind === 'great' ? 'Great Ball' : 'Poké Ball';
    const ballBonus = kind === 'star' ? 2.0 : kind === 'great' ? 1.45 : 1.0;
    const enemy = this.getCurrentEnemy();
    const attempt = calculateCatchAttempt(enemy, ballBonus);
    const shakes = Math.max(1, Math.min(3, attempt.shakes || 1));

    this.setPhase('capturing', 'Capturing...');
    this.state.enemy.captureBallKind = kind;
    this.state.enemy.captureShakes = shakes;
    this.state.enemy.captureProgress = 0;

    // 1. Throw arc (cp: 0.00 -> 0.30)
    this.enqueueStep({
      duration: t.ballThrow,
      onStart: () => {
        this.setPhase('capturing', 'Capturing...');
        this.triggerCameraCue('starBall');
        this.pendingOutcome.sfx.push('catch-throw');
        if (kind === 'star') this.pendingOutcome.sfx.push('star-shimmer');
        this.pushLog(`Threw a ${ballName}!`);
      },
      onProgress: (p) => {
        this.state.enemy.captureProgress = p * 0.30;
      },
    });

    // 2. Absorb beam (cp: 0.30 -> 0.48)
    this.enqueueStep({
      duration: t.ballAbsorb,
      onStart: () => {
        this.pendingOutcome.sfx.push('catch-absorb');
        if (kind === 'star') this.pendingOutcome.sfx.push('star-shimmer');
      },
      onProgress: (p) => {
        this.state.enemy.captureProgress = 0.30 + p * 0.18;
      },
      onComplete: () => {
        this.pendingOutcome.sfx.push('catch-bounce');
      },
    });

    // 3. Suspenseful wobble shakes (cp: 0.48 -> 0.88)
    const shakeSpan = 0.40 / shakes;
    for (let s = 0; s < shakes; s++) {
      const startCp = 0.48 + s * shakeSpan;
      this.enqueueStep({
        duration: t.ballWobble,
        onStart: () => {
          this.pendingOutcome.sfx.push('catch-shake');
          this.pendingOutcome.shakeIndex = s + 1;
        },
        onProgress: (p) => {
          this.state.enemy.captureProgress = startCp + p * shakeSpan;
        },
      });
    }

    // 4. Resolution (Caught celebration vs Breakout + Enemy counterattack)
    if (attempt.caught) {
      let catchDestination: 'team' | 'box' = 'team';
      this.enqueueStep({
        duration: t.ballResolve,
        onStart: () => {
          this.state.enemy.captureProgress = 0.88;
          this.spawnFloatingText('enemy', 'GOTCHA!', '#fde047', 24, 0, 1.5, -24);
          if (enemy.encounterTrait === 'curious') {
            this.spawnFloatingText('enemy', 'Curious +4 Bond!', '#67e8f9', 15, 0.1, 1.4, -48);
          }
          enemy.hp = Math.max(1, enemy.hp);
          enemy.resetBattleState();
          const catchRes = this.storage.manager.recordCaught(enemy);
          catchDestination = catchRes.destination === 'box' ? 'box' : 'team';
          if (catchRes.newBadges?.length) {
            this.pendingOutcome.newBadgeIds = [
              ...(this.pendingOutcome.newBadgeIds ?? []),
              ...catchRes.newBadges.map((b: { id: string }) => b.id),
            ];
          }
          const destLabel = catchDestination === 'box' ? 'Storage Box' : 'team';
          this.pushLog(`Gotcha! ${stripEmojis(enemy.displayName)} joined your ${destLabel}!`);
        },
        onProgress: (p) => {
          this.state.enemy.captureProgress = 0.88 + p * 0.12;
        },
        onComplete: () => {
          this.state.enemy.captureProgress = 1;
          this.state.enemy.faintDrop = 1;
          this.awardVictoryRewards(true, enemy.uid, catchDestination);
        },
      });
    } else {
      this.enqueueStep({
        duration: t.ballResolve,
        onStart: () => {
          this.state.enemy.captureProgress = 0;
          this.setPhase('animating', 'Broke Free!');
          this.pendingOutcome.sfx.push('catch-breakout');
          this.spawnFloatingText('enemy', 'BROKE FREE!', '#fde047', 19, 0, 1.3, -18);
          this.pushLog(`Oh no! ${stripEmojis(enemy.displayName)} broke free after ${shakes} shake${shakes === 1 ? '' : 's'}!`);
          this.syncCombatantSprites();
        },
      });
      this.enqueueStep({ duration: t.interTurn * 0.7 });
      this.enqueueMoveSequence('enemy', () => this.chooseEnemyMove(this.getCurrentEnemy()));
      this.enqueueStep({ duration: t.interTurn });
      this.enqueueStep({
        duration: 0,
        onStart: () => {
          if (!this.playerMon.isFainted && !this.getCurrentEnemy().isFainted) {
            this.state.turnNumber += 1;
            this.storage.saveSync();
            this.returnToCommand(true);
          }
        },
      });
    }

    return this.kickoffImmediateStep();
  }

  usePotion(): BattleActionOutcome {
    if (!this.canAcceptPlayerCommand()) {
      return createEmptyOutcome();
    }
    if (this.playerMon.hp >= this.playerMon.maxHp) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog(`${stripEmojis(this.playerMon.displayName)}'s HP is already full!`);
      return createEmptyOutcome();
    }
    if (!this.storage.manager.useItem('potions')) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog('No Potions left in your bag!');
      return createEmptyOutcome();
    }

    this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
    const t = this.getTimings();
    this.setPhase('player-acting', 'Using Potion');

    this.enqueueStep({
      duration: t.impactHold,
      onStart: () => {
        const healAmt = Math.max(
          BALANCE.combat.potionMinHeal,
          Math.round(this.playerMon.maxHp * BALANCE.combat.potionHealRatio),
        );
        const healed = this.playerMon.healAmount(healAmt);
        this.state.player.healFlash = 1;
        this.pendingOutcome.sfx.push('heal');
        this.pendingOutcome.vfxEvents.push({
          type: 'grass',
          fromSide: 'player',
          targetSide: 'player',
          power: 40,
          effectiveness: 1,
          category: 'heal',
          composureBraced: false,
          isCrit: false,
          duration: Math.max(0.32, t.impactHold + 0.14),
        });
        this.spawnFloatingText('player', `+${healed} HP`, '#86efac', 21, 0, 1.35, -10);
        this.pushLog(`Used a Berry Potion! ${stripEmojis(this.playerMon.displayName)} restored ${healed} HP!`);
        this.syncCombatantSprites();
        this.storage.saveSync();
      },
    });

    this.enqueueStep({ duration: t.interTurn * 0.7 });
    this.enqueueMoveSequence('enemy', () => this.chooseEnemyMove(this.getCurrentEnemy()));
    this.enqueueStep({ duration: t.interTurn });
    this.enqueueStep({
      duration: 0,
      onStart: () => {
        if (!this.playerMon.isFainted && !this.getCurrentEnemy().isFainted) {
          this.state.turnNumber += 1;
          this.storage.saveSync();
          this.returnToCommand(true);
        }
      },
    });

    return this.kickoffImmediateStep();
  }

  switchTeamMember(teamIdx: number): BattleActionOutcome {
    const wasForced = this.state.phase === 'forced-switch';
    if (!this.state.active || this.stepQueue.length > 0) {
      return createEmptyOutcome();
    }
    if (!wasForced && !this.canAcceptPlayerCommand()) {
      return createEmptyOutcome();
    }
    const profile = this.storage.manager.getActiveProfile();
    const team: Pokemon[] = Array.isArray(profile?.team) ? profile.team : [];
    const target = team[teamIdx];
    if (!target || target.isFainted || isSameMon(target, this.playerMon)) {
      return createEmptyOutcome();
    }

    this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
    const t = this.getTimings();
    this.setPhase('player-acting', 'Switching...');
    this.pendingOutcome.sfx.push('move-select');

    this.enqueueStep({
      duration: t.sendOutHold,
      onStart: () => {
        target.resetBattleState();
        this.playerMon = target;
        this.playerBuddyEndured = false;
        this.state.player.faintDrop = 0;
        this.state.player.sendOutProgress = 0;
        this.state.player.displayedHp = target.hp;
        this.state.player.displayedXpRatio = Math.max(0, Math.min(1, target.xp / Math.max(1, target.xpToNext)));
        this.state.player.hitFlash = 0;
        this.state.player.lungeOffset = 0;
        this.state.player.recoilOffset = 0;
        this.state.player.bracedFlash = 0;
        this.state.player.buffFlash = 0;
        this.state.player.healFlash = 0;
        this.state.player.abilityBanner = null;
        this.pendingOutcome.sfx.push('catch-throw');
        if (!this.pendingOutcome.crySpeciesIds) this.pendingOutcome.crySpeciesIds = [];
        this.pendingOutcome.crySpeciesIds.push(target.speciesId);
        if (target.isShiny) this.pendingOutcome.sfx.push('shiny');
        this.pushLog(wasForced ? `Go, ${stripEmojis(target.displayName)}!` : `Switched in ${stripEmojis(target.displayName)}!`);
        this.syncCombatantSprites();
      },
      onProgress: (p) => {
        this.state.player.sendOutProgress = p;
      },
      onComplete: () => {
        this.state.player.sendOutProgress = 1;
      },
    });

    // Entry ability beat for switched-in partner
    this.enqueueStep({
      duration: 0,
      onStart: () => {
        if (evaluateEntryAbility(target)) {
          this.applyEntryAbilityNow(target, 'player');
          this.stepQueue.splice(1, 0, {
            duration: t.abilityHold,
            elapsed: 0,
            started: false,
          });
        }
      },
    });

    if (wasForced) {
      // Forced switch after faint gives a clean send-out with NO free enemy hit (v1 parity)
      this.enqueueStep({
        duration: 0,
        onStart: () => {
          this.storage.saveSync();
          this.returnToCommand(true);
        },
      });
    } else {
      this.enqueueStep({ duration: t.interTurn * 0.7 });
      this.enqueueMoveSequence('enemy', () => this.chooseEnemyMove(this.getCurrentEnemy()));
      this.enqueueStep({ duration: t.interTurn });
      this.enqueueStep({
        duration: 0,
        onStart: () => {
          if (!this.playerMon.isFainted && !this.getCurrentEnemy().isFainted) {
            this.state.turnNumber += 1;
            this.storage.saveSync();
            this.returnToCommand(true);
          }
        },
      });
    }

    return this.kickoffImmediateStep();
  }

  confirmEvolution(): BattleActionOutcome {
    const outcome = createEmptyOutcome();
    if (!this.state.active || this.state.phase !== 'evolving' || !this.state.evolutionTarget) {
      return outcome;
    }
    const oldName = stripEmojis(this.playerMon.displayName || this.playerMon.name);
    const res = this.storage.manager.evolvePokemon(this.playerMon.uid, this.state.evolutionTarget.toId);
    if (res) {
      outcome.sfx.push('evolve');
      outcome.crySpeciesIds = [this.playerMon.speciesId];
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
      // COMBAT-11 parity: announce unlocked moves + floating EVOLVED! banner
      const unlockedIds: string[] = Array.isArray(res.evolution?.unlockedMoves) ? res.evolution.unlockedMoves : [];
      const unlockedNames = unlockedIds.map((id) => getMoveEntry(id).name).filter(Boolean);
      const moveText = unlockedNames.length > 0 ? ` Learned ${unlockedNames.join(', ')}!` : '';

      this.state.floatingTexts = [];
      this.state.player.buffFlash = 1;
      this.spawnFloatingText('player', 'EVOLVED!', '#fde047', 24, 0, 1.6, -28);
      this.pushLog(`Congratulations! ${oldName} evolved into ${stripEmojis(res.evolution.newName)}!${moveText}`);
      this.state.evolutionTarget = undefined;
      this.setPhase('victory', 'Victory!');
      this.syncCombatantSprites(true);
    }
    return outcome;
  }

  flee(): BattleActionOutcome {
    const outcome = createEmptyOutcome();
    if (!this.canAcceptPlayerCommand()) {
      return outcome;
    }
    if (!this.state.canRun) {
      this.actionCooldownRemaining = ACTION_COOLDOWN_SEC;
      this.pushLog('Cannot flee from this battle!');
      return outcome;
    }
    this.clearTimeline();
    this.pendingOutcome = createEmptyOutcome();
    this.state.activeVfx = [];
    this.state.floatingTexts = [];
    this.state.active = false;
    this.state.inputLocked = false;
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

  private completeDefeatRecovery(): void {
    this.defeatRecoveryPending = false;
    this.storage.manager.healTeam(true);
    this.storage.manager.warpToSafeZone();
  }

  closeBattle(): void {
    const needsDefeatRecovery = this.defeatRecoveryPending || this.state.phase === 'defeat';
    if (needsDefeatRecovery) {
      this.completeDefeatRecovery();
    }
    this.clearTimeline();
    this.pendingOutcome = createEmptyOutcome();
    this.state.activeVfx = [];
    this.state.floatingTexts = [];
    this.state.active = false;
    this.setPhase('command', null);
  }

  /**
   * Deterministic helper (primarily for unit tests) that steps `update(stepDt)` cleanly until the
   * current turn / intro / capture reaches an interactive or terminal phase, merging all emitted outcomes.
   */
  advanceUntilSettled(maxSeconds = 12, stepDt = 0.04): BattleActionOutcome {
    const merged = createEmptyOutcome();
    const initial = this.drainStepOutcome();
    if (initial) mergeOutcome(merged, initial);

    const maxSteps = Math.ceil(maxSeconds / Math.max(0.005, stepDt));
    for (let i = 0; i < maxSteps && this.state.active; i++) {
      const settled =
        this.stepQueue.length === 0
        && !this.state.shutter.active
        && this.actionCooldownRemaining <= 0
        && (
          this.state.phase === 'command'
          || this.state.phase === 'forced-switch'
          || this.state.phase === 'evolving'
          || this.state.phase === 'victory'
          || this.state.phase === 'defeat'
        );
      if (settled) break;

      this.update(stepDt);
      const out = this.drainStepOutcome();
      if (out) mergeOutcome(merged, out);
    }
    return merged;
  }

  update(dtSeconds: number, options?: { skipVisualTimers?: boolean }): void {
    if (!this.state.active) return;
    const dt = Math.min(0.05, Math.max(0.001, Number.isFinite(dtSeconds) ? dtSeconds : 0.016));
    const skipVisual = Boolean(options?.skipVisualTimers);

    // 1. Always advance cooldown, shutter->intro handoff, turn FSM timeline, smooth HP/XP & floating text lifetimes!
    if (this.actionCooldownRemaining > 0) {
      this.actionCooldownRemaining = Math.max(0, this.actionCooldownRemaining - dt);
    }

    if (!skipVisual && this.state.shutter.active) {
      this.state.shutter.progress = Math.min(
        1,
        this.state.shutter.progress + dt / Math.max(0.08, this.state.shutter.duration),
      );
      if (this.state.shutter.progress >= 1) {
        this.state.shutter.active = false;
      }
    }

    // Once encounter shutter finishes (driven by renderer OR controller), run intro -> entry abilities -> command!
    if (this.state.phase === 'shutter' && !this.state.shutter.active) {
      this.scheduleIntroSequence();
    }

    // Advance deterministic turn FSM step queue
    let remainingDt = dt;
    let safety = 0;
    while (this.stepQueue.length > 0 && safety < 8) {
      safety += 1;
      const head = this.stepQueue[0];
      if (!head.started) {
        head.started = true;
        head.onStart?.();
        if (this.stepQueue[0] !== head) {
          continue;
        }
      }
      if (head.duration <= 0) {
        head.onProgress?.(1);
        this.stepQueue.shift();
        head.onComplete?.();
        continue;
      }
      head.elapsed += remainingDt;
      const progress = Math.min(1, head.elapsed / head.duration);
      head.onProgress?.(progress);
      if (head.elapsed >= head.duration) {
        remainingDt = Math.max(0, head.elapsed - head.duration);
        this.stepQueue.shift();
        head.onComplete?.();
        if (remainingDt <= 0.0005) break;
      } else {
        break;
      }
    }

    // Smoothly animate displayedHp toward mon.hp & displayedXpRatio toward mon.xp / mon.xpToNext
    const hpDrainSec = Math.max(0.14, this.getTimings().hpDrainSec);
    for (const vis of [this.state.player, this.state.enemy]) {
      const targetHp = vis.mon.hp;
      const diff = targetHp - vis.displayedHp;
      if (Math.abs(diff) <= 0.05) {
        vis.displayedHp = targetHp;
      } else {
        const speed = Math.max(12, vis.mon.maxHp / hpDrainSec);
        const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        vis.displayedHp += step;
      }
    }
    const targetXpRatio = Math.max(0, Math.min(1, this.state.player.mon.xp / Math.max(1, this.state.player.mon.xpToNext)));
    const xpDiff = targetXpRatio - this.state.player.displayedXpRatio;
    if (Math.abs(xpDiff) <= 0.004 || xpDiff < -0.25) {
      // Snap cleanly on level-up wraparound
      this.state.player.displayedXpRatio = targetXpRatio;
    } else {
      this.state.player.displayedXpRatio += Math.sign(xpDiff) * Math.min(Math.abs(xpDiff), dt * 2.2);
    }

    // Advance floating combat text popups
    for (let i = this.state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.state.floatingTexts[i];
      ft.elapsed += dt;
      if (ft.elapsed >= ft.delay + ft.duration) {
        this.state.floatingTexts.splice(i, 1);
      }
    }

    if (skipVisual) return;

    // 2. Standalone visual timers (only when BattleTheaterRenderer is NOT ticking them)
    this.state.elapsedSeconds += dt;
    this.state.cameraCueElapsed += dt;

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
