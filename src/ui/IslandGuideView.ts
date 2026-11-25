import {
  BIOME_IDS,
  type BiomeId,
  type DojoProfileState,
  type UIBridgeCallbacks,
} from '../contracts';
import {
  CHESTS,
  FIELD_QUESTS,
  getBiomeScaledRange,
  getBiomeVisualProfile,
  NPCS,
  SECRET_ARCADE_SPOT,
  SHRINES,
  stripEmojis,
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

const NPC_NAME_BY_ID = (() => {
  const map = new Map<string, string>();
  for (const n of Object.values(NPCS)) {
    map.set(n.id, stripEmojis(n.name));
  }
  return map;
})();

export class IslandGuideView {
  private callbacks: UIBridgeCallbacks | null = null;
  private biomesGridEl: HTMLElement | null = null;
  private questsListEl: HTMLElement | null = null;
  private questsCountEl: HTMLElement | null = null;
  private arcadeHintEl: HTMLElement | null = null;
  private lastMemo = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.lastMemo = '';

    container.innerHTML = `
      <div class="sl-guide-body">
        <div class="sl-guide-col">
          <div class="sl-team-section-head">
            <h3 class="sl-style-group-title">${createIconSvg('icon-guide', 'sl-icon-sm')} 18 Connected Island Biomes</h3>
            <span class="sl-pill">Tap Warp to fast-travel</span>
          </div>
          <div class="sl-guide-biome-grid" data-testid="guide-biomes-grid"></div>
        </div>

        <div class="sl-guide-side">
          <div class="sl-guide-hint sl-glass-soft" data-testid="guide-controls-card">
            <h3 class="sl-style-group-title">${createIconSvg('icon-compass', 'sl-icon-sm')} Controls &amp; Secret Arcade</h3>
            <ul class="sl-guide-controls-list">
              <li><strong>Move:</strong> WASD / Arrow Keys, Tap-to-Walk on map, or Touch D-Pad</li>
              <li><strong>Interact:</strong> Space / Enter or tap the bottom Context Interact Pill</li>
              <li><strong>Warps:</strong> Safe Zone heals at Village; Farm Zone picks ideal training biome</li>
            </ul>
            <div class="sl-alert-item" data-severity="info" data-testid="guide-secret-arcade-hint">
              ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
              <span>Hint: Check the glowing Star Emblem wall at (${SECRET_ARCADE_SPOT.x}, ${SECRET_ARCADE_SPOT.y}) in Starlight Village!</span>
            </div>
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
    `;

    this.biomesGridEl = container.querySelector('[data-testid="guide-biomes-grid"]');
    this.questsListEl = container.querySelector('[data-testid="guide-quests-list"]');
    this.questsCountEl = container.querySelector('[data-testid="guide-quests-count"]');
    this.arcadeHintEl = container.querySelector('[data-testid="guide-secret-arcade-hint"]');

    this.biomesGridEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-warp-biome]') as HTMLButtonElement | null;
      if (!btn) return;
      const biomeId = btn.getAttribute('data-warp-biome') as BiomeId | null;
      if (biomeId) {
        this.callbacks?.onWarpBiome(biomeId);
      }
    });
  }

  sync(profile: DojoProfileState, currentBiomeId: BiomeId, active: boolean): void {
    if (!active) return;

    const memo = [
      currentBiomeId,
      profile.playerLevel,
      profile.shrinesCleared.join(','),
      profile.chestsOpened.join(','),
      profile.questsCompleted.join(','),
      profile.biomesVisited.join(','),
      profile.arcade.unlocked,
      profile.arcade.secretKnocks,
      Object.keys(profile.pokedex.caught).length,
    ].join('|');

    if (memo === this.lastMemo) return;
    this.lastMemo = memo;

    const clearedSet = new Set(profile.shrinesCleared);
    const openedSet = new Set(profile.chestsOpened);
    const visitedSet = new Set(profile.biomesVisited);
    const questsDoneSet = new Set(profile.questsCompleted);

    if (this.biomesGridEl) {
      this.biomesGridEl.innerHTML = BIOME_IDS.map((bId) => {
        const vp = getBiomeVisualProfile(bId);
        const pal = TYPE_PALETTES[vp.elementalType] ?? TYPE_PALETTES.normal;
        const scaled = getBiomeScaledRange(bId, profile);
        const shrines = SHRINES_PER_BIOME.get(bId) ?? [];
        const shrinesDone = shrines.filter((id) => clearedSet.has(id)).length;
        const chests = CHESTS_PER_BIOME.get(bId) ?? [];
        const chestsDone = chests.filter((id) => openedSet.has(id)).length;
        const isCurrent = bId === currentBiomeId;
        const isVisited = isCurrent || visitedSet.has(bId);

        return `
          <article
            class="sl-guide-biome-card sl-glass-soft ${isCurrent ? 'is-current' : ''}"
            style="border-top-color:${isCurrent ? 'var(--sl-gold-bright)' : pal.primary};"
            data-testid="guide-biome-${bId}"
          >
            <div class="sl-guide-biome-head">
              <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                ${createIconSvg(typeToIconId(vp.elementalType), 'sl-icon-md')}
                <div style="min-width:0;">
                  <div class="sl-biome-name">${safeText(vp.displayName)}</div>
                  <div class="sl-biome-sub">${safeText(vp.subtitle)}</div>
                </div>
              </div>
              <span class="sl-pill sl-pill-gold sl-num">Lv.${scaled.minLv}-${scaled.maxLv}</span>
            </div>
            <div class="sl-guide-biome-meta sl-num">
              <span class="sl-pill">${createIconSvg('icon-shrine', 'sl-icon-sm')} ${shrinesDone}/${shrines.length}</span>
              <span class="sl-pill">${createIconSvg('icon-chest', 'sl-icon-sm')} ${chestsDone}/${chests.length}</span>
              <span class="sl-pill">${safeText(scaled.threatLabel)}${isVisited ? ' • Explored' : ''}</span>
            </div>
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

    if (this.arcadeHintEl) {
      const unlocked = Boolean(profile.arcade?.unlocked);
      const knocks = profile.arcade?.secretKnocks ?? 0;
      this.arcadeHintEl.innerHTML = `
        ${createIconSvg('icon-skyhop', 'sl-icon-sm')}
        <span>${
          unlocked
            ? `Sky-Hop Arcade Unlocked! High Score: ${profile.arcade.highScore} (Best Wave ${profile.arcade.bestWave})`
            : `Secret Arcade Wall at (${SECRET_ARCADE_SPOT.x}, ${SECRET_ARCADE_SPOT.y}) in Starlight Village: Earn 1 Badge or catch 5 species, then knock 3 times (${knocks}/3).`
        }</span>
      `;
    }

    if (this.questsCountEl) {
      this.questsCountEl.textContent = `${questsDoneSet.size} / ${FIELD_QUESTS.length} Done`;
    }

    if (this.questsListEl) {
      this.questsListEl.innerHTML = FIELD_QUESTS.map((q) => {
        const done = questsDoneSet.has(q.id);
        const npcName = NPC_NAME_BY_ID.get(q.npcId) ?? q.npcId;
        let prog = '';
        try {
          const rawQuest = q as unknown as {
            progressText?: (p: DojoProfileState) => string;
            progress?: (p: DojoProfileState) => string;
          };
          if (typeof rawQuest.progressText === 'function') {
            prog = stripEmojis(rawQuest.progressText(profile));
          } else if (typeof rawQuest.progress === 'function') {
            prog = stripEmojis(rawQuest.progress(profile));
          }
        } catch {
          prog = '';
        }
        return `
          <div class="sl-quest-row" data-done="${done}" data-testid="guide-quest-${safeText(q.id)}">
            <div class="sl-quest-head">
              <strong class="sl-quest-title">${safeText(stripEmojis(q.title))}</strong>
              <span class="sl-pill ${done ? 'sl-pill-emerald' : ''}">
                ${createIconSvg(done ? 'icon-check' : 'icon-quest', 'sl-icon-sm')}
                <span>${done ? 'Completed' : safeText(npcName)}</span>
              </span>
            </div>
            <div class="sl-quest-desc">
              ${safeText(stripEmojis(q.description))}
            </div>
            ${prog ? `<div class="sl-num" style="font-size:11px; font-weight:700; color:var(--sl-cyan);">${safeText(prog)}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  dispose(): void {
    this.biomesGridEl = null;
    this.questsListEl = null;
    this.questsCountEl = null;
    this.arcadeHintEl = null;
    this.callbacks = null;
  }
}
