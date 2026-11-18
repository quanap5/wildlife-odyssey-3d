# Performance

Targets from the brief: 60 fps at 1080p on a capable desktop GPU, graceful fallback to 30 fps on weaker hardware, no avoidable stalls, no unbounded memory growth.

**State of verification.** The development and test machine has no GPU. Every browser run used Chrome's software WebGL (SwiftShader) on 2 CPU cores, which renders this scene at about 1 frame per second. The 60 fps / 30 fps targets have therefore **not been measured** and are not claimed. What was measured is listed under "Measurements"; what was built to reach the targets is listed under "Techniques".

## Techniques in the build

| Area | What is done | Where |
|---|---|---|
| Terrain | 16 x 16 chunks of 64 m, three LOD steps (2 m / 4 m / 8 m cells) chosen by chunk distance, skirts hide LOD seams, only chunks inside the draw distance exist | `src/world/terrain/Terrain.tsx`, `src/world/streaming/chunks.ts` |
| Vegetation | One `InstancedMesh` per plant model and detail level for the whole visible area; a low-detail model beyond the near ring; density slider hides instances by rank. Canopies are alpha-tested leaf cards from one shared atlas (one material, one program). Ground cover shrinks to nothing in the vertex shader beyond the grass range, so it costs no fill outside it and never ends at a chunk edge | `src/world/vegetation/Vegetation.tsx`, `plantModels.ts` |
| Geometry | All models are merged, vertex-coloured buffers with atlas UVs; one shared material per model family |
| Textures | Everything is painted at start-up: one 1024 px RGBA atlas and two 512 px ground sheets, about 8 MB of GPU memory with mipmaps. Nothing is downloaded |
| Terrain shading | Per-pixel detail runs in the terrain fragment shader (up to 11 texture reads); the Low preset compiles a lite path with 2 reads, no caustics and no bump | `src/engine/rendering/geoBuilder.ts` |
| Wildlife | Agents are only simulated and drawn inside the wildlife radius; animals more than 80 m away are simulated every third frame; all animals of a species share one cached geometry set and one material, and their meshes exist only while the animal is active | `src/entities/wildlife/WildlifeSystem.ts` |
| Culling | Three.js frustum culling per chunk mesh, per structure and per animal; instanced batches are rebuilt only when the player changes chunk | — |
| Physics | Rapier heightfield colliders exist only for the 3 x 3 chunks around the player | `src/engine/physics/physics.ts` |
| Post-processing | Depth of field runs only while a camera tool has a subject, and never on the Low preset | `src/engine/rendering/RenderLoop.tsx` |
| Resolution | Render scale 50-100 %, device pixel ratio capped at 2; adaptive resolution lowers the scale in 12.5 % steps (down to 50 %) after 3 s below 27 fps and raises it after 12 s above 56 fps | `nextAdaptiveScale` (unit-tested) |
| Shadows | Off / Low (1024 px) / High (2048 px); one directional shadow map that follows the player | `src/world/weather/Sky.tsx` |
| Cleanup | Chunk geometry and inspection scenes are disposed when no longer shown; physics colliders are removed as chunks leave the 3 x 3 ring | — |
| Loading | Rapier (4.3 MB, WASM inlined) is a separate chunk loaded in parallel; if it fails the game falls back to an analytic terrain controller | `createPhysics()` |

Not done: GPU texture compression. The textures are generated in the browser, so there is nothing to pre-compress; their total size is fixed and small.

## Graphics presets

| Preset | Render scale | Shadows | Vegetation density | Terrain / vegetation rings | Wildlife radius | Foliage | Grass range | Terrain shader |
|---|---|---|---|---|---|---|---|---|
| Low | 75 % | off | 50 % (ground cover a further 55 %) | 1 chunk detailed, 2 chunks total | 110 m | solid canopies, untextured blades, no flower drifts or river weed | 34 m | lite |
| Medium (default) | 100 % | low | 85 % | 2 / 4 chunks | 150 m | leaf cards | 80 m | full |
| High | 100 % | high | 100 % | 2 / 6 chunks | 190 m | leaf cards | 115 m | full |

Each value can also be set on its own in Settings.

## Performance overlay

F3 (or Settings → Performance overlay) shows FPS, frame time, draw calls, triangles, render resolution and scale, active / total animals, visible plant instances and loaded chunks. Draw calls and triangles are counted across every pass of the frame, so they roughly double while depth of field is active.

## Measurements

All taken on 11 Nov 2026 in headless Chrome with SwiftShader (software rendering), 2 CPU cores. They describe scene complexity, not achievable frame rate on a GPU. Alpha-tested leaf cards and multi-sample shaders are far more expensive in a software rasteriser than on a GPU, so these frame rates understate real hardware by a wide and unknown margin.

**After the art pass — Medium quality, low draw distance, render scale 50 %, low shadows, 800 x 450.** Triangle counts include the shadow pass, which draws the scene a second time.

| View | Draw calls | Triangles | Instances (plants + ground cover) | Software fps |
|---|---|---|---|---|
| Research camp (grassland) | 180 | 600 k | 22 169 | 0.56 |
| Rainforest interior | 94 | 1 180 k | 7 329 | 0.14 |
| River bank | 132 | 545 k | 18 639 | 0.69 |
| Ancient ruins | 207 | 1 151 k | 6 462 | 0.13 |
| Pine slope | 84 | 724 k | 17 054 | 0.39 |
| Camera with depth of field, forest edge | 192 | 1 822 k (shadow pass plus two scene passes) | 15 064 | 0.29 |

**Low preset** (960 x 540, render scale 60 %, no shadows), measured just before the last two Low-only reductions: camp 277 k triangles at 0.85 fps, rainforest 484 k at 0.38 fps. Before the art pass the same preset measured 269 k and 412 k. The browser suite, which runs on the Low preset, went from 14.6 to 18.0 minutes, so Low is roughly a quarter slower in software than it was.

**Full presets in the rainforest (QA pass, 960 x 540).** One frame each on Medium and High is enough to count the scene even though it takes 10-20 s in software:

| Preset | Chunks | Draw calls | Triangles (with shadow pass) | Note |
|---|---|---|---|---|
| Low | 25 | 64 | 433 k | |
| Medium | 81 | 89 | 1 803 k | was 2 870 k before the QA fix that limits full-detail trees to the first ring |
| High | 143 | 115 | 3 125 k | measured before that fix; High keeps two rings of full-detail trees, so it should be unchanged |

Draw calls stay low on every preset because every plant model is one instanced batch.

**Memory (QA pass, after the art pass, Low preset).** Three laps of six sites across all five biomes: JS heap after forced GC 51, 56, 56 MB; GPU geometries 152, 152, 152; textures 5, 5, 5; shader programs 12, 12, 12. Switching Low → Medium → High → Low left 123 geometries and 5 textures (148 and 5 before), so presets do not leak either. The overlay (F3) shows the geometry and texture counts live.

**Memory, earlier measurement.** Measured before the art pass: four laps of seven teleports across all five biomes (Low preset) gave a JS heap after forced GC of 43, 41, 44 and 38 MB with a constant 25 chunks loaded. Not repeated afterwards; the art pass adds fixed-size textures and cached geometry variants, not per-chunk allocations. GPU memory was not measured.

**Build size.** `dist/` is 6.2 MB: `index-*.js` 1.57 MB (454 kB gzip), `rapier-*.js` 4.34 MB (1.67 MB gzip), CSS 34 kB, 18 font files 227 kB. A page loads only the font files it needs, typically 8 to 15 of them.

## Known performance risks

- Real-GPU frame rates are unmeasured. The first thing to do on a real machine is open the overlay on each preset in the rainforest, which is the heaviest biome.
- Vegetation batches are rebuilt on the main thread when the player crosses a chunk boundary; this may show as a short hitch on slow CPUs.
- The Rapier chunk is large because the WASM binary is inlined as base64 by `@dimforge/rapier3d-compat`.
- High shadows re-render the visible instanced vegetation into one 2048 px shadow map with no cascades; distant shadows are soft and the pass is not cheap.
- Leaf cards are alpha-tested and overlap heavily inside a crown. On integrated GPUs the rainforest may need the Low preset; that is what the solid-canopy path is for.
- The terrain shader's triplanar rock and caustics run on every terrain pixel on Medium and High.
