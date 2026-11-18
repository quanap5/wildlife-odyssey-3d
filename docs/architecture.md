# Architecture

Static single-page app: React 19 + TypeScript (strict) + Vite, Three.js through React Three Fiber, Zustand for state, Rapier for player collision. No backend.

## Layers

```
src/
  config.ts              all tunables (world size, speeds, zoom presets, thresholds)
  app/                   App shell (boot, screen switch), GameCanvas (mounts world systems)
  engine/
    rendering/           RenderLoop (manual render, capture, DoF, adaptive scale),
                         geoBuilder (procedural modelling), windMaterial
    physics/             Rapier backend + analytic fallback behind one interface
    input/               one DOM listener set; polled state + discrete key events
    camera/              zoom maths (pure)
    audio/               synthesised ambience, calls, tool sounds, music
  world/
    terrain/             layout (hand-authored), heightmap (deterministic grid), Terrain renderer
    streaming/           chunk grid helpers (rings, LOD, load/unload diff)
    vegetation/          placement (deterministic per chunk), plant models, instanced renderer
    water/               depth-aware water shader, waterfall, mist
    weather/             environment model (pure) + Sky (dome, lights, fog, rain, clock)
    structures/          data for camp/stations/ruins/props + renderer
    registry.ts          live systems + streamed entities, read by gameplay code
  entities/
    player/              controller + cameras + third-person avatar
    wildlife/            types, behaviour FSM (pure), profiles + habitats (data),
                         models (parametric rigs), animation, WildlifeSystem, scene component
  systems/
    identification/      targeting: ray pick + occlusion (pure)
    photography/         quality scoring (pure), capture pipeline
    video/               MediaRecorder recorder
    interaction/         per-frame gameplay glue + key bindings
    quests/              data-driven quest engine (pure)
    persistence/         IndexedDB/memory storage, save schema + migrations, session
  data/                  species catalog (JSON) + verification ledger, biomes, quests
  i18n/                  en / vi dictionaries, pure translate helpers, React hooks
  store/                 gameStore (Zustand, saved + UI state), runtime (per-frame state)
  ui/                    hud, camera overlays, journal, map, menus
  tests/                 Vitest unit tests
e2e/                     Playwright browser tests
```

## Rendering pipeline (art pass)

- `engine/rendering/proceduralTextures.ts` paints every texture at start-up: one foliage atlas shared by all plants and animals, and two tiling ground sheets. `cellRect` is pure, so geometry builds without a DOM.
- `engine/rendering/geoBuilder.ts` bakes parts into one buffer with position, normal, colour, wind weight, atlas UV and a foliage flag (`aSoft`: 0 solid, 1 leaf card, 2 ground cover). `foliage`, `frond` and `crossCards` are the card primitives.
- `engine/rendering/windMaterial.ts` is the single vegetation material: atlas sampling with alpha test, wind with a travelling gust front, kept normals and back-lighting for leaf cards, distance fade for ground cover.
- `world/terrain/terrainMaterial.ts` extends the standard material in world space: mottling, soil, triplanar slope rock, wet shoreline, caustics, screen-space bump. A `TERRAIN_LITE` define drops the expensive parts.
- `world/weather/Ambience.tsx` draws pollen, falling leaves and fireflies as one `Points` object animated entirely in the vertex shader.
- Quality selects geometry as well as settings: the Low preset builds solid canopies and untextured blades (`getPlantGeometry(id, low, simpleFoliage)`), uses a material with no atlas, and the lite terrain path.

## HUD, view model and minimap

- `engine/rendering/framePlan.ts` (pure) decides the passes of a frame. The hand-held view model (`entities/player/ViewModel.tsx`) is drawn last, after the depth buffer is cleared, with its own fixed field of view. A capture redraws the world without it first, so photographs, video frames, the depth-of-field pass and the photo score never see a prop.
- `entities/player/heldItems.ts` builds the props with `GeoBuilder` and maps tool and action to what is held (pure). `engine/camera/boom.ts` is the third-person boom length against ground and obstacles (pure).
- `ui/map/baseMap.ts` paints the relief image once; the full map and `ui/hud/Minimap.tsx` both draw from it. `ui/map/minimap.ts` holds the projection, rim clamping and zoom maths (pure). The minimap redraws on the 10 Hz UI tick, never per frame, and adds no camera or render pass.
- `systems/collection/quickView.ts` (pure) derives the Quick View rows from the store and what was seen at the last look; nothing new is saved. `ui/hud/hudModel.ts` (pure) formats badges, clock and coordinates.
- Layout: the top-right column (`.hud-right`) is capped at the window height and the Quick View panel is its only flexible item, so the panel shrinks before anything leaves the window.

## Principles applied

- **Rendering is separate from gameplay state.** Per-frame simulation state lives in the plain `runtime` object; React components sample it at 10 Hz. Zustand holds what the UI renders and what is saved. The frame loop never triggers React renders.
- **Biological data is separate from rendering.** Species text is JSON. A species needs a catalog entry, a behaviour profile, a habitat group and a model recipe (parameters only); no new code.
- **One source of truth for terrain.** A 513 x 513 height grid is generated once from a seed and shared by the mesh, the Rapier heightfield, vegetation placement, wildlife, the water shader and the map.
- **Pure cores, thin shells.** Behaviour FSM, targeting, photo scoring, zoom, quests, save parsing, environment and map conversion are pure functions with unit tests; components only wire them to Three.js and the DOM.
- **Frame order** (R3F `useFrame` priorities): Sky/clock (-6), Terrain LOD (-5), Vegetation streaming (-4), Player (-3), Wildlife (-2), Interaction (-1), audio mix (0), RenderLoop (1, renders manually).
- **Resource hygiene.** Every component disposes its geometries, materials and textures on unmount; input listeners are attached once and detached; frame-loop code reuses scratch vectors.

## Notable decisions

| Decision | Why |
|---|---|
| Procedural models and audio | No reachable asset CDN in the build environment; avoids licence risk; small download. |
| Raw `@dimforge/rapier3d-compat` instead of `@react-three/rapier` | Only a kinematic character controller over streamed static colliders is needed; fewer moving parts. |
| Analytic physics fallback | The game must stay playable where WebAssembly is blocked. |
| Global instanced batches per plant model | ~20 draw calls for all vegetation; rebuilt only on chunk-boundary crossings. |
| Analytic targeting instead of GPU picking | Deterministic, testable, and gives occlusion fractions for photo scoring. |
| Manual render step | Needed for photo capture at arbitrary resolution and the optional depth-of-field pass. |
| Vertex-colour "display" values converted to linear | Keeps authored colours readable while lighting stays physically based. |

## Save format

`SaveData` (version 2) in IndexedDB store `saves`, key `slot-1`; photos (`{blob, thumb}`) and videos (`Blob`) in their own stores. `parseSave` validates and migrates (v1 -> v2); an unreadable record is copied to `corrupt-<timestamp>` and reported, never deleted. Settings are in `localStorage`.
