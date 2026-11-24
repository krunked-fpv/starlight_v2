# STARLIGHT V2 — ARCHITECTURE CONTRACT

> **Core Constitution**: Git, code, and markdown contracts are persistent truth; agent sessions and scratchpads are disposable compute.

## 1. System Topology & Strict Decoupling

Starlight v2 separates **Core Game State & Continuity** from the **Cozy HD-2D & Celestial Diorama Presentation Layer** so that 100% of Starlight Island gameplay mechanics, dual trainer profiles, legacy v1 saves, 1,025 species data, 28 Elemental Badges, Composure battle math, procedural Web Audio synthesis, and offline PWA playability remain intact regardless of graphics backend.

```text
+-------------------------------------------------------------------------+
|                        CORE GAME DOMAIN (src/core/**)                   |
|  SaveHydrator (v1 localStorage/IDB -> v2 non-destructive bridge)        |
|  GameStore (Dual Profiles, 1,025 Species, 28 Badges, 19 Biomes, Style)  |
|  BattleEngine (18x18 Type Chart, Composure Shield, Star Ball Capture)   |
|  TacticalBriefingEngine | SkyHopEngine | ProceduralAudioSynth (Cry PCM) |
+------------------------------------+------------------------------------+
                                     | Typed Immutable Contracts (src/contracts/**)
                                     v
+-------------------------------------------------------------------------+
|               STARLIGHT V2 PRESENTATION LAYER (src/graphics, src/ui)    |
|  RenderEngine (IRenderBackend negotiation & context-loss hot-swap)      |
|   ├── WebGL2Backend (FBO lighting, water reflections, bloom, LUT, CRT)  |
|   └── Canvas2DBackend (Deterministic SwiftShader/low-power parity)      |
|  Domain Renderers:                                                      |
|   ├── OverworldRenderer (47-tile autotiles, grass sway, point lights)   |
|   ├── BattleTheaterRenderer (5-plane parallax, 18-type VFX, rigs)       |
|   └── SkyHopRenderer (Multi-layer cloud seas, aurora, vortices, dash)   |
|  CelestialUIController (Zero-emoji SVG HUD, Living Title, Holo Dex)     |
+-------------------------------------------------------------------------+
```

## 2. Hybrid WebGL2 / Canvas2D Render Graph

### Primary GPU Path (`WebGL2Backend`)
1. **Pass 1 — Terrain, Autotiles & Multi-Depth Water**: Draws 47-tile autotiled ground, cobblestone, cliffs, and translucent shoreline/deep water with procedural sky & starlight reflection waves and animated surf foam.
2. **Pass 2 — Depth-Sorted Diorama Entities**: Draws cliff drop-shadows, footstep-parting tall grass blades, biome micro-props, landmarks (cottages, shrines, chests, fountains, signposts), and animated directional Trainer/NPC/Rival/Follower rigs with Style Studio cosmetics & auras.
3. **Pass 3 — 2D Deferred Normal/Point Lighting & Canopy Gobos**: Accumulates warm cottage window spill, colored Shrine/Fountain/Starfall point lights, and Style Studio Starlight/Sky-Thunder trainer aura lights over a normal-aware lightmap, modulated by drifting forest canopy sunbeams and cloud shadows.
4. **Pass 4 — Additive VFX, Dual-Kawase Bloom & Biome Color-Grade LUT**: Composites 18-type battle beams/particles/shockwaves, subtle bloom glow, per-biome color-grade LUT uniforms, vignette, and optional CRT scanlines.

### Parity Fallback Path (`Canvas2DBackend`)
Automatically activates when:
- `?renderer=canvas2d` query parameter or user setting is active;
- WebGL2 context creation fails or is unavailable;
- A software rasterizer (e.g., SwiftShader/llvmpipe in headless CI) is detected under `auto` mode; or
- A live `webglcontextlost` event fires (immediately hot-swapping without losing frame pacing or gameplay state, and smoothly restoring on `webglcontextrestored`).

Both backends share locked 60 FPS frame-pacing (`dt` clamped to `<= 50ms`), capped high-DPI thermal scaling (`dpr <= 2`), and `prefers-reduced-motion: reduce` motion/flash attenuation.

## 3. Static GitHub Pages & Offline PWA Envelope

- **Base Path**: `vite.config.ts` sets `base: './'`. Every runtime fetch (`./atlases/manifest.json`, `./icons/starlight-icons.svg`, `./sw.js`, `./manifest.webmanifest`) resolves relative to `document.baseURI` / `import.meta.url`, operating identically at `/` and `/starlight_v2/` (`https://krunked-fpv.github.io/starlight_v2/`).
- **Deterministic Procedural Asset Baker**: `scripts/bake-assets.mjs` uses a seeded Mulberry32 PRNG and pure Node `node:zlib` PNG encoding (zero network calls, zero external paid APIs, zero native image bindings) to generate byte-identical albedo/normal/emissive atlases (`public/atlases/**`) and multi-stop SVG sprite packs (`public/icons/**`) well under the 25 MB `dist/` footprint ceiling.
- **Offline Service Worker (`public/sw.js`)**: Uses versioned Cache Storage (`starlight-v2-cache-...`) precaching core static assets, baked atlases, and SVG packs without ever touching `localStorage` or `IndexedDB` save storage. When offline or when external Pokémon sprites fail to load, the `OfflineSpriteRigSynthesizer` renders stylized, multi-shaded elemental art rigs parameterized by `speciesId`, primary/secondary types, and body archetype.

## 4. Disjoint Worker File Ownership Map

| Specialist | Capability Tier | Exclusive File Ownership |
| --- | --- | --- |
| `@mara-vance` | `inherit` | `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`, `.agents/agents/**`, `src/contracts/**`, `src/core/**`, `src/app/**`, `src/main.ts`, root configs |
| `@devon-park` | `flash` | `scripts/bake-assets.mjs`, `.github/workflows/**`, `public/atlases/**`, `public/icons/**`, `public/sw.js`, `public/manifest.webmanifest` |
| `@kenji-sato` | `inherit` | `src/graphics/engine/**`, `src/graphics/shaders/**` |
| `@linnea-berg` | `pro` | `src/graphics/overworld/**` |
| `@dante-moreau` | `pro` | `src/graphics/battle/**` |
| `@sora-takahashi` | `pro` | `src/ui/**`, `src/graphics/skyhop/**`, `src/styles/**` |
| `@nadia-khoury` | `inherit` | `tests/redteam/**`, `tests/e2e/**`, `playwright.config.ts` |
