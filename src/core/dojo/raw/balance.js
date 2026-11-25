/**
 * Single source of truth for Pokémon: Starlight Island combat, progression,
 * XP rubber-banding, encounter scaling, overworld pacing, and readiness dials.
 *
 * Pure zero-dependency ES6 module — safe to import in browser and Node.
 */

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const prop of Object.values(value)) {
    if (prop && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
  return value;
}

function isInvalidNumeric(raw) {
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

function toPositiveNumber(raw, fallback = 1) {
  if (isInvalidNumeric(raw)) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toBoundedLevel(raw, fallback = 1, maxLevel = 50) {
  if (isInvalidNumeric(raw)) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(1, Math.min(maxLevel, Math.round(num)));
}

function formatTypeName(typeId) {
  if (typeof typeId !== 'string' || !typeId.trim()) return 'Counter';
  const clean = typeId.trim().toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function formatCounterList(types) {
  if (!Array.isArray(types) || types.length === 0) return '';
  if (types.length === 1) return formatTypeName(types[0]);
  return `${formatTypeName(types[0])}/${formatTypeName(types[1])}`;
}

/**
 * Frozen master balance table for Pokémon: Starlight Island.
 * Turn dials here rather than hardcoding magic numbers across modules.
 */
export const BALANCE = deepFreeze({
  /** Combat damage pacing, multiplier compression, mitigation, and anti-1-shot composure. */
  combat: {
    /** Base damage divisor; higher slows combat & increases turns-to-KO (TTK). */
    damageDivisor: 28,
    /** Exponent (<1) softening ATK/DEF stat gaps so glass cannons don't vaporize targets. */
    statRatioExponent: 0.78,
    /** Lower clamp for ATK/DEF ratio before exponentiation. */
    minStatRatio: 0.45,
    /** Upper clamp for ATK/DEF ratio before exponentiation. */
    maxStatRatio: 2.35,
    /** Same-Type Attack Bonus (STAB) multiplier. */
    stabMult: 1.2,
    /** Base critical hit probability before Bond and Ability bonuses (invariant: 0.08). */
    critBaseChance: 0.08,
    /** Critical hit damage multiplier. */
    critMult: 1.35,
    /** Effective damage multiplier applied when raw TYPE_CHART effectiveness is >= 2.0. */
    superEffectiveDamageMult: 1.65,
    /** Effective damage multiplier applied when raw TYPE_CHART effectiveness is > 1.0 and < 2.0 (e.g. 1.5). */
    mildSuperEffectiveMult: 1.35,
    /** Effective damage multiplier applied when raw TYPE_CHART effectiveness is > 0 and < 1.0 (e.g. 0.5). */
    resistedDamageMult: 0.6,
    /** Offensive multiplier knee above which extra stacked bonuses are compressed. */
    offenseSoftCapKnee: 2.2,
    /** Slope applied to offensive multiplier excess above `offenseSoftCapKnee` (strictly monotonic). */
    offenseSoftCapSlope: 0.45,
    /** Per-stage stat shift (+20% per positive stage, reciprocal for negative stages). */
    stageStep: 0.2,
    /** Minimum battle stat stage. */
    minStage: -4,
    /** Maximum battle stat stage. */
    maxStage: 4,
    /** Incoming damage multiplier while a Shield buff is active. */
    shieldMult: 0.68,
    /** Minimum random damage roll variance. */
    varianceMin: 0.92,
    /** Maximum random damage roll variance. */
    varianceMax: 1.08,
    /** Fraction of maxHp restored by a standard Potion. */
    potionHealRatio: 0.5,
    /** Minimum flat HP restored by a standard Potion. */
    potionMinHeal: 20,
    /** Full-HP opening hit guardrail preventing surprise turn-1 sweeps within fair level bands. */
    composure: {
      /** Master switch for full-HP composure capping when `options.applyComposure === true`. */
      enabled: true,
      /** Max fraction of player maxHp a single full-HP opening hit can deal up to `playerGapRampStart`. */
      playerFullHpMaxRatio: 0.72,
      /** Attacker-minus-defender level gap where player opening cap begins ramping toward `playerMaxRampRatio`. */
      playerGapRampStart: 4,
      /** Level gap ceiling beyond which composure turns off (truly reckless underleveling can 1-shot). */
      playerGapHardCap: 8,
      /** Max fraction of player maxHp at `levelGap === playerGapHardCap`. */
      playerMaxRampRatio: 0.88,
      /** Max fraction of non-boss enemy maxHp a full-HP opening hit can deal within `wildMaxLevelAdvantage`. */
      wildFullHpMaxRatio: 0.84,
      /** Max player level advantage over a wild foe where wild composure still protects against 1-shots. */
      wildMaxLevelAdvantage: 5,
      /** Max fraction of boss/shrine maxHp a full-HP opening hit can deal within `playerGapHardCap`. */
      bossFullHpMaxRatio: 0.65,
    },
  },

  /** Level ceiling, Star-Rank upgrade gains, and Trainer Power weighting. */
  progression: {
    /** Global Pokémon and Trainer level cap. */
    maxLevel: 50,
    /** Fractional stat bonus per Star-Rank upgrade tier (★5 = +20%). */
    upgradeStatBonusPerTier: 0.04,
    /** Fraction of `xpToNext` granted on each Star-Rank upgrade. */
    upgradeXpRatio: 0.45,
    /** Minimum XP granted on each Star-Rank upgrade. */
    upgradeMinXp: 25,
    /** Weights for top-3 party levels in `getTrainerPowerLevel` and `getPartyReadinessLevel`. */
    powerTopWeights: [0.5, 0.3, 0.2],
    /** Weights for 2-member party levels in `getTrainerPowerLevel` and `getPartyReadinessLevel`. */
    powerPairWeights: [0.65, 0.35],
    /** Power-level bonus granted per unlocked badge. */
    powerBadgeBonusPerBadge: 0.15,
    /** Maximum cumulative badge bonus added to Trainer Power Level. */
    powerBadgeBonusCap: 2.0,
  },

  /** Battle XP base curve, overlevel taper, underlevel catch-up, and bench XP sharing. */
  xp: {
    /** Multiplier per defeated/caught enemy level before flat base XP. */
    enemyLevelFactor: 11,
    /** Flat XP added to every battle base reward before scaling/modifiers. */
    baseFlat: 10,
    /** Minimum XP awarded to the active battler. */
    minActiveXp: 8,
    /** Minimum XP awarded to each eligible conscious bench teammate. */
    minBenchXp: 5,
    /** Fractional XP decay per level the active Pokémon exceeds the defeated enemy. */
    overlevelDecayPerLevel: 0.24,
    /** Minimum multiplier floor for heavily overleveled active Pokémon. */
    overlevelMinMult: 0.22,
    /** Fractional XP bonus per level the active Pokémon trails the defeated enemy. */
    underlevelBoostPerLevel: 0.14,
    /** Maximum multiplier cap for heavily underleveled active Pokémon. */
    underlevelMaxMult: 1.65,
    /** Baseline bench XP share ratio relative to active base XP. */
    benchBaseShare: 0.42,
    /** Extra bench share ratio per level a bench teammate trails the active battler. */
    benchCatchupPerLevel: 0.08,
    /** Maximum bench catch-up share ratio. */
    benchMaxShare: 0.78,
    /** Minimum bench share ratio when a bench teammate is >3 levels above the defeated enemy. */
    benchOverlevelMinShare: 0.2,
  },

  /** Biome level offsets, elite wild spawn rates, and Shrine/Trial/Rival caps. */
  scaling: {
    /** Per-biome scaling offset applied around the player's progression anchor. */
    biomeOffsets: {
      village: -2,
      forest: -1,
      cave: 0,
      water: 0,
      volcano: 0,
      desert: 0,
      peak: 1,
      grove: 1,
      marsh: 1,
      faeveldt: 1,
      canyon: 1,
      sanctum: 1,
      atoll: 1,
      reef: 1,
      highlands: 1,
      ruins: 1,
      crater: 1,
      rift: 1,
    },
    /** Maximum total stacked wild level bonus (rare + elite + depth + levelBonus) above biome `maxLv`. */
    wildMaxBonusAboveRange: 3,
    /** CatchFactor threshold below which species count as tough outskirts bruisers for 0-badge `depthTier === 0` spawns. */
    noviceOutskirtsCatchFactorCutoff: 0.73,
    /** Weight multiplier applied to tough outskirts bruisers during 0-badge `depthTier === 0` spawns (clamped `>= 1`). */
    noviceOutskirtsToughWeightMult: 0.25,
    /** Minimum badges required before rare grass patches roll random Elite wilds (`options.forceElite` still overrides). */
    noviceRarePatchMinBadgesForElite: 1,
    /** Base elite spawn probability in standard wild grass once badges >= 2. */
    wildEliteBaseChance: 0.06,
    /** Additional elite spawn probability per unlocked badge. */
    wildEliteBadgeStep: 0.012,
    /** Upper cap for non-rare-patch elite spawn probability. */
    wildEliteChanceCap: 0.18,
    /** Elite spawn probability on rare patches when badges < 4. */
    wildRareEliteChanceLow: 0.25,
    /** Elite spawn probability on rare patches when badges >= 4. */
    wildRareEliteChanceHigh: 0.32,
    /** Maximum level offset above Trainer Power Level for scaled Shrine Guardians. */
    shrineGuardMaxOffsetAbovePower: 1,
    /** Maximum Star-Rank upgrade tier for scaled Shrine Guardians. */
    shrineGuardMaxTier: 3,
    /** Base level offset above Trainer Power / Shrine base for Astral Shrine Trials. */
    shrineTrialBaseOffset: 1,
    /** Maximum extra level escalation from repeated Shrine Trial clears. */
    shrineTrialMaxCountBonus: 3,
    /** Maximum Star-Rank upgrade tier for Astral Shrine Trial bosses (min stays 2). */
    shrineTrialMaxTier: 4,
    /** Base level boost on Rival Rematches. */
    rivalRematchBaseBoost: 1,
    /** Maximum extra level escalation from repeated Rival Rematch clears. */
    rivalRematchMaxCountBonus: 3,
    /** Maximum Star-Rank upgrade tier for scaled Rival Trainer Pokémon. */
    rivalMaxTier: 3,
    /** Outgoing damage multiplier for wild Pokémon carrying the `apex` encounter trait. */
    apexTraitDamageMult: 1.08,
  },

  /** Overworld wild encounter pacing and grace steps after warps or escapes. */
  overworld: {
    /** Minimum tall-grass steps between consecutive wild encounters. */
    minStepsBetweenWilds: 5,
    /** Per-step wild encounter roll chance after cooldown steps expire. */
    wildEncounterChance: 0.19,
    /** Maximum dry-streak grass steps before guaranteeing a wild encounter. */
    maxEncounterStreak: 10,
    /** Grace steps after warping during which random wild encounters are suppressed. */
    postWarpGraceSteps: 3,
    /** Grace steps after escaping a battle during which random wild encounters are suppressed. */
    postEscapeGraceSteps: 3,
  },

  /** Thresholds powering encounter readiness badges and pre-battle briefing tips. */
  readiness: {
    /** `levelDelta` (`targetLevel - teamLevel`) at or below which an encounter is `favored`. */
    favoredDelta: -2,
    /** `levelDelta` at or below which an encounter is `balanced` (Even Match). */
    balancedMaxDelta: 2,
    /** `levelDelta` at or below which an encounter is `challenging` (Tough); above is `danger`. */
    challengingMaxDelta: 5,
    /** Average party HP ratio below which readiness flags `needsHeal`. */
    lowHpWarnRatio: 0.65,
  },
});

/**
 * Compress ATK/DEF ratio into a bounded power curve so stat gaps matter
 * without turning small advantages into instant 1-shots.
 *
 * @param {number} atk Effective attacker ATK stat.
 * @param {number} def Effective defender DEF stat.
 * @returns {number} Softened stat ratio.
 */
export function softenStatRatio(atk, def) {
  const safeAtk = toPositiveNumber(atk, 1);
  const safeDef = toPositiveNumber(def, 1);
  const { minStatRatio, maxStatRatio, statRatioExponent } = BALANCE.combat;
  const clamped = Math.max(minStatRatio, Math.min(maxStatRatio, safeAtk / safeDef));
  return Math.pow(clamped, statRatioExponent);
}

/**
 * Translate raw canonical TYPE_CHART effectiveness (`2`, `1.5`, `1`, `0.5`, `0`)
 * into the combat damage multiplier while leaving `result.effectiveness` raw.
 *
 * @param {number} rawEffectiveness Raw TYPE_CHART multiplier.
 * @returns {number} Combat damage multiplier.
 */
export function resolveEffectivenessDamageMult(rawEffectiveness) {
  const eff = isInvalidNumeric(rawEffectiveness) ? 1 : Number(rawEffectiveness);
  if (!Number.isFinite(eff)) return 1.0;
  if (eff >= 2) return BALANCE.combat.superEffectiveDamageMult;
  if (eff > 1) return BALANCE.combat.mildSuperEffectiveMult;
  if (eff === 0) return 0;
  if (eff < 1) return BALANCE.combat.resistedDamageMult;
  return 1.0;
}

/**
 * Strictly monotonic knee compression for stacked offensive multipliers
 * (STAB * Effectiveness * Crit * Offensive Ability * Trait) so stacking
 * remains rewarding (`crit > nonCrit`, `ability > noAbility`) without exploding to 5x.
 *
 * @param {number} mult Product of offensive multipliers.
 * @returns {number} Soft-capped offensive multiplier.
 */
export function applyOffenseSoftCap(mult) {
  const safeMult = isInvalidNumeric(mult) ? 1 : Number(mult);
  if (!Number.isFinite(safeMult) || safeMult <= 0) return 0;
  const { offenseSoftCapKnee: knee, offenseSoftCapSlope: slope } = BALANCE.combat;
  return safeMult <= knee ? safeMult : knee + (safeMult - knee) * slope;
}

/**
 * Full-HP composure guardrail preventing surprise turn-1 1-shots when
 * `options.applyComposure === true` and level gaps remain within fair bounds.
 *
 * @param {number} rawDamage Pre-composure calculated damage.
 * @param {object} attacker Attacking Pokémon (reads `level`).
 * @param {object} defender Defending Pokémon (reads `hp`, `maxHp`, `level`).
 * @param {object} [options] `{ applyComposure, defenderSide: 'player'|'enemy', isBoss }`.
 * @returns {{ damage: number, composureCapped: boolean }}
 */
export function applyComposureGuardrail(rawDamage, attacker, defender, options = {}) {
  const safeRaw = Number.isFinite(Number(rawDamage)) ? Math.max(0, Math.round(Number(rawDamage))) : 0;
  const cfg = BALANCE.combat.composure;
  if (options?.applyComposure !== true || !cfg.enabled) {
    return { damage: safeRaw, composureCapped: false };
  }

  const hp = isInvalidNumeric(defender?.hp) ? NaN : Number(defender.hp);
  const maxHp = isInvalidNumeric(defender?.maxHp) ? NaN : Number(defender.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 1 || hp < maxHp) {
    return { damage: safeRaw, composureCapped: false };
  }

  const atkLv = toPositiveNumber(attacker?.level, 1);
  const defLv = toPositiveNumber(defender?.level, 1);
  const levelGap = atkLv - defLv;

  let capRatio = null;
  if (options?.defenderSide === 'player') {
    if (levelGap <= cfg.playerGapHardCap) {
      if (levelGap <= cfg.playerGapRampStart) {
        capRatio = cfg.playerFullHpMaxRatio;
      } else {
        const span = Math.max(1, cfg.playerGapHardCap - cfg.playerGapRampStart);
        const t = Math.max(0, Math.min(1, (levelGap - cfg.playerGapRampStart) / span));
        capRatio = cfg.playerFullHpMaxRatio + (cfg.playerMaxRampRatio - cfg.playerFullHpMaxRatio) * t;
      }
    }
  } else if (options?.defenderSide === 'enemy' && options?.isBoss) {
    if (levelGap <= cfg.playerGapHardCap) {
      capRatio = cfg.bossFullHpMaxRatio;
    }
  } else if (options?.defenderSide === 'enemy' && !options?.isBoss) {
    if (levelGap <= cfg.wildMaxLevelAdvantage) {
      capRatio = cfg.wildFullHpMaxRatio;
    }
  }

  if (capRatio === null) {
    return { damage: safeRaw, composureCapped: false };
  }

  const cap = Math.max(1, Math.floor(maxHp * capRatio));
  const damage = Math.min(safeRaw, cap);
  return { damage, composureCapped: damage < safeRaw };
}

/**
 * Compute XP rubber-band multiplier based on the level gap between the
 * active Pokémon and the defeated/caught enemy.
 *
 * - Equal level -> `1.0`
 * - Overleveled -> smooth exponential taper (`(1 - overlevelDecayPerLevel)^over`) down to `overlevelMinMult`
 * - Underleveled -> linear boost (`1 + under * underlevelBoostPerLevel`) up to `underlevelMaxMult`
 *
 * @param {number} monLevel Active Pokémon level.
 * @param {number} enemyLevel Defeated/caught enemy level.
 * @returns {number} XP multiplier.
 */
export function getXpDeltaMultiplier(monLevel, enemyLevel) {
  const maxLv = BALANCE.progression.maxLevel;
  const mLv = toBoundedLevel(monLevel, 1, maxLv);
  const eLv = toBoundedLevel(enemyLevel, 1, maxLv);
  const delta = eLv - mLv;
  if (delta === 0) return 1.0;

  const {
    overlevelDecayPerLevel,
    overlevelMinMult,
    underlevelBoostPerLevel,
    underlevelMaxMult,
  } = BALANCE.xp;

  if (delta < 0) {
    const over = -delta;
    const raw = Math.pow(1 - overlevelDecayPerLevel, over);
    return Number(Math.max(overlevelMinMult, raw).toFixed(4));
  }

  const raw = 1 + delta * underlevelBoostPerLevel;
  return Number(Math.min(underlevelMaxMult, raw).toFixed(4));
}

/**
 * Compute active battler XP reward with rubber-banding, bond, and trait modifiers.
 *
 * @param {object} activeMon Active player Pokémon.
 * @param {object} enemy Defeated or caught enemy Pokémon.
 * @param {object} [options] `{ scale = 1.0, bondMult = 1.0, traitMult = 1.0 }`.
 * @returns {{ xp: number, baseXp: number, deltaMult: number, isCatchup: boolean, isTapered: boolean }}
 */
export function computeBattleXpReward(activeMon, enemy, options = {}) {
  const maxLv = BALANCE.progression.maxLevel;
  const enemyLv = toBoundedLevel(enemy?.level, 1, maxLv);
  const monLv = toBoundedLevel(activeMon?.level, enemyLv, maxLv);
  const scale = toPositiveNumber(options?.scale, 1.0);
  const bondMult = toPositiveNumber(options?.bondMult, 1.0);
  const traitMult = toPositiveNumber(options?.traitMult, 1.0);

  const baseXp = Math.max(
    1,
    Math.round((enemyLv * BALANCE.xp.enemyLevelFactor + BALANCE.xp.baseFlat) * scale),
  );
  const deltaMult = getXpDeltaMultiplier(monLv, enemyLv);
  const xp = Math.max(
    BALANCE.xp.minActiveXp,
    Math.round(baseXp * deltaMult * bondMult * traitMult),
  );

  return {
    xp,
    baseXp,
    deltaMult,
    isCatchup: deltaMult > 1,
    isTapered: deltaMult < 1,
  };
}

/**
 * Compute smart bench catch-up XP share for a conscious reserve party member.
 *
 * - Baseline share: `0.42` of `activeBaseXp`
 * - Catch-up boost: `+0.08` per level behind `activeMon.level` up to `0.78`
 * - Overlevel taper: when bench mon is `> 3` levels above `enemy.level`, tapers down to `0.20`
 *
 * @param {object} benchMon Conscious bench Pokémon.
 * @param {object} activeMon Active battler Pokémon.
 * @param {object} enemy Defeated or caught enemy Pokémon.
 * @param {number} [activeBaseXp] Un-tapered active base XP from `computeBattleXpReward`.
 * @returns {{ xp: number, shareRatio: number, isCatchup: boolean }}
 */
export function computeBenchXpShare(benchMon, activeMon, enemy, activeBaseXp) {
  const maxLv = BALANCE.progression.maxLevel;
  const cfg = BALANCE.xp;
  const enemyLv = toBoundedLevel(enemy?.level, 1, maxLv);
  const benchLv = toBoundedLevel(benchMon?.level, 1, maxLv);
  const activeLv = toBoundedLevel(activeMon?.level, benchLv, maxLv);
  const safeBaseXp = toPositiveNumber(
    activeBaseXp,
    enemyLv * cfg.enemyLevelFactor + cfg.baseFlat,
  );

  const behindActive = Math.max(0, activeLv - benchLv);
  const overEnemy = benchLv - enemyLv;

  let shareRatio = cfg.benchBaseShare;
  let isCatchup = false;

  if (overEnemy > 3) {
    shareRatio = Math.max(
      cfg.benchOverlevelMinShare,
      cfg.benchBaseShare - (overEnemy - 3) * cfg.benchCatchupPerLevel,
    );
  } else if (behindActive > 0) {
    shareRatio = Math.min(
      cfg.benchMaxShare,
      cfg.benchBaseShare + behindActive * cfg.benchCatchupPerLevel,
    );
    isCatchup = shareRatio > cfg.benchBaseShare;
  }

  shareRatio = Number(shareRatio.toFixed(4));
  const xp = Math.max(cfg.minBenchXp, Math.round(safeBaseXp * shareRatio));

  return { xp, shareRatio, isCatchup };
}

function isMonHealthy(mon) {
  if (!mon || typeof mon !== 'object') return false;
  if (mon.isFainted === true) return false;
  if (mon.hp === undefined || mon.hp === null) return true;
  if (isInvalidNumeric(mon.hp)) return false;
  const hp = Number(mon.hp);
  return Number.isFinite(hp) && hp > 0;
}

function extractDescendingLevels(mons, maxLv) {
  return mons
    .map((mon) => (mon && typeof mon === 'object' && !isInvalidNumeric(mon.level) ? Number(mon.level) : NaN))
    .filter((lv) => Number.isFinite(lv) && lv > 0)
    .map((lv) => Math.max(1, Math.min(maxLv, lv)))
    .sort((a, b) => b - a);
}

/**
 * Compute weighted top-3 healthy party readiness level
 * (falls back to all team members if all fainted, and to `5` if team is empty).
 *
 * @param {object|Array|null} profile Trainer profile (with `.team`) or party array.
 * @returns {number} Readiness level in `[1, 50]`.
 */
export function getPartyReadinessLevel(profile) {
  const maxLv = BALANCE.progression.maxLevel;
  const rawTeam = Array.isArray(profile)
    ? profile
    : (profile && typeof profile === 'object' && Array.isArray(profile.team) ? profile.team : []);

  const validMons = rawTeam.filter((mon) => mon && typeof mon === 'object');
  if (validMons.length === 0) return 5;

  const healthyMons = validMons.filter(isMonHealthy);
  let levels = extractDescendingLevels(healthyMons, maxLv);
  if (levels.length === 0) {
    levels = extractDescendingLevels(validMons, maxLv);
  }
  if (levels.length === 0) return 5;

  let weighted;
  if (levels.length === 1) {
    weighted = levels[0];
  } else if (levels.length === 2) {
    const [w1, w2] = BALANCE.progression.powerPairWeights;
    weighted = levels[0] * w1 + levels[1] * w2;
  } else {
    const [w1, w2, w3] = BALANCE.progression.powerTopWeights;
    weighted = levels[0] * w1 + levels[1] * w2 + levels[2] * w3;
  }

  return Math.max(1, Math.min(maxLv, Number(weighted.toFixed(1))));
}

const READINESS_META = deepFreeze({
  favored: { tier: 'favored', label: 'Favored', icon: '✅' },
  balanced: { tier: 'balanced', label: 'Even Match', icon: '⚖️' },
  challenging: { tier: 'challenging', label: 'Tough', icon: '⚠️' },
  danger: { tier: 'danger', label: 'Risky', icon: '🚨' },
});

const TIER_ORDER = ['favored', 'balanced', 'challenging', 'danger'];

/**
 * Assess party readiness against an upcoming biome, Shrine, Trial, or Rival encounter.
 *
 * @param {object|Array|null} profile Trainer profile (or party array).
 * @param {object} [spec] Encounter descriptor `{ kind, targetLevel, minLv, maxLv, enemyTypes, enemyCount, label, typeChart }`.
 * @returns {{
 *   teamLevel: number,
 *   targetLevel: number,
 *   levelDelta: number,
 *   needsHeal: boolean,
 *   avgHpRatio: number,
 *   faintedCount: number,
 *   healthyCount: number,
 *   hasTypeAdvantage: boolean,
 *   hasTypeRisk: boolean,
 *   suggestedCounterTypes: string[],
 *   tier: 'favored'|'balanced'|'challenging'|'danger',
 *   label: 'Favored'|'Even Match'|'Tough'|'Risky',
 *   icon: '✅'|'⚖️'|'⚠️'|'🚨',
 *   badgeText: string,
 *   tip: string,
 * }}
 */
export function assessEncounterReadiness(profile, spec = {}) {
  const {
    kind = 'biome',
    source = null,
    targetLevel: rawTargetLevel,
    minLv: rawMinLv,
    maxLv: rawMaxLv,
    enemyTypes: rawEnemyTypes = [],
    enemyCount: rawEnemyCount = 1,
    typeChart = null,
  } = spec || {};

  const normalizedKind = typeof kind === 'string' && kind.trim() ? kind.trim().toLowerCase() : 'biome';
  const normalizedSource = typeof source === 'string' && source.trim() ? source.trim().toLowerCase() : null;
  const encounterSource = normalizedSource ?? normalizedKind;

  const maxLvCap = BALANCE.progression.maxLevel;
  const rawTeam = Array.isArray(profile)
    ? profile
    : (profile && typeof profile === 'object' && Array.isArray(profile.team) ? profile.team : []);
  const team = rawTeam.filter((mon) => mon && typeof mon === 'object');
  const teamLevel = getPartyReadinessLevel(profile);

  const minLv = !isInvalidNumeric(rawMinLv) && Number.isFinite(Number(rawMinLv)) && Number(rawMinLv) > 0
    ? Math.max(1, Math.min(maxLvCap, Number(rawMinLv)))
    : null;
  const maxLv = !isInvalidNumeric(rawMaxLv) && Number.isFinite(Number(rawMaxLv)) && Number(rawMaxLv) > 0
    ? Math.max(1, Math.min(maxLvCap, Number(rawMaxLv)))
    : null;

  let targetLevel;
  if (!isInvalidNumeric(rawTargetLevel) && Number.isFinite(Number(rawTargetLevel)) && Number(rawTargetLevel) > 0) {
    targetLevel = Math.max(1, Math.min(maxLvCap, Number(rawTargetLevel)));
  } else if (minLv !== null && maxLv !== null) {
    targetLevel = Number(((minLv + maxLv) / 2).toFixed(1));
  } else if (maxLv !== null) {
    targetLevel = maxLv;
  } else if (minLv !== null) {
    targetLevel = minLv;
  } else {
    targetLevel = teamLevel;
  }

  const levelDelta = Number((targetLevel - teamLevel).toFixed(1));
  const enemyCount = Math.max(1, Math.round(toPositiveNumber(rawEnemyCount, 1)));

  let faintedCount = 0;
  let hpRatioSum = 0;
  for (const mon of team) {
    if (!isMonHealthy(mon)) {
      faintedCount += 1;
      continue;
    }
    const maxHp = !isInvalidNumeric(mon.maxHp) && Number.isFinite(Number(mon.maxHp)) && Number(mon.maxHp) > 0
      ? Number(mon.maxHp)
      : null;
    const hp = !isInvalidNumeric(mon.hp) && Number.isFinite(Number(mon.hp)) ? Number(mon.hp) : null;
    if (maxHp !== null && hp !== null) {
      hpRatioSum += Math.max(0, Math.min(1, hp / maxHp));
    } else {
      hpRatioSum += 1;
    }
  }
  const healthyCount = Math.max(0, team.length - faintedCount);
  const avgHpRatio = team.length > 0 ? Number((hpRatioSum / team.length).toFixed(3)) : 1;
  const needsHeal = faintedCount > 0 || (team.length > 0 && avgHpRatio < BALANCE.readiness.lowHpWarnRatio);

  const enemyTypes = Array.isArray(rawEnemyTypes)
    ? [...new Set(rawEnemyTypes.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase()))]
    : [];

  let hasTypeAdvantage = false;
  let hasTypeRisk = false;
  let healthyDefensiveCount = 0;
  let weakCount = 0;
  const suggestedCounterTypes = [];

  if (typeChart && typeof typeChart === 'object' && enemyTypes.length > 0) {
    const activePool = healthyCount > 0 ? team.filter(isMonHealthy) : team;
    const offensiveTypes = new Set();
    const defensiveTypes = [];

    for (const mon of activePool) {
      const mType = typeof mon.type === 'string'
        ? mon.type.trim().toLowerCase()
        : (typeof mon.species?.type === 'string' ? mon.species.type.trim().toLowerCase() : null);
      if (mType) {
        offensiveTypes.add(mType);
        defensiveTypes.push(mType);
      }
      if (typeof mon.getMoveObjects === 'function') {
        const moves = mon.getMoveObjects();
        if (Array.isArray(moves)) {
          for (const mv of moves) {
            if (mv && mv.category === 'attack' && typeof mv.type === 'string' && mv.type.trim()) {
              offensiveTypes.add(mv.type.trim().toLowerCase());
            }
          }
        }
      }
    }

    for (const atkType of offensiveTypes) {
      const row = typeChart[atkType];
      if (!row || typeof row !== 'object') continue;
      if (enemyTypes.some((eType) => Number(row[eType]) > 1)) {
        hasTypeAdvantage = true;
        break;
      }
    }

    if (defensiveTypes.length > 0) {
      healthyDefensiveCount = defensiveTypes.length;
      const leadType = defensiveTypes[0];
      const leadWeak = enemyTypes.some((eType) => Number(typeChart[eType]?.[leadType]) > 1);
      for (const dType of defensiveTypes) {
        if (enemyTypes.some((eType) => Number(typeChart[eType]?.[dType]) > 1)) {
          weakCount += 1;
        }
      }
      hasTypeRisk = leadWeak || weakCount > defensiveTypes.length / 2;
    }

    const scoredCounters = [];
    for (const [candType, row] of Object.entries(typeChart)) {
      if (!row || typeof row !== 'object') continue;
      let score = 0;
      let hasDouble = false;
      for (const eType of enemyTypes) {
        const mult = Number(row[eType]);
        if (mult >= 2) {
          score += 2;
          hasDouble = true;
        } else if (mult > 1) {
          score += 1;
        }
      }
      if (score > 0) {
        scoredCounters.push({ type: candType, score, hasDouble });
      }
    }
    scoredCounters.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.hasDouble !== a.hasDouble) return b.hasDouble ? 1 : -1;
      return a.type.localeCompare(b.type);
    });
    for (const entry of scoredCounters.slice(0, 2)) {
      suggestedCounterTypes.push(entry.type);
    }
  }

  let tierIdx;
  if (levelDelta <= BALANCE.readiness.favoredDelta) {
    tierIdx = 0;
  } else if (levelDelta <= BALANCE.readiness.balancedMaxDelta) {
    tierIdx = 1;
  } else if (levelDelta <= BALANCE.readiness.challengingMaxDelta) {
    tierIdx = 2;
  } else {
    tierIdx = 3;
  }

  // Non-biome encounters (Shrine/Rival/Trial) escalate Even Match -> Tough when
  // the opponent leads by >= 1 Lv, the healthy team has no type counter, and 100% of
  // healthy defensive types are weak to the enemy so players see the Farm Zone pivot.
  if (
    encounterSource !== 'biome'
    && tierIdx === 1
    && levelDelta >= 1
    && !hasTypeAdvantage
    && healthyDefensiveCount > 0
    && weakCount === healthyDefensiveCount
  ) {
    tierIdx = 2;
  }

  if (team.length > 0 && healthyCount === 0) {
    tierIdx = 3;
  } else if (needsHeal) {
    tierIdx = Math.min(3, tierIdx + 1);
  }

  const tierKey = TIER_ORDER[tierIdx];
  const meta = READINESS_META[tierKey];
  const badgeText = `${meta.icon} ${meta.label}`;
  const countersLabel = formatCounterList(suggestedCounterTypes);

  let tip;
  if (team.length > 0 && healthyCount === 0) {
    tip = 'Visit Starlight Village to heal your team before battling!';
  } else if (needsHeal) {
    tip = 'Heal up or pack a Potion first — your party is low on HP!';
  } else if (tierKey === 'danger') {
    const gapText = levelDelta > 0 ? `+${Math.round(levelDelta)} Lv` : 'high-power';
    tip = countersLabel
      ? `Strong ${encounterSource === 'biome' ? 'area' : 'foe'} (${gapText})! Train nearby or bring ${countersLabel} moves.`
      : `Strong ${encounterSource === 'biome' ? 'area' : 'foe'} (${gapText})! Train up or stock Potions before jumping in.`;
  } else if (hasTypeRisk && countersLabel) {
    tip = `Watch your lead matchup — try leading with ${countersLabel} moves!`;
  } else if (tierKey === 'challenging') {
    if (enemyCount >= 3 && countersLabel) {
      tip = `${enemyCount}-foe gauntlet! Lead with ${countersLabel} moves and keep Potions handy.`;
    } else if (countersLabel) {
      tip = `Tough fight ahead! ${countersLabel} moves and Shields give you the edge.`;
    } else {
      tip = 'Tough fight ahead! Use Shields, buffs, or Potions to stay in control.';
    }
  } else if (hasTypeAdvantage) {
    tip = 'Great type matchup! Use your super-effective moves to take the lead.';
  } else if (tierKey === 'favored') {
    tip = 'Your team looks strong here — great chance to train bench buddies!';
  } else {
    tip = countersLabel
      ? `Fair fight! ${countersLabel} moves give you an extra tactical edge.`
      : 'Even match! Watch move types and swap teammates if HP gets low.';
  }

  return {
    teamLevel,
    targetLevel,
    levelDelta,
    needsHeal,
    avgHpRatio,
    faintedCount,
    healthyCount,
    hasTypeAdvantage,
    hasTypeRisk,
    suggestedCounterTypes,
    tier: meta.tier,
    label: meta.label,
    icon: meta.icon,
    badgeText,
    tip,
  };
}
