import {
  BIOME_IDS,
  type BiomeId,
  type DojoProfileState,
  type UIBridgeCallbacks,
} from '../contracts';
import {
  assessEncounterReadiness,
  BATTLES_PER_ARCADE_CHARGE,
  BIOMES,
  CHESTS,
  FIELD_QUESTS,
  getAllEvolutionItems,
  getBiomeDiscoveryStats,
  getBiomeScaledRange,
  getBiomeVisualProfile,
  getPlayerProgression,
  getScaledShrineGuard,
  getSpeciesEntry,
  getTrainerPowerLevel,
  MAX_ARCADE_CHARGES,
  MAX_CHEER_CHARGES,
  NPCS,
  resolveRecommendedFarmingZone,
  RIVAL_TRAINERS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  STEPS_PER_ARCADE_CHARGE,
  STEPS_PER_CHEER_CHARGE,
  stripEmojis,
  TOTAL_SPECIES_COUNT,
  TYPE_PALETTES,
  typeToIconId,
} from '../core';
import { createIconSvg, safeText } from './iconHelper';

const SHRINES_PER_BIOME = (() => {
  const map = new Map<string, string[]>();
  for (const sh of Object.values(SHRINES)) {
    const list = map.get(sh.biome) ?? [];
    list.push(sh.id);
    map.set(sh.biome, list);
  }
  return map;
})();

const CHESTS_PER_BIOME = (() => {
  const map = new Map<string, string[]>();
  for (const ch of Object.values(CHESTS)) {
    const b = ch.biome ?? 'forest';
    const list = map.get(b) ?? [];
    list.push(ch.id);
    map.set(b, list);
  }
  return map;
})();

const RIVAL_BY_BIOME = (() => {
  const map = new Map<string, { id: string; name: string }>();
  for (const r of Object.values(RIVAL_TRAINERS)) {
    if (!r) continue;
    map.set(r.biome, { id: r.id, name: stripEmojis(r.name) });
  }
  return map;
})();

const NPC_NAME_BY_ID = (() => {
  const map = new Map<string, string>();
  for (const n of Object.values(NPCS)) {
    map.set(n.id, stripEmojis(n.name));
  }
  return map;
})();

const EVO_ITEM_NAMES = new Map(getAllEvolutionItems().map((it) => [it.id, it.name]));

function formatRewardPills(rewards?: Record<string, unknown> | null): string {
  if (!rewards || typeof rewards !== 'object') return '';
  const chips: string[] = [];
  const r = rewards as {
    potions?: number;
    greatBalls?: number;
    starBalls?: number;
    starShards?: number;
    cheerCharges?: number;
    gems?: Record<string, number>;
    gem?: string;
  };
  if (r.potions && r.potions > 0) chips.push(`+${r.potions} Potions`);
  if (r.greatBalls && r.greatBalls > 0) chips.push(`+${r.greatBalls} Great Balls`);
  if (r.starBalls && r.starBalls > 0) chips.push(`+${r.starBalls} Star Balls`);
  if (r.starShards && r.starShards > 0) chips.push(`+${r.starShards} Star Shards`);
  if (r.cheerCharges && r.cheerCharges > 0) chips.push(`+${r.cheerCharges} Cheers`);
  if (r.gem) chips.push(`+1 ${EVO_ITEM_NAMES.get(r.gem) ?? r.gem}`);
  if (r.gems && typeof r.gems === 'object') {
    for (const [gid, count] of Object.entries(r.gems)) {
      if (Number(count) > 0) chips.push(`+${count} ${EVO_ITEM_NAMES.get(gid) ?? gid}`);
    }
  }
  return chips
    .map((label) => `<span class="sl-pill sl-pill-gold" style="font-size:10px; min-height:20px; padding:1px 6px;">${safeText(label)}</span>`)
    .join('');
}

export class IslandGuideView {
  private callbacks: UIBridgeCallbacks | null = null;
  private overviewEl: HTMLElement | null = null;
  private economyEl: HTMLElement | null = null;
  private biomesGridEl: HTMLElement | null = null;
  private exploreSummaryEl: HTMLElement | null = null;
  private rivalsListEl: HTMLElement | null = null;
  private rivalsCountEl: HTMLElement | null = null;
  private questsListEl: HTMLElement | null = null;
  private questsCountEl: HTMLElement | null = null;
  private arcadeHintEl: HTMLElement | null = null;
  private lastMemo = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.lastMemo = '';

    container.innerHTML = `
      <div class="sl-guide-wrap">
        <div class="sl-guide-overview sl-glass-soft" data-testid="guide-overview"></div>

        <div class="sl-guide-body">
          <div class="sl-guide-col">
            <div class="sl-team-section-head">
              <h3 class="sl-style-group-title">${createIconSvg('icon-guide', 'sl-icon-sm')} 18 Connected Island Biomes</h3>
              <span class="sl-pill sl-pill-gold sl-num" data-testid="guide-explore-summary">Tap Warp to fast-travel</span>
            </div>
            <div class="sl-guide-biome-grid" data-testid="guide-biomes-grid"></div>
          </div>

          <div class="sl-guide-side">
            <div class="sl-guide-card sl-glass-soft" data-testid="guide-controls-card">
              <h3 class="sl-style-group-title">${createIconSvg('icon-compass', 'sl-icon-sm')} Controls &amp; Secret Arcade</h3>
              <ul class="sl-guide-controls-list">
                <li><strong>Move:</strong> WASD / Arrow Keys, Tap-to-Walk on map, or Touch D-Pad</li>
                <li><strong>Interact:</strong> Space / Enter or tap the bottom Context Interact Pill</li>
                <li><strong>Warps:</strong> Safe Zone [H] heals at Village; Farm Zone [T] picks ideal training biome</li>
              </ul>
              <div class="sl-alert-item" data-severity="info" data-testid="guide-secret-arcade-hint">
                ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
                <span>Hint: Check the glowing Star Emblem wall at (${SECRET_ARCADE_SPOT.x}, ${SECRET_ARCADE_SPOT.y}) in Starlight Village!</span>
              </div>
            </div>

            <div class="sl-guide-card sl-glass-soft" data-testid="guide-economy-card"></div>

            <div class="sl-guide-quests-wrap sl-glass-soft" data-testid="guide-rivals-wrap">
              <div class="sl-team-section-head">
                <h3 class="sl-style-group-title" style="margin:0;">${createIconSvg('icon-rival', 'sl-icon-sm')} Rival Trainers</h3>
                <span class="sl-pill sl-pill-gold sl-num" data-testid="guide-rivals-count">0 / ${Object.keys(RIVAL_TRAINERS).length}</span>
              </div>
              <div class="sl-guide-rivals-list" data-testid="guide-rivals-list"></div>
            </div>

            <div class="sl-guide-quests-wrap sl-glass-soft">
              <div class="sl-team-section-head">
                <h3 class="sl-style-group-title" style="margin:0;">${createIconSvg('icon-quest', 'sl-icon-sm')} Field Quests</h3>
                <span class="sl-pill sl-pill-gold sl-num" data-testid="guide-quests-count">0 / ${FIELD_QUESTS.length}</span>
              </div>
              <div class="sl-guide-quests-list" data-testid="guide-quests-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.overviewEl = container.querySelector('[data-testid="guide-overview"]');
    this.economyEl = container.querySelector('[data-testid="guide-economy-card"]');
    this.biomesGridEl = container.querySelector('[data-testid="guide-biomes-grid"]');
    this.exploreSummaryEl = container.querySelector('[data-testid="guide-explore-summary"]');
    this.rivalsListEl = container.querySelector('[data-testid="guide-rivals-list"]');
    this.rivalsCountEl = container.querySelector('[data-testid="guide-rivals-count"]');
    this.questsListEl = container.querySelector('[data-testid="guide-quests-list"]');
    this.questsCountEl = container.querySelector('[data-testid="guide-quests-count"]');
    this.arcadeHintEl = container.querySelector('[data-testid="guide-secret-arcade-hint"]');

    container.addEventListener('click', (evt) => {
      const target = evt.target as HTMLElement | null;
      const warpBtn = target?.closest('[data-warp-biome]') as HTMLButtonElement | null;
      if (warpBtn) {
        const biomeId = warpBtn.getAttribute('data-warp-biome') as BiomeId | null;
        if (biomeId) this.callbacks?.onWarpBiome(biomeId);
        return;
      }
      if (target?.closest('[data-guide-action="warp-farm"]')) {
        this.callbacks?.onWarpFarmZone();
        return;
      }
      if (target?.closest('[data-guide-action="warp-safe"]')) {
        this.callbacks?.onWarpSafeZone();
        return;
      }
      if (target?.closest('[data-guide-action="open-arcade"]')) {
        this.callbacks?.onOpenSkyHop();
      }
    });
  }

  sync(profile: DojoProfileState, currentBiomeId: BiomeId, active: boolean): void {
    if (!active) return;

    const caughtCount = Object.values(profile.pokedex.caught).filter((n) => Number(n) > 0).length;
    const prog = getPlayerProgression(profile);
    const memo = [
      currentBiomeId,
      profile.playerLevel,
      prog.xp,
      profile.bag.starShards,
      profile.bag.cheerCharges,
      profile.shrinesCleared.join(','),
      profile.chestsOpened.join(','),
      profile.questsCompleted.join(','),
      profile.rivalsDefeated.join(','),
      profile.biomesVisited.join(','),
      profile.arcade.unlocked,
      profile.arcade.charges,
      profile.arcade.highScore,
      profile.arcade.secretKnocks,
      caughtCount,
    ].join('|');

    if (memo === this.lastMemo) return;
    this.lastMemo = memo;

    const clearedSet = new Set(profile.shrinesCleared);
    const openedSet = new Set(profile.chestsOpened);
    const visitedSet = new Set(profile.biomesVisited);
    visitedSet.add(currentBiomeId);
    const questsDoneSet = new Set(profile.questsCompleted);
    const rivalsDoneSet = new Set(profile.rivalsDefeated);
    const rivalsList = Object.values(RIVAL_TRAINERS).filter(Boolean);

    const powerLv = getTrainerPowerLevel(profile);
    const recZone = resolveRecommendedFarmingZone(profile) as {
      biomeId?: BiomeId;
      biome?: { name?: string };
      minLv?: number;
      maxLv?: number;
    } | null;
    const recBiomeId = (recZone?.biomeId ?? 'forest') as BiomeId;
    const recBiomeName = getBiomeVisualProfile(recBiomeId).displayName;
    const recRange = `${recZone?.minLv ?? 2}-${recZone?.maxLv ?? 7}`;

    if (this.overviewEl) {
      this.overviewEl.innerHTML = `
        <div class="sl-guide-overview-top">
          <div class="sl-guide-overview-stats sl-num">
            <span class="sl-pill sl-pill-gold">${createIconSvg('icon-compass', 'sl-icon-sm')} Player Lv.${prog.level}</span>
            <span class="sl-pill">${createIconSvg('icon-sword', 'sl-icon-sm')} Trainer Power Lv.${powerLv}</span>
            <span class="sl-pill">${createIconSvg('icon-pokedex', 'sl-icon-sm')} Dex ${caughtCount}/${TOTAL_SPECIES_COUNT}</span>
            <span class="sl-pill">${createIconSvg('icon-shrine', 'sl-icon-sm')} Shrines ${clearedSet.size}/20</span>
            <span class="sl-pill">${createIconSvg('icon-rival', 'sl-icon-sm')} Rivals ${rivalsDoneSet.size}/${rivalsList.length}</span>
            <span class="sl-pill">${createIconSvg('icon-quest', 'sl-icon-sm')} Quests ${questsDoneSet.size}/${FIELD_QUESTS.length}</span>
            <span class="sl-pill">${createIconSvg('icon-star-shard', 'sl-icon-sm')} ${profile.bag.starShards} Shards</span>
            <span class="sl-pill">${createIconSvg('icon-cheer-heart', 'sl-icon-sm')} ${profile.bag.cheerCharges}/${MAX_CHEER_CHARGES} Cheers</span>
          </div>
          <div class="sl-guide-overview-actions">
            <button type="button" class="sl-btn sl-btn-cyan" data-guide-action="warp-farm" data-testid="guide-warp-farm">
              ${createIconSvg('icon-warp-farm', 'sl-icon-sm')}
              <span>Farm: ${safeText(recBiomeName)} (Lv.${safeText(recRange)})</span>
            </button>
            <button type="button" class="sl-btn" data-guide-action="warp-safe" data-testid="guide-warp-safe">
              ${createIconSvg('icon-warp-safe', 'sl-icon-sm')}
              <span>Safe Zone</span>
            </button>
          </div>
        </div>
      `;
    }

    if (this.exploreSummaryEl) {
      this.exploreSummaryEl.textContent = `${visitedSet.size}/${BIOME_IDS.length} Biomes • ${clearedSet.size}/20 Shrines • ${openedSet.size}/36 Chests`;
    }

    if (this.biomesGridEl) {
      this.biomesGridEl.innerHTML = BIOME_IDS.map((bId) => {
        const vp = getBiomeVisualProfile(bId);
        const pal = TYPE_PALETTES[vp.elementalType] ?? TYPE_PALETTES.normal;
        const scaled = getBiomeScaledRange(bId, profile);
        const shrines = SHRINES_PER_BIOME.get(bId) ?? [];
        const chests = CHESTS_PER_BIOME.get(bId) ?? [];
        const chestsDone = chests.filter((id) => openedSet.has(id)).length;
        const rival = RIVAL_BY_BIOME.get(bId) ?? null;
        const rivalDefeated = rival ? rivalsDoneSet.has(rival.id) : false;
        const isCurrent = bId === currentBiomeId;
        const isVisited = isCurrent || visitedSet.has(bId);
        const isSafe = bId === 'village';
        const isRecommended = !isSafe && bId === recBiomeId;

        let spCaught = 0;
        let spSeen = 0;
        let spTotal = 0;
        try {
          const disc = getBiomeDiscoveryStats(profile, bId) as { caught?: number; seen?: number; totalSpecies?: number } | null;
          spCaught = Number(disc?.caught ?? 0);
          spSeen = Number(disc?.seen ?? 0);
          spTotal = Number(disc?.totalSpecies ?? 0);
        } catch {
          spCaught = 0;
          spSeen = 0;
          spTotal = 0;
        }
        const spPct = spTotal > 0 ? Math.min(1, spCaught / spTotal) : 1;

        let readinessHtml = '';
        if (!isSafe) {
          try {
            const rawBiome = BIOMES[bId] as { encounters?: Array<number | { id?: number; speciesId?: number }> } | undefined;
            const enemyTypes = Array.from(
              new Set(
                (rawBiome?.encounters ?? [])
                  .map((enc) => {
                    const id = typeof enc === 'number' ? enc : (enc?.id ?? enc?.speciesId);
                    return id ? getSpeciesEntry(id).type : null;
                  })
                  .filter(Boolean),
              ),
            );
            const r = assessEncounterReadiness(profile, {
              kind: 'biome',
              minLv: scaled.minLv,
              maxLv: scaled.maxLv,
              enemyTypes,
              label: vp.displayName,
            }) as { tier?: string; badgeText?: string; tip?: string } | null;
            if (r?.tier && r?.badgeText) {
              readinessHtml = `<span class="sl-pill sl-readiness-pill" data-tier="${safeText(r.tier)}" title="${safeText(stripEmojis(r.tip ?? ''))}">${safeText(stripEmojis(r.badgeText))}</span>`;
            }
          } catch {
            readinessHtml = '';
          }
        }

        const shrineDetailHtml = shrines
          .map((shId) => {
            const sh = SHRINES[shId];
            if (!sh) return '';
            const done = clearedSet.has(shId);
            const guard = getScaledShrineGuard(sh, profile) as { level?: number } | null;
            const gLv = guard?.level ?? sh.level;
            return `<span class="sl-pill ${done ? 'sl-pill-emerald' : ''}">${createIconSvg('icon-shrine', 'sl-icon-sm')} ${safeText(stripEmojis(sh.name))}: ${done ? 'Cleared' : `Lv.${gLv}`}</span>`;
          })
          .join('');

        return `
          <article
            class="sl-guide-biome-card sl-glass-soft ${isCurrent ? 'is-current' : ''} ${isRecommended ? 'is-recommended' : ''}"
            data-type="${vp.elementalType}"
            style="--biome-accent:${pal.primary}; --biome-glow:${pal.glow};"
            data-testid="guide-biome-${bId}"
          >
            <div class="sl-guide-biome-head">
              <div style="display:flex; align-items:center; gap:9px; min-width:0;">
                <span class="sl-guide-biome-seal">${createIconSvg(typeToIconId(vp.elementalType), 'sl-icon-md')}</span>
                <div style="min-width:0;">
                  <div class="sl-biome-name">${safeText(vp.displayName)}</div>
                  <div class="sl-biome-sub">${safeText(vp.subtitle)}</div>
                </div>
              </div>
              <span class="sl-pill ${isSafe ? 'sl-pill-emerald' : 'sl-pill-gold'} sl-num">${isSafe ? 'Safe Zone' : `Lv.${scaled.minLv}-${scaled.maxLv}`}</span>
            </div>
            <div class="sl-guide-biome-meta sl-num">
              ${isRecommended ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-sparkle', 'sl-icon-sm')} Best Lv. Match</span>` : ''}
              ${readinessHtml}
              ${spTotal > 0 ? `<span class="sl-pill">${createIconSvg('icon-pokedex', 'sl-icon-sm')} ${spCaught}/${spTotal} (Seen ${spSeen})</span>` : `<span class="sl-pill">${createIconSvg('icon-fountain', 'sl-icon-sm')} Healing Fountain</span>`}
              ${shrineDetailHtml}
              ${chests.length > 0 ? `<span class="sl-pill">${createIconSvg('icon-chest', 'sl-icon-sm')} ${chestsDone}/${chests.length}</span>` : ''}
              ${rival ? `<span class="sl-pill ${rivalDefeated ? 'sl-pill-emerald' : ''}">${createIconSvg('icon-rival', 'sl-icon-sm')} ${rivalDefeated ? 'Rival Cleared' : 'Rival Ready'}</span>` : ''}
              <span class="sl-pill">${safeText(scaled.threatLabel)}${isVisited ? ' • Explored' : ''}</span>
            </div>
            ${
              spTotal > 0
                ? `<div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-xp" style="--fill:${spPct.toFixed(3)};"></div></div>`
                : ''
            }
            <button
              type="button"
              class="sl-btn ${isCurrent ? 'is-active' : ''}"
              data-warp-biome="${bId}"
              data-testid="guide-warp-${bId}"
            >
              ${createIconSvg('icon-waypoint', 'sl-icon-sm')}
              <span>${isCurrent ? 'Current Zone (Warp Center)' : `Warp to ${safeText(vp.displayName)}`}</span>
            </button>
          </article>
        `;
      }).join('');
    }

    if (this.economyEl) {
      const stepProg = (profile.stats?.steps ?? 0) % STEPS_PER_CHEER_CHARGE;
      const stepsLeft = Math.max(1, STEPS_PER_CHEER_CHARGE - stepProg);
      const cheerText =
        profile.bag.cheerCharges >= MAX_CHEER_CHARGES
          ? `Bag Full (${MAX_CHEER_CHARGES}/${MAX_CHEER_CHARGES})`
          : `${stepsLeft} steps to next (${stepProg}/${STEPS_PER_CHEER_CHARGE})`;
      this.economyEl.innerHTML = `
        <div class="sl-team-section-head">
          <h3 class="sl-style-group-title" style="margin:0;">${createIconSvg('icon-star-shard', 'sl-icon-sm')} Starlight Economy &amp; Cheers</h3>
          <span class="sl-pill sl-pill-gold sl-num">${createIconSvg('icon-cheer-heart', 'sl-icon-sm')} ${safeText(cheerText)}</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr; gap:6px; font-size:12px; color:var(--sl-text-muted); line-height:1.42;">
          <div><strong style="color:var(--sl-brass-bright);">Star Shards:</strong> Earn from battles, catches, Starfall nodes, or 80+ pts in Sky-Hop to power Rank Upgrades.</div>
          <div><strong style="color:var(--sl-brass-bright);">Cheer Hearts:</strong> Recharge every ${STEPS_PER_CHEER_CHARGE} steps, on battle wins/catches, or 180+ pts (Wave 2+) in Sky-Hop (max ${MAX_CHEER_CHARGES}) to raise Bond (+10).</div>
        </div>
      `;
    }

    if (this.arcadeHintEl) {
      const unlocked = Boolean(profile.arcade?.unlocked);
      const knocks = profile.arcade?.secretKnocks ?? 0;
      const charges = profile.arcade?.charges ?? 0;
      const arcStepsLeft = Math.max(1, STEPS_PER_ARCADE_CHARGE - ((profile.stats?.steps ?? 0) % STEPS_PER_ARCADE_CHARGE));
      const arcBattlesLeft = Math.max(1, BATTLES_PER_ARCADE_CHARGE - ((profile.stats?.battlesWon ?? 0) % BATTLES_PER_ARCADE_CHARGE));
      const rechargeHint =
        charges >= MAX_ARCADE_CHARGES
          ? 'Full flight charges ready!'
          : `Recharge: ${arcStepsLeft} steps or ${arcBattlesLeft} battles for +1 Charge (Shrine/Rival = +1).`;
      if (unlocked) {
        this.arcadeHintEl.innerHTML = `
          ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
          <div style="display:flex; flex-direction:column; gap:8px; flex:1; min-width:0;">
            <span>Sky-Hop Arcade Unlocked! Charges: ${charges}/${MAX_ARCADE_CHARGES} • Best: ${profile.arcade.highScore} (Wave ${profile.arcade.bestWave}) • Flights: ${profile.arcade.plays}. ${safeText(rechargeHint)}</span>
            <button type="button" class="sl-btn sl-btn-primary" data-guide-action="open-arcade" data-testid="guide-arcade-play">
              ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
              <span>Play Sky-Hop (${charges}/${MAX_ARCADE_CHARGES})</span>
            </button>
          </div>
        `;
      } else {
        const attuned = profile.badges.length >= 1 || caughtCount >= 5;
        this.arcadeHintEl.innerHTML = `
          ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
          <span>${
            attuned
              ? `Starlight Attuned! Knock 3 times on the Star Emblem wall at (${SECRET_ARCADE_SPOT.x}, ${SECRET_ARCADE_SPOT.y}) in Starlight Village (${knocks}/3).`
              : `Secret Arcade Wall at (${SECRET_ARCADE_SPOT.x}, ${SECRET_ARCADE_SPOT.y}) in Starlight Village: Earn 1 Badge or catch 5 species (${Math.min(5, caughtCount)}/5), then knock 3 times (${knocks}/3).`
          }</span>
        `;
      }
    }

    if (this.rivalsCountEl) {
      this.rivalsCountEl.textContent = `${rivalsDoneSet.size} / ${rivalsList.length} Cleared`;
    }

    if (this.rivalsListEl) {
      this.rivalsListEl.innerHTML = rivalsList
        .map((r) => {
          const defeated = rivalsDoneSet.has(r.id);
          const biomeName = getBiomeVisualProfile(r.biome as BiomeId).displayName;
          const partyCount = Array.isArray(r.party) ? r.party.length : 1;
          const rewardPills = formatRewardPills(
            (defeated ? r.rematchRewards ?? r.rewards : r.rewards) as Record<string, unknown> | null,
          );
          return `
            <div class="sl-quest-row" data-done="${defeated}" data-testid="guide-rival-${safeText(r.id)}">
              <div class="sl-quest-head">
                <strong class="sl-quest-title">${safeText(stripEmojis(r.name))}</strong>
                <span class="sl-pill ${defeated ? 'sl-pill-emerald' : 'sl-pill-gold'}">
                  ${createIconSvg(defeated ? 'icon-trophy' : 'icon-rival', 'sl-icon-sm')}
                  <span>${defeated ? 'Defeated (+2 Lv Rematch)' : `${partyCount} Pokémon`}</span>
                </span>
              </div>
              <div class="sl-quest-desc">${safeText(biomeName)} • ${defeated ? 'Rematch anytime for bonus rewards' : 'Talk to challenge this rival'}</div>
              ${rewardPills ? `<div style="display:flex; gap:5px; flex-wrap:wrap;">${rewardPills}</div>` : ''}
            </div>
          `;
        })
        .join('');
    }

    if (this.questsCountEl) {
      this.questsCountEl.textContent = `${questsDoneSet.size} / ${FIELD_QUESTS.length} Done`;
    }

    if (this.questsListEl) {
      this.questsListEl.innerHTML = FIELD_QUESTS.map((q) => {
        const done = questsDoneSet.has(q.id);
        const npcName = NPC_NAME_BY_ID.get(q.npcId) ?? q.npcId;
        const rawQuest = q as unknown as {
          check?: (p: DojoProfileState) => boolean;
          progressText?: (p: DojoProfileState) => string;
          progress?: (p: DojoProfileState) => string;
          rewards?: Record<string, unknown>;
        };
        let ready = false;
        let prog = '';
        try {
          if (!done && typeof rawQuest.check === 'function') {
            ready = Boolean(rawQuest.check(profile));
          }
          if (typeof rawQuest.progressText === 'function') {
            prog = stripEmojis(rawQuest.progressText(profile));
          } else if (typeof rawQuest.progress === 'function') {
            prog = stripEmojis(rawQuest.progress(profile));
          }
        } catch {
          prog = '';
        }
        const rewardPills = formatRewardPills(rawQuest.rewards);
        return `
          <div class="sl-quest-row" data-done="${done}" data-ready="${ready}" data-testid="guide-quest-${safeText(q.id)}">
            <div class="sl-quest-head">
              <strong class="sl-quest-title">${safeText(stripEmojis(q.title))}</strong>
              <span class="sl-pill ${done ? 'sl-pill-emerald' : ready ? 'sl-pill-gold' : ''}">
                ${createIconSvg(done ? 'icon-check' : ready ? 'icon-sparkle' : 'icon-quest', 'sl-icon-sm')}
                <span>${done ? 'Completed' : ready ? `Ready • ${safeText(npcName)}` : safeText(npcName)}</span>
              </span>
            </div>
            <div class="sl-quest-desc">
              ${safeText(stripEmojis(q.description))}
            </div>
            ${prog ? `<div class="sl-num" style="font-size:11px; font-weight:700; color:var(--sl-cyan);">${safeText(prog)}</div>` : ''}
            ${rewardPills ? `<div style="display:flex; gap:5px; flex-wrap:wrap;">${rewardPills}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  dispose(): void {
    this.overviewEl = null;
    this.economyEl = null;
    this.biomesGridEl = null;
    this.rivalsListEl = null;
    this.rivalsCountEl = null;
    this.questsListEl = null;
    this.questsCountEl = null;
    this.arcadeHintEl = null;
    this.callbacks = null;
  }
}
