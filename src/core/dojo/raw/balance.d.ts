/* eslint-disable @typescript-eslint/no-explicit-any */
export const BALANCE: {
  readonly combat: {
    readonly damageDivisor: number;
    readonly statRatioExponent: number;
    readonly minStatRatio: number;
    readonly maxStatRatio: number;
    readonly stabMult: number;
    readonly critBaseChance: number;
    readonly critMult: number;
    readonly superEffectiveDamageMult: number;
    readonly mildSuperEffectiveMult: number;
    readonly resistedDamageMult: number;
    readonly offenseSoftCapKnee: number;
    readonly offenseSoftCapSlope: number;
    readonly stageStep: number;
    readonly minStage: number;
    readonly maxStage: number;
    readonly shieldMult: number;
    readonly varianceMin: number;
    readonly varianceMax: number;
    readonly potionHealRatio: number;
    readonly potionMinHeal: number;
    readonly composure: {
      readonly enabled: boolean;
      readonly playerFullHpMaxRatio: number;
      readonly playerGapRampStart: number;
      readonly playerGapHardCap: number;
      readonly playerMaxRampRatio: number;
      readonly wildFullHpMaxRatio: number;
      readonly wildMaxLevelAdvantage: number;
      readonly bossFullHpMaxRatio: number;
    };
  };
  readonly progression: {
    readonly maxLevel: number;
    readonly upgradeStatBonusPerTier: number;
    readonly upgradeXpRatio: number;
    readonly upgradeMinXp: number;
    readonly powerTopWeights: readonly [number, number, number];
    readonly powerPairWeights: readonly [number, number];
    readonly powerBadgeBonusPerBadge: number;
    readonly powerBadgeBonusCap: number;
  };
  readonly xp: {
    readonly enemyLevelFactor: number;
    readonly baseFlat: number;
    readonly minActiveXp: number;
    readonly minBenchXp: number;
    readonly overlevelDecayPerLevel: number;
    readonly overlevelMinMult: number;
    readonly underlevelBoostPerLevel: number;
    readonly underlevelMaxMult: number;
    readonly benchBaseShare: number;
    readonly benchCatchupPerLevel: number;
    readonly benchMaxShare: number;
    readonly benchOverlevelMinShare: number;
  };
  readonly scaling: Record<string, any>;
  readonly overworld: {
    readonly minStepsBetweenWilds: number;
    readonly wildEncounterChance: number;
    readonly maxEncounterStreak: number;
    readonly postWarpGraceSteps: number;
    readonly postEscapeGraceSteps: number;
  };
  readonly readiness: {
    readonly favoredDelta: number;
    readonly balancedMaxDelta: number;
    readonly challengingMaxDelta: number;
    readonly lowHpWarnRatio: number;
  };
};
export function softenStatRatio(atk: number, def: number): number;
export function resolveEffectivenessDamageMult(rawEffectiveness: number): number;
export function applyOffenseSoftCap(mult: number): number;
export function applyComposureGuardrail(
  rawDamage: number,
  attacker: any,
  defender: any,
  options?: any,
): { damage: number; composureCapped: boolean };
export function getXpDeltaMultiplier(monLevel: number, enemyLevel: number): number;
export function computeBattleXpReward(
  activeMon: any,
  enemy: any,
  options?: { scale?: number; bondMult?: number; traitMult?: number },
): { xp: number; baseXp: number; deltaMult: number; isCatchup: boolean; isTapered: boolean };
export function computeBenchXpShare(
  benchMon: any,
  activeMon: any,
  enemy: any,
  activeBaseXp?: number,
): { xp: number; shareRatio: number; isCatchup: boolean };
export function getPartyReadinessLevel(profile: any): number;
export function assessEncounterReadiness(profile: any, spec?: any): {
  teamLevel: number;
  targetLevel: number;
  levelDelta: number;
  needsHeal: boolean;
  avgHpRatio: number;
  faintedCount: number;
  healthyCount: number;
  hasTypeAdvantage: boolean;
  hasTypeRisk: boolean;
  suggestedCounterTypes: string[];
  tier: 'favored' | 'balanced' | 'challenging' | 'danger';
  label: string;
  icon: string;
  badgeText: string;
  tip: string;
};
