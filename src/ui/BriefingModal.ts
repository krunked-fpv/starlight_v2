import type {
  AtlasManifest,
  DecodedSpriteFrames,
  TacticalBriefingData,
  UIBridgeCallbacks,
} from '../contracts';
import { getBiomeVisualProfile, typeToIconId } from '../core';
import { createIconSvg, renderPokemonPreviewCanvas, safeText } from './iconHelper';

export interface BriefingModalAssets {
  manifest: AtlasManifest | null;
  fallbacksSheet: CanvasImageSource | null;
  frames: DecodedSpriteFrames | null;
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
      <div class="sl-briefing-drawer sl-glass" data-testid="briefing-drawer" role="dialog" aria-modal="true" aria-label="Tactical Readiness Briefing">
        <div class="sl-briefing-head">
          <h2 class="sl-modal-title" style="font-size:16px;">
            ${createIconSvg('icon-briefing', 'sl-icon-md')}
            <span>Tactical Readiness Briefing</span>
          </h2>
          <button type="button" class="sl-btn" data-testid="briefing-close">
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
      this.callbacks?.onDismissBriefing();
    });
    this.farmBtn?.addEventListener('click', () => {
      this.callbacks?.onWarpFarmZone();
      this.callbacks?.onDismissBriefing();
    });
  }

  sync(b: TacticalBriefingData | null, active: boolean, timeSec: number, assets: BriefingModalAssets): void {
    if (!active || !b || !this.contentEl) return;

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
    ].join('|');

    if (key !== this.lastKey) {
      this.lastKey = key;
      const biomeVisual = getBiomeVisualProfile(b.biomeId);
      const hpPct = Math.round(Math.max(0, Math.min(1, b.avgHpRatio)) * 100);
      const deltaLabel = b.levelDelta >= 0 ? `+${b.levelDelta}` : `${b.levelDelta}`;

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

      this.contentEl.innerHTML = `
        <div class="sl-briefing-score-box">
          <canvas class="sl-briefing-preview" width="84" height="84" data-testid="briefing-preview-canvas" aria-hidden="true"></canvas>
          <div class="sl-briefing-title-col">
            <div class="sl-briefing-title-row">
              <strong>${safeText(b.title)}</strong>
              <span class="sl-pill sl-readiness-pill" data-tier="${b.tier}" data-testid="briefing-tier-badge">
                ${createIconSvg(b.iconId, 'sl-icon-sm')}
                <span>${safeText(b.label)}</span>
              </span>
            </div>
            <div class="sl-briefing-sub">${safeText(b.subtitle)}</div>
            <div class="sl-briefing-types">
              <span class="sl-pill">${safeText(biomeVisual.displayName)}</span>
              ${enemyTypePills}
            </div>
          </div>
        </div>

        <div class="sl-briefing-kpis sl-num">
          <div class="sl-vital-box">
            ${createIconSvg('icon-team', 'sl-icon-sm')}
            <span>Team Lv.${b.teamLevel} vs Lv.${b.targetLevel} (${deltaLabel})</span>
          </div>
          <div class="sl-vital-box">
            ${createIconSvg('icon-bond', 'sl-icon-sm')}
            <span>Party HP: ${hpPct}% (${b.healthyCount} Ready / ${b.faintedCount} Fainted)</span>
          </div>
        </div>

        <div class="sl-alert-item" data-severity="${b.hasTypeRisk ? 'warn' : b.hasTypeAdvantage ? 'advantage' : 'info'}">
          ${createIconSvg(b.hasTypeRisk ? 'icon-warn' : b.hasTypeAdvantage ? 'icon-check' : 'icon-balance', 'sl-icon-sm')}
          <div style="display:flex; flex-direction:column; gap:6px; min-width:0;">
            <strong>${safeText(matchupNote)} — Target: ${safeText(b.previewSpeciesName)}</strong>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-size:11px; color:var(--sl-text-secondary);">Suggested Counters:</span>
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
      }
      if (this.farmBtn) {
        const span = this.farmBtn.querySelector('span');
        if (span) span.textContent = `Farm: ${b.farmZoneBiomeName}`;
      }
      this.lastRenderStamp = '';
    }

    const stamp = `${b.previewSpeciesId}|${Math.floor(timeSec * 12)}|${Boolean(assets.fallbacksSheet)}`;
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
