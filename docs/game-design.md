# Game design

**Wildlife Odyssey 3D — The Living World.** A peaceful first-person exploration game: you are a field researcher documenting Emerald Valley Research Reserve, a fictional 1 km x 1 km valley populated with real Southeast Asian species. No combat, no arbitrary collecting.

## Art direction

The target is the look of a nature documentary: warm directional sun, soft haze that turns distance into depth, dappled shade under the canopy, and animals that stand out from a blurred background when photographed.

- **Vegetation.** Tree crowns are clouds of textured leaf cards around a dark core, shaded as one soft volume and lit from behind when the sun is beyond them. Each species keeps its growth form: buttressed dipterocarps, whorled pines, clumping bamboo, strangler figs with aerial roots, fishtail palms. Grass grows in drifts with sun-dried patches, wildflowers in the open, reed beds on the waterline and weed on the river bed. A gust front crosses the valley so cover leans in waves.
- **Terrain.** Biome colour per vertex, then per-pixel mottling, bare-soil patches, rock on slopes (sampled on three planes so cliffs are not smeared), a wet band at the waterline and moving caustics under water. Scree gathers on slopes and boulders line the banks.
- **Water.** Layered ripples, depth-tinted shallows you can see the bed through, dark bank reflections, sun glitter, lapping foam.
- **Air.** Drifting pollen by day, leaves falling under the canopy, fireflies after dark, mist at the falls, a slight lens falloff at the frame edges.
- **Animals.** Coat and scale grain, light wrapping round the silhouette, catchlights in the eyes, two-segment legs with a proper hock.
- **Interface.** Paper, ink and brass: a field notebook with mounted specimen plates, and a camera viewfinder with corner brackets and switchable guides.
- **Typography.** Three bundled families with fixed roles, so the game looks the same on every machine: Chakra Petch (angular, instrument-like) for titles, HUD labels and scientific names; Be Vietnam Pro for body text; JetBrains Mono for readouts and small caps labels. All three cover Vietnamese.

The Low preset trades the leaf cards and ground textures for solid shaded canopies so that weak GPUs still get a smooth frame rate.

## Core loop

1. Explore a biome and notice an animal, plant, track, sign or landmark.
2. Approach carefully (animals notice, become alert, flee; crouching halves their awareness).
3. Observe with a tool: binoculars, camera, video camera, scanner, macro lens.
4. The observation is recorded: species identified, photo scored, behaviour logged.
5. The journal fills in; expedition objectives complete; badges are awarded.

## World

| Biome | Where | Highlights |
|---|---|---|
| Grassland and Meadow | centre, around the camp | cogon grass, melastome, silk-cotton trees, hares, butterflies, bees, sambar at the forest edge |
| Tropical Rainforest | west | resin trees, fishtail palms, bamboo, ferns, giant taro, muntjac, boar, junglefowl, squirrels, hornbills |
| River and Lake | plunge pool -> river -> Lotus Lake (east / south-east) | lotus, taro, three fish species, kingfisher, egrets, water dragons, dragonflies |
| Mountain and Waterfall | north | Khasi pine, azalea, Silver Veil Falls with mist, rock shelter, viewpoint, soaring serpent eagles |
| Ancient Forest Ruins | south-west | platform, columns, stele, three artifacts, sacred figs, lizards, toads, beetles |

Landmarks: research camp, two research stations, viewpoint, waterfall, rock shelter, lake, ruins. Four hidden research notes and four track trails.

## Roles

- **Wildlife Biologist** — scanner reaches 35 % further and scans 25 % faster.
- **Archaeologist** — the ruins are on the map from the start and the stele is translated in full.

Both can do everything.

## Tools

| Key | Tool | Mechanic |
|---|---|---|
| C | Wildlife camera | FOV zoom 1-8x (wheel, 1-4), autofocus lock, exposure ([ ]), depth of field (O) with aperture f/2.8-f/16 (- and =), composition guides (G: thirds, golden ratio, diagonals, off), output size (R), hide UI (H). Shutter captures the real frame, scores it 0-100 and stores it. A clear photo of an unknown species identifies it. |
| C then T | Video camera | Records the canvas with MediaRecorder; review at 1x / 0.5x / 0.25x; save to journal or download. |
| B | Binoculars | 4-12x, long targeting range, does not disturb. |
| F | Bio scanner | Hold the subject in the reticle; progress ring; on completion the species is identified from the database. |
| X | Macro lens | Within about 4 m, E opens the 3D inspection view. |
| J | Field journal | Species, photographs, videos, map, progress, notes. |
| Z | Slow motion | World clock at 1.0 / 0.5 / 0.25x; the player's own controls stay at full speed. |

Photo score weights: visibility 22, subject size 20, composition 14, sharpness 12, focus 12, lighting 12, distance 8. A subject mostly hidden (under 50 % visible) or very small in frame (under about 13 % of frame height) scales the whole score down, so a distant speck never rates as good. A score of 70+ is "high quality" and unlocks the species' field notes.

## Expeditions

1. **First Steps into the Wild** — leave camp, walk 40 m, find an animal, binoculars, photograph, scan, open journal, read an entry.
2. **Life by the River** — reach fresh water, identify two fish, record fish on video, photograph lotus or taro.
3. **Forest Biodiversity** — identify three forest plants, photograph two bird species, watch an animal feed.
4. **Hidden Ruins** — find the ruins, examine an artifact, photograph the sacred fig, document the site at the stele.
5. **Master Naturalist** — 15 species, five 70+ photos, three behaviours on video, all five biomes.

Progress towards later expeditions counts from the start. After the fifth, a completion screen appears and free exploration continues.

## Wildlife behaviour

Five controllers share one perception model: walkers (deer, muntjac, boar, hare, squirrel, junglefowl, lizards, toad, beetle), perching birds (kingfisher, egret, bulbul, hornbill), soarer (eagle), insects (butterflies, bee, dragonfly) and schooling fish. States: idle, walking, running, feeding, drinking, resting, searching, fleeing, swimming, flying, alert, returning, perched, hovering, soaring, calling. Activity follows each species' daily rhythm; rain grounds insects and birds; fog and crouching reduce detection; a quiet observer is eventually tolerated.

## Deliberate simplifications

- The mountain is about 140 m high; Khasi pine and azalea grow much higher in reality. The species pages say so.
- Small animals are drawn 1.2-3x life size so they can be found.
- Bird's-nest fern is placed on the ground and stonework rather than up in trees.
- Caves are represented by a rock shelter (the terrain is a heightfield).
