import type {
  DojoBadgeEntry,
  DojoProfileState,
  IconId,
  UIBridgeCallbacks,
} from '../contracts';
import { getAllBadges, typeToIconId } from '../core';
import { badgeIconId, createIconSvg, safeText } from './iconHelper';

function getBadgeMaterial(index: number): { id: string; label: string } {
  if (index >= 25) return { id: 'astral', label: 'Astral Crest' };
  if (index >= 19) return { id: 'gold', label: 'Gold Crest' };
  if (index >= 13) return { id: 'prism', label: 'Prism Crest' };
  if (index >= 7) return { id: 'silver', label: 'Silver Crest' };
  return { id: 'obsidian', label: 'Obsidian Crest' };
}

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
          <span class="sl-pill sl-pill-gold sl-num" data-testid="badges-progress-summary">0 / 28 Island Badges Earned</span>
          <div style="flex: 1 1 220px; max-width: 420px;">
            <div class="sl-bar-track"><div class="sl-bar-fill sl-bar-dash" data-testid="badges-progress-bar" style="--fill: 0;"></div></div>
          </div>
          <span class="sl-pill">Select any crest to inspect unlock criteria</span>
        </div>
        <div class="sl-badge-case">
          <div class="sl-badge-velvet">
            <div class="sl-badge-grid" data-testid="badges-grid"></div>
          </div>
          <aside class="sl-badge-detail" data-testid="badge-detail" aria-live="polite"></aside>
        </div>
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
        const material = getBadgeMaterial(b.index);
        return `
          <button
            type="button"
            class="sl-badge-card"
            data-badge-id="${safeText(b.id)}"
            data-testid="badge-card-${b.index}"
            data-material="${material.id}"
            data-unlocked="false"
          >
            ${createIconSvg(badgeIconId(b.index), 'sl-icon-xl')}
            <span class="sl-badge-name">${safeText(b.name)}</span>
            <span class="sl-pill sl-num" style="min-height:20px; padding:1px 7px; font-size:10px;">
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
      const material = getBadgeMaterial(activeBadge.index);
      this.detailEl.innerHTML = `
        <div class="sl-badge-pedestal" style="opacity:${unlocked ? 1 : 0.6};">
          ${createIconSvg(badgeIconId(activeBadge.index), 'sl-icon-xxl')}
        </div>
        <div>
          <div class="sl-num" style="font-size:11px; color:var(--sl-text-dim); font-weight:800; letter-spacing:0.08em;">
            BADGE #${String(activeBadge.index).padStart(2, '0')} • ${safeText(material.label.toUpperCase())}
          </div>
          <h3 style="margin:4px 0 0; font-family:var(--sl-font-display); font-size:19px; color:var(--sl-gold-bright);">
            ${safeText(activeBadge.name)}
          </h3>
        </div>
        <div style="display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap;">
          <span class="sl-pill sl-type-pill" data-type="${activeBadge.type}">
            ${createIconSvg(typeToIconId(activeBadge.type), 'sl-icon-sm')}
            <span>${safeText(activeBadge.type.toUpperCase())}</span>
          </span>
          <span class="sl-pill ${unlocked ? 'sl-pill-emerald' : ''}">
            ${unlocked ? createIconSvg('icon-crown', 'sl-icon-sm') : createIconSvg('icon-lock', 'sl-icon-sm')}
            <span>${unlocked ? 'Earned' : 'Locked'}</span>
          </span>
        </div>
        <p style="margin:0; font-size:13px; color:var(--sl-text-muted); line-height:1.48;">
          ${safeText(activeBadge.description)}
        </p>
        <div class="sl-pill sl-pill-cyan">
          ${createIconSvg(activeBadge.iconId as IconId, 'sl-icon-sm')}
          <span>${unlocked ? 'Displayed in Jewel Case' : 'Complete goal to unlock'}</span>
        </div>
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
