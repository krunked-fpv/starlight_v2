import type {
  AtlasManifest,
  DecodedSpriteFrames,
  TacticalBriefingData,
  UIBridgeCallbacks,
} from '../contracts';
import {
  getAllBadges,
  getBiomeVisualProfile,
  getSpeciesEntry,
  RIVAL_TRAINERS,
  SHRINES,
  stripEmojis,
  typeToIconId,
} from '../core';
import { createIconSvg, renderPokemonPreviewCanvas, safeText } from './iconHelper';

export interface BriefingModalAssets {
  manifest: AtlasManifest | null;
  fallbacksSheet: CanvasImageSource | null;
  frames: DecodedSpriteFrames | null;
  isRematch?: boolean;
}

export class BriefingModal {
  private callbacks: UIBridgeCallbacks | null = null;
  private contentEl: HTMLElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private challengeBtn: HTMLButtonElement | null = null;
  private healBtn: HTMLButtonElement | null = null;
  private farmBtn: HTMLButtonElement | null = null;
  private lastKey = '';
  private lastRenderStamp = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.lastKey = '';
    this.lastRenderStamp = '';

    container.innerHTML = `
      <div class="sl-briefing-drawer sl-glass sl-rpg-ornate" data-testid="briefing-drawer" role="dialog" aria-modal="true" aria-label="Tactical Readiness Briefing">
        <div class="sl-briefing-head">
          <h2 class="sl-modal-title" style="font-size:17px;">
            ${createIconSvg('icon-briefing', 'sl-icon-md')}
            <span>Tactical Readiness Briefing</span>
          </h2>
          <button type="button" class="sl-btn sl-btn-ghost" data-testid="briefing-close">
            ${createIconSvg('icon-close', 'sl-icon-sm')}
            <span>Close</span>
          </button>
        </div>

        <div data-testid="briefing-content" class="sl-briefing-content"></div>

        <div class="sl-briefing-actions">
          <button type="button" class="sl-btn sl-btn-primary" data-testid="briefing-challenge">
            ${createIconSvg('icon-sword', 'sl-icon-sm')}
            <span>Challenge Now</span>
          </button>
          <button type="button" class="sl-btn sl-btn-cyan" data-testid="briefing-heal-village">
            ${createIconSvg('icon-fountain', 'sl-icon-sm')}
            <span>Heal at Village</span>
          </button>
          <button type="button" class="sl-btn" data-testid="briefing-warp-farm">
            ${createIconSvg('icon-warp-farm', 'sl-icon-sm')}
            <span>Warp to Farm Zone</span>
          </button>
        </div>
      </div>
    `;

    this.contentEl = container.querySelector('[data-testid="briefing-content"]');
    this.challengeBtn = container.querySelector('[data-testid="briefing-challenge"]');
    this.healBtn = container.querySelector('[data-testid="briefing-heal-village"]');
    this.farmBtn = container.querySelector('[data-testid="briefing-warp-farm"]');

    container.querySelector('[data-testid="briefing-close"]')?.addEventListener('click', () => {
      this.callbacks?.onDismissBriefing();
    });
    this.challengeBtn?.addEventListener('click', () => {
      this.callbacks?.onConfirmBriefing();
    });
    this.healBtn?.addEventListener('click', () => {
      this.callbacks?.onWarpSafeZone();
    });
    this.farmBtn?.addEventListener('click', () => {
      this.callbacks?.onWarpFarmZone();
    });
  }

  sync(b: TacticalBriefingData | null, active: boolean, timeSec: number, assets: BriefingModalAssets): void {
    if (!active || !b || !this.contentEl) return;

    const isRematch = Boolean(assets.isRematch);
    const key = [
      b.kind,
      b.targetId,
      b.biomeId,
      b.tier,
      b.label,
      b.teamLevel,
      b.targetLevel,
      Math.round(b.avgHpRatio * 100),
      b.faintedCount,
      b.healthyCount,
      b.hasTypeAdvantage,
      b.hasTypeRisk,
      b.canChallenge,
      b.farmZoneBiomeName,
      b.suggestedCounterTypes.join(','),
      b.upgradeTier ?? 0,
      b.badgeName ?? '',
      b.rematchNumber ?? 0,
      b.partyPreview?.map((m) => `${m.speciesId}:${m.level}`).join(',') ?? '',
      isRematch,
    ].join('|');

    if (key !== this.lastKey) {
      this.lastKey = key;
      const biomeVisual = getBiomeVisualProfile(b.biomeId);
      const hpPct = Math.round(Math.max(0, Math.min(1, b.avgHpRatio)) * 100);
      const deltaLabel = b.levelDelta >= 0 ? `+${b.levelDelta}` : `${b.levelDelta}`;
      const showBiomeChip = b.title.trim().toLowerCase() !== biomeVisual.displayName.trim().toLowerCase();

      // V1 Parity (#32): resolve badge reward, rival full party roster, Star Rank & Rematch pills
      const shrineObj = b.kind === 'shrine' || b.kind === 'shrine-trial' ? SHRINES[b.targetId] : null;
      const rivalObj = b.kind === 'rival' ? RIVAL_TRAINERS[b.targetId] : null;
      const badgeLookup = shrineObj?.badgeId ? getAllBadges().find((bg) => bg.id === shrineObj.badgeId) : null;
      const resolvedBadgeName = b.badgeName || (badgeLookup ? stripEmojis(badgeLookup.name) : '');
      const resolvedUpgradeTier = b.upgradeTier ?? (shrineObj ? 2 : 0);
      const resolvedParty =
        Array.isArray(b.partyPreview) && b.partyPreview.length > 0
          ? b.partyPreview
          : rivalObj && Array.isArray(rivalObj.party)
            ? rivalObj.party.map((slot) => {
                const sp = getSpeciesEntry(slot.speciesId);
                return {
                  speciesId: sp.id,
                  name: sp.name,
                  level: Math.max(1, slot.level),
                  type: sp.type,
                  upgradeTier: 0,
                };
              })
            : [];

      const partyRosterHtml =
        resolvedParty.length > 0
          ? `
            <div class="sl-briefing-roster" data-testid="briefing-party-roster">
              <span class="sl-vital-label" style="margin-bottom:2px;">Opponent Party (${resolvedParty.length})</span>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${resolvedParty
                  .map(
                    (m) => `
                  <span class="sl-pill sl-num">
                    ${createIconSvg(typeToIconId(m.type), 'sl-icon-sm')}
                    <span>${safeText(stripEmojis(m.name))} Lv.${m.level}${m.upgradeTier ? ` Rank ${m.upgradeTier}` : ''}</span>
                  </span>
                `,
                  )
                  .join('')}
              </div>
            </div>
          `
          : '';

      const enemyTypePills = b.enemyTypes
        .map(
          (t) => `
          <span class="sl-pill sl-type-pill" data-type="${t}">
            ${createIconSvg(typeToIconId(t), 'sl-icon-sm')}
            <span>${safeText(t.toUpperCase())}</span>
          </span>`,
        )
        .join('');

      const counterPills = b.suggestedCounterTypes.length > 0
        ? b.suggestedCounterTypes
            .map(
              (t) => `
              <span class="sl-pill sl-type-pill" data-type="${t}">
                ${createIconSvg(typeToIconId(t), 'sl-icon-sm')}
                <span>${safeText(t.toUpperCase())}</span>
              </span>`,
            )
            .join('')
        : `<span class="sl-pill">${createIconSvg('icon-balance', 'sl-icon-sm')} Any Balanced Type</span>`;

      const matchupNote = b.hasTypeAdvantage && !b.hasTypeRisk
        ? 'Type Advantage Active'
        : b.hasTypeRisk && !b.hasTypeAdvantage
          ? 'Type Weakness Detected'
          : b.hasTypeAdvantage && b.hasTypeRisk
            ? 'Mixed Type Matchup'
            : 'Neutral Type Matchup';

      const displayTitle =
        isRematch && !/rematch/i.test(b.title) ? `${b.title} (Rematch)` : b.title;

      this.contentEl.innerHTML = `
        <div class="sl-briefing-score-box">
          <canvas class="sl-briefing-preview" width="84" height="84" data-testid="briefing-preview-canvas" aria-hidden="true"></canvas>
          <div class="sl-briefing-title-col">
            <div class="sl-briefing-title-row">
              <strong>${safeText(displayTitle)}</strong>
              <span class="sl-pill sl-readiness-pill" data-tier="${b.tier}" data-testid="briefing-tier-badge">
                ${createIconSvg(b.iconId, 'sl-icon-sm')}
                <span>${safeText(b.label)}</span>
              </span>
            </div>
            <div class="sl-briefing-sub">${safeText(b.subtitle)}</div>
            <div class="sl-briefing-types">
              ${showBiomeChip ? `<span class="sl-pill">${safeText(biomeVisual.displayName)}</span>` : ''}
              ${enemyTypePills}
              ${resolvedUpgradeTier > 0 ? `<span class="sl-pill sl-pill-gold sl-num">${createIconSvg('icon-star-rank', 'sl-icon-sm')} Rank ${resolvedUpgradeTier}</span>` : ''}
              ${resolvedBadgeName ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-badges', 'sl-icon-sm')} ${safeText(resolvedBadgeName)}</span>` : ''}
              ${b.rematchNumber && b.rematchNumber > 0 ? `<span class="sl-pill sl-pill-cyan sl-num">Rematch #${b.rematchNumber}</span>` : isRematch ? `<span class="sl-pill sl-pill-cyan">Rematch</span>` : ''}
            </div>
          </div>
        </div>
        ${partyRosterHtml}

        <div class="sl-briefing-kpis sl-num">
          <div class="sl-vital-box">
            ${createIconSvg('icon-team', 'sl-icon-md')}
            <div class="sl-vital-copy">
              <span class="sl-vital-label">Level Matchup</span>
              <span class="sl-vital-val">Team Lv.${b.teamLevel} vs Lv.${b.targetLevel} (${deltaLabel})</span>
            </div>
          </div>
          <div class="sl-vital-box">
            ${createIconSvg('icon-bond', 'sl-icon-md')}
            <div class="sl-vital-copy" style="flex:1;">
              <span class="sl-vital-label">Party Readiness</span>
              <span class="sl-vital-val">HP ${hpPct}% (${b.healthyCount} Ready / ${b.faintedCount} Fainted)</span>
              <div class="sl-bar-track sl-bar-track-sm" style="margin-top:3px;">
                <div class="sl-bar-fill sl-bar-hp" data-low="${hpPct <= 25}" data-mid="${hpPct > 25 && hpPct <= 55}" style="--fill:${Math.max(0, Math.min(1, b.avgHpRatio))};"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="sl-alert-item" data-severity="${b.hasTypeRisk ? 'warn' : b.hasTypeAdvantage ? 'advantage' : 'info'}">
          ${createIconSvg(b.hasTypeRisk ? 'icon-warn' : b.hasTypeAdvantage ? 'icon-check' : 'icon-balance', 'sl-icon-sm')}
          <div style="display:flex; flex-direction:column; gap:6px; min-width:0;">
            <strong>${safeText(matchupNote)} — Target: ${safeText(b.previewSpeciesName)}</strong>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-size:11.5px; color:var(--sl-text-secondary);">Suggested Counters:</span>
              ${counterPills}
            </div>
          </div>
        </div>

        <div class="sl-alert-item" data-severity="${b.needsHeal ? 'warn' : 'info'}">
          ${createIconSvg(b.needsHeal ? 'icon-potion' : 'icon-briefing', 'sl-icon-sm')}
          <span>${safeText(b.tip)}</span>
        </div>
      `;

      this.previewCanvas = this.contentEl.querySelector('[data-testid="briefing-preview-canvas"]');
      if (this.challengeBtn) {
        this.challengeBtn.disabled = !b.canChallenge;
        const span = this.challengeBtn.querySelector('span');
        if (span) {
          span.textContent =
            b.biomeId === 'village' && b.kind === 'biome'
              ? 'Enter Whispering Forest'
              : 'Challenge Now';
        }
      }
      if (this.healBtn) {
        this.healBtn.classList.toggle('sl-btn-primary', Boolean(b.needsHeal));
        this.healBtn.classList.toggle('sl-btn-cyan', !b.needsHeal);
      }
      if (this.farmBtn) {
        const recommendFarm = !b.needsHeal && (b.tier === 'danger' || b.tier === 'challenging');
        this.farmBtn.classList.toggle('sl-btn-cyan', recommendFarm);
        const span = this.farmBtn.querySelector('span');
        if (span) span.textContent = `Farm: ${b.farmZoneBiomeName}`;
      }
      this.lastRenderStamp = '';
    }

    const animated = (assets.frames?.frames.length ?? 0) > 1;
    const stamp = `${b.previewSpeciesId}|${animated ? Math.floor(timeSec * 8) : 0}|${Boolean(assets.fallbacksSheet)}|${Boolean(assets.frames)}`;
    if (this.previewCanvas && stamp !== this.lastRenderStamp) {
      this.lastRenderStamp = stamp;
      renderPokemonPreviewCanvas(
        this.previewCanvas,
        b.previewSpeciesId,
        assets.frames,
        assets.fallbacksSheet,
        assets.manifest,
        false,
        timeSec,
      );
    }
  }

  dispose(): void {
    this.contentEl = null;
    this.previewCanvas = null;
    this.challengeBtn = null;
    this.healBtn = null;
    this.farmBtn = null;
    this.callbacks = null;
  }
}
