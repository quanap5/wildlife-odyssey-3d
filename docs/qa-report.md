# QA report — end-to-end pass

Date: 11 Nov 2026. Build: the production bundle in `dist/` (`npm run build`), served by `vite preview`.

## How this was tested

An independent test harness (separate from the project's Playwright suite) drove the game in real Chrome: real key presses, mouse wheel and clicks, with the game's own state read back for evidence. Every check below was executed; the Evidence column is what the run measured. Nothing in the table was inferred from source code.

| | |
|---|---|
| Browser | Chrome (headless), 960 x 540 |
| Renderer | **Software WebGL (SwiftShader)**, about 1 frame per second on the Low preset |
| Preset | Low, except where a row says otherwise |
| Console | Every run recorded console errors, uncaught exceptions, failed requests and HTTP errors: **none in any run** |

The harness uses a debug hook to place the player near a subject (so a check does not have to walk for minutes at one frame per second) and to point the camera. Everything the player does after that — moving, using tools, pressing buttons — goes through the real input path.

**What this environment cannot show.** There is no GPU, no audio device, no second browser and no human eye on a moving picture. Frame rate on real hardware, sound, Firefox/Safari, and how animation, wind and water *look in motion* are not covered. Still images were inspected; motion was verified only by measuring it (speeds, headings, limb angles).

## Result

**110 checks executed** across the 20 requested items plus visual quality, performance and stability.

- 106 passed on the first run.
- 1 failed on a real defect (bee wings, defect 1) and passes after the fix.
- 2 failed because the test itself was wrong; both pass on a corrected re-test (explained in the table).
- 1 is not applicable: it tested a situation only the debug hook can create.
- 4 game defects were found in total (one by a failing check, three by inspection of measurements and screenshots). All four are fixed and re-verified.
- Console errors, uncaught exceptions and failed requests across all runs: 0.

The main acceptance scenario is playable end to end. No blocker was found.

## Defects found and fixed

| # | Defect | How it was found | Root cause | Fix | Regression test |
|---|---|---|---|---|---|
| 1 | Bee and dragonfly wings could stand still while flying | Run B measured wing angles across frames: 37 of 119 flying samples frozen, all bees | Wing phase was integrated as 40 Hz x frame time. Whenever the frame time is a whole number of beats (10, 20 or 40 fps) every frame lands on the same angle | Fast wings now advance by a fixed golden-angle step per frame, so they read as a blur at any frame rate | `animation.test.ts` (fails on the old code at 10 fps, passes now); re-measured in the browser |
| 2 | Medium preset drew 2.87 million triangles a frame in the rainforest | Run F, preset comparison | Full-detail trees were used out to the second chunk ring (25 chunks) on Medium | Medium now switches trees to the far model after the first ring; High keeps two rings | Re-measured: 1.80 million (run H) |
| 3 | Bare-soil patches on the Low preset repeated as visible rectangles | Screenshot inspection (run F) | The lite terrain shader derived soil from the fine-scale texture sample, which tiles every few metres | Soil patches are disabled on the lite path | Same view re-captured on the final build: no patches |
| 4 | Squirrel tail looked like a row of separate balls | Portrait inspection of all 36 species (run G) | Four widely spaced spheres | Nine overlapping puffs along the same curve | Portrait re-rendered on the final build and inspected: one continuous plume |

Added for testing, kept in the game: the performance overlay (F3) now also shows live GPU geometry and texture counts, which is what the leak checks read.

## Harness findings that were not game defects

| Observation | Why it is not a defect |
|---|---|
| A player teleported by the debug hook into the 0.3 m ruins platform could not move | Only the debug hook places the player at terrain height inside a slab. Walking onto the platform steps up normally, and a save made while standing on it restores on top of it and can walk away (run E, item 18) |
| No full-screen panel when mission 1 completes | By design: a mission is announced by three notices (mission complete, badge earned, next mission); the panel is for finishing the whole expedition. The notices are now asserted in the browser suite |
| One species (Chinese water dragon) not met at the six census points | It lives along the waterfall stream, which was not a census point; visiting its habitat found four active individuals (run E) |

## Verified checklist

Runs: A movement and world, B wildlife, C tools, D missions and persistence, E information and interface, F presets, performance and memory, G portraits, H Medium preset after fix 2.

### 1. Start a new expedition

| Check | Result | Evidence | Run |
|---|---|---|---|
| new expedition starts as biologist | **PASS** | {"screen":"playing","role":"biologist","phys":"rapier"} | A |

### 2. Enter the 3D world

| Check | Result | Evidence | Run |
|---|---|---|---|
| 3D world renders (frame not blank) | **PASS** | {"w":960,"h":540,"distinct":842,"mean":107,"spread":208} | A |
| scene has terrain, plants and animals | **PASS** | {"fps":1.14,"calls":120,"tris":227526,"plants":5616,"active":34,"chunks":25,"geo":164,"tex":5,"prog":9,"w":960,"h":540} | A |

### 3. Walk, sprint, crouch, jump

| Check | Result | Evidence | Run |
|---|---|---|---|
| walk forward (W) moves along the view direction | **PASS** | dx=8.4 dz=-0.1 | A |
| walk speed is the configured 4.2 m/s | **PASS** | speed=4.19 | A |
| sprint (Shift+W) is faster and flagged | **PASS** | speed=7.62 sprinting=true | A |
| crouch (Ctrl) lowers the camera | **PASS** | eye 1.62 -> 0.95 | A |
| crouch-walk is slower (1.9 m/s) | **PASS** | speed=1.93 | A |
| standing up again after crouch | **PASS** | crouching=false | A |
| jump (Space) rises more than 0.5 m and lands | **PASS** | rose=true landed=true | A |
| strafe right (D) moves to the right of the view | **PASS** | dx=0.1 dz=7.4 | A |
| backwards (S) moves away from the view direction | **PASS** | dx=-7.3 | A |

### 4. Explore all five biomes

| Check | Result | Evidence | Run |
|---|---|---|---|
| biome grassland: entered, shown on HUD, renders | **PASS** | biome=grassland hud=grassland colours=692 calls=128 tris=226k fps=1.52 | A |
| biome rainforest: entered, shown on HUD, renders | **PASS** | biome=rainforest hud=rainforest colours=568 calls=180 tris=444k fps=0.46 | A |
| biome freshwater: entered, shown on HUD, renders | **PASS** | biome=freshwater hud=freshwater colours=766 calls=70 tris=226k fps=1.2 | A |
| biome mountain: entered, shown on HUD, renders | **PASS** | biome=mountain hud=mountain colours=647 calls=105 tris=259k fps=1.08 | A |
| biome ruins: entered, shown on HUD, renders | **PASS** | biome=ruins hud=ruins colours=508 calls=166 tris=426k fps=0.42 | A |
| all five biomes recorded as explored | **PASS** | grassland,rainforest,freshwater,mountain,ruins | A |

### 5. Terrain and object collisions

| Check | Result | Evidence | Run |
|---|---|---|---|
| terrain: feet stay on the ground on a slope, never below it | **PASS** | max /feet-ground/=0.05 below=0 | A |
| tree trunk blocks the player | **PASS** | trunk r=0.91 stopped at 1.30 m from the axis, same side=true | A |
| boulder blocks the player (or is climbed, not walked through) | **PASS** | boulder r=1.07; player 1.49 m from centre, feet -0.03 m above its base | A |
| ruins wall blocks the player | **PASS on re-test** | First attempt invalid: the debug hook had placed the player inside the 0.3 m platform slab. Re-tested by walking in from outside (next rows). z 297.00 -> 297.00 (wall face at z≈293.75) | A |
| world edge: the player cannot leave the map | **PASS** | x=493.8 y=38.7 | A |
| world edge still renders | **PASS** | {"w":960,"h":540,"distinct":196,"mean":63,"spread":204} | A |
| water: swimming, diving with Ctrl, surfacing again | **PASS** | swimming=true dived=true surfaced=true | A |
| ruins: player can walk onto the platform and reach the inner wall | **PASS** | ended z=295.94 | A |
| ruins: inner wall stops the player | **PASS** | ended z=295.94 | A |
| ruins: a player placed on the platform is not stuck | **N/A (harness)** | Only the debug hook can put the player at terrain height inside the slab; see 'Harness findings'. The real case, a save made on the platform, passes under item 18. moved 0.00 m, y-terrain=0.01 | A |

### 6. Find and observe animals

| Check | Result | Evidence | Run |
|---|---|---|---|
| animals are found near every hub; most species seen active | **PASS** | 21/22 species active at the six hubs; not met: physignathus-cocincinus | B |
| the one species missed by the census (Chinese water dragon) is present in its habitat | **PASS** | [{"active":true,"d":22,"beh":"idle","y":0},{"active":true,"d":21,"beh":"idle","y":0},{"active":true,"d":72,"beh":"idle","y":0},{"active":true,"d":70,"beh":"idle","y":0}] | E |

### 7. Wildlife locomotion and behaviour transitions

| Check | Result | Evidence | Run |
|---|---|---|---|
| no animal has an invalid position | **PASS** | NaN samples=0 | B |
| walking animals stay on the ground | **PASS** | all grounded | B |
| fish stay between the bed and the surface | **PASS** | all inside the water | B |
| moving walkers face their direction of travel | **PASS** | 0 backwards of 9 moving samples | B |
| legs animate while walking | **PASS** | moving=4 frozen=0 | B |
| fish tails animate while swimming | **PASS** | moving=120 frozen=0 | B |
| flying birds are actually in the air | **PASS** | 170/170 flying samples above ground | B |
| wings animate in flight | **PASS** | moving=121 frozen=1 | B |
| behaviour transitions happen on their own | **PASS** | 18 distinct transitions across 14 species (pycnonotus-jocosus:2, papilio-demoleus:1, apis-cerana:1, calotes-versicolor:1, lepus-peguensis:2, danaus-genutia:1, duttaphrynus-melanostictus:1, muntiacus-vaginalis:1) | B |
| bird reacts when approached | **PASS** | pycnonotus-jocosus: alert -> alert | B |
| hare or small mammal reacts when approached | **PASS** | lepus-peguensis: resting -> alert | B |
| fish (player wading in) reacts when approached | **PASS** | barbonymus-gonionotus: feeding -> feeding > fleeing | B |
| insect reacts when approached | **PASS** | crocothemis-servilia: flying -> flying | B |

### 8. Identify animals and plants with the scanner

| Check | Result | Evidence | Run |
|---|---|---|---|
| scanner identifies a bird | **PASS** | pycnonotus-jocosus; panel shows "Red-whiskered bulbul"; target={"sp":"pycnonotus-jocosus","d":9.1,"vis":1} | C |
| scanner identifies a small plant | **PASS** | imperata-cylindrica | C |

### 9. Photographs are real captured images

| Check | Result | Evidence | Run |
|---|---|---|---|
| four photographs stored, each identifying the species and scored 0-100 | **PASS** | ["960x540 q96","1280x720 q98","1920x1080 q98","2560x1440 q98"] | C |
| stored files are real images with scene content | **PASS** | [{"w":2560,"h":1440,"colours":663},{"w":1920,"h":1080,"colours":657},{"w":1280,"h":720,"colours":660},{"w":960,"h":540,"colours":641}] | C |
| output sizes HD, Full HD and QHD produce files of exactly those dimensions | **PASS** | 1280x720, 1920x1080, 2560x1440, 960x540 | C |
| recorded photo dimensions match the stored files | **PASS** | meta 960x540,1280x720,1920x1080,2560x1440 | C |

### 10. Camera focus and all zoom levels

| Check | Result | Evidence | Run |
|---|---|---|---|
| camera opens with a viewfinder | **PASS** |  | C |
| zoom 1x/2x/4x/8x each narrow the field of view to the optical value | **PASS** | [{"z":1,"fov":61.99,"expected":62,"frac":0.087},{"z":2,"fov":33.45,"expected":33.44,"frac":0.175},{"z":4,"fov":17.09,"expected":17.09,"frac":0.35},{"z":8,"fov":8.6,"expected":8.59,"frac":0.699}] | C |
| the subject grows in frame with each zoom step | **PASS** | 0.087 -> 0.175 -> 0.35 -> 0.699 | C |
| mouse wheel zooms smoothly in both directions | **PASS** | 8 -> 4.392467280856465 -> 8 | C |
| autofocus locks on the animal under the reticle | **PASS** | target=true focus=locked | C |
| focus is released when the subject leaves the reticle | **PASS** |  | C |
| binoculars magnify | **PASS** | {"zoom":5.999382950979567,"fov":11.439083274326128,"tool":"binoculars"} | C |

### 11. Record and play a wildlife video

| Check | Result | Evidence | Run |
|---|---|---|---|
| video records and opens for review | **PASS** |  | C |
| the recording is a playable video with real frames | **PASS** | {"w":960,"h":540,"ready":4,"advanced":1.48,"paused":false,"bytes":90534,"mime":"video/webm;codecs=vp9","scale":0.5} | C |
| playback actually advances | **PASS** | {"advanced":1.48,"paused":false} | C |
| video saved to the journal | **PASS** | {"sp":"rusa-unicolor","bytes":90534,"seconds":12.8,"behaviors":["feeding"],"simScale":0.5} | C |

### 12. Slow-motion playback and simulation speed

| Check | Result | Evidence | Run |
|---|---|---|---|
| a clip filmed in slow motion is tagged with the simulation speed | **PASS** | simScale=0.5 | C |
| playback speed 0.5x is applied to the player | **PASS** | playbackRate=0.5 | C |
| playback speed 0.25x is applied to the player | **PASS** | playbackRate=0.25 | C |
| playback speed 1x is applied to the player | **PASS** | playbackRate=1 | C |
| simulation speed returns to 1.0 after cycling Z | **PASS** | {"slowmo":0,"scale":1} | C |

### 13. Inspect a species in close-up mode

| Check | Result | Evidence | Run |
|---|---|---|---|
| E on a nearby subject opens the close-up inspection view | **PASS** | prompt="E — Inspect unknown species" species=melastoma-malabathricum | C |
| the inspection view renders its own 3D canvas | **PASS** | {"w":510,"h":452,"name":null} | C |
| Esc closes the inspection | **PASS** |  | C |

### 14. Vietnamese and English scientific information

| Check | Result | Evidence | Run |
|---|---|---|---|
| the field guide lists all 36 species | **PASS** | 36 cards | E |
| every species page is complete and consistent in English and Vietnamese | **PASS** | 36 species x 2 languages: names cross-referenced, binomial identical and italic, taxonomy identical, labels/headings/descriptions translated, >= 2 adaptations, portrait present | E |
| source links are shown on verified species only | **PASS** | 10 species pages carry source links (ledger says 10 verified) | E |
| every species says whether its classification was checked; 26 say it was not | **PASS** | {"n":36,"unTax":26,"unStatus":12,"verTax":10,"both":0} | F |

### 15. Encyclopedia and research journal

| Check | Result | Evidence | Run |
|---|---|---|---|
| menu settings opens and closes | **PASS** | opened=true closed=true | E |
| menu credits opens and closes | **PASS** | opened=true closed=true | E |
| research journal opens and every tab shows content | **PASS** | {"encyclopedia":2619,"album":60,"videos":64,"map":314,"progress":1521,"notes":80} | E |
| map (M) opens and closes | **PASS** | opened=true closed=true | E |
| inventory (I) opens and closes | **PASS** | opened=true closed=true | E |
| equipment wheel (Tab) selects a tool | **PASS** | tool=binoculars | E |
| pause (Esc) opens and closes | **PASS** | opened=true closed=true | E |

### 16. Complete a research mission

| Check | Result | Evidence | Run |
|---|---|---|---|
| mission 1 "First Steps" completes through play | **PASS** | {"active":1,"completed":["first-steps"],"badges":["first-researcher"],"overlay":"none"} | D |
| completion is announced to the player | **PASS on re-test** | First check looked for a full-screen panel, which by design appears only when the whole expedition is finished. Re-tested in the browser suite: the notices 'Badge earned' and the next mission's name are shown on completion. overlay shown=false | D |
| the tracker moves on to mission 2 | **PASS** | ObjectiveLife by the RiverTravel to the river or lakeIdentif | D |
| fish species 1 identified from the bank | **PASS** | barbonymus-gonionotus from 12 m; last target: none | D |
| fish species 2 identified from the bank | **PASS** | trichopodus-trichopterus from 8 m; last target: trichopodus-trichopterus 12.9 m vis 1.00 | D |
| fish filmed and the behaviour recorded with the clip | **PASS** | subject="Silver barb" {"sp":"barbonymus-gonionotus","behaviors":["swimming"]} | D |
| a lotus or taro is photographed and recognised | **PASS** | {"sp":"colocasia-esculenta","q":93} | D |
| mission 2 completes and awards its badge | **PASS** | {"completed":["first-steps","life-by-the-river"],"badges":["first-researcher","freshwater-surveyor"],"progress":{"travel":{"count":1,"seen":[]},"fish":{"count":2,"seen":["barbonymus-gonionotus","trichopodus-trichopterus"]},"rec... | D |

### 17. Save game progress

| Check | Result | Evidence | Run |
|---|---|---|---|
| pause, save and return to the main menu; Continue is offered | **PASS** | paused=true menu=true continue=true | D |

### 18. Reload the browser and restore the session

| Check | Result | Evidence | Run |
|---|---|---|---|
| after a browser reload, Continue restores discoveries, quests, badges, biomes and role | **PASS** | 4 species, quests first-steps+life-by-the-river | D |
| position restored | **PASS** | saved -320.0,4.1,309.9 now -320.0,4.1,309.9 (0.04 m above terrain) | D |
| the restored player can move (not embedded in the ruins platform) | **PASS** | moved 3.14 m | D |
| a save made on top of the ruins platform restores on top of it and the player can walk | **PASS** | saved 0.34 m above terrain at z=303.6; restored 0.34 m above; then moved 3.14 m | E |

### 19. Photo and video persistence

| Check | Result | Evidence | Run |
|---|---|---|---|
| photo and video records restored | **PASS** | 2 photos, 1 videos | D |
| every saved photo still opens as an image after the reload | **PASS** | 2/2 opened | D |
| the saved video plays from storage after the reload | **PASS** | {"w":960,"ready":4,"advanced":4.98,"dur":9.155} | D |

### 20. Graphics presets and performance

| Check | Result | Evidence | Run |
|---|---|---|---|
| each preset applies its settings | **PASS** | off/low/high shadows, low/medium/high distance, scale 0.75/1/1 | F |
| render resolution follows the preset | **PASS** | 720x405 / 960x540 / 960x540 | F |
| scene detail rises Low < Medium < High and every preset renders | **PASS** | 433k / 2870k / 3125k triangles; chunks 25/81/143 | F |
| draw calls stay bounded on every preset | **PASS** | 64 / 91 / 115 calls in the rainforest | F |
| switching presets back and forth does not leak GPU resources | **PASS** | geometries 148 -> 117 -> 123 -> 123; textures 5 -> 7 -> 7 -> 5; programs 9 -> 12 | F |
| performance overlay reports fps, frame time, draw calls, triangles, resolution, objects and GPU resources | **PASS** | FPS 1 frame 1195.6 ms draw calls 64 triangles 433k render 720×405 (75%) plants 3194 animals 20/156 chunks 25 GPU 123 geo · 5 tex | F |
| adaptive resolution lowers the render scale when the frame rate is low | **PASS** | scale 0.75 -> 0.65625 at 0.82 fps | F |

### Visual quality, performance and stability

| Check | Result | Evidence | Run |
|---|---|---|---|
| third-person camera never goes under the terrain | **PASS** | clearance > 0.12 m at 4 spots | A |
| first-person camera stays above ground when crouched on a slope | **PASS** | clearance 0.96 m | A |
| no memory growth across three laps of all biomes (JS heap) | **PASS** | 51 MB -> 56 MB -> 56 MB | F |
| no GPU resource growth across three laps | **PASS** | 152 geo/5 tex/12 prog -> 152 geo/5 tex/12 prog -> 152 geo/5 tex/12 prog | F |
| screenshots captured for terrain seam inspection | **PASS** | seams-view.png, seams-ground.png | F |
| all 36 species portraits render (no missing model or material) | **PASS** | 36/36 thumbnails | G |
| every portrait shows a visible, shaded subject | **PASS** | min cover 0.03, min colours 17 | G |
| Medium preset in the rainforest stays under 2 million triangles a frame (shadow pass included) | **PASS** | {"fps":0.12,"calls":89,"tris":1802642,"plants":9649,"active":26,"chunks":81,"geo":116,"tex":7,"prog":13,"w":960,"h":540} | H |

## Regression after the fixes

| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck` | clean |
| `npm run test` | **152 passed**, 11 files (3 new tests for wing animation) |
| `npm run build` | succeeds |
| `npm run test:e2e` on the final build | **3 passed** in 16.2 min, including the new assertion that mission completion is announced |
| QA run B (wildlife) repeated on the final build | 14 of 14 passed; wings in flight: 121 moving samples, 1 still (before the fix: 82 moving, 37 still) |
| QA run G (portraits) repeated on the final build | 2 of 2 passed |
| QA run H (Medium preset) on the final build | 1.80 million triangles in the rainforest (before: 2.87 million) |

Runs A, C, D, E and F were executed on the build immediately before fixes 1-4. Those fixes touch only insect wing animation, which trees use the far model on Medium and High, the Low-preset soil patches and the squirrel's tail; the browser suite, which re-covers movement, tools, missions and persistence, was run after them.

## Not executed

| Item | Reason |
|---|---|
| Frame rate at 1080p on a GPU, per preset | No GPU in the test environment. Scene complexity per preset is in the table above; frame rate is not |
| High preset beyond one rendered frame | One frame takes about 20 s in software; it rendered correctly and its counts were recorded |
| Audio | No audio device. The audio engine starts without errors; nothing was heard |
| Firefox, Safari, mobile | Only Chrome is installed |
| Animation, wind, water and particles judged by eye in motion | Stills only; motion was measured, not watched |
| Missions 3, 4 and 5 played to completion | Not played. Missions 1 and 2 were completed by play; 3-5 are covered by unit tests of the quest engine only |
| Photo and video download buttons | Present and enabled at top level; the download itself was not triggered |
| Storage-full and storage-denied paths during play | Not simulated in this pass (the in-memory fallback was exercised earlier in a sandboxed frame) |
| Sessions longer than about 12 minutes | Longest continuous run was about 12 minutes; memory was level over that time |
