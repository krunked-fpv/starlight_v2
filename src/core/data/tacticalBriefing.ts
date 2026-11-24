import type {
  BiomeId,
  ElementalType,
  OverworldMapData,
  TacticalBriefingData,
  TrainerProfile,
} from '../../contracts';
import { BIOME_DESCRIPTORS } from './biomes';
import { getCounterTypes, getTypeEffectiveness } from './typePalettes';
import { getSpecies } from '../catalog/speciesCatalog';

export function computeTacticalBriefing(
  profile: TrainerProfile,
  biomeId: BiomeId,
  map: OverworldMapData,
): TacticalBriefingData {
  const biome = BIOME_DESCRIPTORS[biomeId];
  const guardian = getSpecies(biome.guardianSpeciesId);
  const shrineId = `${biomeId}-shrine`;
  const guardianCleared = profile.clearedShrines.includes(shrineId);

  const totalHp = profile.party.reduce((acc, m) => acc + m.hp, 0);
  const totalMaxHp = Math.max(1, profile.party.reduce((acc, m) => acc + m.maxHp, 0));
  const partyHpPercent = Math.round((totalHp / totalMaxHp) * 100);

  const avgComposure = Math.round(
    profile.party.reduce((acc, m) => acc + m.composure, 0) / Math.max(1, profile.party.length),
  );

  const recommendedTypes = getCounterTypes(biome.elementalType).slice(0, 3) as ElementalType[];

  // Check whether any active party member carries a type advantage against the biome guardian
  const hasAdvantage = profile.party.some((member) => {
    const sp = getSpecies(member.speciesId);
    return (
      getTypeEffectiveness(sp.primaryType, guardian.primaryType, guardian.secondaryType) >= 2 ||
      (sp.secondaryType !== null &&
        getTypeEffectiveness(sp.secondaryType, guardian.primaryType, guardian.secondaryType) >= 2)
    );
  });

  let score = Math.round(partyHpPercent * 0.48 + avgComposure * 0.32);
  if (hasAdvantage) score += 12;
  if (profile.inventory.starBalls >= 3) score += 8;
  score = Math.max(0, Math.min(100, score));

  const readinessGrade: TacticalBriefingData['readinessGrade'] =
    score >= 82 ? 'OPTIMAL' : score >= 58 ? 'READY' : 'CAUTION';

  const alerts: TacticalBriefingData['alerts'] = [];
  if (hasAdvantage) {
    alerts.push({
      severity: 'advantage',
      iconId: `icon-type-${recommendedTypes[0] ?? biome.elementalType}`,
      text: `Party holds super-effective elemental coverage against ${guardian.name}.`,
    });
  } else {
    alerts.push({
      severity: 'info',
      iconId: `icon-type-${biome.elementalType}`,
      text: `Consider ${recommendedTypes.map((t) => t.toUpperCase()).join(' / ')} moves for ${biome.name}.`,
    });
  }

  if (partyHpPercent < 65) {
    alerts.push({
      severity: 'warn',
      iconId: 'icon-fountain',
      text: 'Party vitality below 65%. Visit the Healing Fountain before a Shrine challenge.',
    });
  } else {
    alerts.push({
      severity: 'info',
      iconId: 'icon-composure',
      text: `Average Composure shield at ${avgComposure}% — ready to absorb heavy elemental bursts.`,
    });
  }

  if (profile.inventory.starBalls <= 2) {
    alerts.push({
      severity: 'warn',
      iconId: 'icon-starball',
      text: 'Low Star Ball reserves. Open glowing Treasure Chests across biomes.',
    });
  } else {
    alerts.push({
      severity: 'advantage',
      iconId: 'icon-starball',
      text: `${profile.inventory.starBalls} Star Balls primed for rare Starfall captures.`,
    });
  }

  const nextLandmark =
    map.landmarks.find((l) => l.kind === 'shrine' && !guardianCleared) ??
    map.landmarks.find((l) => l.kind === 'starfall') ??
    map.landmarks[0];

  return {
    biomeId,
    biomeName: biome.name,
    biomeType: biome.elementalType,
    readinessScore: score,
    readinessGrade,
    partyHpPercent,
    avgComposure,
    recommendedTypes,
    guardianSpecies: guardian,
    guardianCleared,
    starBallsReady: profile.inventory.starBalls,
    potionsReady: profile.inventory.potions + profile.inventory.superPotions,
    activeAura: profile.style.aura,
    wayfindingLabel: nextLandmark ? nextLandmark.label : 'Explore Starlight Island',
    alerts,
  };
}
