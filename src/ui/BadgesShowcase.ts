import type { BadgeDefinition, TrainerProfile, UIBridgeCallbacks } from '../contracts';
import { BADGE_DEFINITIONS, BIOME_DESCRIPTORS } from '../core';
import { badgeIconId, iconSvg, safeText, typeIconId } from './iconHelper';

export class BadgesShowcase {
  private callbacks: UIBridgeCallbacks | null = null;
  private selectedBadgeId = BADGE_DEFINITIONS[0]?.id ?? 'badge-normal';
  private badgeButtons = new Map<string, HTMLButtonElement>();
  private progressPillEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private lastMemo = '';
  private currentBadges: BadgeDefinition[] = BADGE_DEFINITIONS;
  private currentUnlocked = new Set<string>();

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.badgeButtons.clear();

    container.innerHTML = `
      <div class="sl-modal-panel sl-glass" role="dialog" aria-modal="true" aria-label="28 Elemental & Mastery Badges Case">
        <div class="sl-modal-header">
          <h2 class="sl-modal-title">
            ${iconSvg('icon-badges', 'sl-icon-md')}
            <span>28 Elemental &amp; Mastery Badges</span>
          </h2>
          <button type="button" class="sl-btn" data-testid="badges-close">Return to Island</button>
        </div>
        <div class="sl-badges-body">
          <div class="sl-badges-summary">
            <span class="sl-pill sl-num" data-testid="badges-progress-summary">0 / 28 Badges Earned</span>
            <div style="flex: 1 1 200px; max-width: 340px;">
              <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-dash" data-testid="badges-progress-bar" style="--fill: 0;"></div></div>
            </div>
          </div>
          <div class="sl-badge-case">
            <div class="sl-badge-grid" data-testid="badges-grid"></div>
          </div>
          <div class="sl-badge-detail" data-testid="badge-detail"></div>
        </div>
      </div>
    `;

    this.progressPillEl = container.querySelector('[data-testid="badges-progress-summary"]') as HTMLElement | null;
    this.progressBarEl = container.querySelector('[data-testid="badges-progress-bar"]') as HTMLElement | null;
    this.gridEl = container.querySelector('[data-testid="badges-grid"]') as HTMLElement | null;
    this.detailEl = container.querySelector('[data-testid="badge-detail"]') as HTMLElement | null;

    const closeBtn = container.querySelector('[data-testid="badges-close"]') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => {
      this.callbacks?.onNavigateScreen('overworld');
    });

    this.renderGrid(BADGE_DEFINITIONS);
  }

  private renderGrid(badges: BadgeDefinition[]): void {
    if (!this.gridEl) return;
    this.badgeButtons.clear();
    const sorted = [...badges].sort((a, b) => a.index - b.index);
    this.currentBadges = sorted;

    this.gridEl.innerHTML = sorted
      .map(
        (b) => `
        <button
          type="button"
          class="sl-badge-card"
          data-badge-id="${safeText(b.id)}"
          data-testid="badge-card-${b.index}"
          data-material="${b.material}"
          data-unlocked="false"
        >
          ${iconSvg(badgeIconId(b.index), 'sl-icon-xl')}
          <span class="sl-badge-name">${safeText(b.name)}</span>
          <span class="sl-pill sl-num" style="min-height:22px; font-size:10px;">
            #${String(b.index).padStart(2, '0')} • ${b.category === 'elemental' ? 'Shrine' : 'Mastery'}
          </span>
        </button>
      `,
      )
      .join('');

    for (const b of sorted) {
      const btn = this.gridEl.querySelector(`[data-badge-id="${b.id}"]`) as HTMLButtonElement | null;
      if (btn) {
        this.badgeButtons.set(b.id, btn);
        btn.addEventListener('click', () => {
          this.selectedBadgeId = b.id;
          this.lastMemo = '';
          this.updateSelectionAndDetail();
        });
        btn.addEventListener('mouseenter', () => {
          this.selectedBadgeId = b.id;
          this.lastMemo = '';
          this.updateSelectionAndDetail();
        });
      }
    }
  }

  sync(profile: TrainerProfile, badges: BadgeDefinition[], active: boolean): void {
    const list = badges.length > 0 ? badges : BADGE_DEFINITIONS;
    if (list.length !== this.currentBadges.length) {
      this.renderGrid(list);
    }
    this.currentUnlocked = new Set(profile.badges);
    if (!active) return;
    this.updateSelectionAndDetail();
  }

  private updateSelectionAndDetail(): void {
    const memo = `${this.selectedBadgeId}|${Array.from(this.currentUnlocked).sort().join(',')}`;
    if (memo === this.lastMemo) return;
    this.lastMemo = memo;

    let totalEarned = 0;
    let elementalEarned = 0;
    let masteryEarned = 0;

    for (const b of this.currentBadges) {
      const unlocked = this.currentUnlocked.has(b.id);
      if (unlocked) {
        totalEarned += 1;
        if (b.category === 'elemental') elementalEarned += 1;
        else masteryEarned += 1;
      }
      const btn = this.badgeButtons.get(b.id);
      if (btn) {
        btn.setAttribute('data-unlocked', String(unlocked));
        btn.classList.toggle('is-selected', b.id === this.selectedBadgeId);
        btn.setAttribute('aria-pressed', String(b.id === this.selectedBadgeId));
      }
    }

    if (this.progressPillEl) {
      this.progressPillEl.textContent = `${totalEarned} / ${this.currentBadges.length} Earned • ${elementalEarned}/18 Shrine • ${masteryEarned}/10 Mastery`;
    }
    if (this.progressBarEl) {
      this.progressBarEl.style.setProperty(
        '--fill',
        String(Math.min(1, totalEarned / Math.max(1, this.currentBadges.length))),
      );
    }

    const activeBadge =
      this.currentBadges.find((b) => b.id === this.selectedBadgeId) ?? this.currentBadges[0];
    if (this.detailEl && activeBadge) {
      const unlocked = this.currentUnlocked.has(activeBadge.id);
      const biomeName = BIOME_DESCRIPTORS[activeBadge.biomeId]?.name ?? activeBadge.biomeId;
      this.detailEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          ${iconSvg(badgeIconId(activeBadge.index), 'sl-icon-lg')}
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong>${safeText(activeBadge.name)}</strong>
              <span class="sl-pill sl-type-pill" data-type="${activeBadge.type}">
                ${iconSvg(typeIconId(activeBadge.type), 'sl-icon-sm')}
                <span>${safeText(activeBadge.material.toUpperCase())}</span>
              </span>
              <span class="sl-pill">${safeText(biomeName)}</span>
            </div>
            <div style="font-size:12px; color:var(--sl-text-secondary); margin-top:2px;">
              ${safeText(activeBadge.requirement)}
            </div>
          </div>
        </div>
        <span class="sl-pill" style="border-color:${unlocked ? 'var(--sl-emerald)' : 'var(--sl-border-subtle)'};">
          ${unlocked ? iconSvg('icon-crown', 'sl-icon-sm') : iconSvg('icon-shrine', 'sl-icon-sm')}
          <span>${unlocked ? 'Unlocked' : 'Locked'}</span>
        </span>
      `;
    }
  }

  dispose(): void {
    this.badgeButtons.clear();
    this.progressPillEl = null;
    this.progressBarEl = null;
    this.detailEl = null;
    this.gridEl = null;
    this.callbacks = null;
  }
}
