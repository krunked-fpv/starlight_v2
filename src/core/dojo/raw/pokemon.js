import * as Config from './config.js';
import {
  ABILITIES,
  ENCOUNTER_TRAITS,
  SPECIES,
  MOVES,
  TYPE_CHART,
  TYPES,
  BIOMES,
  SHRINES,
  EVOLUTIONS,
  EVOLUTION_ITEMS,
  getSpriteUrls,
} from './config.js';
import {
  BALANCE,
  softenStatRatio,
  resolveEffectivenessDamageMult,
  applyOffenseSoftCap,
  applyComposureGuardrail,
  getXpDeltaMultiplier,
  computeBattleXpReward,
  computeBenchXpShare,
  getPartyReadinessLevel,
  assessEncounterReadiness as assessEncounterReadinessBase,
} from './balance.js';

export {
  BALANCE,
  softenStatRatio,
  resolveEffectivenessDamageMult,
  applyOffenseSoftCap,
  applyComposureGuardrail,
  getXpDeltaMultiplier,
  computeBattleXpReward,
  computeBenchXpShare,
  getPartyReadinessLevel,
};

export function assessEncounterReadiness(profile, spec = {}) {
  const hasExplicitTypeChart = spec && typeof spec === 'object' && Object.prototype.hasOwnProperty.call(spec, 'typeChart');
  const nextSpec = hasExplicitTypeChart ? spec : { ...(spec || {}), typeChart: TYPE_CHART };
  return assessEncounterReadinessBase(profile, nextSpec);
}

export const MAX_UPGRADE_TIER = 5;
export const MAX_RECENT_ENCOUNTERS = 20;
const VALID_ENCOUNTER_TRAITS = new Set(['curious', 'treasure', 'spirited', 'apex']);

let recentWildEncounters = [];
let recentWildLevels = {};

export function resetEncounterHistory() {
  recentWildEncounters = [];
  recentWildLevels = {};
}

function normalizeEncounterTrait(raw) {
  return typeof raw === 'string' && VALID_ENCOUNTER_TRAITS.has(raw) ? raw : null;
}

export const BIOME_SCALING_OFFSETS = { ...BALANCE.scaling.biomeOffsets };

function getBiomeScalingOffset(biomeId) {
  if (typeof biomeId !== 'string') return 0;
  const cfgOffsets = Config.BIOME_SCALING_OFFSETS;
  if (cfgOffsets && Object.prototype.hasOwnProperty.call(cfgOffsets, biomeId)) {
    const val = Number(cfgOffsets[biomeId]);
    if (Number.isFinite(val)) return val;
  }
  return Object.prototype.hasOwnProperty.call(BIOME_SCALING_OFFSETS, biomeId)
    ? BIOME_SCALING_OFFSETS[biomeId]
    : 0;
}

function resolveAbilityId(monOrSpecies) {
  if (!monOrSpecies) return null;
  if (typeof monOrSpecies === 'number' || typeof monOrSpecies === 'string') {
    if (typeof monOrSpecies === 'string' && ABILITIES?.[monOrSpecies]) {
      return monOrSpecies;
    }
    const sp = SPECIES[Number(monOrSpecies)];
    return sp?.ability && ABILITIES?.[sp.ability] ? sp.ability : null;
  }
  if (typeof monOrSpecies === 'object') {
    if (typeof monOrSpecies.abilityId === 'string' && ABILITIES?.[monOrSpecies.abilityId]) {
      return monOrSpecies.abilityId;
    }
    const sp = monOrSpecies.species?.id
      ? monOrSpecies.species
      : monOrSpecies.speciesId !== undefined
        ? SPECIES[Number(monOrSpecies.speciesId)]
        : monOrSpecies.id !== undefined
          ? SPECIES[Number(monOrSpecies.id)]
          : null;
    if (sp?.ability && ABILITIES?.[sp.ability]) {
      return sp.ability;
    }
    if (typeof monOrSpecies.ability === 'string' && ABILITIES?.[monOrSpecies.ability]) {
      return monOrSpecies.ability;
    }
    if (
      monOrSpecies.ability
      && typeof monOrSpecies.ability === 'object'
      && typeof monOrSpecies.ability.id === 'string'
      && ABILITIES?.[monOrSpecies.ability.id]
    ) {
      return monOrSpecies.ability.id;
    }
  }
  return null;
}

export function getPokemonAbility(monOrSpecies) {
  const abilityId = resolveAbilityId(monOrSpecies);
  return abilityId ? (ABILITIES?.[abilityId] || null) : null;
}

export function evaluateEntryAbility(mon) {
  if (!mon || mon.isFainted || mon.abilityEntryTriggered) return null;
  const hp = mon.hp;
  if (hp !== undefined && hp !== null && Number.isFinite(Number(hp)) && Number(hp) <= 0) {
    return null;
  }
  const ability = getPokemonAbility(mon);
  if (!ability || ability.trigger !== 'entry') return null;

  const stat = ['atk', 'def', 'spd'].includes(ability.stat) ? ability.stat : 'atk';
  const stages = Number.isFinite(Number(ability.stages)) ? Number(ability.stages) : 1;
  const statLabel = { atk: 'Attack', def: 'Defense', spd: 'Speed' }[stat] || stat.toUpperCase();
  const grantShield = Boolean(ability.grantShield);
  const shieldTurns = grantShield ? (Number(ability.shieldTurns) || 1) : 0;
  return {
    abilityId: ability.id,
    ability,
    stat,
    stages,
    grantShield,
    shieldTurns,
    summary: grantShield ? `${statLabel} +${stages} & Shield!` : `${statLabel} +${stages}`,
  };
}

export function evaluateTurnEndAbility(mon) {
  if (!mon || mon.isFainted) return null;
  const hp = Number(mon.hp);
  const maxHp = Number(mon.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || hp <= 0 || maxHp <= 0) {
    return null;
  }
  const ability = getPokemonAbility(mon);
  if (!ability || ability.trigger !== 'turn_end') return null;

  if (ability.id === 'thunder_steppe' || ability.boostStat) {
    const boostStat = ['atk', 'def', 'spd'].includes(ability.boostStat) ? ability.boostStat : 'spd';
    const boostStages = Number.isFinite(Number(ability.boostStages)) ? Number(ability.boostStages) : 1;
    const currentStage = Number(mon.battleStages?.[boostStat]) || 0;
    if (currentStage >= 2) return null;
    const statLabel = { atk: 'Attack', def: 'Defense', spd: 'Speed' }[boostStat] || boostStat.toUpperCase();
    return {
      abilityId: ability.id,
      ability,
      heal: 0,
      boostStat,
      boostStages,
      summary: `${statLabel} +${boostStages}!`,
    };
  }

  if (hp >= maxHp) {
    return null;
  }

  const heal = Math.max(1, Math.round(maxHp * 0.08));
  return {
    abilityId: ability.id,
    ability,
    heal,
    boostStat: null,
    boostStages: 0,
    summary: `+${heal} HP`,
  };
}

function isInvalidNumericInput(raw) {
  return (
    raw === null
    || raw === undefined
    || raw === ''
    || (typeof raw === 'string' && raw.trim() === '')
    || typeof raw === 'boolean'
    || typeof raw === 'object'
    || typeof raw === 'symbol'
    || typeof raw === 'function'
  );
}

export function getBondTier(bond) {
  const raw = isInvalidNumericInput(bond) ? 0 : Number(bond);
  const safeBond = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  if (safeBond >= 85) {
    return { tier: 3, id: 'soulmate', label: 'Best Buddy', icon: '🌟', xpMult: 1.20, critBonus: 0.04, endureChance: 0.25 };
  }
  if (safeBond >= 60) {
    return { tier: 2, id: 'trusted', label: 'Trusted Buddy', icon: '💖', xpMult: 1.12, critBonus: 0.04, endureChance: 0.15 };
  }
  if (safeBond >= 40) {
    return { tier: 1, id: 'friend', label: 'Good Friend', icon: '💛', xpMult: 1.08, critBonus: 0.02, endureChance: 0 };
  }
  return { tier: 0, id: 'partner', label: 'New Partner', icon: '🌱', xpMult: 1.0, critBonus: 0, endureChance: 0 };
}

function makeUid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUid(raw) {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  } else if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return makeUid();
}

function normalizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 14).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoundedInt(raw, min, max, fallback) {
  if (isInvalidNumericInput(raw)) return fallback;
  if (raw === -Infinity) return min;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.round(num))) : fallback;
}

function normalizeLevel(raw, fallback = 5) {
  return normalizeBoundedInt(raw, 1, BALANCE.progression.maxLevel, fallback);
}

function normalizeXp(raw) {
  if (isInvalidNumericInput(raw)) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(num))) : 0;
}

function normalizeHp(raw, maxHp) {
  return normalizeBoundedInt(raw, 0, maxHp, maxHp);
}

function normalizeBond(raw) {
  return normalizeBoundedInt(raw, 0, 100, 20);
}

function normalizeUpgradeTier(raw) {
  return normalizeBoundedInt(raw, 0, MAX_UPGRADE_TIER, 0);
}

function parseFiniteMovePp(val) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') return NaN;
  if (val === Infinity) return Number.MAX_SAFE_INTEGER;
  if (val === -Infinity) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : NaN;
}

function sanitizeMovePp(species, rawMovePp, rawPp, rawMoves, overrideMoveIds = null) {
  const speciesPool = Array.isArray(species?.movePool) ? species.movePool : [];
  const pool = Array.isArray(overrideMoveIds) && overrideMoveIds.length > 0
    ? [...new Set([...speciesPool, ...overrideMoveIds])]
    : speciesPool;
  const movesByIdPp = new Map();

  if (Array.isArray(rawMoves)) {
    for (let idx = 0; idx < rawMoves.length; idx += 1) {
      const item = rawMoves[idx];
      if (typeof item === 'string' && MOVES[item]) {
        if (Array.isArray(rawPp) && idx < rawPp.length) {
          const parsed = parseFiniteMovePp(rawPp[idx]);
          if (Number.isFinite(parsed)) movesByIdPp.set(item, parsed);
        }
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        const mId = typeof item.id === 'string' ? item.id : (typeof item.moveId === 'string' ? item.moveId : null);
        if (mId && MOVES[mId]) {
          const rawVal = item.pp ?? item.currentPp ?? item.current;
          const parsed = parseFiniteMovePp(rawVal);
          if (Number.isFinite(parsed)) movesByIdPp.set(mId, parsed);
        }
      }
    }
  }

  const out = {};
  for (let i = 0; i < pool.length; i += 1) {
    const moveId = pool[i];
    const maxPp = MOVES[moveId]?.pp || 20;
    let candidate = NaN;

    if (rawMovePp && typeof rawMovePp === 'object') {
      if (Array.isArray(rawMovePp)) {
        candidate = parseFiniteMovePp(rawMovePp[i]);
      } else if (Object.prototype.hasOwnProperty.call(rawMovePp, moveId)) {
        candidate = parseFiniteMovePp(rawMovePp[moveId]);
      }
    }

    if (!Number.isFinite(candidate) && movesByIdPp.has(moveId)) {
      candidate = movesByIdPp.get(moveId);
    }

    if (!Number.isFinite(candidate) && rawPp && typeof rawPp === 'object') {
      if (Array.isArray(rawPp)) {
        candidate = parseFiniteMovePp(rawPp[i]);
      } else if (Object.prototype.hasOwnProperty.call(rawPp, moveId)) {
        candidate = parseFiniteMovePp(rawPp[moveId]);
      }
    }

    out[moveId] = Number.isFinite(candidate) ? Math.max(0, Math.min(maxPp, Math.round(candidate))) : maxPp;
  }
  return out;
}

export class Pokemon {
  constructor({
    uid = makeUid(),
    speciesId,
    level = 5,
    xp = 0,
    hp = null,
    caughtBiome = 'wild',
    movePp = null,
    pp = null,
    moves = null,
    moveIds = null,
    isShiny = false,
    nickname = null,
    bond = 20,
    upgradeTier = 0,
    isElite = false,
    encounterTrait = null,
    abilityId = null,
  }) {
    const parsedSpeciesId = isInvalidNumericInput(speciesId) ? NaN : Number(speciesId);
    const species = Number.isInteger(parsedSpeciesId) ? SPECIES[parsedSpeciesId] : null;
    if (!species) {
      throw new Error(`Unknown Pokémon speciesId: ${speciesId}`);
    }
    this.uid = normalizeUid(uid);
    this.speciesId = parsedSpeciesId;
    this.level = normalizeLevel(level, 5);
    this.xp = normalizeXp(xp);
    this.caughtBiome = typeof caughtBiome === 'string' && caughtBiome.trim() ? caughtBiome.trim() : 'wild';
    this.isShiny = Boolean(isShiny);
    this.nickname = normalizeNickname(nickname);
    this.bond = normalizeBond(bond);
    this.upgradeTier = normalizeUpgradeTier(upgradeTier);
    this.isElite = Boolean(isElite);
    this.encounterTrait = normalizeEncounterTrait(encounterTrait);
    const rawAbilityId = typeof abilityId === 'string' && ABILITIES?.[abilityId] ? abilityId : null;
    this._abilityId = rawAbilityId && rawAbilityId !== species.ability ? rawAbilityId : null;
    const validMoveIds = Array.isArray(moveIds)
      ? [...new Set(moveIds.filter((id) => typeof id === 'string' && Boolean(MOVES[id])))]
      : [];
    this.moves = validMoveIds.length > 0 ? validMoveIds : null;

    this.maxHp = 20;
    this.atk = 10;
    this.def = 10;
    this.spd = 10;
    this.xpToNext = 100;
    this.recalculateStats();

    this.hp = normalizeHp(hp, this.maxHp);
    this.movePp = sanitizeMovePp(this.species, movePp, pp, moves, this.moves);

    this.resetBattleState();
  }

  resetBattleState() {
    this.battleStages = { atk: 0, def: 0, spd: 0 };
    this.shieldTurns = 0;
    this.abilityEntryTriggered = false;
  }

  applyStageBoost(stat, delta = 1) {
    if (!this.battleStages || typeof this.battleStages !== 'object') {
      this.battleStages = { atk: 0, def: 0, spd: 0 };
    }
    const key = ['atk', 'def', 'spd'].includes(stat) ? stat : 'atk';
    const prev = Number(this.battleStages[key]) || 0;
    const step = Number.isFinite(Number(delta)) ? Math.round(Number(delta)) : 0;
    const next = Math.max(BALANCE.combat.minStage, Math.min(BALANCE.combat.maxStage, prev + step));
    this.battleStages[key] = next;
    return { stat: key, stage: next, changed: next !== prev };
  }

  getStageMultiplier(stat) {
    const rawStage = Number(this.battleStages?.[stat]);
    const stage = Number.isFinite(rawStage)
      ? Math.max(BALANCE.combat.minStage, Math.min(BALANCE.combat.maxStage, Math.round(rawStage)))
      : 0;
    const stageStep = BALANCE.combat.stageStep;
    if (stage === 0) return 1.0;
    if (stage > 0) return 1 + stage * stageStep;
    return 1 / (1 - stage * stageStep);
  }

  getEffectiveAtk() {
    const stage = Number(this.battleStages?.atk) || 0;
    if (stage === 0) return this.atk;
    return Math.max(1, Math.round(this.atk * this.getStageMultiplier('atk')));
  }

  getEffectiveDef() {
    const stage = Number(this.battleStages?.def) || 0;
    if (stage === 0) return this.def;
    return Math.max(1, Math.round(this.def * this.getStageMultiplier('def')));
  }

  getEffectiveSpd() {
    const stage = Number(this.battleStages?.spd) || 0;
    if (stage === 0) return this.spd;
    return Math.max(1, Math.round(this.spd * this.getStageMultiplier('spd')));
  }

  get species() {
    return SPECIES[this.speciesId];
  }

  get name() {
    return this.species?.name || 'Mystery';
  }

  get displayName() {
    return this.nickname || this.name;
  }

  setNickname(raw) {
    this.nickname = normalizeNickname(raw);
    return this.nickname;
  }

  gainBond(delta = 1) {
    const step = isInvalidNumericInput(delta) ? NaN : Number(delta);
    const add = Number.isFinite(step) ? step : 0;
    const prev = normalizeBond(this.bond);
    this.bond = Math.max(0, Math.min(100, Math.round(prev + add)));
    return this.bond;
  }

  get type() {
    return this.species?.type || 'normal';
  }

  get typeInfo() {
    return TYPES[this.type] || TYPES.normal;
  }

  get abilityId() {
    if (this._abilityId && ABILITIES?.[this._abilityId]) {
      return this._abilityId;
    }
    const id = this.species?.ability;
    return id && ABILITIES?.[id] ? id : null;
  }

  get ability() {
    const id = this.abilityId;
    return id ? (ABILITIES?.[id] || null) : null;
  }

  get isFainted() {
    return this.hp <= 0;
  }

  recalculateStats() {
    const base = this.species?.baseStats || {};
    const safeHp = Number.isFinite(Number(base.hp)) && Number(base.hp) > 0 ? Number(base.hp) : 45;
    const safeAtk = Number.isFinite(Number(base.atk)) && Number(base.atk) > 0 ? Number(base.atk) : 45;
    const safeDef = Number.isFinite(Number(base.def)) && Number(base.def) > 0 ? Number(base.def) : 45;
    const safeSpd = Number.isFinite(Number(base.spd)) && Number(base.spd) > 0 ? Number(base.spd) : 45;
    const lv = normalizeLevel(this.level, 5);
    this.level = lv;
    const tier = normalizeUpgradeTier(this.upgradeTier);
    this.upgradeTier = tier;
    const rawMaxHp = Math.floor(((safeHp * 2) * lv) / 35) + lv + 18;
    const rawAtk = Math.floor(((safeAtk * 2) * lv) / 40) + 7;
    const rawDef = Math.floor(((safeDef * 2) * lv) / 40) + 6;
    const rawSpd = Math.floor(((safeSpd * 2) * lv) / 40) + 6;
    if (tier > 0) {
      const mult = 1 + tier * BALANCE.progression.upgradeStatBonusPerTier;
      this.maxHp = Math.round(rawMaxHp * mult);
      this.atk = Math.round(rawAtk * mult);
      this.def = Math.round(rawDef * mult);
      this.spd = Math.round(rawSpd * mult);
    } else {
      this.maxHp = rawMaxHp;
      this.atk = rawAtk;
      this.def = rawDef;
      this.spd = rawSpd;
    }
    this.xpToNext = lv * 22 + 15;
  }

  getUpgradeCost() {
    const tier = normalizeUpgradeTier(this.upgradeTier);
    if (tier >= MAX_UPGRADE_TIER) return null;
    return (tier + 1) * 2;
  }

  applyUpgrade() {
    const oldTier = normalizeUpgradeTier(this.upgradeTier);
    if (oldTier >= MAX_UPGRADE_TIER) {
      return {
        upgraded: false,
        reason: 'max_tier',
        oldTier,
        newTier: oldTier,
        levelResult: null,
        pendingEvo: this.getPendingLevelEvolution(),
      };
    }
    const newTier = oldTier + 1;
    this.upgradeTier = newTier;
    this.recalculateStats();
    const xpGain = Math.max(
      BALANCE.progression.upgradeMinXp,
      Math.round(this.xpToNext * BALANCE.progression.upgradeXpRatio),
    );
    const levelResult = this.gainXp(xpGain);
    this.healFull();
    this.gainBond(10);
    const pendingEvo = this.getPendingLevelEvolution();
    return {
      upgraded: true,
      oldTier,
      newTier,
      levelResult,
      pendingEvo,
    };
  }

  healFull() {
    this.hp = this.maxHp;
    this.restoreAllPp();
  }

  healAmount(amount) {
    if (isInvalidNumericInput(amount)) return 0;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const before = normalizeHp(this.hp, this.maxHp);
    this.hp = Math.min(this.maxHp, before + Math.max(1, Math.round(n)));
    return this.hp - before;
  }

  takeDamage(amount) {
    if (isInvalidNumericInput(amount)) return 0;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const before = normalizeHp(this.hp, this.maxHp);
    this.hp = Math.max(0, before - Math.round(n));
    return before - this.hp;
  }

  gainXp(amount) {
    const oldLevel = normalizeLevel(this.level, 5);
    this.level = oldLevel;
    if (!Number.isFinite(Number(this.xpToNext)) || this.xpToNext <= 0) {
      this.recalculateStats();
    }
    this.xp = normalizeXp(this.xp);
    const n = isInvalidNumericInput(amount) ? NaN : Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        leveledUp: false,
        levelsGained: 0,
        oldLevel,
        newLevel: oldLevel,
      };
    }
    const add = Math.max(1, Math.round(n));
    const nextXp = this.xp + add;
    this.xp = Number.isFinite(nextXp) ? Math.min(Number.MAX_SAFE_INTEGER, nextXp) : Number.MAX_SAFE_INTEGER;
    while (this.level < BALANCE.progression.maxLevel && this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      const oldMax = this.maxHp;
      this.level += 1;
      this.recalculateStats();
      const bonus = Math.max(2, this.maxHp - oldMax + 3);
      if (Number.isFinite(Number(this.hp)) && Number(this.hp) > 0) {
        this.hp = Math.min(this.maxHp, Number(this.hp) + bonus);
      }
    }
    return {
      leveledUp: this.level > oldLevel,
      levelsGained: this.level - oldLevel,
      oldLevel,
      newLevel: this.level,
    };
  }

  getMoveObjects() {
    const instancePool = Array.isArray(this.moves) && this.moves.length > 0
      ? this.moves
          .map((item) => (typeof item === 'string' ? MOVES[item] : (item?.id ? MOVES[item.id] : null)))
          .filter(Boolean)
      : [];
    if (instancePool.length > 0) {
      return instancePool;
    }
    const speciesPool = Array.isArray(this.species?.movePool)
      ? this.species.movePool.map((moveId) => MOVES[moveId]).filter(Boolean)
      : [];
    if (speciesPool.length > 0) {
      return speciesPool;
    }
    const fallbackMove = MOVES.tackle || Object.values(MOVES || {})[0] || null;
    return fallbackMove ? [fallbackMove] : [];
  }

  getMovePp(moveId) {
    const max = MOVES[moveId]?.pp || 20;
    const raw = this.movePp?.[moveId];
    const current = !isInvalidNumericInput(raw) && Number.isFinite(Number(raw))
      ? Math.max(0, Math.min(max, Math.round(Number(raw))))
      : max;
    return { current, max };
  }

  consumeMovePp(moveId) {
    const { current, max } = this.getMovePp(moveId);
    if (!this.movePp) this.movePp = {};
    this.movePp[moveId] = Math.max(0, Math.min(max, current - 1));
    return this.movePp[moveId];
  }

  restoreAllPp() {
    if (!this.movePp) this.movePp = {};
    for (const move of this.getMoveObjects()) {
      this.movePp[move.id] = move.pp || 20;
    }
  }

  hasAnyMovePp() {
    return this.getMoveObjects().some((move) => this.getMovePp(move.id).current > 0);
  }

  getPendingLevelEvolution() {
    const rules = EVOLUTIONS[this.speciesId] || [];
    for (const rule of rules) {
      if (
        !isInvalidNumericInput(rule?.minLevel)
        && Number.isFinite(Number(rule.minLevel))
        && this.level >= Number(rule.minLevel)
        && SPECIES[rule.to]
      ) {
        return {
          fromId: this.speciesId,
          toId: rule.to,
          toSpecies: SPECIES[rule.to],
          minLevel: rule.minLevel,
        };
      }
    }
    return null;
  }

  getAvailableItemEvolutions(bagGems = {}) {
    const rules = EVOLUTIONS[this.speciesId] || [];
    const gems = bagGems && typeof bagGems === 'object' ? bagGems : {};
    return rules
      .filter((rule) => rule.item && EVOLUTION_ITEMS[rule.item] && SPECIES[rule.to])
      .map((rule) => {
        const rawCount = gems[rule.item];
        const count = !isInvalidNumericInput(rawCount) && Number.isFinite(Number(rawCount))
          ? Math.max(0, Math.floor(Number(rawCount)))
          : 0;
        return {
          item: rule.item,
          itemInfo: EVOLUTION_ITEMS[rule.item],
          toId: rule.to,
          toSpecies: SPECIES[rule.to],
          canUse: count > 0,
        };
      });
  }

  evolve(toId) {
    const targetId = isInvalidNumericInput(toId) ? NaN : Number(toId);
    const targetSpecies = Number.isInteger(targetId) ? SPECIES[targetId] : null;
    if (!targetSpecies) {
      throw new Error(`Unknown evolution target speciesId: ${toId}`);
    }

    const oldSpeciesId = this.speciesId;
    const oldName = this.name;
    const oldMax = this.maxHp;
    const oldPoolSet = new Set(Array.isArray(this.species?.movePool) ? this.species.movePool : []);
    const prevPp = this.movePp || {};

    this.speciesId = targetId;
    this._abilityId = null;
    this.moves = null;
    this.recalculateStats();

    if (Number.isFinite(Number(this.hp)) && Number(this.hp) > 0) {
      this.hp = Math.min(this.maxHp, Number(this.hp) + Math.max(4, this.maxHp - oldMax));
    }

    const nextMovePp = {};
    const unlockedMoves = [];
    for (const moveId of targetSpecies.movePool) {
      const maxPp = MOVES[moveId]?.pp || 20;
      if (oldPoolSet.has(moveId) && Number.isFinite(Number(prevPp[moveId]))) {
        nextMovePp[moveId] = Math.max(0, Math.min(maxPp, Math.round(Number(prevPp[moveId]))));
      } else {
        nextMovePp[moveId] = maxPp;
        if (!oldPoolSet.has(moveId)) {
          unlockedMoves.push(moveId);
        }
      }
    }
    this.movePp = nextMovePp;

    return {
      oldSpeciesId,
      newSpeciesId: targetId,
      oldName,
      newName: targetSpecies.name,
      unlockedMoves,
    };
  }

  toJSON() {
    return {
      uid: this.uid,
      speciesId: this.speciesId,
      level: this.level,
      xp: this.xp,
      hp: this.hp,
      caughtBiome: this.caughtBiome,
      isShiny: Boolean(this.isShiny),
      nickname: this.nickname,
      bond: this.bond,
      upgradeTier: this.upgradeTier,
      isElite: Boolean(this.isElite),
      encounterTrait: this.encounterTrait,
      abilityId: this.abilityId,
      movePp: { ...this.movePp },
    };
  }

  static fromJSON(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid Pokémon JSON data');
    }
    const abilityId = typeof data.abilityId === 'string'
      ? data.abilityId
      : (typeof data.ability === 'string'
        ? data.ability
        : (data.ability && typeof data.ability === 'object' ? data.ability.id : null));
    return new Pokemon({
      ...data,
      abilityId,
    });
  }
}

export function createPokemon(speciesId, level = 5, biome = 'wild', options = {}) {
  return new Pokemon({
    speciesId,
    level,
    caughtBiome: biome,
    isShiny: Boolean(options?.isShiny),
    nickname: options?.nickname ?? null,
    bond: options?.bond ?? 20,
    upgradeTier: options?.upgradeTier ?? 0,
    isElite: Boolean(options?.isElite),
    encounterTrait: options?.encounterTrait ?? null,
    abilityId: options?.abilityId ?? null,
    moveIds: Array.isArray(options?.moveIds) ? options.moveIds : null,
  });
}

export function createStarterPokemon(speciesId) {
  return new Pokemon({ speciesId, level: 5, caughtBiome: 'starter' });
}

const FALLBACK_TRAINER_XP_WEIGHTS = {
  battleWin: 14,
  badge: 60,
  shrine: 85,
  rival: 50,
  rivalRematch: 30,
  shrineTrial: 40,
  quest: 45,
  speciesCaught: 4,
};

export const TRAINER_XP_WEIGHTS = Config.TRAINER_XP_WEIGHTS
  ? { ...FALLBACK_TRAINER_XP_WEIGHTS, ...Config.TRAINER_XP_WEIGHTS }
  : { ...FALLBACK_TRAINER_XP_WEIGHTS };

function isValidProgressionNumber(raw) {
  return (
    !isInvalidNumericInput(raw)
    && !(typeof raw === 'string' && raw.trim() === '')
    && Number.isFinite(Number(raw))
  );
}

function toSafeNonNegInt(raw) {
  if (!isValidProgressionNumber(raw)) return 0;
  const num = Number(raw);
  return num >= 0 ? Math.floor(num) : 0;
}

function countUniqueIdEntries(list) {
  if (!list) return 0;
  const items = Array.isArray(list) ? list : (list instanceof Set ? [...list] : null);
  if (!items) return 0;
  const unique = new Set();
  for (const item of items) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const trimmed = String(item).trim();
    if (trimmed) unique.add(trimmed);
  }
  return unique.size;
}

function sumNonNegIntMapValues(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  let total = 0;
  for (const val of Object.values(obj)) {
    total += toSafeNonNegInt(val);
  }
  return total;
}

function countUniqueCaughtSpecies(rawCaught) {
  if (!rawCaught || typeof rawCaught !== 'object') return 0;
  const seen = new Set();
  if (Array.isArray(rawCaught)) {
    for (const item of rawCaught) {
      if (item === null || item === undefined || typeof item === 'boolean') continue;
      const trimmed = String(item).trim();
      if (!trimmed) continue;
      const asNum = Number(trimmed);
      seen.add(Number.isInteger(asNum) && asNum > 0 ? String(asNum) : trimmed);
    }
    return seen.size;
  }
  for (const [key, val] of Object.entries(rawCaught)) {
    const trimmedKey = String(key).trim();
    if (!trimmedKey) continue;
    const isCaught = val === true || (isValidProgressionNumber(val) && Number(val) > 0);
    if (isCaught) {
      const asNum = Number(trimmedKey);
      seen.add(Number.isInteger(asNum) && asNum > 0 ? String(asNum) : trimmedKey);
    }
  }
  return seen.size;
}

function hasExplicitProgressionData(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
  return (
    isValidProgressionNumber(profile.playerLevel)
    || isValidProgressionNumber(profile.trainerXp)
    || (Boolean(profile.stats) && typeof profile.stats === 'object' && !Array.isArray(profile.stats))
    || Array.isArray(profile.shrinesCleared)
    || Array.isArray(profile.questsCompleted)
  );
}

/**
 * Return the Trainer XP required to advance from `level` to `level + 1`.
 */
export function getPlayerLevelXpRequired(level) {
  if (typeof Config.getPlayerLevelXpRequired === 'function') {
    return Config.getPlayerLevelXpRequired(level);
  }
  if (isInvalidNumericInput(level) || (typeof level === 'string' && level.trim() === '')) {
    return 30;
  }
  const num = Number(level);
  if (num >= 50) return 0;
  const lv = Math.max(1, Math.floor(Number.isFinite(num) ? num : 1));
  return lv >= 50 ? 0 : 30 + (lv - 1) * 10;
}

/**
 * Return the cumulative Trainer XP threshold at which a trainer reaches `level` (1..50).
 */
export function getCumulativeXpForPlayerLevel(level) {
  if (typeof Config.getCumulativeXpForPlayerLevel === 'function') {
    return Config.getCumulativeXpForPlayerLevel(level);
  }
  let targetLv = 1;
  if (level === Infinity || (typeof level === 'string' && level.trim() === 'Infinity')) {
    targetLv = 50;
  } else if (
    level === -Infinity
    || (typeof level === 'string' && level.trim() === '-Infinity')
    || isInvalidNumericInput(level)
    || (typeof level === 'string' && level.trim() === '')
  ) {
    targetLv = 1;
  } else {
    const num = Number(level);
    targetLv = Number.isFinite(num) ? Math.max(1, Math.min(50, Math.round(num))) : 1;
  }
  let total = 0;
  for (let lv = 1; lv < targetLv; lv += 1) {
    total += getPlayerLevelXpRequired(lv);
  }
  return total;
}

/**
 * Compute authoritative milestone Trainer XP strictly from trainer accomplishments
 * (never reading party or box Pokémon levels).
 */
export function computeMilestoneTrainerXp(profile) {
  if (typeof Config.computeMilestoneTrainerXp === 'function') {
    return Config.computeMilestoneTrainerXp(profile);
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 0;
  const w = TRAINER_XP_WEIGHTS;
  const battlesWon = toSafeNonNegInt(profile.stats?.battlesWon);
  const badgesCount = countUniqueIdEntries(profile.badges);
  const shrinesCount = countUniqueIdEntries(profile.shrinesCleared);
  const rivalsCount = countUniqueIdEntries(profile.rivalsDefeated);
  const rivalRematches = sumNonNegIntMapValues(profile.rivalRematchCounts);
  const shrineTrials = sumNonNegIntMapValues(profile.shrineTrialCounts);
  const questsCount = countUniqueIdEntries(profile.questsCompleted);
  const caughtBonus = Math.max(0, countUniqueCaughtSpecies(profile.pokedex?.caught) - 1);

  return (
    battlesWon * w.battleWin
    + badgesCount * w.badge
    + shrinesCount * w.shrine
    + rivalsCount * w.rival
    + rivalRematches * w.rivalRematch
    + shrineTrials * w.shrineTrial
    + questsCount * w.quest
    + caughtBonus * w.speciesCaught
  );
}

/**
 * Convert a raw Trainer XP total into `{ level, xp, xpIntoLevel, xpToNext, progressPct, isMaxLevel }`.
 */
export function getPlayerLevelFromXp(xp) {
  if (typeof Config.getPlayerLevelFromXp === 'function') {
    return Config.getPlayerLevelFromXp(xp);
  }
  let safeXp = 0;
  if (xp === Infinity || (typeof xp === 'string' && xp.trim() === 'Infinity')) {
    safeXp = getCumulativeXpForPlayerLevel(50);
  } else {
    safeXp = toSafeNonNegInt(xp);
  }

  let level = 1;
  let levelStartXp = 0;
  while (level < 50) {
    const req = getPlayerLevelXpRequired(level);
    if (safeXp < levelStartXp + req) break;
    levelStartXp += req;
    level += 1;
  }

  const isMaxLevel = level >= 50;
  const xpToNext = isMaxLevel ? 0 : getPlayerLevelXpRequired(level);
  const xpIntoLevel = isMaxLevel ? 0 : Math.max(0, safeXp - levelStartXp);
  const progressPct = isMaxLevel
    ? 100
    : Math.max(0, Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpToNext)) * 100)));

  return {
    level,
    xp: safeXp,
    xpIntoLevel,
    xpToNext,
    progressPct,
    isMaxLevel,
  };
}

/**
 * Resolve Trainer Player Level progression from a profile object or scalar level (1..50).
 */
export function getPlayerProgression(profileOrLevel = null) {
  if (typeof Config.getPlayerProgression === 'function') {
    return Config.getPlayerProgression(profileOrLevel);
  }
  if (typeof profileOrLevel === 'number') {
    if (profileOrLevel === -Infinity) return getPlayerLevelFromXp(0);
    if (profileOrLevel === Infinity) return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(50));
    if (!Number.isFinite(profileOrLevel)) return getPlayerLevelFromXp(0);
    const lv = Math.max(1, Math.min(50, Math.round(profileOrLevel)));
    return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(lv));
  }
  if (typeof profileOrLevel === 'string') {
    const trimmed = profileOrLevel.trim();
    if (!trimmed || trimmed === '-Infinity') return getPlayerLevelFromXp(0);
    if (trimmed === 'Infinity') return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(50));
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return getPlayerLevelFromXp(0);
    const lv = Math.max(1, Math.min(50, Math.round(parsed)));
    return getPlayerLevelFromXp(getCumulativeXpForPlayerLevel(lv));
  }
  if (!profileOrLevel || typeof profileOrLevel !== 'object' || Array.isArray(profileOrLevel)) {
    return getPlayerLevelFromXp(0);
  }

  const milestoneXp = computeMilestoneTrainerXp(profileOrLevel);
  const persistedXp = toSafeNonNegInt(profileOrLevel.trainerXp);
  let explicitLv = null;
  if (isValidProgressionNumber(profileOrLevel.playerLevel)) {
    const parsedLv = Number(profileOrLevel.playerLevel);
    if (Number.isInteger(parsedLv) && parsedLv >= 1 && parsedLv <= 50) {
      explicitLv = parsedLv;
    }
  }
  const explicitFloorXp = (persistedXp === 0 && explicitLv !== null)
    ? getCumulativeXpForPlayerLevel(explicitLv)
    : 0;
  const effectiveXp = Math.max(persistedXp, milestoneXp, explicitFloorXp);
  return getPlayerLevelFromXp(effectiveXp);
}

/**
 * Resolve Trainer Player Level (1..50) from a profile object or scalar level.
 */
export function getPlayerLevel(profileOrLevel = null) {
  if (typeof Config.getPlayerLevel === 'function') {
    return Config.getPlayerLevel(profileOrLevel);
  }
  return getPlayerProgression(profileOrLevel).level;
}

export function getTrainerPowerLevel(profile = null) {
  const maxLv = BALANCE.progression.maxLevel;
  const levels = (Array.isArray(profile?.team) ? profile.team : [])
    .filter((mon) => !isInvalidNumericInput(mon?.level))
    .map((mon) => Number(mon?.level))
    .filter((lv) => Number.isFinite(lv) && lv > 0)
    .map((lv) => Math.max(1, Math.min(maxLv, lv)))
    .sort((a, b) => b - a);

  let teamScore = 1;
  if (levels.length === 1) {
    teamScore = levels[0];
  } else if (levels.length === 2) {
    const [w1, w2] = BALANCE.progression.powerPairWeights;
    teamScore = levels[0] * w1 + levels[1] * w2;
  } else if (levels.length >= 3) {
    const [w1, w2, w3] = BALANCE.progression.powerTopWeights;
    teamScore = levels[0] * w1 + levels[1] * w2 + levels[2] * w3;
  }

  const badgesCount = Array.isArray(profile?.badges) ? profile.badges.length : 0;
  const badgeBonus = Math.min(
    BALANCE.progression.powerBadgeBonusCap,
    badgesCount * BALANCE.progression.powerBadgeBonusPerBadge,
  );
  const raw = teamScore + badgeBonus;
  return Math.max(1, Math.min(maxLv, Number(raw.toFixed(2))));
}

const FALLBACK_FARMING_BIOME_ORDER = [
  'forest',
  'cave',
  'water',
  'volcano',
  'peak',
  'desert',
  'grove',
  'marsh',
  'faeveldt',
  'canyon',
  'sanctum',
  'atoll',
  'reef',
  'highlands',
  'ruins',
  'crater',
  'rift',
];

const FALLBACK_BIOME_WARP_POINTS = {
  village: { x: 8, y: 15, dir: 'down' },
  forest: { x: 4, y: 5, dir: 'up' },
  cave: { x: 21, y: 5, dir: 'right' },
  water: { x: 15, y: 31, dir: 'down' },
  volcano: { x: 39, y: 11, dir: 'up' },
  peak: { x: 47, y: 23, dir: 'down' },
  grove: { x: 25, y: 44, dir: 'up' },
  desert: { x: 56, y: 16, dir: 'down' },
  marsh: { x: 13, y: 55, dir: 'down' },
  sanctum: { x: 46, y: 53, dir: 'right' },
  canyon: { x: 73, y: 17, dir: 'down' },
  reef: { x: 16, y: 64, dir: 'down' },
  ruins: { x: 51, y: 64, dir: 'down' },
  rift: { x: 78, y: 42, dir: 'down' },
  faeveldt: { x: 90, y: 14, dir: 'right' },
  atoll: { x: 25, y: 77, dir: 'down' },
  highlands: { x: 60, y: 77, dir: 'down' },
  crater: { x: 88, y: 46, dir: 'down' },
};

function extractSortedPartyLevels(mons) {
  return mons
    .map((mon) => {
      if (!mon || typeof mon !== 'object') return NaN;
      const raw = mon.level;
      if (isInvalidNumericInput(raw) || (typeof raw === 'string' && raw.trim() === '')) return NaN;
      return Number(raw);
    })
    .filter((lv) => Number.isFinite(lv) && lv > 0)
    .map((lv) => Math.max(1, Math.min(50, Math.round(lv))))
    .sort((a, b) => b - a);
}

/**
 * Compute the party's effective farming level (1..50), preferring healthy team
 * members before falling back to fainted members, or normalize a scalar level.
 */
export function getPartyFarmingLevel(profileOrLevel = null) {
  if (typeof profileOrLevel === 'number') {
    if (profileOrLevel === -Infinity) return 1;
    if (profileOrLevel === Infinity) return 50;
    if (!Number.isFinite(profileOrLevel)) return 5;
    return Math.max(1, Math.min(50, Math.round(profileOrLevel)));
  }

  const rawTeam = Array.isArray(profileOrLevel)
    ? profileOrLevel
    : (profileOrLevel && typeof profileOrLevel === 'object' && Array.isArray(profileOrLevel.team)
      ? profileOrLevel.team
      : null);

  if (!rawTeam) return 5;

  const validMons = rawTeam.filter((mon) => mon && typeof mon === 'object');
  const healthyMons = validMons.filter((mon) => {
    if (mon.isFainted) return false;
    if (mon.hp === undefined || mon.hp === null) return true;
    return !isInvalidNumericInput(mon.hp) && Number.isFinite(Number(mon.hp)) && Number(mon.hp) > 0;
  });

  let levels = extractSortedPartyLevels(healthyMons);
  if (levels.length === 0) {
    levels = extractSortedPartyLevels(validMons);
  }
  if (levels.length === 0) return 5;
  if (levels.length === 1) return levels[0];
  return Math.max(1, Math.min(50, Math.round(0.68 * levels[0] + 0.32 * levels[1])));
}

function fallbackGetBiomeWarpPoint(biomeId) {
  const biome = (BIOMES && BIOMES[biomeId]) || BIOMES.forest;
  const preset = FALLBACK_BIOME_WARP_POINTS[biome.id];
  if (
    preset
    && (typeof Config.isTileWalkableAt !== 'function' || Config.isTileWalkableAt(preset.x, preset.y))
    && (typeof Config.getBiomeAt !== 'function' || Config.getBiomeAt(preset.x, preset.y)?.id === biome.id)
  ) {
    return { biomeId: biome.id, x: preset.x, y: preset.y, dir: preset.dir || 'down' };
  }
  const rows = Number(Config.WORLD_ROWS) || 0;
  const cols = Number(Config.WORLD_COLS) || 0;
  if (typeof Config.isTileWalkableAt === 'function' && typeof Config.getBiomeAt === 'function') {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (Config.isTileWalkableAt(x, y) && Config.getBiomeAt(x, y)?.id === biome.id) {
          return { biomeId: biome.id, x, y, dir: preset?.dir || 'down' };
        }
      }
    }
  }
  const safe = typeof Config.findNearestSafePosition === 'function'
    ? Config.findNearestSafePosition(preset?.x ?? 8, preset?.y ?? 15, preset?.dir || 'down')
    : { x: 8, y: 15, dir: 'down' };
  return { biomeId: biome.id, x: safe.x, y: safe.y, dir: safe.dir || 'down' };
}

function hasUnclearedShrineInBiome(biomeId, clearedSet) {
  if (!clearedSet || !SHRINES) return false;
  return Object.values(SHRINES).some(
    (shrine) => shrine && shrine.biome === biomeId && shrine.id && !clearedSet.has(shrine.id),
  );
}

function fallbackResolveFarmingBiomeForLevel(playerLevel, profile = null, scaledTarget = playerLevel) {
  const order = Array.isArray(Config.FARMING_BIOME_ORDER) && Config.FARMING_BIOME_ORDER.length > 0
    ? Config.FARMING_BIOME_ORDER
    : FALLBACK_FARMING_BIOME_ORDER;
  const farmingOrder = order.filter((id) => id !== 'village');
  const hasShrinesCleared = Boolean(
    profile && (Array.isArray(profile.shrinesCleared) || profile.shrinesCleared instanceof Set),
  );
  const clearedSet = hasShrinesCleared ? new Set(profile.shrinesCleared) : null;

  const evals = farmingOrder
    .map((id) => {
      const biome = BIOMES[id];
      if (!biome || !Array.isArray(biome.levelRange) || biome.levelRange.length < 2) return null;
      const scaled = getBiomeScaledRange(id, scaledTarget);
      const { baseMin, baseMax, minLv, maxLv, threatTone } = scaled;
      const safeThreat = threatTone !== 'veteran' && threatTone !== 'apex';
      const safeCap = maxLv <= Math.max(7, playerLevel + 4) && minLv <= Math.max(2, playerLevel + 1);
      const inActual = minLv <= playerLevel && playerLevel <= maxLv;
      const inBase = baseMin <= playerLevel && playerLevel <= baseMax;
      const actualMid = (minLv + maxLv) / 2;
      const baseMid = (baseMin + baseMax) / 2;
      const score = Math.abs(playerLevel - actualMid) * 1.2
        + Math.abs(playerLevel - baseMid) * 0.8
        + (threatTone === 'balanced' ? 0 : 0.6);
      return {
        biomeId: id,
        biome,
        scaled,
        safeThreat,
        safeCap,
        inActual,
        inBase,
        score,
      };
    })
    .filter(Boolean);

  let pool = evals.filter((e) => e.safeThreat && e.safeCap && e.inActual);
  if (pool.length === 0) pool = evals.filter((e) => e.safeThreat && e.safeCap);
  if (pool.length === 0) pool = evals.filter((e) => e.safeThreat);
  if (pool.length === 0) pool = evals;

  const nativeMatches = pool.filter((e) => e.inBase);
  if (nativeMatches.length > 0) {
    pool = nativeMatches;
  }

  const sortEvalPool = (list) => [...list].sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-6) return a.score - b.score;
    if (hasShrinesCleared) {
      const rankA = hasUnclearedShrineInBiome(a.biomeId, clearedSet) ? 0 : 1;
      const rankB = hasUnclearedShrineInBiome(b.biomeId, clearedSet) ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
    }
    return farmingOrder.indexOf(a.biomeId) - farmingOrder.indexOf(b.biomeId);
  });

  const sorted = sortEvalPool(pool);
  let picked = sorted[0];

  const recentWarpBiomes = Array.isArray(profile?.recentWarpBiomes)
    ? profile.recentWarpBiomes.filter((id) => typeof id === 'string' && id !== 'village')
    : [];
  if (recentWarpBiomes.length > 0 && picked) {
    const recentSet = new Set(recentWarpBiomes);
    const bestScore = picked.score;
    const searchPool = playerLevel >= 28
      ? sortEvalPool(evals.filter((e) => e.safeThreat && e.safeCap && e.inActual && e.scaled.threatTone === 'balanced'))
      : sorted;
    const rotated = searchPool.find((e) => (
      !recentSet.has(e.biomeId)
      && e.safeThreat
      && e.safeCap
      && e.scaled.threatTone === 'balanced'
      && (playerLevel >= 28 || Math.abs(e.score - bestScore) <= 4.5)
    ));
    if (rotated) {
      picked = rotated;
    }
  }
  const pickedBiome = picked?.biome || BIOMES.forest;
  const clamped = playerLevel < 2 ? 'low' : (playerLevel > 36 ? 'high' : null);
  const warp = typeof Config.getBiomeWarpPoint === 'function'
    ? Config.getBiomeWarpPoint(pickedBiome.id)
    : fallbackGetBiomeWarpPoint(pickedBiome.id);

  return {
    biomeId: pickedBiome.id,
    biome: pickedBiome,
    playerLevel,
    targetLevel: playerLevel,
    levelRange: [...pickedBiome.levelRange],
    minLv: picked?.scaled?.minLv ?? pickedBiome.levelRange[0],
    maxLv: picked?.scaled?.maxLv ?? pickedBiome.levelRange[1],
    x: warp.x,
    y: warp.y,
    dir: warp.dir || 'down',
    clamped,
  };
}

/**
 * Resolve the recommended wild farming biome, scaled level range, threat
 * metadata, and walkable landing warp coordinates for a trainer profile or level.
 */
export function resolveRecommendedFarmingZone(profileOrLevel = null) {
  const playerLevel = getPlayerLevel(profileOrLevel);
  const isProfile = Boolean(profileOrLevel) && typeof profileOrLevel === 'object' && !Array.isArray(profileOrLevel);
  const profile = isProfile ? profileOrLevel : null;
  const hasExplicitProgression = hasExplicitProgressionData(profile);
  const scaledTarget = isProfile
    ? (hasExplicitProgression ? profile : { ...profile, playerLevel })
    : playerLevel;

  const hasModernWorldResolver = typeof Config.resolveFarmingBiomeForLevel === 'function'
    && typeof Config.getPlayerLevel === 'function';
  const resolved = hasModernWorldResolver
    ? Config.resolveFarmingBiomeForLevel(playerLevel, isProfile ? scaledTarget : null, { getScaledRange: getBiomeScaledRange })
    : fallbackResolveFarmingBiomeForLevel(playerLevel, profile, scaledTarget);

  const biomeId = resolved?.biomeId
    && resolved.biomeId !== 'village'
    && Object.prototype.hasOwnProperty.call(BIOMES, resolved.biomeId)
    ? resolved.biomeId
    : 'forest';
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const clamped = resolved?.clamped !== undefined
    ? resolved.clamped
    : (playerLevel < 2 ? 'low' : (playerLevel > 36 ? 'high' : null));

  const scaled = getBiomeScaledRange(biomeId, scaledTarget);
  const warp = (typeof Config.getBiomeWarpPoint === 'function' ? Config.getBiomeWarpPoint(biomeId) : null)
    || (Number.isFinite(resolved?.x) && Number.isFinite(resolved?.y)
      ? { biomeId, x: resolved.x, y: resolved.y, dir: resolved.dir || 'down' }
      : fallbackGetBiomeWarpPoint(biomeId));

  return {
    biomeId,
    biome,
    playerLevel,
    partyLevel: playerLevel,
    baseMin: scaled.baseMin,
    baseMax: scaled.baseMax,
    minLv: scaled.minLv,
    maxLv: scaled.maxLv,
    threatLabel: scaled.threatLabel,
    threatTone: scaled.threatTone,
    isScaled: scaled.isScaled,
    clamped,
    x: warp.x,
    y: warp.y,
    dir: warp.dir || 'down',
  };
}

export function getBiomeScaledRange(biomeId, profile = null) {
  const biome = BIOMES[biomeId] || BIOMES.forest;
  const [rawMin, rawMax] = Array.isArray(biome?.levelRange) ? biome.levelRange : [2, 7];
  const baseMin = Math.max(1, Math.min(50, Math.round(rawMin)));
  const baseMax = Math.max(baseMin, Math.min(50, Math.round(rawMax)));
  const tierOffset = getBiomeScalingOffset(biomeId);

  const isProfileObj = Boolean(profile) && typeof profile === 'object' && !Array.isArray(profile);
  const hasExplicitProgression = hasExplicitProgressionData(profile);
  const badgesCount = isProfileObj && Array.isArray(profile.badges) ? profile.badges.length : 0;
  const playerLevel = isProfileObj
    ? getPlayerLevel(profile)
    : (typeof profile === 'number' ? getPlayerLevel(profile) : 1);
  const power = isProfileObj ? getTrainerPowerLevel(profile) : playerLevel;
  const anchor = isProfileObj
    ? (hasExplicitProgression || badgesCount === 0 ? playerLevel : power)
    : playerLevel;

  let minLv = baseMin;
  let maxLv = baseMax;
  const shouldScale = (profile !== null && profile !== undefined)
    && biomeId !== 'village'
    && !(badgesCount === 0 && anchor <= baseMax);

  if (shouldScale) {
    const center = Math.round(anchor) + tierOffset;
    const scaledMax = Math.max(baseMax, Math.min(50, center + 2));
    const scaledMin = Math.max(baseMin, Math.min(scaledMax - 2, center - 3));
    minLv = Math.max(1, scaledMin);
    maxLv = Math.max(minLv, scaledMax);
  }

  const isScaled = minLv !== baseMin || maxLv !== baseMax;
  const threatRef = (biomeId === 'forest' && !isScaled) ? Math.max(anchor, 5) : anchor;
  const delta = maxLv - threatRef;
  let threatLabel = 'Balanced';
  let threatTone = 'balanced';
  if (biomeId !== 'village') {
    if (delta > 10.5) {
      threatLabel = 'Apex';
      threatTone = 'apex';
    } else if (delta > 6) {
      threatLabel = 'Veteran';
      threatTone = 'veteran';
    } else if (delta > 3.5) {
      threatLabel = 'Challenging';
      threatTone = 'challenging';
    }
  }

  return {
    minLv,
    maxLv,
    baseMin,
    baseMax,
    tierOffset,
    anchor,
    playerLevel,
    threatLabel,
    threatTone,
    isScaled,
  };
}

function isSeenInProfile(profile, speciesId) {
  if (!profile || typeof profile !== 'object') return false;
  if (isCaughtInProfile(profile, speciesId)) return true;
  const seenList = profile.pokedex?.seen;
  if (!seenList) return false;
  if (Array.isArray(seenList)) {
    return seenList.some((id) => Number(id) === speciesId);
  }
  if (seenList instanceof Set) {
    return seenList.has(speciesId);
  }
  if (typeof seenList === 'object') {
    const val = seenList[speciesId];
    return val === true || (!isInvalidNumericInput(val) && Number.isFinite(Number(val)) && Number(val) > 0);
  }
  return false;
}

function isCaughtInProfile(profile, speciesId) {
  if (!profile || typeof profile !== 'object') return false;
  const caughtMap = profile.pokedex?.caught;
  if (!caughtMap) return false;
  if (Array.isArray(caughtMap)) return caughtMap.includes(speciesId);
  const val = caughtMap[speciesId];
  return val === true || (Number.isFinite(Number(val)) && Number(val) > 0);
}

function sanitizeEncounterHistory(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const rawId of list) {
    const numId = Number(rawId);
    if (Number.isInteger(numId) && SPECIES[numId]) {
      out.push(numId);
    }
  }
  return out.slice(-MAX_RECENT_ENCOUNTERS);
}

export function rollWildPokemon(biomeId, avgTeamLevelOrProfile = 5, options = {}) {
  const biome = BIOMES[biomeId];
  if (!biome || !biome.encounters.length) return null;

  const isProfile = typeof avgTeamLevelOrProfile === 'object' && avgTeamLevelOrProfile !== null;
  const profile = isProfile ? avgTeamLevelOrProfile : null;
  const badgesCount = Array.isArray(profile?.badges) ? profile.badges.length : 0;
  const isRarePatch = Boolean(options?.isRarePatch);
  const disableAntiRepeat = options?.disableAntiRepeat === true;
  const rawDepth = options?.depthTier;
  const depthTier = (
    rawDepth !== null
    && rawDepth !== undefined
    && rawDepth !== ''
    && typeof rawDepth !== 'boolean'
    && Number.isFinite(Number(rawDepth))
  )
    ? Math.max(0, Math.min(2, Math.floor(Number(rawDepth))))
    : 0;
  const isNoviceOutskirts = depthTier === 0 && badgesCount === 0;
  const toughCutoff = BALANCE.scaling.noviceOutskirtsCatchFactorCutoff;
  const toughWeightMult = BALANCE.scaling.noviceOutskirtsToughWeightMult;

  const recentHistory = isProfile && Array.isArray(profile.recentEncounters)
    ? sanitizeEncounterHistory(profile.recentEncounters)
    : sanitizeEncounterHistory(recentWildEncounters);

  const weightedPool = biome.encounters.map((entry) => {
    const speciesCatchFactor = Number(SPECIES[entry.id]?.catchFactor);
    const isNoviceBruiser = isNoviceOutskirts
      && Number.isFinite(speciesCatchFactor)
      && speciesCatchFactor < toughCutoff;

    // Skip rare-patch inverse weighting for tough bruisers in 0-badge outskirts so
    // rare nodes stay welcoming instead of spiking low-weight heavy hitters.
    let weight = isRarePatch && !isNoviceBruiser
      ? Math.max(1, Math.round(1000 / Math.max(4, entry.weight)))
      : entry.weight;

    if (isNoviceBruiser) {
      weight = Math.max(1, weight * toughWeightMult);
    }

    return {
      id: entry.id,
      weight,
    };
  });

  if (isProfile && profile?.shrinesCleared) {
    const clearedList = Array.isArray(profile.shrinesCleared)
      ? profile.shrinesCleared
      : (profile.shrinesCleared instanceof Set ? [...profile.shrinesCleared] : []);
    const cleared = new Set(clearedList);
    const appendRoamer = (speciesId, baseWeight) => {
      if (!SPECIES[speciesId]) return;
      weightedPool.push({
        id: speciesId,
        weight: isRarePatch ? Math.max(1, Math.round(1000 / Math.max(4, baseWeight))) : baseWeight,
      });
    };
    if (biomeId === 'volcano') {
      if (cleared.has('volcano_shrine')) appendRoamer(146, 5);
      if (cleared.has('thunder_shrine')) appendRoamer(145, 5);
    } else if (biomeId === 'peak') {
      if (cleared.has('peak_shrine')) appendRoamer(144, 5);
      if (cleared.has('starlight_shrine')) appendRoamer(151, 4);
    } else if (biomeId === 'grove') {
      if (cleared.has('grove_shrine')) appendRoamer(385, 4);
    } else if (biomeId === 'desert') {
      if (cleared.has('desert_shrine')) appendRoamer(248, 5);
    } else if (biomeId === 'marsh') {
      if (cleared.has('marsh_shrine')) appendRoamer(251, 4);
    } else if (biomeId === 'sanctum') {
      if (cleared.has('sanctum_shrine')) {
        appendRoamer(384, 4);
        appendRoamer(249, 4);
      }
    } else if (biomeId === 'canyon') {
      if (cleared.has('canyon_shrine')) {
        appendRoamer(243, 5);
        appendRoamer(244, 4);
      }
    } else if (biomeId === 'reef') {
      if (cleared.has('reef_shrine')) {
        appendRoamer(382, 5);
        appendRoamer(245, 4);
      }
    } else if (biomeId === 'ruins') {
      if (cleared.has('ruins_shrine')) {
        appendRoamer(483, 5);
        appendRoamer(486, 4);
      }
    } else if (biomeId === 'rift') {
      if (cleared.has('rift_shrine')) {
        appendRoamer(493, 4);
        appendRoamer(150, 5);
        appendRoamer(250, 4);
        appendRoamer(643, 4);
        appendRoamer(644, 4);
        appendRoamer(649, 4);
      }
    } else if (biomeId === 'faeveldt') {
      if (cleared.has('faeveldt_shrine')) {
        appendRoamer(717, 5);
        appendRoamer(718, 4);
        appendRoamer(719, 4);
        appendRoamer(720, 4);
        appendRoamer(721, 4);
      }
    } else if (biomeId === 'atoll') {
      if (cleared.has('atoll_shrine')) {
        appendRoamer(792, 5);
        appendRoamer(800, 4);
        appendRoamer(801, 4);
        appendRoamer(802, 4);
        appendRoamer(807, 4);
        appendRoamer(808, 4);
      }
    } else if (biomeId === 'highlands') {
      if (cleared.has('highlands_shrine')) {
        appendRoamer(889, 5);
        appendRoamer(890, 4);
        appendRoamer(893, 4);
        appendRoamer(898, 4);
        appendRoamer(905, 4);
      }
    } else if (biomeId === 'crater') {
      if (cleared.has('crater_shrine')) {
        appendRoamer(1007, 5);
        appendRoamer(1008, 5);
        appendRoamer(1009, 4);
        appendRoamer(1010, 4);
        appendRoamer(1017, 4);
        appendRoamer(1025, 4);
      }
    }
  }

  const isMysteryCry = options?.nodeKind === 'mystery_cry';
  for (const entry of weightedPool) {
    if (isProfile) {
      const caught = isCaughtInProfile(profile, entry.id);
      const seen = caught || isSeenInProfile(profile, entry.id);
      if (isMysteryCry) {
        if (!seen) entry.weight *= 3.0;
        if (!caught) entry.weight *= 1.8;
      } else if (!caught) {
        entry.weight *= 1.35;
      }
    }
    entry.baseWeight = entry.weight;
  }

  const distinctSpeciesCount = new Set(weightedPool.map((entry) => entry.id)).size;
  const prevSpeciesId = recentHistory.length > 0 ? recentHistory[recentHistory.length - 1] : null;
  const priorRecentSet = new Set(
    recentHistory.slice(-Math.min(12, Math.max(1, distinctSpeciesCount - 2)), -1),
  );

  if (!disableAntiRepeat && distinctSpeciesCount > 1) {
    for (const entry of weightedPool) {
      if (prevSpeciesId !== null && entry.id === prevSpeciesId) {
        entry.weight = 0;
      } else if (priorRecentSet.has(entry.id)) {
        entry.weight *= 0.08;
      }
    }

    const postWeightTotal = weightedPool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (postWeightTotal <= 0) {
      for (const entry of weightedPool) {
        if (entry.baseWeight > 0 && (prevSpeciesId === null || entry.id !== prevSpeciesId)) {
          entry.weight = 1;
        }
      }
      const fallbackTotal = weightedPool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (fallbackTotal <= 0) {
        for (const entry of weightedPool) {
          if (entry.baseWeight > 0) entry.weight = 1;
        }
      }
    }
  }

  const totalWeight = weightedPool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  const positiveEntries = weightedPool.filter((entry) => entry.weight > 0);
  let pickedId = (positiveEntries[0] || weightedPool[0]).id;
  if (totalWeight > 0) {
    let roll = Math.random() * totalWeight;
    for (const entry of weightedPool) {
      if (entry.weight <= 0) continue;
      roll -= entry.weight;
      if (roll <= 0) {
        pickedId = entry.id;
        break;
      }
    }
  }

  recentWildEncounters = [...recentWildEncounters, pickedId].slice(-MAX_RECENT_ENCOUNTERS);
  if (isProfile) {
    profile.recentEncounters = [...recentHistory, pickedId].slice(-MAX_RECENT_ENCOUNTERS);
  }

  let minLv;
  let maxLv;
  let targetCenter;
  if (isProfile) {
    const scaledRange = getBiomeScaledRange(biomeId, profile);
    minLv = scaledRange.minLv;
    maxLv = scaledRange.maxLv;
    const anchor = scaledRange.anchor ?? getPlayerLevel(profile);
    targetCenter = scaledRange.isScaled
      ? Math.max(minLv, Math.min(maxLv, Math.round(anchor + scaledRange.tierOffset)))
      : Math.max(minLv, Math.min(maxLv, Math.round(anchor <= minLv ? minLv + 1 : anchor)));
  } else {
    [minLv, maxLv] = biome.levelRange;
    const avgLv = Number.isFinite(Number(avgTeamLevelOrProfile)) ? Number(avgTeamLevelOrProfile) : 5;
    targetCenter = Math.max(minLv, Math.min(maxLv, Math.round(avgLv * 0.85)));
  }

  const maxLvCap = BALANCE.progression.maxLevel;
  let isElite = false;
  const allowRareElite = isRarePatch && badgesCount >= BALANCE.scaling.noviceRarePatchMinBadgesForElite;
  const allowGrassElite = badgesCount >= 2;
  if (typeof options?.forceElite === 'boolean') {
    isElite = options.forceElite;
  } else if (allowRareElite || allowGrassElite) {
    const eliteChance = allowRareElite
      ? (badgesCount >= 4 ? BALANCE.scaling.wildRareEliteChanceHigh : BALANCE.scaling.wildRareEliteChanceLow)
      : Math.min(
          BALANCE.scaling.wildEliteChanceCap,
          BALANCE.scaling.wildEliteBaseChance + badgesCount * BALANCE.scaling.wildEliteBadgeStep,
        );
    isElite = Math.random() < eliteChance;
  }

  let upgradeTier = 0;
  if (options?.upgradeTier !== undefined && options?.upgradeTier !== null && Number.isFinite(Number(options.upgradeTier))) {
    upgradeTier = normalizeUpgradeTier(options.upgradeTier);
  } else if (isElite) {
    const maxEliteTier = badgesCount >= 5 ? 3 : (badgesCount >= 2 || isRarePatch ? 2 : 1);
    upgradeTier = 1 + Math.floor(Math.random() * maxEliteTier);
  }

  const depthBoost = depthTier === 1
    ? 1 + Math.floor(Math.random() * 2)
    : (depthTier >= 2 ? 2 + Math.floor(Math.random() * 3) : 0);

  const rareBoost = isRarePatch ? 1 + Math.floor(Math.random() * 2) : 0;
  const eliteBoost = isElite ? 1 : 0;
  const levelBonus = !isInvalidNumericInput(options?.levelBonus) && Number.isFinite(Number(options?.levelBonus))
    ? Math.round(Number(options.levelBonus))
    : 0;
  const rawStackedBonus = rareBoost + eliteBoost + depthBoost + Math.max(0, levelBonus);
  const cappedBonus = Math.min(BALANCE.scaling.wildMaxBonusAboveRange, rawStackedBonus);
  const maxAllowed = Math.min(maxLvCap, maxLv + cappedBonus);
  const effectiveMin = Math.max(1, Math.min(maxLvCap, Math.round(minLv)));
  const effectiveMax = Math.max(effectiveMin, Math.min(maxLvCap, Math.round(maxAllowed)));
  const effectiveDepthShift = Math.min(depthBoost, cappedBonus);
  const nonDepthPositiveBonus = Math.max(0, cappedBonus - effectiveDepthShift);
  const centerBonus = levelBonus < 0
    ? Math.min(nonDepthPositiveBonus, rareBoost + eliteBoost) + levelBonus
    : Math.min(nonDepthPositiveBonus, rareBoost + eliteBoost + levelBonus);
  const rawCenter = targetCenter + centerBonus;
  const preDepthMax = Math.max(
    effectiveMin,
    Math.min(effectiveMax, Math.round(maxLv + nonDepthPositiveBonus)),
  );
  const clampedCenter = Math.max(effectiveMin, Math.min(preDepthMax, rawCenter));
  const biomeLevelHistory = Array.isArray(recentWildLevels[biomeId]) ? recentWildLevels[biomeId] : [];
  const prevWildLevel = biomeLevelHistory.length > 0 ? biomeLevelHistory[biomeLevelHistory.length - 1] : null;

  const buildLevelWindow = (radius) => {
    const out = [];
    for (let d = -radius; d <= radius; d += 1) {
      const lv = Math.max(effectiveMin, Math.min(preDepthMax, clampedCenter + d));
      if (!out.includes(lv)) out.push(lv);
    }
    return out;
  };

  let baseSpan = Math.max(
    effectiveMin,
    Math.min(preDepthMax, rawCenter + Math.floor(Math.random() * 3) - 1),
  );
  const predictsFinal = (lv) => Math.max(1, Math.min(effectiveMax, lv + effectiveDepthShift));

  if (!disableAntiRepeat && preDepthMax > effectiveMin) {
    const recentLvSet = new Set(biomeLevelHistory.slice(-3));
    const window1 = buildLevelWindow(1);
    const window2 = buildLevelWindow(2);
    const fullRange = [];
    for (let lv = effectiveMin; lv <= preDepthMax; lv += 1) {
      fullRange.push(lv);
    }

    const notInRecent1 = window1.filter((lv) => {
      const res = predictsFinal(lv);
      return res !== prevWildLevel && !recentLvSet.has(res);
    });
    const notInRecent2 = window2.filter((lv) => {
      const res = predictsFinal(lv);
      return res !== prevWildLevel && !recentLvSet.has(res);
    });
    const nonPrev1 = window1.filter((lv) => predictsFinal(lv) !== prevWildLevel);
    const nonPrevAll = fullRange.filter((lv) => predictsFinal(lv) !== prevWildLevel);

    let levelPool = null;
    if (notInRecent1.length > 0) {
      levelPool = notInRecent1;
    } else if (notInRecent2.length > 0) {
      levelPool = notInRecent2;
    } else if (nonPrev1.length > 0) {
      levelPool = nonPrev1;
    } else if (nonPrevAll.length > 0) {
      levelPool = nonPrevAll;
    }

    if (levelPool && levelPool.length > 0) {
      baseSpan = levelPool[Math.floor(Math.random() * levelPool.length)];
    }
  }

  const finalLevel = predictsFinal(baseSpan);
  recentWildLevels[biomeId] = [...biomeLevelHistory, finalLevel].slice(-3);

  const shinyChance = isRarePatch ? 1 / 6 : 0.05;
  const isShiny = options?.forceShiny !== undefined ? Boolean(options.forceShiny) : Math.random() < shinyChance;

  let encounterTrait = null;
  if (options?.encounterTrait !== undefined) {
    encounterTrait = normalizeEncounterTrait(options.encounterTrait);
  } else if (isElite || depthTier === 2) {
    encounterTrait = 'apex';
  } else {
    const traitRoll = Math.random();
    if (isRarePatch) {
      if (traitRoll < 0.34) encounterTrait = 'curious';
      else if (traitRoll < 0.67) encounterTrait = 'treasure';
      else encounterTrait = 'spirited';
    } else if (traitRoll < 0.18) {
      encounterTrait = 'curious';
    } else if (traitRoll < 0.36) {
      encounterTrait = 'treasure';
    } else if (traitRoll < 0.54) {
      encounterTrait = 'spirited';
    }
  }

  return createPokemon(pickedId, finalLevel, biomeId, {
    isShiny,
    upgradeTier,
    isElite,
    encounterTrait,
  });
}

export function getScaledShrineGuard(shrine, profile = null) {
  const guardianId = Number(shrine?.guardianId) || 25;
  const maxLv = BALANCE.progression.maxLevel;
  const baseLevel = Math.max(1, Math.min(maxLv, Number(shrine?.level) || 7));
  let level = baseLevel;
  let upgradeTier = 0;

  if (profile) {
    const power = getTrainerPowerLevel(profile);
    const badgesCount = Array.isArray(profile?.badges) ? profile.badges.length : 0;
    const targetLevel = Math.round(power + BALANCE.scaling.shrineGuardMaxOffsetAbovePower);
    level = Math.max(baseLevel, Math.min(maxLv, targetLevel));

    if (level > baseLevel || badgesCount >= 4) {
      const tierCap = Math.min(MAX_UPGRADE_TIER, BALANCE.scaling.shrineGuardMaxTier);
      upgradeTier = Math.min(
        tierCap,
        Math.max(1, Math.floor(Math.max(0, level - baseLevel) / 8) + Math.floor(badgesCount / 6)),
      );
    }
  }

  const result = { guardianId, level, upgradeTier };
  if (shrine?.id === 'forest_shrine' && upgradeTier === 0 && level <= 6) {
    result.moveIds = ['thunder_shock', 'quick_attack', 'spark_dash'];
  }
  return result;
}

const SHRINE_TRIAL_ROAMERS_BY_BIOME = {
  forest: [251, 385, 151, 492, 640],
  cave: [150, 377, 379, 488, 719],
  water: [245, 382, 249, 490],
  volcano: [146, 145, 244, 383, 485],
  peak: [144, 151, 384, 380, 381],
  grove: [385, 251, 151, 492, 716],
  desert: [248, 383, 377, 639, 718],
  marsh: [251, 385, 491, 488, 647],
  sanctum: [384, 249, 150, 250, 381],
  canyon: [243, 244, 145, 642],
  reef: [382, 245, 249, 490],
  ruins: [483, 486, 484, 487, 379],
  rift: [493, 150, 250, 643, 644, 649],
  faeveldt: [717, 718, 719, 720, 721],
  atoll: [792, 800, 801, 802, 807, 808],
  highlands: [889, 890, 893, 898, 905],
  crater: [1007, 1008, 1009, 1010, 1017, 1025],
};

const FALLBACK_SHRINE_TRIAL_LEGENDARIES = [144, 145, 146, 150, 151, 243, 244, 245];

export function getScaledShrineTrial(shrine, profile = null) {
  const baseGuardId = Number(shrine?.guardianId);
  const biomeRoamers = SHRINE_TRIAL_ROAMERS_BY_BIOME[shrine?.biome] || [];
  const poolSet = new Set();
  if (Number.isInteger(baseGuardId) && SPECIES[baseGuardId]) {
    poolSet.add(baseGuardId);
  }
  for (const id of biomeRoamers) {
    if (SPECIES[id]) poolSet.add(id);
  }
  for (const id of FALLBACK_SHRINE_TRIAL_LEGENDARIES) {
    if (poolSet.size >= 4) break;
    if (SPECIES[id]) poolSet.add(id);
  }
  const pool = [...poolSet];

  const maxLv = BALANCE.progression.maxLevel;
  const trialCount = toSafeNonNegInt(profile?.shrineTrialCounts?.[shrine?.id]);
  const guardianId = pool[(trialCount + 1) % pool.length];
  const rawShrineLv = shrine?.level;
  const shrineBaseLv = !isInvalidNumericInput(rawShrineLv) && Number.isFinite(Number(rawShrineLv))
    ? Math.max(1, Math.min(maxLv, Math.round(Number(rawShrineLv))))
    : 10;
  const power = profile ? Math.round(getTrainerPowerLevel(profile)) : shrineBaseLv;
  const baseOffset = BALANCE.scaling.shrineTrialBaseOffset;
  const countBonus = Math.min(BALANCE.scaling.shrineTrialMaxCountBonus, trialCount);
  const level = Math.min(
    maxLv,
    Math.max(shrineBaseLv + baseOffset, power + baseOffset + countBonus),
  );
  const trialTierCap = Math.min(MAX_UPGRADE_TIER, BALANCE.scaling.shrineTrialMaxTier);
  const upgradeTier = Math.min(
    trialTierCap,
    Math.max(2, Math.floor(level / 12) + (trialCount >= 2 ? 1 : 0)),
  );

  return {
    guardianId,
    level,
    upgradeTier,
    isElite: true,
    trialNumber: trialCount + 1,
  };
}

function evolveSpeciesForLevel(speciesId, targetLevel) {
  let currentId = Number(speciesId);
  const visited = new Set([currentId]);
  while (visited.size < 4) {
    const rules = EVOLUTIONS[currentId];
    if (!Array.isArray(rules) || rules.length === 0) break;
    const match = rules.find(
      (rule) => Number.isFinite(Number(rule?.minLevel)) && targetLevel >= Number(rule.minLevel) && SPECIES[rule.to],
    );
    if (!match || visited.has(Number(match.to))) break;
    currentId = Number(match.to);
    visited.add(currentId);
  }
  return currentId;
}

export function getScaledRivalParty(rival, profile = null) {
  const rawParty = Array.isArray(rival?.party) && rival.party.length > 0
    ? rival.party
    : [{ speciesId: 25, level: 6 }];

  const maxLv = BALANCE.progression.maxLevel;
  const rivalTierCap = Math.min(MAX_UPGRADE_TIER, BALANCE.scaling.rivalMaxTier);
  const computeRematchBoost = (rc) => (
    BALANCE.scaling.rivalRematchBaseBoost
    + Math.min(BALANCE.scaling.rivalRematchMaxCountBonus, rc)
  );

  const isRematch = Boolean(profile?.rivalsDefeated?.includes(rival?.id));
  const rematchCount = isRematch ? toSafeNonNegInt(profile?.rivalRematchCounts?.[rival?.id]) : 0;
  const rematchBoost = isRematch ? computeRematchBoost(rematchCount) : 0;
  const power = profile ? getTrainerPowerLevel(profile) : 5;
  const badgesCount = Array.isArray(profile?.badges) ? profile.badges.length : 0;

  const validRematchPool = Array.isArray(rival?.rematchPool)
    ? [...new Set(rival.rematchPool.map(Number).filter((id) => Number.isInteger(id) && Boolean(SPECIES[id])))]
    : [];

  if (isRematch && validRematchPool.length >= 3) {
    const aceEntry = rawParty[rawParty.length - 1];
    const aceBaseId = Number(aceEntry?.speciesId ?? aceEntry?.id);
    const aceBaseLv = !isInvalidNumericInput(aceEntry?.level) && Number.isFinite(Number(aceEntry?.level))
      ? Math.max(1, Math.min(maxLv, Math.round(Number(aceEntry.level))))
      : 6;
    const firstRawId = Number(rawParty[0]?.speciesId ?? rawParty[0]?.id);
    const maxRotatedSize = validRematchPool.length <= 3 ? 3 : 4;

    const buildPartyForCount = (rcVal, prevParty = null) => {
      const rBoost = computeRematchBoost(rcVal);
      const desiredSize = rawParty.length <= 2
        ? (rawParty.length === 2 && rcVal === 0 ? 2 : Math.min(4, rcVal >= 2 ? 4 : 3))
        : Math.min(4, rcVal >= 1 ? 4 : 3);
      const partySize = Math.max(2, Math.min(desiredSize, maxRotatedSize));

      const aceTargetLv = Math.round(power + rBoost + 1);
      const aceLevel = Math.min(maxLv, Math.max(Math.min(maxLv, aceBaseLv + rBoost), Math.min(maxLv, aceTargetLv)));
      const aceSpeciesId = SPECIES[aceBaseId] ? evolveSpeciesForLevel(aceBaseId, aceLevel) : validRematchPool[0];

      const supportCount = partySize - 1;
      const rawLeadLv = rawParty[0]?.level;
      const minBaseSupportLv = !isInvalidNumericInput(rawLeadLv) && Number.isFinite(Number(rawLeadLv))
        ? Math.max(1, Math.min(maxLv, Math.round(Number(rawLeadLv))))
        : Math.max(1, aceBaseLv - (partySize - 1));
      const avgSupportLv = Math.min(
        maxLv,
        Math.max(minBaseSupportLv + rBoost, Math.round(power + rBoost - 1)),
      );
      const eligiblePool = [];
      const seenEligibleEvolved = new Set([aceSpeciesId]);
      for (const candBaseId of validRematchPool) {
        const approxEvolved = evolveSpeciesForLevel(candBaseId, avgSupportLv);
        if (seenEligibleEvolved.has(approxEvolved)) continue;
        seenEligibleEvolved.add(approxEvolved);
        eligiblePool.push(candBaseId);
      }
      const rotationPool = eligiblePool.length >= supportCount ? eligiblePool : validRematchPool;
      const baseShift = rcVal % rotationPool.length;

      const buildAttempt = (shiftOffset) => {
        const shift = (baseShift + shiftOffset) % rotationPool.length;
        const picked = [];
        const usedSpecies = new Set([aceSpeciesId]);

        for (let pass = 0; pass < 2 && picked.length < supportCount; pass += 1) {
          for (let k = 0; k < rotationPool.length && picked.length < supportCount; k += 1) {
            const candBaseId = rotationPool[(shift + k) % rotationPool.length];
            const slotIdx = picked.length;
            const rawSlot = rawParty[Math.min(slotIdx, rawParty.length - 1)];
            const rawSlotLv = rawSlot?.level;
            const baseLv = !isInvalidNumericInput(rawSlotLv) && Number.isFinite(Number(rawSlotLv))
              ? Math.max(1, Math.min(maxLv, Math.round(Number(rawSlotLv))))
              : Math.max(1, aceBaseLv - (partySize - 1 - slotIdx));
            const slotOffset = -(partySize - 1 - slotIdx);
            const targetLv = Math.round(power + rBoost + slotOffset);
            const level = Math.min(maxLv, Math.max(Math.min(maxLv, baseLv + rBoost), Math.min(maxLv, targetLv)));
            const evolvedId = evolveSpeciesForLevel(candBaseId, level);

            if (usedSpecies.has(evolvedId)) continue;
            if (pass === 0 && slotIdx === 0 && rcVal === 0 && evolvedId === firstRawId && rotationPool.length > supportCount) continue;

            usedSpecies.add(evolvedId);
            const delta = Math.max(0, level - baseLv);
            const upgradeTier = Math.min(
              rivalTierCap,
              Math.max(delta >= 2 ? 1 : 0, Math.floor(delta / 7) + Math.floor(badgesCount / 6) + (rcVal >= 2 ? 1 : 0)),
            );
            picked.push({ speciesId: evolvedId, level, upgradeTier });
          }
        }

        const aceDelta = Math.max(0, aceLevel - aceBaseLv);
        const aceTier = Math.min(
          rivalTierCap,
          Math.max(aceDelta >= 2 ? 1 : 0, Math.floor(aceDelta / 7) + Math.floor(badgesCount / 6) + (rcVal >= 2 ? 1 : 0)),
        );
        picked.push({ speciesId: aceSpeciesId, level: aceLevel, upgradeTier: aceTier });
        return picked;
      };

      let best = buildAttempt(0);
      if (prevParty) {
        const prevLead = prevParty[0]?.speciesId;
        const prevSig = prevParty.map((m) => m.speciesId).join(',');
        for (let offset = 0; offset < rotationPool.length; offset += 1) {
          const cand = buildAttempt(offset);
          const candSig = cand.map((m) => m.speciesId).join(',');
          if (cand[0]?.speciesId !== prevLead && candSig !== prevSig) {
            best = cand;
            break;
          }
        }
      }
      return best;
    };

    const startRc = Math.max(0, rematchCount - 12);
    let currentParty = null;
    for (let r = startRc; r <= rematchCount; r += 1) {
      currentParty = buildPartyForCount(r, currentParty);
    }
    return currentParty;
  }

  return rawParty
    .map((entry, idx) => {
      const rawSpeciesId = Number(entry?.speciesId ?? entry?.id);
      if (!SPECIES[rawSpeciesId]) return null;

      const baseLv = Math.max(1, Math.min(maxLv, Number(entry?.level) || 6));
      if (!profile) {
        return { speciesId: rawSpeciesId, level: baseLv, upgradeTier: 0 };
      }

      const slotOffset = idx === rawParty.length - 1 ? 1 : -(rawParty.length - 1 - idx);
      const targetLv = Math.round(power + rematchBoost + slotOffset);
      const level = Math.max(Math.min(maxLv, baseLv + rematchBoost), Math.min(maxLv, targetLv));
      const speciesId = isRematch ? evolveSpeciesForLevel(rawSpeciesId, level) : rawSpeciesId;

      const delta = Math.max(0, level - baseLv);
      let upgradeTier = 0;
      if (isRematch || delta >= 4 || badgesCount >= 4) {
        const minRematchTier = isRematch && delta >= 2 ? 1 : 0;
        upgradeTier = Math.min(
          rivalTierCap,
          Math.max(minRematchTier, Math.floor(delta / 7) + Math.floor(badgesCount / 6)),
        );
      }

      return { speciesId, level, upgradeTier };
    })
    .filter(Boolean);
}

export function getBattleShardReward(enemy, options = {}) {
  const {
    isShrine = false,
    isTrainer = false,
    caught = false,
    includeTraitBonus = true,
  } = options || {};
  const rawTier = isInvalidNumericInput(enemy?.upgradeTier) ? NaN : Number(enemy.upgradeTier);
  const tier = Number.isFinite(rawTier) ? Math.max(0, Math.min(MAX_UPGRADE_TIER, Math.floor(rawTier))) : 0;
  const rawLevel = isInvalidNumericInput(enemy?.level) ? NaN : Number(enemy.level);
  const level = Number.isFinite(rawLevel) ? Math.max(1, Math.min(50, Math.floor(rawLevel))) : 1;
  const isElite = Boolean(enemy?.isElite);

  let reward = 1;
  if (isShrine) {
    reward = 3 + (tier >= 2 || level >= 20 ? 1 : 0);
  } else if (isTrainer) {
    reward = 2 + (tier >= 2 || level >= 20 ? 1 : 0);
  } else if (isElite) {
    reward = 3 + (tier >= 3 ? 1 : 0);
  } else if (level >= 20 || tier >= 1) {
    reward = 2;
  }

  if (caught && (isElite || level >= 15)) {
    reward += 1;
  }

  const traitId = options?.encounterTrait ?? enemy?.encounterTrait ?? null;
  if (!isTrainer && includeTraitBonus && traitId && ENCOUNTER_TRAITS?.[traitId]?.shardBonus) {
    reward += ENCOUNTER_TRAITS[traitId].shardBonus;
  }

  return Math.max(1, Math.round(reward));
}

export function getTypeEffectiveness(moveType, defenderType) {
  const table = TYPE_CHART[moveType];
  if (!table) return 1;
  return table[defenderType] ?? 1;
}

const PINCH_ABILITY_IDS = new Set(['overgrow', 'blaze', 'torrent', 'swarm_resonance']);
const TYPE_BOOST_ABILITY_IDS = new Set([
  'storm_conduit',
  'dune_titan',
  'mystic_prism',
  'shadow_cloak',
  'dragon_heart',
  'aurora_cloak',
  'pixilate_aura',
]);

export function evaluateOffensiveAbility(attacker, move) {
  const ability = getPokemonAbility(attacker);
  if (!ability || ability.trigger !== 'attack' || !move) return null;

  if (ability.id === 'champion_spirit') {
    if (move.damageClass !== 'physical') return null;
    const hp = Number(attacker?.hp);
    const maxHp = Number(attacker?.maxHp);
    const isPinch = Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp > 0 && hp <= maxHp * 0.5;
    const mult = isPinch ? 1.3 : 1.2;
    return {
      abilityId: ability.id,
      ability,
      mult,
      summary: isPinch ? 'Valor +30%' : 'Valor +20%',
    };
  }

  if (!move.type || move.type !== ability.type) return null;

  if (ability.id === 'nectar_siphon') {
    return {
      abilityId: ability.id,
      ability,
      mult: 1.15,
      drainRatio: 0.2,
      summary: 'Grass +15% & Drain!',
    };
  }

  if (ability.id === 'toxic_alchemy') {
    return {
      abilityId: ability.id,
      ability,
      mult: 1.15,
      drainRatio: 0.2,
      summary: 'Poison +15% & Drain!',
    };
  }

  if (ability.id === 'rail_overload') {
    return {
      abilityId: ability.id,
      ability,
      mult: 1.2,
      critBonus: 0.15,
      summary: 'Electric +20%',
    };
  }

  if (ability.id === 'supreme_overlord') {
    return {
      abilityId: ability.id,
      ability,
      mult: 1.2,
      critBonus: 0.15,
      summary: 'Dark +20%',
    };
  }

  let mult = 1;
  if (PINCH_ABILITY_IDS.has(ability.id)) {
    const hp = Number(attacker?.hp);
    const maxHp = Number(attacker?.maxHp);
    const isPinch = Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp > 0 && hp <= maxHp * 0.5;
    mult = isPinch ? 1.35 : 1.2;
  } else if (TYPE_BOOST_ABILITY_IDS.has(ability.id)) {
    mult = 1.2;
  } else {
    return null;
  }

  const typeLabel = TYPES[move.type]?.label || move.type;
  return {
    abilityId: ability.id,
    ability,
    mult,
    summary: `${typeLabel} +${Math.round((mult - 1) * 100)}%`,
  };
}

export function evaluateDefensiveAbility(defender, move, effectiveness = 1) {
  const ability = getPokemonAbility(defender);
  if (!ability || ability.trigger !== 'defense') return null;

  if (ability.id === 'permafrost' && (move?.type === 'fire' || move?.type === 'ice')) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      summary: '-25% Damage',
    };
  }

  if (ability.id === 'magma_armor' && (move?.type === 'grass' || move?.type === 'ice' || move?.type === 'fire')) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      summary: '-25% Damage',
    };
  }

  if (ability.id === 'fossil_bastion' && Number(effectiveness) > 1) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      summary: 'Relic -25%',
    };
  }

  if (ability.id === 'phantom_mirage' && (move?.type === 'normal' || move?.type === 'psychic' || move?.type === 'rock')) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      counterBoostStat: 'spd',
      summary: '-25% & SPD +1!',
    };
  }

  if (ability.id === 'stamina_earth' && (move?.type === 'electric' || move?.type === 'poison' || move?.type === 'rock')) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      counterBoostStat: 'def',
      summary: '-25% & DEF +1!',
    };
  }

  if (
    ability.id === 'corviknight_armor'
    && (
      move?.type === 'fighting'
      || move?.type === 'rock'
      || move?.type === 'fairy'
      || move?.type === 'bug'
      || move?.type === 'steel'
    )
  ) {
    return {
      abilityId: ability.id,
      ability,
      mult: 0.75,
      summary: '-25% Damage',
    };
  }

  if (ability.id === 'prism_scales') {
    const hp = Number(defender?.hp);
    const maxHp = Number(defender?.maxHp);
    if (Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0 && hp >= maxHp) {
      return {
        abilityId: ability.id,
        ability,
        mult: 0.7,
        summary: '-30% Damage',
      };
    }
  }

  return null;
}

export function calculateDamage(attacker, defender, move, options = {}) {
  const rawMaxHp = isInvalidNumericInput(attacker?.maxHp) ? NaN : Number(attacker.maxHp);
  const safeMaxHp = Number.isFinite(rawMaxHp) && rawMaxHp > 0 ? rawMaxHp : 20;

  if (move?.category === 'heal') {
    const heal = Math.max(8, Math.round(safeMaxHp * 0.38));
    return {
      category: 'heal',
      heal,
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      missed: false,
      composureCapped: false,
      attackerAbilityTrigger: null,
      defenderAbilityTrigger: null,
    };
  }

  if (move?.category === 'buff') {
    const buffStages = !isInvalidNumericInput(move.buffStages) && Number.isFinite(Number(move.buffStages))
      ? Number(move.buffStages)
      : 1;
    return {
      category: 'buff',
      buffStat: ['atk', 'def', 'spd'].includes(move.buffStat) ? move.buffStat : 'atk',
      buffStages,
      grantShield: false,
      heal: 0,
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      missed: false,
      composureCapped: false,
      attackerAbilityTrigger: null,
      defenderAbilityTrigger: null,
    };
  }

  if (move?.category === 'shield') {
    const buffStages = !isInvalidNumericInput(move.buffStages) && Number.isFinite(Number(move.buffStages))
      ? Number(move.buffStages)
      : 1;
    return {
      category: 'shield',
      buffStat: ['atk', 'def', 'spd'].includes(move.buffStat) ? move.buffStat : 'def',
      buffStages,
      grantShield: true,
      heal: Math.max(4, Math.round(safeMaxHp * 0.12)),
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      missed: false,
      composureCapped: false,
      attackerAbilityTrigger: null,
      defenderAbilityTrigger: null,
    };
  }

  const accuracy = !isInvalidNumericInput(move?.accuracy) && Number.isFinite(Number(move.accuracy))
    ? Math.max(0, Math.min(100, Number(move.accuracy)))
    : 100;
  const hitRoll = options.forceHit === true ? 0 : options.forceHit === false ? 999 : Math.random() * 100;
  if (hitRoll > accuracy) {
    return {
      category: 'attack',
      heal: 0,
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      missed: true,
      composureCapped: false,
      attackerAbilityTrigger: null,
      defenderAbilityTrigger: null,
    };
  }

  const combatCfg = BALANCE.combat;
  const applyAbilities = options?.applyAbilities === true;
  let attackerAbilityTrigger = applyAbilities ? evaluateOffensiveAbility(attacker, move) : null;

  const stab = attacker?.type && move?.type && attacker.type === move.type ? combatCfg.stabMult : 1;
  const rawEff = getTypeEffectiveness(move?.type, defender?.type);
  const effectiveness = Number.isFinite(Number(rawEff)) && Number(rawEff) >= 0 ? Number(rawEff) : 1;
  const effDamageMult = resolveEffectivenessDamageMult(effectiveness);
  const abilityCritBonus = Number.isFinite(Number(attackerAbilityTrigger?.critBonus))
    ? Number(attackerAbilityTrigger.critBonus)
    : 0;
  const critChance = combatCfg.critBaseChance + getBondTier(attacker?.bond).critBonus + abilityCritBonus;
  const isCrit = options.forceCrit !== undefined ? Boolean(options.forceCrit) : Math.random() < critChance;
  const critMult = isCrit ? combatCfg.critMult : 1;
  const variance = !isInvalidNumericInput(options.fixedVariance)
    && Number.isFinite(Number(options.fixedVariance))
    && Number(options.fixedVariance) > 0
    ? Number(options.fixedVariance)
    : combatCfg.varianceMin + Math.random() * (combatCfg.varianceMax - combatCfg.varianceMin);

  const rawAtk = typeof attacker?.getEffectiveAtk === 'function' ? attacker.getEffectiveAtk() : attacker?.atk;
  const rawDef = typeof defender?.getEffectiveDef === 'function' ? defender.getEffectiveDef() : defender?.def;

  const safeLv = !isInvalidNumericInput(attacker?.level) && Number.isFinite(Number(attacker.level))
    ? Math.max(1, Number(attacker.level))
    : 1;
  const safeAtk = !isInvalidNumericInput(rawAtk) && Number.isFinite(Number(rawAtk))
    ? Math.max(1, Number(rawAtk))
    : 1;
  const safeDef = !isInvalidNumericInput(rawDef) && Number.isFinite(Number(rawDef))
    ? Math.max(1, Number(rawDef))
    : 1;
  const safePower = !isInvalidNumericInput(move?.power) && Number.isFinite(Number(move.power))
    ? Math.max(0, Number(move.power))
    : 0;

  const statRatio = softenStatRatio(safeAtk, safeDef);
  const basePower = (((2 * safeLv) / 5 + 2) * safePower * statRatio) / combatCfg.damageDivisor;
  const shieldMult = (Number(defender?.shieldTurns) || 0) > 0 ? combatCfg.shieldMult : 1;

  const defenderAbilityTrigger = applyAbilities ? evaluateDefensiveAbility(defender, move, effectiveness) : null;
  const attackerAbMult = Number.isFinite(Number(attackerAbilityTrigger?.mult)) ? Number(attackerAbilityTrigger.mult) : 1;
  const defenderAbMult = Number.isFinite(Number(defenderAbilityTrigger?.mult)) ? Number(defenderAbilityTrigger.mult) : 1;
  const traitId = options?.encounterTrait ?? (options?.applyEncounterTraits === true ? attacker?.encounterTrait : null);
  const traitDmgMult = traitId === 'apex'
    ? BALANCE.scaling.apexTraitDamageMult
    : (traitId && ENCOUNTER_TRAITS?.[traitId]?.dmgMult ? ENCOUNTER_TRAITS[traitId].dmgMult : 1);

  const offenseMult = applyOffenseSoftCap(stab * effDamageMult * critMult * attackerAbMult * traitDmgMult);
  const preComposureDamage = Math.max(
    1,
    Math.round(basePower * offenseMult * variance * shieldMult * defenderAbMult),
  );
  const safeRawDamage = Number.isFinite(preComposureDamage) ? preComposureDamage : 1;
  const { damage, composureCapped } = applyComposureGuardrail(safeRawDamage, attacker, defender, options);

  if (attackerAbilityTrigger && attackerAbilityTrigger.drainRatio) {
    attackerAbilityTrigger = {
      ...attackerAbilityTrigger,
      drainHeal: Math.max(1, Math.round(damage * attackerAbilityTrigger.drainRatio)),
    };
  }

  return {
    category: 'attack',
    heal: 0,
    damage,
    effectiveness,
    isCrit,
    missed: false,
    composureCapped: Boolean(composureCapped),
    attackerAbilityTrigger,
    defenderAbilityTrigger,
  };
}

export function calculateCatchAttempt(wildPokemon, ballBonus = 1.0, options = {}) {
  const rawMaxHp = isInvalidNumericInput(wildPokemon?.maxHp) ? NaN : Number(wildPokemon.maxHp);
  const safeMaxHp = Number.isFinite(rawMaxHp) && rawMaxHp > 0 ? rawMaxHp : 1;
  const rawHp = isInvalidNumericInput(wildPokemon?.hp) ? NaN : Number(wildPokemon.hp);
  const clampedHp = Number.isFinite(rawHp) ? Math.max(0, Math.min(safeMaxHp, rawHp)) : safeMaxHp;
  const hpRatio = clampedHp / safeMaxHp;

  const rawFactor = isInvalidNumericInput(wildPokemon?.species?.catchFactor)
    ? NaN
    : Number(wildPokemon.species.catchFactor);
  const factor = Number.isFinite(rawFactor) && rawFactor > 0 ? rawFactor : 0.78;
  const rawBonus = isInvalidNumericInput(ballBonus) ? NaN : Number(ballBonus);
  const safeBonus = Number.isFinite(rawBonus) && rawBonus > 0 ? rawBonus : 1.0;
  const traitId = options?.encounterTrait ?? wildPokemon?.encounterTrait ?? null;
  const traitCatchMult = traitId && ENCOUNTER_TRAITS?.[traitId]?.catchMult ? ENCOUNTER_TRAITS[traitId].catchMult : 1.0;

  const raw = (1 - 0.68 * hpRatio) * factor * safeBonus * traitCatchMult;
  const chance = raw <= 0.82
    ? Math.max(0.08, raw)
    : Math.min(0.995, 0.82 + 0.175 * (1 - Math.exp(-(raw - 0.82) * 1.8)));

  const caught = Math.random() < chance;
  const shakes = caught ? 3 : Math.min(3, 1 + Math.floor(Math.random() * 2) + (Math.random() < 0.35 ? 1 : 0));
  return { caught, shakes, chance };
}

export const SPECIES_ARCHETYPES = [
  'biped',
  'quadruped',
  'winged',
  'serpentine',
  'aquatic',
  'insectoid',
  'draconic',
  'construct',
  'amorphous',
  'flora',
];

const ARCHETYPE_CODE_TABLE =
  '99900600055555522211223300111101100011002299955551111440011440000000999447771144772224488448883004477991100088100904444440500051434811117444420222336009991114441122555524400002221109440499909954411248781553031145550108811444242114117100000010111666228999000444111155555999999222200055990005550000047118077700110055988444411180066699221388444477995543808888981888444433446667777776641380999000444222145511199000055555144994408800821181177000286660001155009444990700900251101707887888661768448900999110444101111100000088222117772210000044400555555999941101095500288442288101000088822888990559944455997773338888866600755400677771222215666551192066164850001000000022255511999110010077720804470444400661110078367999911221237812221104442221055500255114441155999910109999005588411706084671007777871285577767708670087000000000002225551199111111777921332440055008890000000800888045570001160647446116000771101504042100001200115555100001199927170004022111099995995522000332447713791121144401130109857777777006773114676661988002076661118';

const TYPE_FALLBACK_ARCHETYPE = {
  bug: 'insectoid',
  flying: 'winged',
  water: 'aquatic',
  grass: 'flora',
  dragon: 'draconic',
  steel: 'construct',
  ghost: 'amorphous',
  poison: 'amorphous',
  ground: 'quadruped',
  rock: 'construct',
  fighting: 'biped',
  dark: 'quadruped',
  fairy: 'biped',
  psychic: 'amorphous',
  electric: 'quadruped',
  fire: 'quadruped',
  ice: 'aquatic',
  normal: 'biped',
};

export function resolveSpeciesArchetype(speciesOrId) {
  let species = null;
  if (typeof speciesOrId === 'number' || typeof speciesOrId === 'string') {
    species = SPECIES[Number(speciesOrId)] || null;
  } else if (speciesOrId && typeof speciesOrId === 'object') {
    if (speciesOrId.species && speciesOrId.species.id) {
      species = speciesOrId.species;
    } else {
      const numId = Number(speciesOrId.speciesId ?? speciesOrId.id);
      species = Number.isInteger(numId) && SPECIES[numId] ? SPECIES[numId] : speciesOrId;
    }
  }

  const numId = Number(species?.id);
  if (Number.isInteger(numId) && numId >= 1 && numId <= ARCHETYPE_CODE_TABLE.length) {
    const code = Number(ARCHETYPE_CODE_TABLE[numId - 1]);
    if (SPECIES_ARCHETYPES[code]) {
      return SPECIES_ARCHETYPES[code];
    }
  }
  return TYPE_FALLBACK_ARCHETYPE[species?.type] || 'biped';
}

function escapeXmlText(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildArchetypeSilhouetteBody(archetype, fill, back) {
  const face = back
    ? '<path d="M37 33 L48 23 L59 33" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>'
    : '<circle cx="38" cy="45" r="4.6" fill="#090d1a"/><circle cx="58" cy="45" r="4.6" fill="#090d1a"/><circle cx="36.5" cy="43.4" r="1.7" fill="#ffffff"/><circle cx="56.5" cy="43.4" r="1.7" fill="#ffffff"/><path d="M43 55 Q48 59 53 55" fill="none" stroke="#090d1a" stroke-width="2.5" stroke-linecap="round"/>';

  switch (archetype) {
    case 'quadruped':
      return `<path d="M22 44 L14 26 L32 34 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.2" stroke-linejoin="round"/><path d="M70 48 Q84 36 80 24 Q70 30 68 42 Z" fill="${fill}" stroke="#090d1a" stroke-width="3"/><rect x="20" y="34" width="52" height="36" rx="18" fill="${fill}" stroke="#090d1a" stroke-width="3.6"/><rect x="24" y="64" width="10" height="14" rx="4" fill="${fill}" stroke="#090d1a" stroke-width="3"/><rect x="58" y="64" width="10" height="14" rx="4" fill="${fill}" stroke="#090d1a" stroke-width="3"/>${face}`;
    case 'winged':
      return `<path d="M26 52 Q8 32 14 18 Q30 24 34 40 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.2" stroke-linejoin="round"/><path d="M70 52 Q88 32 82 18 Q66 24 62 40 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="48" cy="48" rx="20" ry="24" fill="${fill}" stroke="#090d1a" stroke-width="3.6"/><path d="M44 16 L48 25 L52 16 Z" fill="#ffffff" stroke="#090d1a" stroke-width="2.2"/>${face}`;
    case 'serpentine':
      return `<path d="M24 72 C14 58, 28 46, 48 52 C66 57, 74 42, 66 28 C58 16, 36 18, 34 32 C32 44, 48 48, 58 40" fill="none" stroke="#090d1a" stroke-width="20" stroke-linecap="round"/><path d="M24 72 C14 58, 28 46, 48 52 C66 57, 74 42, 66 28 C58 16, 36 18, 34 32 C32 44, 48 48, 58 40" fill="none" stroke="${fill}" stroke-width="13" stroke-linecap="round"/><circle cx="48" cy="34" r="15" fill="${fill}" stroke="#090d1a" stroke-width="3.4"/>${face}`;
    case 'aquatic':
      return `<path d="M68 48 L86 34 L82 48 L86 62 Z" fill="${fill}" stroke="#090d1a" stroke-width="3" stroke-linejoin="round"/><path d="M44 16 L54 29 L38 29 Z" fill="${fill}" stroke="#090d1a" stroke-width="3" stroke-linejoin="round"/><ellipse cx="45" cy="49" rx="25" ry="20" fill="${fill}" stroke="#090d1a" stroke-width="3.6"/><path d="M26 57 Q45 64 64 57" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.65"/>${face}`;
    case 'insectoid':
      return `<path d="M38 26 Q30 12 22 14" fill="none" stroke="#090d1a" stroke-width="3" stroke-linecap="round"/><path d="M58 26 Q66 12 74 14" fill="none" stroke="#090d1a" stroke-width="3" stroke-linecap="round"/><ellipse cx="22" cy="46" rx="11" ry="16" transform="rotate(-18 22 46)" fill="${fill}" stroke="#090d1a" stroke-width="3"/><ellipse cx="74" cy="46" rx="11" ry="16" transform="rotate(18 74 46)" fill="${fill}" stroke="#090d1a" stroke-width="3"/><rect x="27" y="25" width="42" height="48" rx="21" fill="${fill}" stroke="#090d1a" stroke-width="3.6"/><path d="M28 56 H68" stroke="#090d1a" stroke-width="2.6"/>${face}`;
    case 'draconic':
      return `<path d="M26 44 L10 22 L28 32 Z" fill="${fill}" stroke="#090d1a" stroke-width="3" stroke-linejoin="round"/><path d="M70 44 L86 22 L68 32 Z" fill="${fill}" stroke="#090d1a" stroke-width="3" stroke-linejoin="round"/><path d="M35 28 L30 12 L43 24 Z" fill="#fef08a" stroke="#090d1a" stroke-width="2.6" stroke-linejoin="round"/><path d="M61 28 L66 12 L53 24 Z" fill="#fef08a" stroke="#090d1a" stroke-width="2.6" stroke-linejoin="round"/><rect x="24" y="26" width="48" height="48" rx="20" fill="${fill}" stroke="#090d1a" stroke-width="3.8"/>${face}`;
    case 'construct':
      return `<rect x="44" y="13" width="8" height="13" rx="3" fill="${fill}" stroke="#090d1a" stroke-width="2.8"/><circle cx="19" cy="48" r="8" fill="${fill}" stroke="#090d1a" stroke-width="3"/><circle cx="77" cy="48" r="8" fill="${fill}" stroke="#090d1a" stroke-width="3"/><polygon points="32,24 64,24 72,38 72,62 64,74 32,74 24,62 24,38" fill="${fill}" stroke="#090d1a" stroke-width="3.6" stroke-linejoin="round"/><rect x="31" y="39" width="34" height="13" rx="6" fill="#090d1a" opacity="0.22"/>${face}`;
    case 'amorphous':
      return `<circle cx="22" cy="30" r="5" fill="${fill}" stroke="#090d1a" stroke-width="2.4"/><circle cx="74" cy="28" r="4" fill="${fill}" stroke="#090d1a" stroke-width="2.4"/><path d="M22 54 C21 31, 35 18, 48 18 C61 18, 75 31, 74 54 C74 68, 69 77, 60 72 C54 68, 51 77, 48 77 C45 77, 42 68, 36 72 C27 77, 22 68, 22 54 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.6" stroke-linejoin="round"/>${face}`;
    case 'flora':
      return `<path d="M48 10 C58 20, 58 30, 48 35 C38 30, 38 20, 48 10 Z" fill="${fill}" stroke="#090d1a" stroke-width="3"/><path d="M22 30 Q34 26 36 38 Q22 42 22 30 Z" fill="${fill}" stroke="#090d1a" stroke-width="3"/><path d="M74 30 Q62 26 60 38 Q74 42 74 30 Z" fill="${fill}" stroke="#090d1a" stroke-width="3"/><rect x="24" y="30" width="48" height="45" rx="22" fill="${fill}" stroke="#090d1a" stroke-width="3.6"/>${face}`;
    case 'biped':
    default:
      return `<path d="M27 32 L18 14 L38 24 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.5" stroke-linejoin="round"/><path d="M69 32 L78 14 L58 24 Z" fill="${fill}" stroke="#090d1a" stroke-width="3.5" stroke-linejoin="round"/><rect x="22" y="23" width="52" height="52" rx="24" fill="${fill}" stroke="#090d1a" stroke-width="4"/><rect x="25" y="26" width="46" height="46" rx="21" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.7"/>${face}`;
  }
}

export function generateSilhouetteDataUri(species, back = false) {
  const fill = species?.color || '#38bdf8';
  const name = escapeXmlText((species?.name || 'Mystery').slice(0, 11));
  const archetype = resolveSpeciesArchetype(species);
  const body = buildArchetypeSilhouetteBody(archetype, fill, back);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" data-archetype="${archetype}"><ellipse cx="48" cy="83" rx="26" ry="6" fill="rgba(2,6,23,0.45)"/>${body}<text x="48" y="90" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle" fill="#ffffff" stroke="#090d1a" stroke-width="2.8" paint-order="stroke">${name}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const resolvedSpriteCache = new Map();

export function attachPokemonSprite(imgEl, speciesOrMon, options = {}) {
  if (!imgEl) return Promise.resolve();
  const { back = false, timeoutMs = 2000 } = options || {};

  let species = null;
  let inferredShiny = false;
  if (speciesOrMon && typeof speciesOrMon === 'object') {
    inferredShiny = Boolean(speciesOrMon.isShiny);
    if (speciesOrMon.species && speciesOrMon.species.id) {
      species = speciesOrMon.species;
    } else if (speciesOrMon.speciesId !== undefined) {
      species = SPECIES[Number(speciesOrMon.speciesId)] || null;
    } else if (speciesOrMon.id !== undefined) {
      species = SPECIES[Number(speciesOrMon.id)] || speciesOrMon;
    }
  } else if (speciesOrMon !== undefined && speciesOrMon !== null) {
    species = SPECIES[Number(speciesOrMon)] || null;
  }

  const shiny = Boolean(options?.shiny ?? inferredShiny);
  imgEl.classList.toggle('is-shiny-sprite', shiny);

  const inlineFallback = generateSilhouetteDataUri(species || null, back);

  if (!species) {
    imgEl.alt = 'Wild Pokémon';
    imgEl.onload = null;
    imgEl.onerror = null;
    imgEl.src = inlineFallback;
    return Promise.resolve();
  }

  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  imgEl.dataset.loadToken = token;
  imgEl.alt = species.name;

  const nextSpeciesKey = `${species.id}:${back ? 'back' : 'front'}:${shiny ? 'shiny' : 'std'}`;
  if (resolvedSpriteCache.has(nextSpeciesKey)) {
    const cachedUrl = resolvedSpriteCache.get(nextSpeciesKey);
    imgEl.dataset.speciesKey = nextSpeciesKey;
    imgEl.onload = null;
    imgEl.onerror = () => {
      resolvedSpriteCache.delete(nextSpeciesKey);
      imgEl.onerror = null;
      imgEl.src = inlineFallback;
    };
    imgEl.src = cachedUrl;
    return Promise.resolve();
  }

  const urls = getSpriteUrls(species.id, back, shiny);
  const safeType = TYPES?.[species.type] ? species.type : 'normal';
  const localSvg = `./assets/fallback/${safeType}.svg`;
  const totalBudgetMs = Math.max(50, Number(timeoutMs) || 2000);
  const animatedBudgetMs = Math.max(25, Math.round(totalBudgetMs * 0.45));
  const candidateUrls = [
    urls?.animated,
    urls?.static,
    ...(Array.isArray(urls?.fallbacks) ? urls.fallbacks : []),
  ].filter((url, idx, arr) => typeof url === 'string' && url.length > 0 && arr.indexOf(url) === idx);
  const tailCount = Math.max(1, candidateUrls.length - 1);
  const tailPerStepCap = Math.max(20, Math.round((totalBudgetMs - animatedBudgetMs) / tailCount));
  const remoteCandidates = candidateUrls.map((url, idx) => ({
    url,
    capMs: idx === 0
      ? animatedBudgetMs
      : (idx === candidateUrls.length - 1 ? null : tailPerStepCap),
  }));

  let placeholderErrored = false;
  // Immediately render local fallback sprite when empty or switching species so images never flash blank or stale
  if (!imgEl.getAttribute('src') || imgEl.dataset.speciesKey !== nextSpeciesKey) {
    imgEl.dataset.speciesKey = nextSpeciesKey;
    imgEl.onerror = () => {
      placeholderErrored = true;
      imgEl.onerror = null;
      imgEl.src = inlineFallback;
    };
    imgEl.src = localSvg;
  }

  return new Promise((resolve) => {
    let settled = false;
    const startTime = Date.now();

    const abortStale = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const finishSuccess = (loadedUrl) => {
      if (settled) return;
      settled = true;
      if (imgEl.dataset.loadToken === token) {
        if (/^https?:\/\//i.test(loadedUrl)) {
          resolvedSpriteCache.set(nextSpeciesKey, loadedUrl);
        }
        imgEl.onload = null;
        imgEl.onerror = () => {
          resolvedSpriteCache.delete(nextSpeciesKey);
          imgEl.onerror = null;
          imgEl.src = inlineFallback;
        };
        imgEl.src = loadedUrl;
      }
      resolve();
    };

    const finalizeAfterRemoteFailure = () => {
      if (settled) return;
      settled = true;
      if (imgEl.dataset.loadToken !== token) {
        resolve();
        return;
      }
      const currentSrc = imgEl.getAttribute('src') || '';
      if (placeholderErrored || currentSrc.startsWith('data:image/svg+xml')) {
        imgEl.onload = null;
        imgEl.onerror = null;
        if (!currentSrc.startsWith('data:image/svg+xml')) {
          imgEl.src = inlineFallback;
        }
        resolve();
        return;
      }
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        resolve();
        return;
      }
      imgEl.onload = null;
      imgEl.onerror = null;
      imgEl.src = inlineFallback;
      resolve();
    };

    const tryRemote = (stepIdx) => {
      if (imgEl.dataset.loadToken !== token) {
        abortStale();
        return;
      }
      if (stepIdx >= remoteCandidates.length) {
        finalizeAfterRemoteFailure();
        return;
      }

      const elapsed = Date.now() - startTime;
      const remaining = totalBudgetMs - elapsed;
      if (remaining <= 0) {
        finalizeAfterRemoteFailure();
        return;
      }

      const { url, capMs } = remoteCandidates[stepIdx];
      const probeBudgetMs = capMs === null ? remaining : Math.min(capMs, remaining);
      const target = typeof Image !== 'undefined' ? new Image() : imgEl;
      let probeDone = false;
      let probeTimer = null;

      const finishProbe = (succeeded) => {
        if (probeDone) return;
        probeDone = true;
        if (probeTimer !== null) {
          clearTimeout(probeTimer);
          probeTimer = null;
        }
        target.onload = null;
        target.onerror = null;
        if (imgEl.dataset.loadToken !== token) {
          abortStale();
          return;
        }
        if (succeeded) {
          finishSuccess(url);
        } else {
          tryRemote(stepIdx + 1);
        }
      };

      probeTimer = setTimeout(() => finishProbe(false), probeBudgetMs);
      target.onload = () => finishProbe(true);
      target.onerror = () => finishProbe(false);
      target.src = url;
    };

    tryRemote(0);
  });
}
