import { describe, expect, it, vi } from 'vitest';
import type {
  BadgeToastState,
  BattleSceneState,
  CryWaveformSnapshot,
  DojoProfileState,
  DrawerTab,
  FrameStats,
  IOfflineSpriteRigSynthesizer,
  IconId,
  RendererCapabilities,
  TacticalBriefingData,
  UIBridgeCallbacks,
  UIRenderSnapshot,
} from '../contracts';
import { BIOME_IDS, ELEMENTAL_TYPES } from '../contracts';
import {
  DojoBattleController,
  DojoOverworldSim,
  DojoSkyHopController,
  FIELD_QUESTS,
  SpriteAssetLoader,
  StarlightStorageBridge,
  TOTAL_SPECIES_COUNT,
  containsEmoji,
  createDefaultSaveState,
  getAllBadges,
  getAllEvolutionItems,
  getAllSpecies,
  getAllTrainerAccessories,
  getAllTrainerAuras,
  getAllTrainerStyles,
} from '../core';
import { Canvas2DBackend } from '../graphics/engine/Canvas2DBackend';
import { SkyHopRenderer } from '../graphics/skyhop';
import {
  ALL_ICON_IDS,
  BADGE_ICON_IDS,
  CORE_ICON_IDS,
  CelestialUIController,
  LivingTitleRenderer,
  TYPE_ICON_IDS,
  badgeIconId,
  computeHoloCardMetrics,
  createIconSvg,
  ensureSvgSpriteSheet,
  filterAndPaginatePokedex,
  iconSvg,
  isValidIconId,
  renderPokemonPreviewCanvas,
  renderTrainerPortraitCanvas,
  sanitizeNoEmoji,
  typeIconId,
} from './index';

// ============================================================================
// Minimal Node FS & Mock DOM Harness (zero @types/node or jsdom dependency)
// ============================================================================

interface NodeDirentLike {
  name: string;
  isDirectory(): boolean;
}

interface NodeFsLike {
  readdirSync(p: string, opts: { withFileTypes: true }): NodeDirentLike[];
  readFileSync(p: string, enc: 'utf8'): string;
}

interface NodePathLike {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
}

async function loadNodeModules(): Promise<{ fs: NodeFsLike; path: NodePathLike; cwd: string }> {
  const fsMod = (await import('node:' + 'fs')) as unknown as NodeFsLike;
  const pathMod = (await import('node:' + 'path')) as unknown as NodePathLike;
  const proc = (globalThis as unknown as { process: { cwd(): string } }).process;
  return { fs: fsMod, path: pathMod, cwd: proc.cwd() };
}

interface MockCtx2D {
  canvas: MockElement;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
  lineDashOffset: number;
  shadowColor: string;
  shadowBlur: number;
  calls: {
    fillRect: number;
    drawImage: number;
    arc: number;
    stroke: number;
    fillText: number;
    clearRect: number;
  };
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(...args: unknown[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop: () => void };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop: () => void };
  createPattern(): Record<string, unknown>;
}

function createMockCtx2D(canvas: MockElement): MockCtx2D {
  const calls = {
    fillRect: 0,
    drawImage: 0,
    arc: 0,
    stroke: 0,
    fillText: 0,
    clearRect: 0,
  };
  const noop = () => undefined;
  return {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    lineDashOffset: 0,
    shadowColor: 'transparent',
    shadowBlur: 0,
    calls,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    setLineDash: noop,
    clearRect: () => {
      calls.clearRect += 1;
    },
    fillRect: () => {
      calls.fillRect += 1;
    },
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: () => {
      calls.arc += 1;
    },
    ellipse: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: () => {
      calls.stroke += 1;
    },
    fillText: () => {
      calls.fillText += 1;
    },
    drawImage: () => {
      calls.drawImage += 1;
    },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  };
}

class MockClassList {
  private set = new Set<string>();
  constructor(private readonly host: MockElement) {}

  syncFromAttr(val: string): void {
    this.set.clear();
    for (const tok of val.split(/\s+/)) {
      if (tok) this.set.add(tok);
    }
  }

  add(...tokens: string[]): void {
    for (const t of tokens) if (t) this.set.add(t);
    this.host.setAttributeInternal('class', Array.from(this.set).join(' '));
  }

  remove(...tokens: string[]): void {
    for (const t of tokens) this.set.delete(t);
    this.host.setAttributeInternal('class', Array.from(this.set).join(' '));
  }

  toggle(token: string, force?: boolean): boolean {
    const has = this.set.has(token);
    const next = force === undefined ? !has : Boolean(force);
    if (next) this.set.add(token);
    else this.set.delete(token);
    this.host.setAttributeInternal('class', Array.from(this.set).join(' '));
    return next;
  }

  contains(token: string): boolean {
    return this.set.has(token);
  }
}

class MockStyle {
  private props = new Map<string, string>();
  cssText = '';
  setProperty(key: string, val: string): void {
    this.props.set(key, val);
  }
  getPropertyValue(key: string): string {
    return this.props.get(key) ?? '';
  }
  set transform(v: string) {
    this.props.set('transform', v);
  }
  get transform(): string {
    return this.props.get('transform') ?? '';
  }
  set width(v: string) {
    this.props.set('width', v);
  }
  get width(): string {
    return this.props.get('width') ?? '';
  }
  set height(v: string) {
    this.props.set('height', v);
  }
  get height(): string {
    return this.props.get('height') ?? '';
  }
  set overflow(v: string) {
    this.props.set('overflow', v);
  }
  get overflow(): string {
    return this.props.get('overflow') ?? '';
  }
  set clip(v: string) {
    this.props.set('clip', v);
  }
  get clip(): string {
    return this.props.get('clip') ?? '';
  }
  set position(v: string) {
    this.props.set('position', v);
  }
  get position(): string {
    return this.props.get('position') ?? '';
  }
  set opacity(v: string) {
    this.props.set('opacity', v);
  }
  get opacity(): string {
    return this.props.get('opacity') ?? '';
  }
  set pointerEvents(v: string) {
    this.props.set('pointer-events', v);
  }
  get pointerEvents(): string {
    return this.props.get('pointer-events') ?? '';
  }
}

class MockElement {
  readonly tagName: string;
  readonly children: MockElement[] = [];
  readonly attrs = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = new MockStyle();
  readonly classList: MockClassList;
  parentElement: MockElement | null = null;
  width = 300;
  height = 150;
  clientWidth = 300;
  clientHeight = 150;
  value = '';
  disabled = false;
  checked = false;
  private _text = '';
  private _ctx2d: MockCtx2D | null = null;
  private listeners = new Map<string, Array<(ev: unknown) => void>>();

  constructor(
    tagName: string,
    readonly ownerDocument: MockDocument,
  ) {
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList(this);
  }

  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  set id(val: string) {
    this.setAttribute('id', val);
  }

  get className(): string {
    return this.attrs.get('class') ?? '';
  }
  set className(val: string) {
    this.setAttribute('class', val);
  }

  get hidden(): boolean {
    return this.attrs.has('hidden');
  }
  set hidden(val: boolean) {
    if (val) this.attrs.set('hidden', '');
    else this.attrs.delete('hidden');
  }

  setAttributeInternal(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'class') this.classList.syncFromAttr(value);
    if (name === 'value') this.value = value;
    if (name === 'disabled') this.disabled = true;
    if (name === 'width' && Number.isFinite(Number(value))) {
      this.width = Number(value);
      this.clientWidth = this.width;
    }
    if (name === 'height' && Number.isFinite(Number(value))) {
      this.height = Number(value);
      this.clientHeight = this.height;
    }
    if (name.startsWith('data-')) {
      const camel = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
      this.dataset[camel] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
    if (name === 'disabled') this.disabled = false;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: Array<MockElement | string>): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this._text += node;
      } else {
        this.appendChild(node);
      }
    }
  }

  remove(): void {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  insertAdjacentHTML(_position: string, html: string): void {
    parseHtmlInto(this, html ?? '', this.ownerDocument);
  }

  get textContent(): string {
    if (this.children.length === 0) return this._text;
    return [this._text, ...this.children.map((c) => c.textContent)].join('');
  }

  set textContent(val: string) {
    this.children.length = 0;
    this._text = val ?? '';
  }

  get innerHTML(): string {
    const childHtml = this.children
      .map((c) => {
        const a = Array.from(c.attrs.entries())
          .map(([k, v]) => (v === '' ? k : `${k}="${v}"`))
          .join(' ');
        const open = `<${c.tagName.toLowerCase()}${a ? ` ${a}` : ''}>`;
        return `${open}${c._text}${c.children.length > 0 ? c.innerHTML : ''}</${c.tagName.toLowerCase()}>`;
      })
      .join('');
    return `${this._text}${childHtml}`;
  }

  set innerHTML(html: string) {
    this.children.length = 0;
    this._text = '';
    parseHtmlInto(this, html ?? '', this.ownerDocument);
  }

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((fn) => fn !== listener),
    );
  }

  dispatchEvent(ev: Record<string, unknown>): boolean {
    const type = String(ev.type ?? '');
    const eventObj = {
      ...ev,
      target: ev.target ?? this,
      currentTarget: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };
    const list = this.listeners.get(type) ?? [];
    for (const fn of list) {
      fn(eventObj);
    }
    if (this.parentElement) {
      this.parentElement.dispatchEvent(eventObj);
    }
    return true;
  }

  click(): void {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click', target: this });
  }

  focus(): void {
    // no-op
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      toJSON: () => ({}),
    } as DOMRect;
  }

  getContext(type: string): MockCtx2D | null {
    if (type !== '2d') return null;
    if (!this._ctx2d) this._ctx2d = createMockCtx2D(this);
    return this._ctx2d;
  }

  closest(selector: string): MockElement | null {
    let cur: MockElement | null = this;
    while (cur) {
      if (matchesSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
    const results: MockElement[] = [];
    const seen = new Set<MockElement>();
    const walk = (node: MockElement) => {
      for (const child of node.children) {
        if (parts.some((sel) => matchesSelectorChain(child, sel)) && !seen.has(child)) {
          seen.add(child);
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function matchesSimpleSelector(el: MockElement, sel: string): boolean {
  let remaining = sel.trim();
  if (!remaining) return false;

  const attrMatches: Array<{ name: string; op?: string; val?: string }> = [];
  remaining = remaining.replace(
    /\[([a-zA-Z0-9_-]+)(?:(=|\^=|\$=|\*=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g,
    (_, name: string, op?: string, dq?: string, sq?: string, bare?: string) => {
      attrMatches.push({ name, op, val: dq ?? sq ?? bare });
      return '';
    },
  );

  const idMatches: string[] = [];
  remaining = remaining.replace(/#([a-zA-Z0-9_-]+)/g, (_, id: string) => {
    idMatches.push(id);
    return '';
  });

  const classMatches: string[] = [];
  remaining = remaining.replace(/\.([a-zA-Z0-9_-]+)/g, (_, cls: string) => {
    classMatches.push(cls);
    return '';
  });

  if (remaining && remaining !== '*' && el.tagName.toLowerCase() !== remaining.toLowerCase()) {
    return false;
  }
  for (const id of idMatches) {
    if (el.id !== id) return false;
  }
  for (const cls of classMatches) {
    if (!el.classList.contains(cls)) return false;
  }
  for (const attr of attrMatches) {
    if (!el.hasAttribute(attr.name)) return false;
    const actual = el.getAttribute(attr.name) ?? '';
    if (attr.op === '=' && actual !== (attr.val ?? '')) return false;
    if (attr.op === '^=' && !actual.startsWith(attr.val ?? '')) return false;
    if (attr.op === '$=' && !actual.endsWith(attr.val ?? '')) return false;
    if (attr.op === '*=' && !actual.includes(attr.val ?? '')) return false;
  }
  return true;
}

function matchesSelectorChain(el: MockElement, chain: string): boolean {
  const segments = chain.trim().split(/\s+/).filter(Boolean);
  if (segments.length === 0) return false;
  if (!matchesSimpleSelector(el, segments[segments.length - 1])) return false;
  let cur = el.parentElement;
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    while (cur && !matchesSimpleSelector(cur, segments[i])) {
      cur = cur.parentElement;
    }
    if (!cur) return false;
    cur = cur.parentElement;
  }
  return true;
}

function matchesSelector(el: MockElement, selector: string): boolean {
  return selector
    .split(',')
    .map((s) => s.trim())
    .some((chain) => matchesSelectorChain(el, chain));
}

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'path', 'circle', 'rect', 'line', 'polygon', 'use']);

function parseHtmlInto(root: MockElement, html: string, doc: MockDocument): void {
  const stack: MockElement[] = [root];
  const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9_-]+)\s*>|<([a-zA-Z0-9_-]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html)) !== null) {
    const [, closeTag, openTag, attrStr, text] = match;
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      if (top) top.append(text);
      continue;
    }
    if (closeTag) {
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].tagName.toLowerCase() === closeTag.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (openTag) {
      const selfClosing = attrStr.trim().endsWith('/') || VOID_TAGS.has(openTag.toLowerCase());
      const cleanAttrs = attrStr.replace(/\/\s*$/, '');
      const el = doc.createElement(openTag);
      const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = attrRe.exec(cleanAttrs)) !== null) {
        const [, name, dq, sq, bare] = aMatch;
        el.setAttribute(name, dq ?? sq ?? bare ?? '');
      }
      stack[stack.length - 1].appendChild(el);
      if (!selfClosing) {
        stack.push(el);
      }
    }
  }
}

class MockDocument {
  readonly documentElement: MockElement;
  readonly body: MockElement;
  readonly baseURI = '';
  activeElement: MockElement | null = null;

  constructor() {
    this.documentElement = new MockElement('html', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): MockElement {
    return new MockElement(tag, this);
  }

  createElementNS(_ns: string, tag: string): MockElement {
    return new MockElement(tag, this);
  }

  getElementById(id: string): MockElement | null {
    return this.documentElement.querySelector(`#${id}`);
  }
}

// ============================================================================
// Snapshot & Callback Test Fixtures
// ============================================================================

function makeDefaultFrameStats(): FrameStats {
  return {
    fps: 60,
    frameTimeMs: 16.6,
    clampedDtMs: 16.67,
    drawCalls: 24,
    activeLights: 4,
    activeParticles: 6,
    backend: 'canvas2d',
    contextLostCount: 0,
    contextRestoredCount: 0,
  };
}

function makeDefaultCapabilities(): RendererCapabilities {
  return {
    kind: 'canvas2d',
    webgl2Supported: false,
    isSoftwareRasterizer: false,
    rendererString: 'Canvas2D Test',
    maxTextureSize: 4096,
    dpr: 1,
    reducedMotion: false,
    crtMode: false,
  };
}

function makeMockCallbacks(): UIBridgeCallbacks & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      const list = calls[name] ?? [];
      list.push(args);
      calls[name] = list;
    };

  return {
    calls,
    onSelectTrainer: record('onSelectTrainer'),
    onChooseStarter: record('onChooseStarter'),
    onNavigateScreen: record('onNavigateScreen'),
    onMoveInput: record('onMoveInput'),
    onInteractNearby: record('onInteractNearby'),
    onTriggerEncounter: record('onTriggerEncounter'),
    onTapWorldCanvas: record('onTapWorldCanvas'),
    onWarpBiome: record('onWarpBiome'),
    onWarpSafeZone: record('onWarpSafeZone'),
    onWarpFarmZone: record('onWarpFarmZone'),
    onAdvanceDialogue: record('onAdvanceDialogue'),
    onDismissDialogue: record('onDismissDialogue'),
    onOpenBriefingForBiome: record('onOpenBriefingForBiome'),
    onConfirmBriefing: record('onConfirmBriefing'),
    onDismissBriefing: record('onDismissBriefing'),
    onBattleMove: record('onBattleMove'),
    onBattleThrowBall: record('onBattleThrowBall'),
    onBattleUsePotion: record('onBattleUsePotion'),
    onBattleSwitchMember: record('onBattleSwitchMember'),
    onBattleFlee: record('onBattleFlee'),
    onBattleToggleOfflineRig: record('onBattleToggleOfflineRig'),
    onBattleCloseResult: record('onBattleCloseResult'),
    onBattleConfirmEvolution: record('onBattleConfirmEvolution'),
    onSelectPokedexSpecies: record('onSelectPokedexSpecies'),
    onPlaySpeciesCry: record('onPlaySpeciesCry'),
    onSetLeadPokemon: record('onSetLeadPokemon'),
    onSwapTeamWithBox: record('onSwapTeamWithBox'),
    onDepositToBox: record('onDepositToBox'),
    onWithdrawFromBox: record('onWithdrawFromBox'),
    onUpgradePokemon: record('onUpgradePokemon'),
    onCheerPokemon: record('onCheerPokemon'),
    onHealPokemonWithPotion: record('onHealPokemonWithPotion'),
    onEvolvePokemon: record('onEvolvePokemon'),
    onRenamePokemon: record('onRenamePokemon'),
    onUpdateAppearance: record('onUpdateAppearance'),
    onUpdateSettings: record('onUpdateSettings'),
    onForceSave: record('onForceSave'),
    onResetTrainerProgress: record('onResetTrainerProgress'),
    onResetAllProgress: record('onResetAllProgress'),
    onOpenSkyHop: record('onOpenSkyHop'),
    onStartSkyHop: record('onStartSkyHop'),
    onToggleSkyHopPause: record('onToggleSkyHopPause'),
    onSkyHopStarDash: record('onSkyHopStarDash'),
    onSkyHopInputY: record('onSkyHopInputY'),
    onSkyHopKeyDir: record('onSkyHopKeyDir'),
    onBuySkyHopCharge: record('onBuySkyHopCharge'),
    onCloseSkyHop: record('onCloseSkyHop'),
  };
}

function makeDefaultCryWaveform(): CryWaveformSnapshot {
  return {
    speciesId: 0,
    samples: new Float32Array(0),
    peakAmplitude: 0,
    playing: false,
  };
}

function buildSnapshot(
  bridge: StarlightStorageBridge,
  overworld: DojoOverworldSim,
  battleCtrl: DojoBattleController,
  skyCtrl: DojoSkyHopController,
  overrides: Partial<UIRenderSnapshot> = {},
): UIRenderSnapshot {
  const save = bridge.toV3SaveState();
  const profile: DojoProfileState = bridge.getActiveProfileJSON() ?? save.profiles.violet;
  return {
    screen: 'overworld',
    save,
    profile,
    overworld: overworld.getState(),
    battle: battleCtrl.getState(),
    briefing: null,
    dialogue: null,
    skyhop: skyCtrl.getState(),
    activeDrawerTab: 'pokedex',
    selectedPokedexId: 1,
    cryWaveform: makeDefaultCryWaveform(),
    badges: getAllBadges(),
    evolutionItems: getAllEvolutionItems(),
    badgeToast: null,
    toastMessage: null,
    frameStats: makeDefaultFrameStats(),
    capabilities: makeDefaultCapabilities(),
    spriteCacheVersion: 0,
    ...overrides,
  };
}

function collectFilesRecursive(
  fsMod: NodeFsLike,
  pathMod: NodePathLike,
  dir: string,
  ext: string,
): string[] {
  const out: string[] = [];
  for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
    const full = pathMod.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursive(fsMod, pathMod, full, ext));
    } else if (entry.name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

// ============================================================================
// Tests
// ============================================================================

describe('Task 7: Strict Zero-Emoji & CSS Invariant Verification', () => {
  it('contains zero raw Unicode emojis across all src/ui/, src/graphics/skyhop/, and src/styles/starlight.css files', async () => {
    const { fs, path, cwd } = await loadNodeModules();
    const files = [
      ...collectFilesRecursive(fs, path, path.join(cwd, 'src', 'ui'), '.ts'),
      ...collectFilesRecursive(fs, path, path.join(cwd, 'src', 'graphics', 'skyhop'), '.ts'),
      path.join(cwd, 'src', 'styles', 'starlight.css'),
    ];
    expect(files.length).toBeGreaterThanOrEqual(12);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(
        containsEmoji(content),
        `Found raw Unicode emoji in ${path.relative(cwd, file)}`,
      ).toBe(false);
    }
  });

  it('enforces pixel-glass CSS invariants, >=44px touch targets, reduced motion, and non-blocking CRT overlay', async () => {
    const { fs, path, cwd } = await loadNodeModules();
    const cssPath = path.join(cwd, 'src', 'styles', 'starlight.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('.crt-overlay.is-active');
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain("[data-reduced-motion='true']");
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('image-rendering: pixelated');
  });
});

describe('Task 7: SVG Icon Sprite Sheet & Pixel Canvas Helpers', () => {
  it('exports all 99 IconIds cleanly with SVG <use href="#icon-..."/> markup', () => {
    expect(CORE_ICON_IDS.length).toBe(53);
    expect(TYPE_ICON_IDS.length).toBe(18);
    expect(BADGE_ICON_IDS.length).toBe(28);
    expect(ALL_ICON_IDS.length).toBe(99);

    for (const id of ALL_ICON_IDS) {
      expect(isValidIconId(id)).toBe(true);
      const markup = createIconSvg(id, 'sl-icon-md');
      expect(markup).toContain('<svg');
      expect(markup).toContain(`<use href="#${id}"></use>`);
      expect(containsEmoji(markup)).toBe(false);
    }

    expect(iconSvg('icon-compass' as IconId)).toContain('#icon-compass');
    for (const type of ELEMENTAL_TYPES) {
      expect(isValidIconId(typeIconId(type))).toBe(true);
    }
    for (let i = 1; i <= 28; i += 1) {
      expect(isValidIconId(badgeIconId(i))).toBe(true);
    }
  });

  it('sanitizes strings while preserving clean ASCII and accented text', () => {
    expect(sanitizeNoEmoji('Star Shards & Pok\u00e9 Ball')).toBe('Star Shards & Pok\u00e9 Ball');
    expect(sanitizeNoEmoji('Level Up!')).toBe('Level Up!');
    expect(containsEmoji(sanitizeNoEmoji('Star Shard Reward'))).toBe(false);
  });

  it('hydrates SVG sprite host without display: none and draws crisp offline pixel previews', async () => {
    const doc = new MockDocument();
    await ensureSvgSpriteSheet(doc as unknown as Document);
    const host = doc.getElementById('svg-sprite-host');
    expect(host).not.toBeNull();
    expect(host?.getAttribute('style') ?? '').not.toContain('display: none');
    expect(host?.style.width).toBe('0px');

    const pokeCanvas = doc.createElement('canvas');
    pokeCanvas.width = 64;
    pokeCanvas.height = 64;
    renderPokemonPreviewCanvas(
      pokeCanvas as unknown as HTMLCanvasElement,
      25,
      null,
      null,
      null,
      false,
    );
    const pokeCtx = pokeCanvas.getContext('2d')!;
    expect(pokeCtx.imageSmoothingEnabled).toBe(false);
    expect(pokeCtx.calls.fillRect).toBeGreaterThan(20);

    const portraitCanvas = doc.createElement('canvas');
    portraitCanvas.width = 64;
    portraitCanvas.height = 64;
    renderTrainerPortraitCanvas(
      portraitCanvas as unknown as HTMLCanvasElement,
      'violet',
      null,
      null,
    );
    const portraitCtx = portraitCanvas.getContext('2d')!;
    expect(portraitCtx.imageSmoothingEnabled).toBe(false);
    expect(portraitCtx.calls.fillRect).toBeGreaterThan(10);
  });
});

describe('Task 7: 1,025 Pokedex Filter & Holographic Collector Card', () => {
  it('filters and paginates all 1,025 species by id, name, generation, type, biome, and caught status', () => {
    const allSpecies = getAllSpecies();
    expect(allSpecies.length).toBe(TOTAL_SPECIES_COUNT);

    const pokedex = { seen: [1, 25], caught: { 1: 1, 25: 1 } };

    const page1 = filterAndPaginatePokedex({
      query: '',
      genFilter: 'all',
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pageSize: 36,
      pokedex,
    });
    expect(page1.totalMatches).toBe(1025);
    expect(page1.items[0]?.id).toBe(1);

    const byId25 = filterAndPaginatePokedex({
      query: '25',
      genFilter: 'all',
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pageSize: 36,
      pokedex,
    });
    expect(byId25.items.some((s) => s.id === 25 && s.name === 'Pikachu')).toBe(true);

    const by1025 = filterAndPaginatePokedex({
      query: '1025',
      genFilter: 'all',
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pageSize: 36,
      pokedex,
    });
    expect(by1025.items[0]?.id).toBe(1025);
    expect(by1025.items[0]?.name).toBe('Pecharunt');

    const caughtOnly = filterAndPaginatePokedex({
      query: '',
      genFilter: 'all',
      typeFilter: 'electric',
      biomeFilter: 'all',
      caughtOnly: true,
      page: 1,
      pageSize: 36,
      pokedex,
    });
    expect(caughtOnly.totalMatches).toBe(1);
    expect(caughtOnly.items[0]?.id).toBe(25);

    const gen9Count = filterAndPaginatePokedex({
      query: '',
      genFilter: 9,
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      page: 1,
      pageSize: 36,
      pokedex,
    });
    expect(gen9Count.totalMatches).toBeGreaterThan(100);
  });

  it('computes bounded 3D holographic tilt angles', () => {
    const center = computeHoloCardMetrics(
      {
        speciesId: 25,
        pointerTiltX: 0,
        pointerTiltY: 0,
        starRank: 3,
        bondLevel: 50,
        caught: true,
        shiny: false,
      },
      false,
    );
    expect(center.rxDeg).toBeCloseTo(0);
    expect(center.ryDeg).toBeCloseTo(0);

    const corner = computeHoloCardMetrics(
      {
        speciesId: 1025,
        pointerTiltX: 1,
        pointerTiltY: -1,
        starRank: 5,
        bondLevel: 100,
        caught: true,
        shiny: true,
      },
      false,
    );
    expect(Math.abs(corner.rxDeg)).toBeLessThanOrEqual(13);
    expect(Math.abs(corner.ryDeg)).toBeLessThanOrEqual(13);
    expect(corner.maxBond).toBe(true);

    const reduced = computeHoloCardMetrics(
      {
        speciesId: 1025,
        pointerTiltX: 1,
        pointerTiltY: -1,
        starRank: 5,
        bondLevel: 100,
        caught: true,
        shiny: true,
      },
      true,
    );
    expect(reduced.rxDeg).toBe(0);
    expect(reduced.ryDeg).toBe(0);
  });
});

describe('Task 7: CelestialUIController Full-Screen Integration', () => {
  it('mounts and syncs Title, Starter Lab, Overworld HUD, Briefing, Battle, 5-Tab Drawer, Settings, and Sky-Hop with zero emojis', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    const loader = new SpriteAssetLoader({ forceOffline: true });
    const overworld = new DojoOverworldSim(bridge, loader);
    const battleCtrl = new DojoBattleController(bridge, loader);
    const skyCtrl = new DojoSkyHopController(bridge, loader);

    const doc = new MockDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);

    const rigSynth: IOfflineSpriteRigSynthesizer = {
      attachFallbackSheet: vi.fn(),
      renderRig: vi.fn(),
      toDataUrl: vi.fn(() => 'data:image/png;base64,test'),
    };
    const callbacks = makeMockCallbacks();
    const ui = new CelestialUIController({ rigSynthesizer: rigSynth });
    ui.mount(root as unknown as HTMLElement, callbacks);

    const assertNoEmojiDom = (label: string) => {
      const html = root.innerHTML;
      expect(containsEmoji(html), `Raw emoji detected in rendered DOM (${label})`).toBe(false);
    };

    // 1. Title Screen: Violet & Ozias cards
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'title',
      }),
    );
    const violetCard = root.querySelector('[data-testid="profile-violet"]');
    const oziasCard = root.querySelector('[data-testid="profile-ozias"]');
    expect(violetCard).not.toBeNull();
    expect(oziasCard).not.toBeNull();
    root.querySelector('[data-testid="title-play-violet"]')?.click();
    expect(callbacks.calls.onSelectTrainer?.[0]?.[0]).toBe('violet');
    assertNoEmojiDom('title');

    // 2. Starter Lab: Professor Willow + 3 starters
    bridge.manager.selectTrainer('violet');
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'starter',
      }),
    );
    expect(root.querySelector('[data-testid="starter-card-1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="starter-card-4"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="starter-card-7"]')).not.toBeNull();
    root.querySelector('[data-testid="starter-choose-4"]')?.click();
    expect(callbacks.calls.onChooseStarter?.[0]?.[0]).toBe(4);
    assertNoEmojiDom('starter');

    // Choose starter so party & HUD populate cleanly
    bridge.manager.chooseStarter(1);

    // 3. Overworld HUD (no raw cheat/debug buttons!)
    const badgeToast: BadgeToastState = {
      badgeId: 'first_catch',
      name: 'First Friend',
      iconId: 'icon-badge-1',
      description: 'Befriend your first wild partner!',
      remainingSec: 3,
    };
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'overworld',
        badgeToast,
        dialogue: {
          speaker: 'Professor Willow',
          speakerPortrait: 'willow',
          title: 'Starlight Conservatory',
          lines: ['Explore all 18 biomes and unite with 1,025 Pokemon!'],
          currentIndex: 0,
          rewardTags: [{ iconId: 'icon-star-shard', label: '+50 Star Shards' }],
        },
      }),
    );
    expect(root.querySelector('[data-testid="hud-trainer-name"]')?.textContent).toContain('Violet');
    expect(root.querySelector('[data-testid="nav-pokedex"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="nav-briefing"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="nav-skyhop"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="nav-settings"]')).not.toBeNull();
    expect(root.innerHTML.toLowerCase()).not.toContain('cheat');
    expect(root.innerHTML.toLowerCase()).not.toContain('debug give');
    assertNoEmojiDom('overworld');

    // 4. Briefing Modal
    const briefing: TacticalBriefingData = {
      kind: 'shrine',
      targetId: 'shrine_forest',
      biomeId: 'forest',
      title: 'Whispering Woods Shrine',
      subtitle: 'Guardian Encounter',
      previewSpeciesId: 25,
      previewSpeciesName: 'Pikachu',
      enemyTypes: ['electric'],
      enemyCount: 1,
      teamLevel: 5,
      targetLevel: 7,
      levelDelta: -2,
      avgHpRatio: 1,
      faintedCount: 0,
      healthyCount: 1,
      tier: 'balanced',
      label: 'Even Match',
      iconId: 'icon-balance',
      tip: 'Ground moves resist Electric shocks cleanly.',
      hasTypeAdvantage: true,
      hasTypeRisk: false,
      suggestedCounterTypes: ['ground'],
      needsHeal: false,
      farmZoneBiomeId: 'village',
      farmZoneBiomeName: 'Celestial Village',
      canChallenge: true,
    };
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'briefing',
        briefing,
      }),
    );
    expect(root.querySelector('[data-testid="briefing-tier-badge"]')?.textContent).toContain('Even Match');
    root.querySelector('[data-testid="briefing-challenge"]')?.click();
    expect(callbacks.calls.onConfirmBriefing?.length).toBeGreaterThanOrEqual(1);
    assertNoEmojiDom('briefing');

    // 5. Battle Command Deck
    battleCtrl.startEncounter({
      biomeId: 'forest',
      tier: 'wild',
      forceSpeciesId: 25,
    });
    for (let i = 0; i < 20; i += 1) {
      battleCtrl.update(0.05);
    }
    const battleState: BattleSceneState = battleCtrl.getState();
    expect(battleState.phase).toBe('command');
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'battle',
        battle: battleState,
      }),
    );
    expect(root.querySelector('[data-testid="battle-enemy-name"]')?.textContent).toContain('Pikachu');
    expect(root.querySelector('[data-testid="battle-move-0"]')).not.toBeNull();
    root.querySelector('[data-testid="battle-move-0"]')?.click();
    expect(callbacks.calls.onBattleMove?.[0]?.[0]).toBe(battleState.player.mon.moves[0].id);
    assertNoEmojiDom('battle');

    // 6. 5-Tab Collector Drawer
    const cryWaveform: CryWaveformSnapshot = {
      speciesId: 1025,
      samples: new Float32Array([0.1, 0.4, -0.3, 0.7, -0.5, 0.2]),
      peakAmplitude: 0.7,
      playing: true,
    };
    const tabs: DrawerTab[] = ['pokedex', 'team', 'badges', 'guide', 'style'];
    for (const tab of tabs) {
      ui.sync(
        buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
          screen: 'pokedex',
          activeDrawerTab: tab,
          selectedPokedexId: 1025,
          cryWaveform,
        }),
      );
      if (tab === 'pokedex') {
        expect(root.querySelector('[data-testid="pokedex-card-name"]')?.textContent).toContain('Pecharunt');
        root.querySelector('[data-testid="pokedex-play-cry"]')?.click();
        expect(callbacks.calls.onPlaySpeciesCry?.[0]?.[0]).toBe(1025);
      } else if (tab === 'team') {
        expect(root.querySelector('[data-testid="team-card-0"]')).not.toBeNull();
      } else if (tab === 'badges') {
        expect(root.querySelectorAll('[data-badge-id]').length).toBe(28);
        expect(root.querySelector('[data-testid="badges-progress-summary"]')?.textContent).toContain('/ 28');
      } else if (tab === 'guide') {
        expect(root.querySelectorAll('[data-testid^="guide-biome-"]').length).toBe(BIOME_IDS.length);
        expect(root.querySelectorAll('[data-testid^="guide-quest-"]').length).toBe(FIELD_QUESTS.length);
      } else if (tab === 'style') {
        expect(root.querySelectorAll('[data-testid^="style-outfit-"]').length).toBe(
          getAllTrainerStyles().length,
        );
        expect(root.querySelectorAll('[data-testid^="style-accessory-"]').length).toBe(
          getAllTrainerAccessories().length,
        );
        expect(root.querySelectorAll('[data-testid^="style-aura-"]').length).toBe(
          getAllTrainerAuras().length,
        );
        expect(getAllTrainerStyles().length).toBe(10);
        expect(getAllTrainerAccessories().length).toBe(8);
        expect(getAllTrainerAuras().length).toBe(6);
      }
      assertNoEmojiDom(`drawer-${tab}`);
    }

    // 7. Settings & Parent Zone
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'settings',
      }),
    );
    expect(root.querySelector('[data-testid="setting-renderer"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="parent-reset-trainer"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="parent-reset-all"]')).not.toBeNull();
    assertNoEmojiDom('settings');

    // 8. Sky-Hop Arcade HUD
    skyCtrl.open();
    skyCtrl.startNewRun();
    skyCtrl.update(0.1);
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'skyhop',
        skyhop: skyCtrl.getState(),
      }),
    );
    expect(root.querySelector('[data-testid="skyhop-score"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="skyhop-wave"]')?.textContent).toContain('1');
    assertNoEmojiDom('skyhop');

    ui.dispose();
  });

  it('verifies UI overhaul & Sprint 2 UI parity behaviors (Sky-Hop gate, Compass->Guide, Switch Trainer, Struggle, Badges grid, Pokedex filters)', () => {
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(4); // Charmander (Fire)
    const loader = new SpriteAssetLoader({ forceOffline: true });
    const overworld = new DojoOverworldSim(bridge, loader);
    const battleCtrl = new DojoBattleController(bridge, loader);
    const skyCtrl = new DojoSkyHopController(bridge, loader);

    const doc = new MockDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);

    const callbacks = makeMockCallbacks();
    const ui = new CelestialUIController();
    ui.mount(root as unknown as HTMLElement, callbacks);

    // 1. Overworld: Lead HP HUD, Compass -> Island Guide (BUG-02), Sky-Hop hidden until unlocked (BUG-11)
    const lockedSnap = buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, { screen: 'overworld' });
    ui.sync(lockedSnap);
    expect(root.querySelector('[data-testid="hud-lead-label"]')?.textContent).toContain('Charmander');
    expect(root.querySelector('[data-testid="hud-lead-hp-bar"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="nav-skyhop"]')?.hidden).toBe(true);

    root.querySelector('[data-testid="hud-compass"]')?.click();
    expect(callbacks.calls.onNavigateScreen?.at(-1)).toEqual(['pokedex', 'guide']);

    // Unlock Secret Arcade -> Sky-Hop dock button reveals with charge count
    const unlockedSnap = buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, { screen: 'overworld' });
    unlockedSnap.profile!.arcade.unlocked = true;
    unlockedSnap.profile!.arcade.charges = 3;
    ui.sync(unlockedSnap);
    expect(root.querySelector('[data-testid="nav-skyhop"]')?.hidden).toBe(false);
    expect(root.querySelector('[data-testid="nav-skyhop"]')?.textContent).toContain('3');

    // 2. Settings: Switch Trainer button (BUG-08) & Close returns to previous screen (Title)
    ui.sync(buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, { screen: 'title' }));
    ui.sync(buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, { screen: 'settings' }));
    root.querySelector('[data-testid="setting-switch-trainer"]')?.click();
    expect(callbacks.calls.onNavigateScreen?.at(-1)).toEqual(['title']);
    root.querySelector('[data-testid="settings-close"]')?.click();
    expect(callbacks.calls.onNavigateScreen?.at(-1)).toEqual(['title']);

    // 3. Battle: IN DEX badge, effectiveness pill, PHY/SPC tag, and 0-PP Struggle fallback (BUG-07, BUG-18)
    battleCtrl.startEncounter({ biomeId: 'forest', tier: 'wild', forceSpeciesId: 1 }); // Bulbasaur (Grass)
    for (let i = 0; i < 20; i += 1) battleCtrl.update(0.05);
    const bState = battleCtrl.getState();
    const bSnap = buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
      screen: 'battle',
      battle: bState,
    });
    bSnap.profile!.pokedex.caught[1] = 1;
    ui.sync(bSnap);
    expect(root.querySelector('[data-testid="battle-enemy-caught"]')?.textContent).toContain('IN DEX');

    // Drain all move PP -> slot 0 becomes Struggle and fires onBattleMove('struggle')
    for (const m of bState.player.mon.moves) m.currentPp = 0;
    ui.sync(bSnap);
    const move0 = root.querySelector('[data-testid="battle-move-0"]');
    expect(move0?.disabled).toBe(false);
    expect(move0?.textContent).toContain('Struggle');
    move0?.click();
    expect(callbacks.calls.onBattleMove?.at(-1)).toEqual(['struggle']);

    // 4. Badges Showcase: detail pedestal lives inside .sl-badge-case (BUG-21)
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'badges',
        activeDrawerTab: 'badges',
      }),
    );
    expect(root.querySelector('.sl-badge-case .sl-badge-detail')).not.toBeNull();

    // 5. Pokedex: abilityFilter & needToCatchOnly filters work cleanly (BUG-19)
    const dexAll = filterAndPaginatePokedex({
      query: '',
      genFilter: 'all',
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      needToCatchOnly: true,
      abilityFilter: 'all',
      page: 1,
      pageSize: 36,
      pokedex: { seen: [1, 4], caught: { 4: 1 } },
    });
    expect(dexAll.totalMatches).toBe(TOTAL_SPECIES_COUNT - 1);
    expect(dexAll.items.some((s) => s.id === 4)).toBe(false);

    const sampleAbility = getAllSpecies().find((s) => s.ability)?.ability ?? '';
    expect(sampleAbility.length).toBeGreaterThan(0);
    const abilityFiltered = filterAndPaginatePokedex({
      query: '',
      genFilter: 'all',
      typeFilter: 'all',
      biomeFilter: 'all',
      caughtOnly: false,
      abilityFilter: sampleAbility,
      page: 1,
      pageSize: 36,
      pokedex: { seen: [], caught: {} },
    });
    expect(abilityFiltered.totalMatches).toBeGreaterThan(0);
    expect(abilityFiltered.items.every((s) => s.ability === sampleAbility)).toBe(true);

    // 6. Forced-switch auto-opens Switch drawer & victory banner renders trailDrop chip (GAP-1 / BUG-16)
    const forcedState: BattleSceneState = {
      ...bState,
      phase: 'forced-switch',
    };
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'battle',
        battle: forcedState,
      }),
    );
    expect(root.querySelector('[data-testid="battle-switch-drawer"]')?.hidden).toBe(false);
    expect(root.querySelector('[data-testid="battle-forced-switch-prompt"]')).not.toBeNull();

    const victoryState: BattleSceneState = {
      ...bState,
      phase: 'victory',
      rewardSummary: {
        xpGained: 40,
        shardsGained: 15,
        newBadges: [],
        caught: false,
        leveledUp: false,
        trailDrop: '+1 Fire Gem',
      },
    };
    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'battle',
        battle: victoryState,
      }),
    );
    expect(root.querySelector('[data-testid="battle-trail-drop"]')?.textContent).toContain('+1 Fire Gem');

    // 7. Starter Lab displays equipped Aura in style label (GAP-2) & Stale toast suppressed on Drawer entry
    const auraSnap = buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
      screen: 'starter',
      toastMessage: 'Escaped safely.',
    });
    auraSnap.profile!.appearance.aura = 'stars';
    ui.sync(auraSnap);
    expect(root.querySelector('[data-testid="starter-style-label"]')?.textContent).toContain('Starlight Sparks');

    ui.sync(
      buildSnapshot(bridge, overworld, battleCtrl, skyCtrl, {
        screen: 'pokedex',
        activeDrawerTab: 'pokedex',
        selectedPokedexId: 1025,
        toastMessage: 'Escaped safely.',
      }),
    );
    expect(root.querySelector('[data-testid="toast-banner"]')?.hidden).toBe(true);
    expect(root.querySelector('[data-testid="pokedex-card-lore"]')?.textContent).toContain('Unmet species');

    ui.dispose();
  });
});

describe('Task 7: LivingTitleRenderer & SkyHopRenderer Frame Output', () => {
  it('renders twilight vista and Star-Dash SkyHop frames onto Canvas2DBackend without errors', () => {
    const doc = new MockDocument();
    const canvas = doc.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    canvas.clientWidth = 960;
    canvas.clientHeight = 540;

    const backend = new Canvas2DBackend();
    backend.initSync(canvas as unknown as HTMLCanvasElement, { dprCap: 1 });

    // LivingTitleRenderer frame
    const save = createDefaultSaveState();
    const titleRenderer = new LivingTitleRenderer();
    backend.beginFrame(2.5, 0.016);
    titleRenderer.update(0.016);
    titleRenderer.render(backend, save);
    const titleStats = backend.endFrame();
    expect(titleStats.drawCalls).toBeGreaterThan(0);

    // SkyHopRenderer frame (active flight + Star Dash + telegraphed Void Meteor)
    const bridge = new StarlightStorageBridge(createDefaultSaveState());
    bridge.manager.selectTrainer('violet');
    bridge.manager.chooseStarter(1);
    const loader = new SpriteAssetLoader({ forceOffline: true });
    const skyCtrl = new DojoSkyHopController(bridge, loader);
    skyCtrl.open();
    skyCtrl.startNewRun();
    skyCtrl.activateDash();
    skyCtrl.update(0.05);

    const state = skyCtrl.getState();
    state.entities.push({
      id: 'test-meteor-1',
      kind: 'void_meteor',
      x: 780,
      y: 210,
      baseY: 210,
      vy: 0,
      radius: 26,
      speed: 340,
      age: 0,
      bobAmp: 0,
      bobFreq: 0,
    });

    const skyRenderer = new SkyHopRenderer();
    backend.beginFrame(4.2, 0.016);
    skyRenderer.update(state, 0.016);
    skyRenderer.render(backend, state);
    const skyStats = backend.endFrame();
    expect(skyStats.drawCalls).toBeGreaterThan(0);
    expect(skyStats.activeLights).toBeGreaterThan(0);

    backend.dispose();
  });
});
