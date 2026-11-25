import type {
  AtlasManifest,
  DecodedSpriteFrames,
  DojoPokemonJSON,
  DojoProfileState,
  UIBridgeCallbacks,
} from '../contracts';
import {
  getAbilityEntry,
  getAllEvolutionItems,
  getBondTier,
  getEvolutionRules,
  getSpeciesEntry,
  MAX_CHEER_CHARGES,
  Pokemon,
  STEPS_PER_CHEER_CHARGE,
  stripEmojis,
  typeToIconId,
} from '../core';
import { createIconSvg, renderPokemonPreviewCanvas, safeText } from './iconHelper';

export interface TeamBoxAssets {
  manifest: AtlasManifest | null;
  fallbacksSheet: CanvasImageSource | null;
  getFrames?: (speciesId: number, shiny: boolean) => DecodedSpriteFrames | null;
}

function hydrateStats(json: DojoPokemonJSON): { maxHp: number; atk: number; def: number; spd: number; xpToNext: number } {
  try {
    const mon = Pokemon.fromJSON(json);
    return {
      maxHp: mon.maxHp,
      atk: mon.atk,
      def: mon.def,
      spd: mon.spd,
      xpToNext: mon.xpToNext,
    };
  } catch {
    return {
      maxHp: json.maxHp ?? Math.max(20, json.hp),
      atk: json.atk ?? 10,
      def: json.def ?? 10,
      spd: json.spd ?? 10,
      xpToNext: json.xpToNext ?? 100,
    };
  }
}

export class TeamBoxView {
  private callbacks: UIBridgeCallbacks | null = null;
  private bagStripEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private swapBannerEl: HTMLElement | null = null;
  private teamGridEl: HTMLElement | null = null;
  private boxGridEl: HTMLElement | null = null;
  private selectedTeamSwapIdx: number | null = null;
  private selectedBoxSwapIdx: number | null = null;
  private editingNicknameUid: string | null = null;
  private celebrationBanner: { kind: 'upgrade' | 'cheer' | 'evolve'; eyebrow: string; title: string; detail: string } | null = null;
  private currentProfile: DojoProfileState | null = null;
  private lastMemo = '';
  private lastSpriteStamp = '';

  mount(container: HTMLElement, callbacks: UIBridgeCallbacks): void {
    this.callbacks = callbacks;
    this.selectedTeamSwapIdx = null;
    this.selectedBoxSwapIdx = null;
    this.editingNicknameUid = null;
    this.celebrationBanner = null;
    this.lastMemo = '';
    this.lastSpriteStamp = '';

    container.innerHTML = `
      <div class="sl-team-body">
        <div class="sl-team-bag-strip" data-testid="team-bag-strip"></div>
        <div class="sl-team-celebration sl-glass-soft" data-testid="team-celebration-banner" hidden></div>
        <div class="sl-swap-notice sl-glass-soft" data-testid="team-swap-notice" hidden></div>

        <section class="sl-team-section">
          <div class="sl-team-section-head">
            <h3 class="sl-style-group-title">${createIconSvg('icon-team', 'sl-icon-sm')} Active Party (6 Slots)</h3>
            <span class="sl-pill" data-testid="team-swap-hint">Use Swap Box to trade slots with Storage</span>
          </div>
          <div class="sl-team-grid" data-testid="team-grid"></div>
        </section>

        <section class="sl-team-section">
          <div class="sl-team-section-head">
            <h3 class="sl-style-group-title">${createIconSvg('icon-chest', 'sl-icon-sm')} Storage Box</h3>
          </div>
          <div class="sl-box-grid" data-testid="box-grid"></div>
        </section>
      </div>
    `;

    this.bagStripEl = container.querySelector('[data-testid="team-bag-strip"]');
    this.bannerEl = container.querySelector('[data-testid="team-celebration-banner"]');
    this.swapBannerEl = container.querySelector('[data-testid="team-swap-notice"]');
    this.teamGridEl = container.querySelector('[data-testid="team-grid"]');
    this.boxGridEl = container.querySelector('[data-testid="box-grid"]');

    this.bannerEl?.addEventListener('click', (evt) => {
      if ((evt.target as HTMLElement | null)?.closest('[data-action="dismiss-banner"]')) {
        this.celebrationBanner = null;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      }
    });

    this.swapBannerEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('[data-action="cancel-swap"]');
      if (!btn) return;
      this.selectedTeamSwapIdx = null;
      this.selectedBoxSwapIdx = null;
      this.lastMemo = '';
      if (this.currentProfile) this.renderContent(this.currentProfile);
    });

    this.teamGridEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const idx = Number(btn.getAttribute('data-team-idx'));
      const uid = btn.getAttribute('data-uid') ?? '';

      if (action === 'set-lead' && Number.isInteger(idx)) {
        this.callbacks?.onSetLeadPokemon(idx);
      } else if (action === 'deposit' && Number.isInteger(idx)) {
        this.selectedTeamSwapIdx = null;
        this.selectedBoxSwapIdx = null;
        this.callbacks?.onDepositToBox(idx);
      } else if (action === 'swap-here' && Number.isInteger(idx) && this.selectedBoxSwapIdx !== null) {
        const boxIdx = this.selectedBoxSwapIdx;
        this.selectedBoxSwapIdx = null;
        this.selectedTeamSwapIdx = null;
        this.callbacks?.onSwapTeamWithBox(idx, boxIdx);
      } else if (action === 'swap-mode' && Number.isInteger(idx)) {
        this.selectedBoxSwapIdx = null;
        this.selectedTeamSwapIdx = this.selectedTeamSwapIdx === idx ? null : idx;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      } else if (action === 'upgrade' && uid) {
        this.captureActionBanner('upgrade', uid);
        this.callbacks?.onUpgradePokemon(uid);
      } else if (action === 'cheer' && uid) {
        this.captureActionBanner('cheer', uid);
        this.callbacks?.onCheerPokemon(uid);
      } else if (action === 'heal' && uid) {
        this.callbacks?.onHealPokemonWithPotion(uid);
      } else if (action === 'evolve' && uid) {
        const toId = Number(btn.getAttribute('data-evo-to'));
        const itemKey = btn.getAttribute('data-evo-item') || undefined;
        if (Number.isInteger(toId) && toId >= 1) {
          this.captureActionBanner('evolve', uid, toId);
          this.callbacks?.onEvolvePokemon(uid, toId, itemKey);
        }
      } else if (action === 'rename-open' && uid) {
        this.editingNicknameUid = this.editingNicknameUid === uid ? null : uid;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      } else if (action === 'rename-save' && uid) {
        const card = btn.closest('[data-team-card]') as HTMLElement | null;
        const input = card?.querySelector('[data-rename-input]') as HTMLInputElement | null;
        if (input) {
          this.callbacks?.onRenamePokemon(uid, input.value);
          this.editingNicknameUid = null;
        }
      } else if (action === 'rename-reset' && uid) {
        this.callbacks?.onRenamePokemon(uid, '');
        this.editingNicknameUid = null;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      } else if (action === 'rename-cancel') {
        this.editingNicknameUid = null;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      }
    });

    this.teamGridEl?.addEventListener('keydown', (evt) => {
      const input = (evt.target as HTMLElement | null)?.closest('[data-rename-input]') as HTMLInputElement | null;
      if (!input) return;
      if (evt.key === 'Enter') {
        evt.preventDefault();
        const uid = input.getAttribute('data-rename-uid') ?? '';
        if (uid) {
          this.callbacks?.onRenamePokemon(uid, input.value);
          this.editingNicknameUid = null;
        }
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        this.editingNicknameUid = null;
        this.lastMemo = '';
        if (this.currentProfile) this.renderContent(this.currentProfile);
      }
    });

    this.boxGridEl?.addEventListener('click', (evt) => {
      const btn = (evt.target as HTMLElement | null)?.closest('button') as HTMLButtonElement | null;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const boxIdx = Number(btn.getAttribute('data-box-idx'));
      const uid = btn.getAttribute('data-uid') ?? '';

      if (action === 'withdraw' && Number.isInteger(boxIdx)) {
        this.callbacks?.onWithdrawFromBox(boxIdx);
      } else if (action === 'swap-box' && Number.isInteger(boxIdx)) {
        if (this.selectedTeamSwapIdx !== null) {
          const teamIdx = this.selectedTeamSwapIdx;
          this.selectedTeamSwapIdx = null;
          this.selectedBoxSwapIdx = null;
          this.callbacks?.onSwapTeamWithBox(teamIdx, boxIdx);
        } else {
          this.selectedBoxSwapIdx = this.selectedBoxSwapIdx === boxIdx ? null : boxIdx;
          this.lastMemo = '';
          if (this.currentProfile) this.renderContent(this.currentProfile);
        }
      } else if (action === 'upgrade' && uid) {
        this.captureActionBanner('upgrade', uid);
        this.callbacks?.onUpgradePokemon(uid);
      } else if (action === 'cheer' && uid) {
        this.captureActionBanner('cheer', uid);
        this.callbacks?.onCheerPokemon(uid);
      } else if (action === 'heal' && uid) {
        this.callbacks?.onHealPokemonWithPotion(uid);
      } else if (action === 'evolve' && uid) {
        const toId = Number(btn.getAttribute('data-evo-to'));
        const itemKey = btn.getAttribute('data-evo-item') || undefined;
        if (Number.isInteger(toId) && toId >= 1) {
          this.captureActionBanner('evolve', uid, toId);
          this.callbacks?.onEvolvePokemon(uid, toId, itemKey);
        }
      }
    });
  }

  sync(profile: DojoProfileState, active: boolean, timeSec: number, assets: TeamBoxAssets): void {
    this.currentProfile = profile;
    if (!active) return;

    this.renderContent(profile);

    const hasAnimated =
      profile.team.some((m) => (assets.getFrames?.(m.speciesId, m.isShiny)?.frames.length ?? 0) > 1) ||
      profile.box.some((m) => (assets.getFrames?.(m.speciesId, m.isShiny)?.frames.length ?? 0) > 1);
    const animTick = hasAnimated ? Math.floor(timeSec * 8) : 0;
    const stamp = `${animTick}|${this.lastMemo}|${Boolean(assets.fallbacksSheet)}`;
    if (stamp !== this.lastSpriteStamp) {
      this.lastSpriteStamp = stamp;
      this.renderSprites(profile, timeSec, assets);
    }
  }

  private captureActionBanner(kind: 'upgrade' | 'cheer' | 'evolve', uid: string, evoToId?: number): void {
    const profile = this.currentProfile;
    if (!profile) return;
    const mon = [...profile.team, ...profile.box].find((m) => m.uid === uid);
    if (!mon) return;
    const sp = getSpeciesEntry(mon.speciesId);
    const monName = stripEmojis(mon.nickname || sp.name);
    if (kind === 'upgrade') {
      const nextTier = Math.min(5, (mon.upgradeTier ?? 0) + 1);
      const before = hydrateStats(mon);
      const after = hydrateStats({ ...mon, upgradeTier: nextTier });
      const deltas = [
        after.maxHp > before.maxHp ? `+${after.maxHp - before.maxHp} HP` : '',
        after.atk > before.atk ? `+${after.atk - before.atk} ATK` : '',
        after.def > before.def ? `+${after.def - before.def} DEF` : '',
        after.spd > before.spd ? `+${after.spd - before.spd} SPD` : '',
      ].filter(Boolean);
      this.celebrationBanner = {
        kind: 'upgrade',
        eyebrow: `STARLIGHT POWER UP • RANK ${nextTier}${nextTier >= 5 ? ' MAX' : ''}`,
        title: `${monName} reached Star Rank ${nextTier}!`,
        detail: `${deltas.length > 0 ? deltas.join(' • ') : '+5% Starlight Stat Boost'} • Full Heal & +10 Bond`,
      };
    } else if (kind === 'cheer') {
      const nextBond = Math.min(100, (mon.bond ?? 0) + 10);
      const tier = getBondTier(nextBond) as { label: string; xpMult?: number; critBonus?: number; endureChance?: number };
      const perks: string[] = [];
      if ((tier.xpMult ?? 1) > 1) perks.push(`+${Math.round(((tier.xpMult ?? 1) - 1) * 100)}% XP`);
      if ((tier.critBonus ?? 0) > 0) perks.push(`+${Math.round((tier.critBonus ?? 0) * 100)}% Crit`);
      if ((tier.endureChance ?? 0) > 0) perks.push(`${Math.round((tier.endureChance ?? 0) * 100)}% Endure`);
      this.celebrationBanner = {
        kind: 'cheer',
        eyebrow: `BUDDY CHEER • ${stripEmojis(tier.label).toUpperCase()}`,
        title: `${monName} beamed with joy! (Bond ${nextBond}/100)`,
        detail: perks.length > 0 ? `Active Bond Perks: ${perks.join(', ')}` : 'Reach 40+ Bond for bonus XP, Crit & Endure perks!',
      };
    } else if (kind === 'evolve' && evoToId) {
      const toSp = getSpeciesEntry(evoToId);
      this.celebrationBanner = {
        kind: 'evolve',
        eyebrow: 'STARLIGHT EVOLUTION COMPLETE',
        title: `${monName} evolved into ${toSp.name}!`,
        detail: 'Stats surged higher and new species moves unlocked for adventure!',
      };
    }
    this.lastMemo = '';
  }

  private renderContent(profile: DojoProfileState): void {
    const bag = profile.bag;
    const gemCount = Object.values(bag.gems ?? {}).reduce((a, b) => a + Number(b || 0), 0);
    const cheerStepsProgress = (profile.stats?.steps ?? 0) % STEPS_PER_CHEER_CHARGE;
    const stepsToNextCheer = Math.max(1, STEPS_PER_CHEER_CHARGE - cheerStepsProgress);
    const memo = [
      bag.starShards,
      bag.potions,
      bag.greatBalls,
      bag.starBalls,
      bag.cheerCharges,
      stepsToNextCheer,
      gemCount,
      this.selectedTeamSwapIdx ?? -1,
      this.selectedBoxSwapIdx ?? -1,
      this.editingNicknameUid ?? '',
      this.celebrationBanner?.title ?? '',
      profile.team.map((m) => `${m.uid}:${m.speciesId}:${m.level}:${m.hp}:${m.bond}:${m.upgradeTier}:${m.nickname ?? ''}`).join('|'),
      profile.box.map((m) => `${m.uid}:${m.speciesId}:${m.level}:${m.hp}:${m.bond}:${m.upgradeTier}:${m.nickname ?? ''}`).join('|'),
    ].join('~');

    if (memo === this.lastMemo) return;
    this.lastMemo = memo;

    const evoItemMap = new Map(getAllEvolutionItems().map((it) => [it.id, it.name]));
    const ownedGems = Object.entries(bag.gems ?? {}).filter(([, count]) => Number(count) > 0);

    if (this.bagStripEl) {
      const gemChips = ownedGems
        .map(([id, cnt]) => `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-gem', 'sl-icon-sm')} ${safeText(evoItemMap.get(id) ?? id)} x${cnt}</span>`)
        .join('');
      const cheerRechargeText =
        bag.cheerCharges >= MAX_CHEER_CHARGES
          ? `${bag.cheerCharges}/${MAX_CHEER_CHARGES}`
          : `${bag.cheerCharges}/${MAX_CHEER_CHARGES} (${stepsToNextCheer} steps)`;
      this.bagStripEl.innerHTML = `
        <span class="sl-pill sl-pill-gold sl-num">${createIconSvg('icon-star-shard', 'sl-icon-sm')} Star Shards: ${bag.starShards}</span>
        <span class="sl-pill sl-num">${createIconSvg('icon-potion', 'sl-icon-sm')} Potions: ${bag.potions}</span>
        <span class="sl-pill sl-num">${createIconSvg('icon-greatball', 'sl-icon-sm')} Great Balls: ${bag.greatBalls}</span>
        <span class="sl-pill sl-num">${createIconSvg('icon-starball', 'sl-icon-sm')} Star Balls: ${bag.starBalls}</span>
        <span class="sl-pill sl-num">${createIconSvg('icon-pokeball', 'sl-icon-sm')} Poké Balls: Unlimited</span>
        <span class="sl-pill sl-num" title="Earn +1 Cheer Heart every ${STEPS_PER_CHEER_CHARGE} steps, on battle wins/catches, or 180+ pts in Sky-Hop">${createIconSvg('icon-cheer-heart', 'sl-icon-sm')} Cheers: ${cheerRechargeText}</span>
        <span class="sl-pill sl-pill-cyan sl-num">${createIconSvg('icon-gem', 'sl-icon-sm')} Evo Gems: ${gemCount}</span>
        ${gemChips}
      `;
    }

    if (this.bannerEl) {
      if (this.celebrationBanner) {
        const b = this.celebrationBanner;
        this.bannerEl.hidden = false;
        this.bannerEl.setAttribute('data-kind', b.kind);
        this.bannerEl.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
            <span style="font-size:10px; font-weight:800; letter-spacing:0.1em; color:var(--sl-gold-bright);">${safeText(b.eyebrow)}</span>
            <strong style="font-family:var(--sl-font-display); font-size:15px; color:var(--sl-brass-bright);">${safeText(b.title)}</strong>
            <span style="font-size:12px; color:var(--sl-text-muted);">${safeText(b.detail)}</span>
          </div>
          <button type="button" class="sl-btn sl-btn-primary" data-action="dismiss-banner">
            <span>Awesome</span>
          </button>
        `;
      } else {
        this.bannerEl.hidden = true;
      }
    }

    if (this.swapBannerEl) {
      const teamSwapMon = this.selectedTeamSwapIdx !== null ? profile.team[this.selectedTeamSwapIdx] : null;
      const boxSwapMon = this.selectedBoxSwapIdx !== null ? profile.box[this.selectedBoxSwapIdx] : null;
      if (teamSwapMon) {
        const swapSp = getSpeciesEntry(teamSwapMon.speciesId);
        const swapName = stripEmojis(teamSwapMon.nickname || swapSp.name);
        this.swapBannerEl.hidden = false;
        this.swapBannerEl.innerHTML = `
          <span>Select a Storage Box Pokémon below to swap with <strong>${safeText(swapName)} (Lv.${teamSwapMon.level})</strong></span>
          <button type="button" class="sl-btn sl-btn-ghost" data-action="cancel-swap">
            ${createIconSvg('icon-close', 'sl-icon-sm')}
            <span>Cancel</span>
          </button>
        `;
      } else if (boxSwapMon) {
        const swapSp = getSpeciesEntry(boxSwapMon.speciesId);
        const swapName = stripEmojis(boxSwapMon.nickname || swapSp.name);
        this.swapBannerEl.hidden = false;
        this.swapBannerEl.innerHTML = `
          <span>Select an Active Party slot below to swap with <strong>${safeText(swapName)} (Lv.${boxSwapMon.level})</strong></span>
          <button type="button" class="sl-btn sl-btn-ghost" data-action="cancel-swap">
            ${createIconSvg('icon-close', 'sl-icon-sm')}
            <span>Cancel</span>
          </button>
        `;
      } else {
        this.swapBannerEl.hidden = true;
      }
    }

    if (this.teamGridEl) {
      if (profile.team.length === 0) {
        this.teamGridEl.innerHTML = `<div class="sl-empty-state">${createIconSvg('icon-lab', 'sl-icon-md')} No Pokémon in party yet. Visit Professor Willow's Lab!</div>`;
      } else {
        const cardsHtml = profile.team
          .map((mon, idx) => {
            const sp = getSpeciesEntry(mon.speciesId);
            const stats = hydrateStats(mon);
            const hpPct = Math.max(0, Math.min(1, mon.hp / Math.max(1, stats.maxHp)));
            const xpPct = Math.max(0, Math.min(1, mon.xp / Math.max(1, stats.xpToNext)));
            const displayName = stripEmojis(mon.nickname || sp.name);
            const isNicknamed = Boolean(mon.nickname && mon.nickname.trim() && mon.nickname.trim() !== sp.name);
            const bondTier = getBondTier(mon.bond);
            const ab = getAbilityEntry(mon.abilityId || sp.ability);
            const upgradeCost = mon.upgradeTier < 5 ? (mon.upgradeTier + 1) * 2 : null;
            const canUpgrade = upgradeCost !== null && bag.starShards >= upgradeCost;
            const canCheer = bag.cheerCharges >= 1 && mon.bond < 100;
            const canHeal = bag.potions >= 1 && mon.hp < stats.maxHp;

            const rules = getEvolutionRules(mon.speciesId);
            const evoOptions = rules.filter((r) => {
              if (r.minLevel && mon.level >= r.minLevel) return true;
              if (r.item && Number(bag.gems?.[r.item] ?? 0) > 0) return true;
              return false;
            });
            const lockedRules = rules.filter((r) => !evoOptions.includes(r));
            const lockedHintHtml = lockedRules
              .map(
                (rule) =>
                  `<span class="sl-pill" style="color:var(--sl-text-dim);">${createIconSvg('icon-evolve', 'sl-icon-sm')} ${safeText(getSpeciesEntry(rule.to).name)} (${safeText(rule.item ? (evoItemMap.get(rule.item) ?? rule.item) : `Lv.${rule.minLevel}`)})</span>`,
              )
              .join('');

            const evoButtons = evoOptions
              .map((r) => {
                const targetSp = getSpeciesEntry(r.to);
                const itemLabel = r.item ? evoItemMap.get(r.item) ?? r.item : `Lv.${r.minLevel}`;
                return `
                  <button
                    type="button"
                    class="sl-btn sl-btn-primary sl-team-evolve-btn"
                    data-action="evolve"
                    data-uid="${safeText(mon.uid)}"
                    data-evo-to="${r.to}"
                    ${r.item ? `data-evo-item="${safeText(r.item)}"` : ''}
                    data-testid="team-evolve-${idx}"
                  >
                    ${createIconSvg('icon-evolve', 'sl-icon-sm')}
                    <span>Evolve into ${safeText(targetSp.name)} (${safeText(itemLabel)})</span>
                  </button>
                `;
              })
              .join('');

            const isSwapSelected = this.selectedTeamSwapIdx === idx;
            const isRenaming = this.editingNicknameUid === mon.uid;

            return `
              <article class="sl-team-card sl-glass-soft ${idx === 0 ? 'is-lead' : ''} ${isSwapSelected ? 'is-swap-selected' : ''}" data-team-card="${idx}" data-testid="team-card-${idx}" data-type="${sp.type}">
                <div class="sl-team-card-top">
                  <canvas class="sl-team-sprite" width="68" height="68" data-team-canvas="${idx}" aria-hidden="true"></canvas>
                  <div class="sl-team-meta">
                    <div class="sl-team-name-row">
                      <strong class="sl-team-name">${safeText(displayName)}</strong>
                      ${isNicknamed ? `<span class="sl-team-species-sub">(${safeText(sp.name)})</span>` : ''}
                      <span class="sl-pill sl-num">Lv.${mon.level}</span>
                      ${idx === 0 ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-crown', 'sl-icon-sm')} Lead</span>` : ''}
                      ${mon.isShiny ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-sparkle', 'sl-icon-sm')} Shiny</span>` : ''}
                    </div>
                    <div class="sl-team-subpills">
                      <span class="sl-pill sl-type-pill" data-type="${sp.type}">${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')} ${safeText(sp.type.toUpperCase())}</span>
                      <span class="sl-pill sl-num">${createIconSvg('icon-star-rank', 'sl-icon-sm')} ${mon.upgradeTier}/5</span>
                      <span class="sl-pill sl-num">${createIconSvg('icon-bond', 'sl-icon-sm')} ${mon.bond} (${safeText(stripEmojis(bondTier.label))})</span>
                      ${ab ? `<span class="sl-pill sl-pill-cyan" title="${safeText(ab.description)}">${safeText(ab.name)}</span>` : ''}
                      ${lockedHintHtml}
                    </div>
                    <div class="sl-team-stat-strip sl-num">
                      <span class="sl-stat-chip"><span class="sl-stat-k">ATK</span> <strong>${stats.atk}</strong></span>
                      <span class="sl-stat-chip"><span class="sl-stat-k">DEF</span> <strong>${stats.def}</strong></span>
                      <span class="sl-stat-chip"><span class="sl-stat-k">SPD</span> <strong>${stats.spd}</strong></span>
                    </div>
                    <div class="sl-gauge-row">
                      <span class="sl-gauge-label">HP</span>
                      <div class="sl-bar-track sl-bar-track-hp"><div class="sl-bar-fill sl-bar-hp" data-low="${hpPct <= 0.25}" data-mid="${hpPct > 0.25 && hpPct <= 0.52}" style="--fill:${hpPct};"></div></div>
                      <span class="sl-gauge-val sl-num">${mon.hp}/${stats.maxHp}</span>
                    </div>
                    <div class="sl-gauge-row">
                      <span class="sl-gauge-label">XP</span>
                      <div class="sl-bar-track sl-bar-track-sm"><div class="sl-bar-fill sl-bar-xp" style="--fill:${xpPct};"></div></div>
                      <span class="sl-gauge-val sl-num">${mon.xp}/${stats.xpToNext}</span>
                    </div>
                  </div>
                </div>

                ${
                  isRenaming
                    ? `
                  <div class="sl-rename-row">
                    <input type="text" class="sl-input" maxlength="14" value="${safeText(mon.nickname ?? sp.name)}" data-rename-input data-rename-uid="${safeText(mon.uid)}" aria-label="Pokemon Nickname" />
                    <button type="button" class="sl-btn sl-btn-cyan" data-action="rename-save" data-uid="${safeText(mon.uid)}">Save</button>
                    <button type="button" class="sl-btn" data-action="rename-reset" data-uid="${safeText(mon.uid)}" title="Reset to species name">Reset</button>
                    <button type="button" class="sl-btn sl-btn-ghost" data-action="rename-cancel">Cancel</button>
                  </div>
                `
                    : ''
                }

                <div class="sl-team-actions">
                  <button type="button" class="sl-btn" data-action="set-lead" data-team-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>
                    ${createIconSvg('icon-crown', 'sl-icon-sm')}
                    <span>Set Lead</span>
                  </button>
                  <button type="button" class="sl-btn" data-action="heal" data-uid="${safeText(mon.uid)}" ${canHeal ? '' : 'disabled'} data-testid="team-heal-${idx}" title="Use 1 Potion to heal ${safeText(displayName)}">
                    ${createIconSvg('icon-potion', 'sl-icon-sm')}
                    <span>Heal</span>
                  </button>
                  <button type="button" class="sl-btn sl-btn-cyan" data-action="upgrade" data-uid="${safeText(mon.uid)}" ${canUpgrade ? '' : 'disabled'} data-testid="team-upgrade-${idx}" title="${upgradeCost !== null ? `Boost HP/ATK/DEF/SPD +5% to Star Rank ${mon.upgradeTier + 1}, full heal & bonus XP (need ${upgradeCost} Star Shards, have ${bag.starShards})` : 'Max Star Rank reached'}">
                    ${createIconSvg('icon-star-rank', 'sl-icon-sm')}
                    <span>${upgradeCost !== null ? (canUpgrade ? `Rank (${upgradeCost})` : `Rank (${bag.starShards}/${upgradeCost})`) : 'Max Rank'}</span>
                  </button>
                  <button type="button" class="sl-btn" data-action="cheer" data-uid="${safeText(mon.uid)}" ${canCheer ? '' : 'disabled'} data-testid="team-cheer-${idx}" title="${bag.cheerCharges <= 0 ? `No Cheer Hearts (0/${MAX_CHEER_CHARGES}) — ${stepsToNextCheer} steps, battle win/catch, or 180+ pts in Sky-Hop for +1` : `Spend 1 Cheer Heart to raise Bond +10 (${bag.cheerCharges}/${MAX_CHEER_CHARGES} held)`}">
                    ${createIconSvg('icon-cheer-heart', 'sl-icon-sm')}
                    <span>${mon.bond >= 100 ? 'Max Bond' : bag.cheerCharges <= 0 ? `Cheer (0/${MAX_CHEER_CHARGES})` : 'Cheer'}</span>
                  </button>
                  ${
                    this.selectedBoxSwapIdx !== null
                      ? `<button type="button" class="sl-btn sl-btn-primary" data-action="swap-here" data-team-idx="${idx}"><span>Swap Here</span></button>`
                      : `<button type="button" class="sl-btn ${isSwapSelected ? 'is-active' : ''}" data-action="swap-mode" data-team-idx="${idx}" aria-pressed="${isSwapSelected}"><span>${isSwapSelected ? 'Pick Box' : 'Swap Box'}</span></button>`
                  }
                  <button type="button" class="sl-btn" data-action="deposit" data-team-idx="${idx}" ${profile.team.length <= 1 ? 'disabled' : ''}>
                    <span>Deposit</span>
                  </button>
                  <button type="button" class="sl-btn sl-btn-ghost sl-team-rename-btn" data-action="rename-open" data-uid="${safeText(mon.uid)}">
                    <span>${isRenaming ? 'Close Rename' : 'Rename'}</span>
                  </button>
                  ${evoButtons}
                </div>
              </article>
            `;
          })
          .join('');

        const emptySlotsCount = Math.max(0, 6 - profile.team.length);
        const emptySlotsHtml =
          emptySlotsCount > 0
            ? `
          <div class="sl-team-open-roster" aria-hidden="true">
            ${Array.from({ length: emptySlotsCount }, (_, i) => `
              <div class="sl-team-slot-empty">
                ${createIconSvg('icon-pokeball', 'sl-icon-sm')}
                <span>Open Slot ${profile.team.length + i + 1}</span>
              </div>
            `).join('')}
          </div>
        `
            : '';

        this.teamGridEl.innerHTML = cardsHtml + emptySlotsHtml;
      }
    }

    if (this.boxGridEl) {
      if (profile.box.length === 0) {
        this.boxGridEl.innerHTML = `
          <div class="sl-empty-state">
            ${createIconSvg('icon-chest', 'sl-icon-md')}
            <span>Storage Box is empty. Catch wild Pokémon beyond 6 party members to store them here!</span>
          </div>
        `;
      } else {
        this.boxGridEl.innerHTML = profile.box
          .map((mon, idx) => {
            const sp = getSpeciesEntry(mon.speciesId);
            const stats = hydrateStats(mon);
            const displayName = stripEmojis(mon.nickname || sp.name);
            const isBoxNicknamed = Boolean(mon.nickname && mon.nickname.trim() && mon.nickname.trim() !== sp.name);
            const boxBondTier = getBondTier(mon.bond);
            const ab = getAbilityEntry(mon.abilityId || sp.ability);
            const upgradeCost = mon.upgradeTier < 5 ? (mon.upgradeTier + 1) * 2 : null;
            const canUpgrade = upgradeCost !== null && bag.starShards >= upgradeCost;
            const canCheer = bag.cheerCharges >= 1 && mon.bond < 100;
            const canHeal = bag.potions >= 1 && mon.hp < stats.maxHp;
            const boxRules = getEvolutionRules(mon.speciesId);
            const evoOptions = boxRules.filter((r) => {
              if (r.minLevel && mon.level >= r.minLevel) return true;
              if (r.item && Number(bag.gems?.[r.item] ?? 0) > 0) return true;
              return false;
            });
            const boxLockedHints = boxRules
              .filter((r) => !evoOptions.includes(r))
              .map(
                (rule) =>
                  `<span class="sl-pill" style="color:var(--sl-text-dim);">${createIconSvg('icon-evolve', 'sl-icon-sm')} ${safeText(getSpeciesEntry(rule.to).name)} (${safeText(rule.item ? (evoItemMap.get(rule.item) ?? rule.item) : `Lv.${rule.minLevel}`)})</span>`,
              )
              .join('');
            const boxEvoHtml = evoOptions
              .map((r) => {
                const targetSp = getSpeciesEntry(r.to);
                const itemLabel = r.item ? evoItemMap.get(r.item) ?? r.item : `Lv.${r.minLevel}`;
                return `
                  <button
                    type="button"
                    class="sl-btn sl-btn-primary"
                    style="grid-column: 1 / -1;"
                    data-action="evolve"
                    data-uid="${safeText(mon.uid)}"
                    data-evo-to="${r.to}"
                    ${r.item ? `data-evo-item="${safeText(r.item)}"` : ''}
                  >
                    ${createIconSvg('icon-evolve', 'sl-icon-sm')}
                    <span>Evolve: ${safeText(targetSp.name)} (${safeText(itemLabel)})</span>
                  </button>
                `;
              })
              .join('');

            const isBoxSwapPicked = this.selectedBoxSwapIdx === idx;
            const swapLabel =
              this.selectedTeamSwapIdx !== null
                ? `Swap Slot ${this.selectedTeamSwapIdx + 1}`
                : isBoxSwapPicked
                  ? 'Selected'
                  : 'Swap';

            return `
              <article class="sl-box-card sl-glass-soft ${evoOptions.length > 0 ? 'is-evo-ready' : ''} ${isBoxSwapPicked ? 'is-swap-selected' : ''}" data-testid="box-card-${idx}">
                <div style="display:flex; align-items:center; gap:10px;">
                  <canvas class="sl-box-sprite" width="52" height="52" data-box-canvas="${idx}" aria-hidden="true"></canvas>
                  <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <strong style="color:var(--sl-gold-bright);">${safeText(displayName)}</strong>
                      ${isBoxNicknamed ? `<span class="sl-team-species-sub">(${safeText(sp.name)})</span>` : ''}
                      <span class="sl-pill sl-num">Lv.${mon.level}</span>
                      ${mon.isShiny ? `<span class="sl-pill sl-pill-gold">${createIconSvg('icon-sparkle', 'sl-icon-sm')} Shiny</span>` : ''}
                    </div>
                    <div style="display:flex; gap:5px; margin-top:4px; flex-wrap:wrap;">
                      <span class="sl-pill sl-type-pill" data-type="${sp.type}">${createIconSvg(typeToIconId(sp.type), 'sl-icon-sm')} ${safeText(sp.type)}</span>
                      <span class="sl-pill sl-num">${createIconSvg('icon-star-rank', 'sl-icon-sm')} ${mon.upgradeTier}/5</span>
                      <span class="sl-pill sl-num">${createIconSvg('icon-bond', 'sl-icon-sm')} ${mon.bond} (${safeText(stripEmojis(boxBondTier.label))})</span>
                      ${ab ? `<span class="sl-pill sl-pill-cyan" title="${safeText(ab.description)}">${safeText(ab.name)}</span>` : ''}
                      ${boxLockedHints}
                    </div>
                    <div class="sl-num" style="font-size:10.5px; color:var(--sl-text-dim); margin-top:4px;">
                      HP ${mon.hp}/${stats.maxHp} • ATK ${stats.atk} • DEF ${stats.def} • SPD ${stats.spd}
                    </div>
                  </div>
                </div>
                <div class="sl-box-actions">
                  <button type="button" class="sl-btn sl-btn-cyan" data-action="withdraw" data-box-idx="${idx}" ${profile.team.length >= 6 ? 'disabled' : ''}>
                    <span>Withdraw</span>
                  </button>
                  <button type="button" class="sl-btn ${isBoxSwapPicked ? 'is-active' : ''}" data-action="swap-box" data-box-idx="${idx}" ${profile.team.length === 0 ? 'disabled' : ''}>
                    <span>${swapLabel}</span>
                  </button>
                  <button type="button" class="sl-btn" data-action="upgrade" data-uid="${safeText(mon.uid)}" ${canUpgrade ? '' : 'disabled'} title="${upgradeCost !== null ? `Need ${upgradeCost} Star Shards (have ${bag.starShards})` : 'Max Rank'}">
                    ${createIconSvg('icon-star-rank', 'sl-icon-sm')}
                    <span>${upgradeCost !== null ? (canUpgrade ? `Rank (${upgradeCost})` : `Rank (${bag.starShards}/${upgradeCost})`) : 'Max'}</span>
                  </button>
                  <button type="button" class="sl-btn" data-action="cheer" data-uid="${safeText(mon.uid)}" ${canCheer ? '' : 'disabled'}>
                    ${createIconSvg('icon-cheer-heart', 'sl-icon-sm')}
                    <span>${mon.bond >= 100 ? 'Max Bond' : 'Cheer'}</span>
                  </button>
                  <button type="button" class="sl-btn" style="grid-column: 1 / -1;" data-action="heal" data-uid="${safeText(mon.uid)}" ${canHeal ? '' : 'disabled'}>
                    ${createIconSvg('icon-potion', 'sl-icon-sm')}
                    <span>Heal with Potion</span>
                  </button>
                  ${boxEvoHtml}
                </div>
              </article>
            `;
          })
          .join('');
      }
    }
  }

  private renderSprites(profile: DojoProfileState, timeSec: number, assets: TeamBoxAssets): void {
    profile.team.forEach((mon, idx) => {
      const canvas = this.teamGridEl?.querySelector(`[data-team-canvas="${idx}"]`) as HTMLCanvasElement | null;
      if (!canvas) return;
      renderPokemonPreviewCanvas(
        canvas,
        mon.speciesId,
        assets.getFrames?.(mon.speciesId, mon.isShiny) ?? null,
        assets.fallbacksSheet,
        assets.manifest,
        mon.isShiny,
        timeSec,
      );
    });
    profile.box.forEach((mon, idx) => {
      const canvas = this.boxGridEl?.querySelector(`[data-box-canvas="${idx}"]`) as HTMLCanvasElement | null;
      if (!canvas) return;
      renderPokemonPreviewCanvas(
        canvas,
        mon.speciesId,
        assets.getFrames?.(mon.speciesId, mon.isShiny) ?? null,
        assets.fallbacksSheet,
        assets.manifest,
        mon.isShiny,
        timeSec,
      );
    });
  }

  dispose(): void {
    this.bagStripEl = null;
    this.bannerEl = null;
    this.swapBannerEl = null;
    this.teamGridEl = null;
    this.boxGridEl = null;
    this.currentProfile = null;
    this.callbacks = null;
  }
}
