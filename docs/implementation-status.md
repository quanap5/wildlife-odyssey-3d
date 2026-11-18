# Implementation status

Last updated: 18 Nov 2026 (branch `feature/hud-minimap-held-items`; `main` is still 0.1.0 as of 13 Nov).

## Status words

| Status | Meaning here |
|---|---|
| **Verified (browser)** | Asserted by the Playwright suite against the production build in real Chrome, driven by real key presses and clicks |
| **Verified (unit)** | Logic covered by Vitest; the feature is also wired into the game |
| **Implemented** | Built and wired in; checked at most by a one-off script or a screenshot, not by a repeatable assertion |
| **Blocked** | Could not be checked in the build environment |
| **Not started** | Not built |

Nothing below is marked Verified on the strength of reading the code.

## Current phase

Phase 8 (optimisation and release), followed by an art-direction pass over rendering and interface. All eight phases have working code. The full 30-step acceptance scenario passes in the browser on the art-pass build. A ninth pass added the minimap, the over-the-shoulder camera, hand-held tools, HUD badges and Quick View; it is complete on its branch and all four browser tests pass there. What remains is verification that needs hardware this environment does not have (a GPU, speakers, other browsers) and content depth (species source checks).

## Latest test results

Run on the feature branch build, 18 Nov 2026 (after the Quick View layout fix).

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean |
| Types | `npm run typecheck` (strict) | clean |
| Unit tests | `npm run test` | **192 passed**, 12 files |
| Production build | `npm run build` | succeeds; `dist/` 6.2 MB (includes 227 kB of bundled fonts) |
| Browser tests | `npm run test:e2e` | **4 passed** in 13.9 min on the branch build |
| HUD and Quick View layout | `node qa/quickview-layout.mjs` | 32 checks pass: English and Vietnamese, empty and full collections, at 960 x 540, 1280 x 720, 1920 x 1080 and 800 x 450. At 800 x 450 (below the design size) the panel stays inside the window but its list is cut short |
| Independent QA pass | scripted play-through in real Chrome, `docs/qa-report.md` | **110 checks**: 109 pass, 1 not applicable; 4 defects found and fixed. Run on 11 Nov 2026, before the typeface change, and not repeated since |
| Typeface check | scripted Chrome run at 1280 x 720, Vietnamese | 16 checks pass: families per role, Vietnamese and italic faces loaded, no clipped text, no failed requests |

Browser tests ran in headless Chrome with software WebGL (SwiftShader, about 1 frame per second) at 960 x 540 on the Low preset. **The Low preset uses solid canopies and the lite terrain shader, so the automated suite does not exercise the leaf-card foliage, the full terrain shader or shadows.** Those were checked by screenshot only (see "Art pass" below). Each test also fails on any console error, uncaught exception, failed request or HTTP error; none occurred.

1. **Main menu** — loads; the canvas holds a real rendered scene (not blank or flat); all five menu entries; Continue disabled without a save; Vietnamese and English; field guide lists 36 species and keeps the open page across a language switch; settings persist; credits.
2. **Acceptance scenario** — steps 1-30 of the brief, in order, in one session (details in the table below).
3. **Tools, interactions and environment** — archaeologist role; slow motion measured on the simulation clock at 1.0 / 0.5 / 0.25x; third person; performance overlay; jump; reading a sign with E; scanning a plant, which raises the discovery card; camera guides (G) and aperture (- =); macro lens; rain and night from the pause menu (frame measurably darker); Vietnamese HUD in game; save, return to menu, reset progress.
4. **HUD and hands** — minimap in the corner following the player; N zoom; badges and tool bar inside the window and clear of the centre; scanner in the hand on screen but absent from a captured frame; scan; camera raised to the eye; every tool; Quick View under the minimap, inside the window and not cut off, with the scanned species and the new photograph marked new, while the player keeps walking; view switching; minimap and hand-held settings.

Unit test files: `species` (schema, lookup, wiring), `quests` (state transitions), `photography` (scoring, zoom, adaptive resolution, codec choice), `i18n` (key parity, anatomy notes), `persistence` (serialisation, migration, corrupt saves, media storage), `store` (discovery tracking, save round trip), `behavior` (state transitions for every controller), `world` (terrain, chunk streaming, placement, map coordinates, day/night and weather), `simulation` (wildlife system, targeting and occlusion, Rapier controller), `rendering` (atlas layout, card geometry, plant model variants, camera settings).

### Acceptance scenario

| Step | What the test asserts | Status |
|---|---|---|
| 1-2 | Game opens in Chrome; menu with Continue / New Expedition / Field Guide / Settings / Credits | Verified (browser) |
| 3-5 | New Expedition → Wildlife Biologist → spawn at the research camp, Rapier physics active, 3D frame rendered | Verified (browser) |
| 6 | W A S D moves over the terrain; looking works by keyboard and by mouse drag | Verified (browser) |
| 7-8 | Walk to the forest edge; plants and animals are active around the player | Verified (browser) |
| 9-10 | Approaching a sambar deer makes it alert, then flee | Verified (browser) |
| 11 | B: binoculars narrow the field of view | Verified (browser) |
| 12-15 | C: camera, 4x zoom, focus lock, shutter; a real image is stored, scored 0-100, and identifies the species | Verified (browser) |
| 16-17 | Journal page shows English and Vietnamese names, scientific name, family, order, habitat, adaptations; photo opens from storage | Verified (browser) |
| 18 | Inspection view: separate 3D view of the animal with six animations | Verified (browser) |
| 19-21 | Video recorded with MediaRecorder (VP9 WebM), reviewed at 0.5x, saved to the journal with subject and behaviour | Verified (browser) |
| 22-24 | Swim and dive at the river; fish stay inside the water volume; a silver barb is scanned and photographed | Verified (browser) |
| 25-26 | Map opens, a click places a waypoint, the player reaches it in the rainforest | Verified (browser) |
| 27 | Mission 1 completes and awards its badge | Verified (browser) |
| 28 | Pause → save and return to the main menu; Continue is enabled | Verified (browser) |
| 29-30 | Page reload → Continue restores position, discoveries, quest state, photos and the video (which plays at 0.5x from IndexedDB) | Verified (browser) |

"Polished" (step 2) and "beautiful" (step 5) are judgements; the menu and camp were looked at in screenshots, not scored.

## Feature checklist

### World

| Feature | Status | Evidence / note |
|---|---|---|
| 1 km² deterministic world from one seed | Verified (unit) | `world.test.ts` |
| Five biomes: rainforest, river and lake, grassland, mountain and waterfall, ancient ruins | Verified (unit) + screenshots of all five | Player entered grassland, freshwater and rainforest in the browser test |
| Chunked terrain, three LOD levels, draw distance | Implemented | Seen working in every browser run; LOD seams not inspected closely |
| Instanced vegetation with wind, 14 plant species + rocks | Implemented | Screenshots |
| Water: animated surface, depth-tinted shallows, shore foam, sun glint, waterfall with mist | Implemented | Screenshots of river, lake, waterfall, underwater |
| Research camp, two field stations, summit viewpoint, ruins, rock shelter | Implemented | Screenshots of camp, ruins, viewpoint |
| Caves | Not started | A rock shelter stands in for caves; no enclosed cave geometry |
| Day / night cycle with speed setting; morning, noon, sunset, night | Verified (browser) for night; unit tests for the light model | Sunset and night screenshots |
| Weather: clear, cloudy, light rain, fog; affects light, fog, sound mix, animal activity | Verified (browser) for rain; unit tests for the rest | Fog and cloudy never looked at |
| Shadows (off / low / high) | Implemented | Never rendered in a checked run: all checked runs had shadows off |
| Map with landmarks, undiscovered areas, player marker, waypoint; compass | Verified (browser) | Compass letters are not localised |

### Art pass (rendering and interface)

"Screenshot" below means: captured in headless Chrome on the shipped build at Medium quality with low draw distance and low shadows, and looked at once. It is evidence that the feature renders and roughly how it looks, not a repeatable test, and not a check of frame rate.

| Feature | Status | Evidence / note |
|---|---|---|
| Leaf-card canopies, bark, fronds, per-species growth forms | Implemented | Screenshots of grassland, rainforest, ruins, pine slope; geometry variants verified (unit) |
| Dense grass in drifts, wildflowers, reed beds, river weed, distance fade | Implemented | Screenshots; ground-cover flags verified (unit) |
| Terrain: mottling, soil, triplanar slope rock, wet shoreline, caustics, bump | Implemented | Screenshots of slopes, waterfall face, river bank and bed |
| Scree and shoreline boulders | Implemented | Placement stays deterministic (unit) |
| Water: layered ripples, bank reflections, glitter, lapping foam | Implemented | Screenshots of river and lake |
| Soft canopy shade, lifted skylight, haze, lens falloff | Implemented | Screenshots at morning, sunset and night |
| Pollen, falling leaves, fireflies | Implemented | Pollen and fireflies seen in screenshots; falling leaves not looked at |
| Animals: coat and scale grain, rim light, eye catchlights, jointed legs | Implemented | Sambar deer seen at 8x zoom and in the inspection view; the other 21 animals were not looked at individually after the change |
| Viewfinder: corner brackets, guides (thirds / golden / diagonals / off), aperture f/2.8-f/16, focus distance, shutter blink | Guides and aperture: Verified (browser). Rest: Implemented | The effect of aperture on blur strength was not compared visually |
| Discovery card on first sighting | Verified (browser) | Also seen in a screenshot |
| Journal paper styling, specimen plates, inspection plinth and slow turn | Implemented | Screenshots at 800 x 450, where the layout stacks; not re-checked at desktop width |
| Low preset: solid canopies, untextured ground cover, lite terrain | Verified (browser) indirectly: the whole suite runs on it | One screenshot |
| Bundled typefaces: Chakra Petch (titles, HUD labels, scientific names), Be Vietnam Pro (body), JetBrains Mono (readouts); Latin and Vietnamese subsets, OFL 1.1 | Verified (browser) for loading and use; look: Implemented | A scripted Chrome check (13 Nov 2026) confirmed each role resolves to the bundled family, the Vietnamese and italic faces load from the build with no failed request, and no text is clipped in the menu, field guide (both languages), HUD or journal at 1280 x 720. Appearance was judged from five screenshots in Vietnamese; English was checked for clipping only, and the settings, map, video and pause screens were not looked at with the new fonts |
| External glTF models and PBR texture packs | Not started | Not reachable or licence-checkable from the build environment; see `docs/asset-licenses.md` |

### HUD, views and hand-held tools (branch)

| Feature | Status | Evidence / note |
|---|---|---|
| Minimap: corner position, follows the player, three zoom levels, heading-up / north-up, three sizes, on/off | Verified (browser) | Projection, rim clamping and zoom: Verified (unit). Landmark and waypoint markers were not asserted in the browser |
| Over-the-shoulder camera, 0.25 s switch, lens tools borrow first person, view saved | Verified (browser) for switching and saving | Boom against ground, trunks and walls: Verified (unit); not watched in motion |
| Hand-held props in first person (separate pass) and on the avatar in third person | Verified (browser) for what is held and when | Looked at in screenshots on the Low preset only; sway and bob not watched in motion |
| Props never in a captured frame | Verified (browser) + (unit) | A displayed frame holds the scanner's lit screen; a captured frame of the same view holds none of it |
| HUD tool bar, clock, weather, collection badge and dot, context badges, mission-badge count, biome and coordinates | Verified (browser) at 960 x 540 in English | Position inside the window in both languages at four sizes: layout script. Recording, swimming and waypoint badges: Verified (unit) only |
| Quick View (hold Q): seven collections, counts, newest items, new marks, hints for empty collections, no pause | Verified (browser) | Layout in both languages and four sizes: layout script, with sample data placed in the store for the full case |
| Held items off; simplified props on Low | Off: Verified (browser). Low props: Implemented | |

### Player

| Feature | Status | Evidence / note |
|---|---|---|
| Two roles: Wildlife Biologist (faster scans), Archaeologist (ruins on map from the start) | Verified (browser) for selecting either role | Archaeologist map effect: Verified (unit). Faster scans: Implemented |
| Walk, jump, ground following, structure collisions (Rapier, with analytic fallback) | Verified (browser) | Sprint and crouch: Implemented |
| Swimming and diving | Verified (browser) | |
| First / third person | Verified (browser) | |
| Mouse look with pointer lock | Implemented | Tests look around with the keyboard and by dragging; pointer-lock capture is not asserted |
| Photo, video, binocular, scanner, macro, inspection modes | Verified (browser) | |

### Wildlife

| Feature | Status | Evidence / note |
|---|---|---|
| 22 animal species, 156 individuals, each with its own profile | Verified (unit) | |
| Behaviour state machine with 16 states: idle, walking, running, feeding, drinking, resting, searching, alert, fleeing, returning, swimming, flying, perched, hovering, soaring, calling | Verified (unit) | Alert and fleeing also verified (browser) |
| Locomotion types: walk, run, hop, crawl, wade, fly, soar, swim | Verified (unit) that species move differently | Only deer and fish were watched closely in the browser |
| Fish schooling, kept inside water volumes | Verified (browser) | |
| Activity by time of day and weather; approach water; birds between trees; butterflies and bees at flowers | Verified (unit) | |
| Animals simulated only near the player | Verified (unit) | Reduced update rate beyond 80 m: Implemented |
| Procedural models and animation | Implemented | Stylised low-poly rigs with parametric animation, not skeletal assets. Small animals are drawn larger than life so they can be found |

### Species data

| Feature | Status | Evidence / note |
|---|---|---|
| 36 real species (22 animals, 14 plants), typed schema, Vietnamese and English | Verified (unit) | |
| Taxonomy and conservation status checked against a cited source | **10 of 36** | The other 26 are labelled "not yet verified" in the game and in `docs/species-sources.md`. No status or taxonomy was invented, but unverified entries were written from general knowledge and may contain errors |
| Anatomy notes in inspection | Verified (unit) | General facts about the organism's group, labelled as such; not per-species claims |

### Research tools

| Feature | Status | Evidence / note |
|---|---|---|
| Camera: optical-style zoom by field of view (1 / 2 / 4 / 8x), focus lock, occlusion-aware identification | Verified (browser) | |
| Photo score 0-100 from visibility, size, composition, distance, sharpness, focus, light | Verified (unit) + (browser) | |
| Exposure compensation, depth of field, hide UI | Implemented | Depth of field checked in one screenshot |
| Output sizes HD / Full HD / QHD | Implemented | Only the screen-size capture was exercised |
| Photo album: open, delete | Open: Verified (browser). Delete: Implemented | |
| Download of photos and videos | Implemented | The button is present and enabled at top level (browser test); the download itself was not exercised. Hidden when the game is embedded in a frame |
| Video recording, codec selection, review, save, library playback | Verified (browser) in Chrome (VP9 WebM) | Codec fallback order verified (unit). Firefox and Safari not tested |
| Slow motion: simulation at 1.0 / 0.5 / 0.25x and slowed playback of recordings | Verified (browser) | The UI states that slowed playback is not high-frame-rate footage |
| Binoculars | Verified (browser) | |
| Bio scanner for animals and plants | Verified (browser) | |
| Macro lens | Verified (browser) for toggling | Close-up use not checked |
| Inspection mode | Verified (browser) | |

### Journal, missions, interactions

| Feature | Status | Evidence / note |
|---|---|---|
| Journal: species, photographs, videos, map, progress, field notes | Verified (browser) | Field notes tab: Implemented |
| Five data-driven missions | Mission 1: Verified (browser). Missions 2-5: Verified (unit) | Missions 2-5 were not played to completion in the browser |
| Signs, viewpoint panorama, artifacts, hidden notes, animal tracks, rocks, plant inspection | Reading a sign: Verified (browser). The rest: Implemented | |
| Contextual prompt instead of floating labels | Verified (browser) | |

### Interface, audio, saving

| Feature | Status | Evidence / note |
|---|---|---|
| Main menu, HUD, equipment wheel, inventory, pause, settings | Verified (browser) | Inventory and wheel: Implemented (screenshot of the wheel) |
| Vietnamese / English everywhere from one string table | Verified (unit) for key parity; (browser) for menu, guide and HUD | |
| Synthesised audio: ambience per biome, river, waterfall, wind, rain, night insects, animal calls, footsteps, shutter, scanner, journal, music | **Blocked** | Generated with WebAudio in code, no audio files. The build machine has no audio output, so it has never been listened to |
| Save / load in IndexedDB, autosave, corrupt-save backup, schema migration, New / Continue / Reset | Verified (browser) + (unit) | Storage-full handling: Implemented, not exercised |
| Performance overlay, graphics presets, adaptive resolution | Overlay: Verified (browser). Adaptive rule: Verified (unit) | |
| 60 fps at 1080p on a desktop GPU; 30 fps fallback | **Blocked** | No GPU available. See `docs/performance.md` |

## QA pass (11 Nov 2026)

A separate end-to-end QA pass re-tested the whole player flow with its own harness: sprint, crouch and strafing; all five biomes; collisions with trunks, boulders, the ruins wall and the map edge; a wildlife census that met 21 of 22 species at six sites (the 22nd at its own habitat), checking that every sampled animal was grounded or in its water volume and, for those that were moving, that heading and limb animation matched the movement; scanner on a bird and a small plant; photographs at all four output sizes verified as real image files of the right dimensions; all four zoom levels against the optical formula; video playback; all 36 species pages in both languages; missions 1 **and 2** completed by play; a save made while standing on a structure; presets, draw calls, GPU resource counts and heap over repeated laps. Full evidence is in `docs/qa-report.md`.

This strengthens several rows above: sprint and crouch, photo output sizes, mission 2, and species pages in both languages were exercised in the real browser by that pass. The harness is kept in `qa/harness` and can be re-run, but it is not part of `npm run test:e2e`, so those rows keep their original status words.

## Known bugs and limitations

- **Frame rate on real hardware is unknown.** Only software rendering was available. Medium and High presets were not exercised by the browser tests. The art pass makes Medium and High heavier (alpha-tested foliage, a richer terrain shader); how much that costs on a GPU is unmeasured.
- **The art pass was judged from about twenty screenshots by the developer, at 800 x 450 and half render scale.** Nobody has seen it in motion at full resolution. Wind, particles, water movement and animal animation in particular have only been seen as stills.
- Leaf cards thin out slightly at long range (alpha-tested mipmaps), and the Low preset looks much plainer than Medium.
- **Audio has not been heard.**
- **26 of 36 species entries are unverified** and say so.
- Only Chrome was tested. Safari's MP4 recording path and Firefox are untested.
- Console shows a `THREE.Clock` deprecation warning that comes from React Three Fiber.
- Compass letters (N, E, S, W) are not translated.
- The physics chunk is 4.3 MB because Rapier's WASM is inlined.
- On a very slow machine the scanner and focus lock take longer than designed, because simulation steps are clamped.
- **The HUD pass has been seen only on the Low preset, in stills.** Hand-held props on Medium and High, their sway and bob, and the third-person camera in motion have not been looked at.
- Below 960 x 540 the Quick View list is cut short instead of leaving the window.
- No touch or gamepad controls; desktop keyboard and mouse only.
- When the game is embedded in a sandboxed frame, pointer capture, file download and persistent storage can each be refused by the host. The game then falls back to drag-to-look and in-memory saves (with a notice on the menu) and replaces the download buttons with a note. This was checked once by hand-run script in a frame sandboxed to scripts only: menu, new expedition, Rapier physics, a photo and the album all worked; nothing persisted, as expected.

## Bugs found by the browser tests and fixed

- (HUD pass) Quick View ran past the bottom of a 960 x 540 window (bottom edge at 606 px); it now ends at 478 px with empty collections in Vietnamese and 520 px with every collection filled.
- (HUD pass) The "click to look around" hint showed through the Quick View panel.
- Cursor could stay captured when a panel was opened right after closing another, making the panel unclickable.
- Video review: the clip could cover the speed and save buttons at small window sizes.
- Map clicks were offset when the map was letterboxed.
- A recording could be saved without its observed behaviour on slow machines.
- Draw-call and triangle counts read as 1 while depth of field was active.
- A distant speck could be rated an "excellent" photo.
- (QA pass) Bee and dragonfly wings froze at 10, 20 and 40 fps; Medium preset drew 2.87 M triangles in the rainforest (now 1.80 M); Low-preset soil patches tiled visibly; squirrel tail was a row of separate balls.
- (Art pass) The mane on maned mammals was a row of dark spikes; now a low ridge.
- Inspection anatomy headings were paired with unrelated species facts.

## Remaining work and next tasks

1. Run on a machine with a GPU: record frame rate per preset in each biome, check shadows, tune budgets, and judge the art pass in motion at full resolution.
2. Listen to the audio mix and adjust levels.
3. Verify the remaining 26 species against primary sources and update `verification.json`.
4. Play missions 2-5 to completion in the browser and add them to the suite.
5. Test in Firefox and Safari.
6. Merge `feature/hud-minimap-held-items` into `main` and tag 0.2.0.
7. Content depth: enclosed cave, more animal animation variety, localised compass.
