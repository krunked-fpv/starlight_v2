import type {
  DojoBadgeEntry,
  DojoProfileState,
  IconId,
  UIBridgeCallbacks,
} from '../contracts';
import { getAllBadges, typeToIconId } from '../core';
import { badgeIconId, createIconSvg, safeText } from './iconHelper';

export class BadgesShowcase {
  private selectedBadgeId = '';
  private badgeButtons = new Map<string, HTMLButtonElement>();
  private progressPillEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private lastMemo = '';
  private currentBadges: DojoBadgeEntry[] = getAllBadges();
  private currentUnlocked = new Set<string>();

  mount(container: HTMLElement, _callbacks: UIBridgeCallbacks): void {
    this.badgeButtons.clear();
    this.currentBadges = getAllBadges();
    this.selectedBadgeId = this.currentBadges[0]?.id ?? 'forest';
    this.lastMemo = '';

    container.innerHTML = `
      <div class="sl-badges-body">
        <div class="sl-badges-summary">
          <span class="sl-pill sl-num" data-testid="badges-progress-summary">0 / 28 Badges Earned</span>
          <div style="flex: 1 1 200px; max-width: 360px;">
            <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-dash" data-testid="badges-progress-bar" style="--fill: 0;"></div></div>
          </div>
        </div>
        <div class="sl-badge-case">
          <div class="sl-badge-grid" data-testid="badges-grid"></div>
        </div>
        <div class="sl-badge-detail" data-testid="badge-detail"></div>
      </div>
    `;

    this.progressPillEl = container.querySelector('[data-testid="badges-progress-summary"]');
    this.progressBarEl = container.querySelector('[data-testid="badges-progress-bar"]');
    this.gridEl = container.querySelector('[data-testid="badges-grid"]');
    this.detailEl = container.querySelector('[data-testid="badge-detail"]');

    this.renderGrid(this.currentBadges);
  }

  private renderGrid(badges: DojoBadgeEntry[]): void {
    if (!this.gridEl) return;
    this.badgeButtons.clear();
    const sorted = [...badges].sort((a, b) => a.index - b.index);
    this.currentBadges = sorted;
    if (!this.selectedBadgeId && sorted[0]) {
      this.selectedBadgeId = sorted[0].id;
    }

    this.gridEl.innerHTML = sorted
      .map((b) => {
        const material =
          b.index >= 25
            ? 'astral'
            : b.index >= 19
              ? 'gold'
              : b.index >= 13
                ? 'prism'
                : b.index >= 7
                  ? 'silver'
                  : 'obsidian';
        return `
          <button
            type="button"
            class="sl-badge-card"
            data-badge-id="${safeText(b.id)}"
            data-testid="badge-card-${b.index}"
            data-material="${material}"
            data-unlocked="false"
          >
            ${createIconSvg(badgeIconId(b.index), 'sl-icon-xl')}
            <span class="sl-badge-name">${safeText(b.name)}</span>
            <span class="sl-pill sl-num" style="min-height:22px; font-size:10px;">
              ${createIconSvg(typeToIconId(b.type), 'sl-icon-sm')}
              #${String(b.index).padStart(2, '0')}
            </span>
          </button>
        `;
      })
      .join('');

    for (const b of sorted) {
      const btn = this.gridEl.querySelector(`[data-badge-id="${b.id}"]`) as HTMLButtonElement | null;
      if (!btn) continue;
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

  sync(profile: DojoProfileState, badges: DojoBadgeEntry[], active: boolean): void {
    const list = badges.length > 0 ? badges : getAllBadges();
    if (list.length !== this.currentBadges.length) {
      this.renderGrid(list);
    }
    const unlocked = new Set<string>(Array.isArray(profile.badges) ? profile.badges : []);
    for (const b of list) {
      if (!unlocked.has(b.id) && b.check(profile)) {
        unlocked.add(b.id);
      }
    }
    this.currentUnlocked = unlocked;
    if (!active) return;
    this.updateSelectionAndDetail();
  }

  private updateSelectionAndDetail(): void {
    const memo = `${this.selectedBadgeId}|${Array.from(this.currentUnlocked).sort().join(',')}`;
    if (memo === this.lastMemo) return;
    this.lastMemo = memo;

    let totalEarned = 0;
    for (const b of this.currentBadges) {
      const unlocked = this.currentUnlocked.has(b.id);
      if (unlocked) totalEarned += 1;
      const btn = this.badgeButtons.get(b.id);
      if (btn) {
        btn.setAttribute('data-unlocked', String(unlocked));
        btn.classList.toggle('is-selected', b.id === this.selectedBadgeId);
        btn.setAttribute('aria-pressed', String(b.id === this.selectedBadgeId));
      }
    }

    if (this.progressPillEl) {
      this.progressPillEl.textContent = `${totalEarned} / ${this.currentBadges.length} Island Badges Earned`;
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
      this.detailEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          ${createIconSvg(badgeIconId(activeBadge.index), 'sl-icon-lg')}
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong>#${String(activeBadge.index).padStart(2, '0')} ${safeText(activeBadge.name)}</strong>
              <span class="sl-pill sl-type-pill" data-type="${activeBadge.type}">
                ${createIconSvg(typeToIconId(activeBadge.type), 'sl-icon-sm')}
                <span>${safeText(activeBadge.type.toUpperCase())}</span>
              </span>
              <span class="sl-pill">
                ${createIconSvg(activeBadge.iconId as IconId, 'sl-icon-sm')}
                <span>Crest</span>
              </span>
            </div>
            <div style="font-size:12px; color:var(--sl-text-secondary); margin-top:4px;">
              ${safeText(activeBadge.description)}
            </div>
          </div>
        </div>
        <span class="sl-pill" style="border-color:${unlocked ? 'var(--sl-emerald)' : 'var(--sl-border-subtle)'};">
          ${unlocked ? createIconSvg('icon-crown', 'sl-icon-sm') : createIconSvg('icon-lock', 'sl-icon-sm')}
          <span>${unlocked ? 'Earned' : 'Locked'}</span>
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
  }
}
