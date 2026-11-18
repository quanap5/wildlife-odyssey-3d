# MASTER PROMPT — WILDLIFE ODYSSEY 3D
## Build a Complete Browser-Based 3D Wildlife Exploration and Scientific Discovery Game

### 0. YOUR ROLE AND MISSION

You are an autonomous senior game development team operating as one coordinated AI engineering agent.

Assume the responsibilities of:
- Game Director and Creative Director
- Principal Three.js / WebGL Engineer
- Senior React / TypeScript Architect
- Gameplay and Systems Designer
- 3D Environment and Technical Artist
- Wildlife AI and Animation Engineer
- Ecology and Biology Researcher
- Physics and Camera Systems Engineer
- UI/UX and Interaction Designer
- Performance Optimization Engineer
- QA Automation and Release Engineer

Your mission is to **design, implement, test, optimize, document, and deliver a fully playable, visually impressive, scientifically educational 3D browser game from scratch.**

**Game title:** WILDLIFE ODYSSEY 3D — The Living World

**Game genre:** Open-world exploration, wildlife photography, nature simulation, scientific discovery, educational adventure.

**Primary audience:** Players interested in animals, nature, photography, biology, archaeology, and immersive exploration.

**Target platform:** Modern desktop browsers, with responsive menus and optional mobile support.

**Primary languages:** Vietnamese and English.

This is a software engineering and game production assignment, not a concept-art assignment.

You must create the actual source code, assets or asset-generation pipeline, gameplay systems, automated tests, and executable project.

Do not stop after creating a beautiful landing page, static 3D scene, technical prototype, or mock interface.

The final project must support a coherent gameplay loop from starting the game to exploring, researching species, completing expeditions, saving progress, and resuming a previous session.

---

# 1. AUTONOMOUS EXECUTION DIRECTIVE

You are authorized to own and modify the entire project codebase.

You may:
- Create directories and source files.
- Install appropriate open-source dependencies.
- Refactor or replace architecture where necessary.
- Generate procedural geometry and textures.
- Download appropriately licensed public game assets when network tools are available.
- Build shaders, animations, UI elements, and gameplay logic.
- Create automated tests and debugging utilities.
- Run development servers, builds, and test suites.
- Diagnose and repair integration problems.
- Make reasonable engineering decisions without asking for approval for every minor implementation detail.

Do not perform destructive operations outside the project workspace.

Do not overwrite unrelated user files, expose secrets, or accept restrictive commercial licensing terms.

If a resource cannot be downloaded, implement an acceptable local procedural fallback.

If a tool is unavailable, choose another implementation path and document the limitation.

Do not use unavailable tools as a reason to leave fundamental gameplay incomplete.

Keep a visible task plan and progress log.

Do not report a feature as complete until it is implemented and verified.

### Completion principle

The project is complete only when:

1. The application builds successfully.
2. The browser loads an actual 3D world.
3. The player can move through the environment.
4. Animals and plants exist as interactive world entities.
5. The camera and research tools work.
6. Biological information is accessible.
7. Wildlife observations can be recorded and saved.
8. The core expedition gameplay loop works.
9. Automated tests pass.
10. The application can be restarted and progress restored.

Prioritize functional completeness over excessive planning or impressive but disconnected code.

---

# 2. GAME VISION

Create an immersive living world that evokes the visual quality and atmosphere of a modern nature exploration game.

The player should feel like a professional wildlife researcher entering a beautiful, mysterious wilderness.

The world should feel alive rather than static.

Examples of desired experiences:

- Walking through a dense rainforest at sunrise.
- Seeing sunlight penetrate the forest canopy.
- Hearing insects, birds, flowing water, and rustling leaves.
- Discovering deer moving through a clearing.
- Watching butterflies land on flowers.
- Observing a bird resting on a tree branch.
- Finding fish swimming beneath the surface of a river.
- Following animal footprints.
- Using binoculars to observe a distant animal.
- Taking a close-up photograph of an insect.
- Recording a bird flying in slow motion.
- Inspecting an interesting plant and reading its scientific classification.
- Finding ancient ruins hidden deep inside the forest.
- Completing research objectives and unlocking new areas.

The experience must support peaceful, curiosity-driven exploration.

Avoid combat-focused gameplay.

The environment should be attractive, believable, interactive, and rewarding to investigate.

## Visual direction

Target a premium stylized-realistic aesthetic.

Use:
- Rich vegetation and natural colors.
- Physically based materials.
- High-quality natural lighting.
- Soft shadows.
- Atmospheric fog.
- Water reflections and refraction approximations.
- Wind-driven plant movement.
- Ground variation, rocks, and terrain detail.
- Dynamic clouds and weather.
- Smooth camera movement.
- Cinematic depth of field in photography mode.
- Subtle environmental particles.
- Appropriate environmental audio.

Do not use colored cubes or primitive placeholders as final representations of important animals, trees, or environmental landmarks.

Procedural geometry is acceptable when it produces recognizable, visually coherent, polished results.

---

# 3. TECHNOLOGY STACK

Use the following preferred stack:

### Application

- React
- TypeScript with strict type checking
- Vite
- Three.js
- React Three Fiber
- Drei
- Zustand for application/gameplay state

### Physics and interactions

- Rapier physics
- Raycasting for interaction and scanning
- Spatial partitioning for world entities
- Terrain-aware character movement

### Rendering

- WebGL using Three.js
- Physically based materials
- InstancedMesh for repeated vegetation
- GLB/glTF asset loading
- Custom shaders when appropriate
- Postprocessing when performance permits

### Data

- TypeScript data schemas
- JSON species catalog
- IndexedDB for saved observations and media
- Local browser persistence for settings and progression

### Quality assurance

- ESLint
- TypeScript compiler
- Vitest
- Playwright
- Build validation and browser smoke testing

### Deployment

The result must build into a static deployable frontend.

Support development using:

```bash
npm install
npm run dev
npm run build
npm run preview
npm run test
```

Configure additional scripts when appropriate.

Choose dependency versions that are currently compatible. Verify actual APIs before implementing integrations.

Avoid introducing an unnecessary backend for the initial single-player experience.

---

# 4. WORLD DESIGN

## 4.1 Overall world

Create a large, interconnected explorable nature reserve.

Working title:

**Emerald Valley Research Reserve**

The world should be organized into environmental biomes.

The initial implementation must provide a coherent map with at least five recognizable regions.

### Biome A — Tropical Rainforest

Features:
- Tall trees.
- Dense canopy.
- Ferns.
- Vines.
- Moss-covered rocks.
- Fallen logs.
- Tropical flowers.
- Insects.
- Birds.
- Small mammals.
- Light rays and humid atmosphere.

### Biome B — Freshwater River and Lake

Features:
- Flowing river.
- Lake surface.
- Shoreline.
- Water plants.
- Swimming fish.
- Rocks beneath the surface.
- Fish schools.
- Water birds.
- Wetland plants.
- Underwater viewing opportunities.

### Biome C — Grassland and Meadow

Features:
- Open grasslands.
- Wildflowers.
- Scattered trees.
- Butterflies.
- Deer.
- Rabbits.
- Birds.
- Dynamic grass affected by wind.
- Long-distance landscape views.

### Biome D — Mountain and Waterfall

Features:
- Rocky paths.
- Hills and steep slopes.
- A waterfall.
- Elevated viewpoints.
- Mountain vegetation.
- Birds flying overhead.
- Rocky caves.
- Mist near waterfall spray.

### Biome E — Ancient Forest Ruins

Features:
- Overgrown stone structures.
- Ancient pathways.
- Mossy columns.
- Hidden archaeological artifacts.
- Weathered inscriptions.
- Distinctive plants around ruins.
- Discoverable environmental clues.

This biome introduces a secondary archaeology exploration activity.

The main focus must remain biological and ecological exploration.

## 4.2 World dimensions

Design the world using scalable chunk-based generation.

Target an initial playable area approximately 1 km × 1 km if feasible without compromising browser performance.

Support world expansion through data-driven biome configuration.

Use deterministic seeds to keep world layouts consistent across sessions.

Implement:
- Terrain chunk generation.
- Chunk loading and unloading.
- Level of detail.
- Frustum culling.
- Distance-based object activation.
- Vegetation instancing.
- Environment streaming where appropriate.

Avoid loading every object, animal, and texture into GPU memory at once.

## 4.3 Map and navigation

Include an interactive map with:
- Current player position.
- Compass.
- Exploration landmarks.
- Discovered species locations.
- Research stations.
- Biome boundaries.
- Waypoints.
- Discovery markers.
- Undiscovered areas.

Allow the player to create a waypoint and navigate toward it.

Use an intuitive map interface.

---

# 5. PLAYER CHARACTER AND CONTROLS

The player acts as a field researcher.

Offer two research roles at the beginning:

**Wildlife Biologist**
Focuses on observing animals, plants, ecosystems, and environmental behavior.

**Archaeologist**
Focuses on ruins, artifacts, environmental history, and ancient ecosystems.

Both roles should be able to freely explore the entire world.

The initial experience should prioritize the Wildlife Biologist gameplay.

## 5.1 Camera perspectives

Implement:
- First-person mode.
- Third-person mode.
- Photography mode.
- Binocular mode.
- Inspection mode.

Third-person mode may use a simple but recognizable animated researcher character.

If a high-quality character asset is unavailable, prioritize a polished first-person experience.

## 5.2 Controls

| Input | Action |
|---|---|
| W/A/S/D | Move |
| Mouse | Look around |
| Shift | Sprint |
| Ctrl | Crouch |
| Space | Jump |
| E | Interact |
| F | Activate research scanner |
| C | Open photography tool |
| B | Binoculars |
| V | Switch perspective |
| M | World map |
| J | Field journal |
| I | Inventory |
| Tab | Equipment wheel |
| Esc | Pause and settings |

Support configurable mouse sensitivity.

Movement must include:
- Collision detection.
- Gravity.
- Ground snapping.
- Slope handling.
- Water interactions.
- Walking and sprinting.
- Crouching.
- Camera smoothing.
- Camera collision prevention.

Do not allow the player to walk through trees, rocks, or buildings.

Prevent accidentally walking through the terrain.

Implement realistic but comfortable movement.

---

# 6. LIVING ECOSYSTEM

The wildlife simulation is a critical feature.

Animals must not behave like static museum objects.

Create a reusable animal AI architecture.

## 6.1 Animal behavioral states

At minimum support:

- Idle
- Walking
- Running
- Grazing / Feeding
- Drinking
- Sleeping / Resting
- Searching
- Fleeing
- Swimming
- Flying, where applicable
- Reacting to nearby player
- Returning to habitat

Implement a finite state machine or an equivalent lightweight behavior system.

Each animal should have:

```ts
interface WildlifeAgent {
  id: string;
  speciesId: string;
  position: Vector3;
  homeRegion: string;
  currentBehavior: string;
  movementSpeed: number;
  awarenessRadius: number;
  preferredHabitat: string[];
  active: boolean;
}
```

Use species-specific behavior parameters.

Examples:

Deer:
- Grazes in clearings.
- Walks between feeding areas.
- Reacts to nearby movement.
- Runs away when frightened.

Birds:
- Perch on branches.
- Fly between selected destinations.
- Occasionally vocalize.
- React to player proximity.

Butterflies:
- Fly around flowers.
- Hover and land periodically.
- Change their movement direction naturally.

Fish:
- Swim within underwater habitats.
- Form small schools.
- Turn gradually.
- Avoid obstacles and shore boundaries.
- React to nearby disturbances.

Rabbits:
- Rest near bushes.
- Hop around grasslands.
- Flee when approached.

The system must support different locomotion types:
- Walking.
- Running.
- Flying.
- Swimming.
- Hopping.
- Crawling.

Do not implement every animal using an identical random movement script.

## 6.2 Ecological interactions

Create lightweight ecosystem behaviors:
- Animals approach water.
- Birds move between trees.
- Butterflies visit flowers.
- Fish remain within appropriate water volumes.
- Wildlife activity varies by time of day.
- Certain species prefer specific habitats.
- Weather influences visibility and activity.

These systems may use approximations rather than expensive full scientific simulation.

The player should be able to observe meaningful behaviors.

---

# 7. SPECIES DATABASE

Implement a structured and extensible biological encyclopedia.

Start with at least **30 well-defined species**, distributed among:
- Mammals.
- Birds.
- Fish.
- Reptiles or amphibians.
- Insects.
- Trees.
- Flowers.
- Ferns and other plants.

Every species must have biological metadata.

Use a typed schema similar to:

```ts
interface SpeciesRecord {
  id: string;

  commonNameEn: string;
  commonNameVi: string;
  scientificName: string;

  kingdom: string;
  phylum: string;
  className: string;
  order: string;
  family: string;
  genus: string;

  descriptionEn: string;
  descriptionVi: string;

  habitats: string[];
  diet?: string[];
  lifespan?: string;
  size?: string;
  conservationStatus?: string;

  behaviorEn?: string;
  behaviorVi?: string;

  adaptationsEn?: string[];
  adaptationsVi?: string[];

  ecologicalRoleEn?: string;
  ecologicalRoleVi?: string;

  interestingFactsEn?: string[];
  interestingFactsVi?: string[];

  modelAsset?: string;
  audioAsset?: string;
  thumbnailAsset?: string;
}
```

## 7.1 Biological accuracy

Use real biological species wherever possible.

Do not invent scientific names, taxonomy, conservation status, or species-specific biological facts.

Prefer accepted taxonomic databases and reliable scientific references.

Track the source URL and verification status for biological information.

When external scientific information cannot be verified, mark it clearly as unverified rather than pretending it is accurate.

Ensure the biomes contain ecologically plausible species combinations.

Avoid introducing animals into incorrect habitats without an explicit fictional-world explanation.

## 7.2 Species information display

Each species page must show:

- Representative image or rendered 3D model.
- Vietnamese common name.
- English common name.
- Scientific name.
- Family.
- Order.
- Class.
- Habitat.
- Diet.
- Physical characteristics.
- Survival adaptations.
- Behavior.
- Role in the ecosystem.
- Interesting facts.
- Conservation information when verified.

Include Vietnamese and English localization.

Allow switching languages while keeping the current species page open.

---

# 8. WILDLIFE RESEARCH TOOL SYSTEM

This is the signature gameplay feature.

The player carries a virtual wildlife research toolkit.

## 8.1 Tools

Implement the following:

1. Digital wildlife camera.
2. Video recording camera.
3. Binoculars.
4. Biological identification scanner.
5. Macro inspection tool.
6. Field journal.

Every tool must have a distinct purpose and functioning gameplay mechanics.

---

# 9. PROFESSIONAL PHOTOGRAPHY MODE

Press C to enter photography mode.

The camera interface should resemble a professional digital wildlife camera.

Include:
- Viewfinder.
- Crosshair/focus reticle.
- Zoom indicator.
- Focus target.
- Species identification status.
- Camera movement controls.
- Photo shutter.
- Depth-of-field control when feasible.
- Exposure adjustment when feasible.
- Field-of-view adjustment.
- Image resolution options.
- UI visibility toggle.

## 9.1 Zoom

Implement smooth optical-style digital zoom.

Support example zoom presets:
- 1×
- 2×
- 4×
- 8×

Zoom should modify camera projection/FOV correctly.

Avoid merely enlarging the entire browser canvas.

## 9.2 Wildlife identification

When the camera points at an animal or plant:
1. Raycast or perform screen-space entity detection.
2. Determine the target.
3. Check visibility and distance.
4. Show a focus indicator.
5. Display the common name if the species has been identified.
6. Otherwise show “Unknown species”.
7. Allow the player to photograph it.
8. Evaluate observation quality.
9. Record the observation in the journal.

Do not identify an animal through objects that block the camera view.

## 9.3 Photo quality

Calculate a photo quality score using:
- Target visibility.
- Target size in frame.
- Centering/composition.
- Distance.
- Motion blur approximation.
- Focus.
- Lighting.
- Whether the animal is partially occluded.

The score should range from 0 to 100.

Example:

```ts
interface PhotoResult {
  id: string;
  speciesId: string;
  timestamp: number;
  imageBlobId: string;
  quality: number;
  location: [number, number, number];
  biome: string;
  observedBehavior?: string;
}
```

An excellent photo can unlock additional scientific observations or journal rewards.

## 9.4 Photograph capture

Capture actual pixels rendered by the 3D scene.

Save photo data locally.

Allow:
- Viewing photographs.
- Downloading images.
- Deleting images.
- Associating a photo with species metadata.
- Viewing the location where the image was captured.

Do not create a fake shutter button that only displays a notification.

---

# 10. VIDEO RECORDING AND SLOW MOTION

Implement a working in-game video camera.

## 10.1 Video recording

The player must be able to:
1. Open the video camera.
2. Aim at wildlife.
3. Start recording.
4. Observe a recording indicator.
5. Stop recording.
6. Preview the recording.
7. Save the recording locally.
8. Download it in a supported browser format.

Use appropriate browser capture APIs.

Prefer MediaRecorder and canvas captureStream where supported.

Check codec support before recording.

Provide meaningful error handling.

## 10.2 Slow-motion wildlife observation

Implement two distinct systems:

**A. In-game cinematic slow motion**

Temporarily slow the simulation clock affecting:
- Animal animation.
- Animal movement.
- Environmental motion where appropriate.

Keep the camera controls responsive.

Provide speed presets:
- 1.0×
- 0.5×
- 0.25×

Avoid breaking physics stability.

**B. Recorded-video slow playback**

Allow the player to replay recorded video at reduced playback speeds.

Clearly distinguish playback slowdown from true high-frame-rate recording.

Do not claim that slowing ordinary browser-recorded video creates genuine high-frame-rate footage.

## 10.3 Detailed scientific observation

When a species is selected during inspection:
- Display its name.
- Highlight its body.
- Show scientific metadata.
- Allow zooming and orbiting around the selected 3D subject.
- Allow observation of current animations.
- Show behavior notes.
- Optionally show anatomical hotspots.

For plants, reveal:
- Leaves.
- Flowers.
- Trunk/stem.
- Roots when represented.
- Morphological characteristics.

For animals, reveal:
- General anatomy.
- Locomotion.
- Feeding behavior.
- Survival adaptations.

Inspection mode may isolate the subject in a separate 3D preview scene without changing or freezing the original world permanently.

---

# 11. BIOLOGICAL SCANNER

Press F to activate the research scanner.

The scanner should behave like a scientific field instrument.

When aiming at a species:
- Display a subtle scanning animation.
- Identify the species.
- Show distance.
- Show biological classification.
- Show observation completion status.
- Mark it as discovered after a successful scan.
- Add it to the journal.

Include scanner feedback:
- Scan progress.
- Scanning reticle.
- Target identification.
- Completion animation.
- Short audio confirmation.

Scanner results must come from the actual species database.

Do not display random species information unrelated to the target.

---

# 12. FIELD JOURNAL AND RESEARCH PROGRESSION

Implement a complete journal accessible by pressing J.

The journal is a major part of the game.

## Journal sections

### Species Encyclopedia

Display all available species as cards.

Species not yet discovered appear as unknown entries or silhouettes.

Discovered species reveal:
- Names.
- Scientific details.
- Observed behavior.
- Discovery location.
- Photographs.
- Video records.

### Photography Album

Display photographs taken during gameplay.

Provide:
- Thumbnail grid.
- Fullscreen preview.
- Sorting by date.
- Species filtering.
- Quality score.
- Download.

### Video Library

Display recorded videos.

Provide:
- Playback.
- Slow-motion playback controls.
- Species association.
- Deletion.
- Download.

### Exploration Map

Display visited areas and discovered species locations.

### Research Progress

Track:
- Number of species discovered.
- Number of photographs captured.
- Number of high-quality photographs.
- Number of videos recorded.
- Number of completed research tasks.
- Number of explored biomes.

---

# 13. QUEST AND EXPEDITION SYSTEM

Create an enjoyable research-driven gameplay loop.

Do not rely on combat or arbitrary item collection.

## Initial expedition

**Mission 1 — First Steps into the Wild**

Objectives:
1. Leave the research camp.
2. Learn basic movement.
3. Locate a nearby animal.
4. Activate binoculars.
5. Take a wildlife photograph.
6. Scan the animal.
7. Open the journal.
8. Review biological details.

Reward:
- First Researcher Badge.
- Journal entry unlocked.

## Mission 2 — Life by the River

Objectives:
1. Travel to the freshwater biome.
2. Discover at least two fish species.
3. Record fish swimming behavior.
4. Photograph a water plant.
5. Complete the freshwater survey.

## Mission 3 — Forest Biodiversity

Objectives:
1. Find three forest plants.
2. Photograph two bird species.
3. Observe a feeding behavior.
4. Complete the forest field journal.

## Mission 4 — Hidden Ruins

Objectives:
1. Locate the ancient ruins.
2. Inspect an archaeological artifact.
3. Photograph a unique plant growing near the ruins.
4. Document the location in the journal.

## Mission 5 — Master Naturalist

Objectives:
1. Discover at least 15 species.
2. Obtain five high-quality photographs.
3. Record three wildlife behaviors.
4. Visit all five biomes.
5. Complete the first research expedition.

Create a coherent completion screen and continue allowing free exploration afterward.

Use a data-driven quest architecture so missions can be added without rewriting the game.

---

# 14. DAY/NIGHT AND WEATHER

Implement a controllable environmental time system.

Features:
- Morning.
- Noon.
- Sunset.
- Night.
- Smooth sunlight transition.
- Sky color changes.
- Shadow direction changes.
- Atmospheric light adjustments.

Optional weather states:
- Clear.
- Cloudy.
- Light rain.
- Fog.

Weather should influence:
- Lighting.
- Sound.
- Visibility.
- Wildlife behavior where relevant.

Add a setting to control the time-of-day cycle speed.

Keep heavy weather effects optimized.

---

# 15. WATER AND UNDERWATER EXPLORATION

Water must be more than a flat blue plane.

Create visually convincing water with:
- Surface movement.
- Ripples.
- Transparent shallows.
- Underwater color gradients.
- Reflections where feasible.
- Shoreline transitions.
- Rocks and aquatic vegetation.

Implement fish animation and schooling.

The player should be able to observe underwater life using at least one reliable approach:
- Underwater camera inspection.
- Shore-based underwater observation tool.
- Controlled diving mode.

Prefer a polished underwater observation system over incomplete swimming mechanics.

Prevent fish from swimming outside water volumes.

Use depth-aware movement and boundary constraints.

---

# 16. WORLD INTERACTIONS

Implement meaningful interactions with the environment.

Examples:
- Approaching wildlife carefully.
- Inspecting flowers.
- Examining tree bark.
- Finding tracks.
- Inspecting rocks.
- Reading signs at research stations.
- Discovering artifacts.
- Interacting with observation stations.
- Unlocking viewpoints.
- Finding hidden research notes.

Show contextual interaction prompts.

Avoid excessive floating labels across the screen.

Interactive entities must have consistent identifiers and components.

---

# 17. UI/UX DESIGN

Design a polished, modern game interface.

Visual inspiration:
- Premium nature documentary interfaces.
- Professional wildlife photography equipment.
- Scientific field notebooks.
- Minimal cinematic adventure-game HUDs.

## Main menu

Include:
- Continue
- New Expedition
- Field Guide
- Settings
- Credits

## In-game HUD

Display:
- Compass.
- Current biome.
- Minimal objective tracker.
- Current tool.
- Interaction indicators.
- Small discovery notifications.

Avoid covering too much of the 3D viewport.

## Field journal UI

Use a modern scientific notebook aesthetic:
- Clean typography.
- Natural colors.
- Strong image hierarchy.
- Readable data tables.
- Species categories.
- Smooth transitions.

## Settings

Include:
- Graphics quality.
- Render resolution scaling.
- Shadow quality.
- Vegetation density.
- Draw distance.
- Master volume.
- Music volume.
- Effects volume.
- Mouse sensitivity.
- Language.
- Control reference.

## Localization

Implement Vietnamese and English using a centralized localization framework.

Do not hardcode translated UI strings throughout React components.

---

# 18. AUDIO DESIGN

Create an immersive environmental sound system.

Support:
- Forest ambience.
- Bird calls.
- Insect sounds.
- Flowing river.
- Waterfall.
- Wind.
- Footsteps.
- Camera shutter.
- Scanner feedback.
- Journal interaction.
- Ambient music.

Use spatial audio where useful.

Adjust environmental sounds based on biome.

Provide fallback audio generation or openly licensed assets where necessary.

Do not include copyrighted audio without appropriate permission.

Audio playback must respect browser autoplay restrictions.

---

# 19. SOFTWARE ARCHITECTURE

Use a modular project structure.

Suggested organization:

```text
wildlife-odyssey/
├── public/
│   ├── models/
│   ├── textures/
│   ├── audio/
│   └── icons/
├── src/
│   ├── app/
│   ├── engine/
│   │   ├── rendering/
│   │   ├── physics/
│   │   ├── input/
│   │   ├── camera/
│   │   ├── audio/
│   │   └── performance/
│   ├── world/
│   │   ├── terrain/
│   │   ├── biomes/
│   │   ├── vegetation/
│   │   ├── water/
│   │   ├── weather/
│   │   └── streaming/
│   ├── entities/
│   │   ├── player/
│   │   ├── wildlife/
│   │   ├── plants/
│   │   └── artifacts/
│   ├── systems/
│   │   ├── movement/
│   │   ├── interaction/
│   │   ├── identification/
│   │   ├── photography/
│   │   ├── video/
│   │   ├── inspection/
│   │   ├── quests/
│   │   ├── discovery/
│   │   └── persistence/
│   ├── data/
│   │   ├── species/
│   │   ├── biomes/
│   │   └── quests/
│   ├── ui/
│   │   ├── hud/
│   │   ├── menus/
│   │   ├── journal/
│   │   ├── camera/
│   │   └── map/
│   ├── i18n/
│   ├── store/
│   ├── utils/
│   └── tests/
├── docs/
│   ├── architecture.md
│   ├── game-design.md
│   ├── species-sources.md
│   ├── asset-licenses.md
│   ├── performance.md
│   └── implementation-status.md
├── package.json
├── tsconfig.json
└── README.md
```

You may improve this structure when engineering considerations justify it.

## Architecture principles

- Separate rendering from gameplay state.
- Separate biological data from rendering.
- Use reusable components and systems.
- Avoid circular dependencies.
- Avoid huge monolithic components.
- Implement asset caching.
- Properly dispose Three.js resources.
- Avoid unmanaged event listeners.
- Avoid uncontrolled frame-loop allocations.
- Use deterministic world configuration where practical.
- Support adding new species with minimal new code.
- Centralize configuration.
- Use strict TypeScript types.

Ensure the entire project is maintainable rather than only impressive in a demo.

---

# 20. PERFORMANCE REQUIREMENTS

Performance is a major acceptance criterion.

Target:
- 60 FPS at 1080p on a capable desktop GPU using appropriate settings.
- Graceful fallback to 30 FPS on lower-end hardware.
- No avoidable frame stalls during ordinary exploration.
- No unbounded memory growth.

These are performance targets, not guaranteed results on every device.

Implement:
- Vegetation instancing.
- LOD.
- Distance-based animation updates.
- Frustum culling.
- Asset compression when supported.
- Texture size budgeting.
- GPU resource cleanup.
- Adaptive graphics settings.
- Chunk-based environment management.
- Wildlife simulation throttling for distant creatures.

Provide performance metrics:
- FPS.
- Frame time.
- Draw calls where available.
- Triangle count.
- Render resolution.
- Approximate scene object counts.

Implement an optional developer performance overlay.

Do not sacrifice playable performance solely to create more realistic graphics.

---

# 21. SAVE AND LOAD SYSTEM

Implement persistent progression.

Save:
- Player location.
- Current research role.
- Discovered species.
- Quest progress.
- Exploration progress.
- Collected photographs.
- Recorded videos, subject to browser storage limits.
- User settings.
- Research statistics.

Use local persistence.

Prefer IndexedDB for larger structured records and binary media.

Handle:
- Storage permission issues.
- Quota limits.
- Missing files.
- Corrupted saves.
- Schema migrations.
- First-time player setup.

Include:
- New Game.
- Continue Game.
- Reset Progress.

Do not silently discard saved research data.

---

# 22. TESTING AND VALIDATION

Implement automated tests for core gameplay.

Unit tests should cover:
- Species schema validation.
- Species lookup.
- Quest state transitions.
- Discovery tracking.
- Photo quality scoring.
- Camera zoom calculations.
- Save serialization.
- Localization keys.
- Animal behavior transitions.
- Map coordinate conversion.

Browser integration tests should cover:
1. Opening the game.
2. Starting an expedition.
3. Entering the 3D environment.
4. Moving the player.
5. Interacting with a species.
6. Activating the scanner.
7. Entering photo mode.
8. Capturing a screenshot.
9. Opening the field journal.
10. Saving and reloading progress.

Test video recording in supported browsers, including permission and codec handling.

Use browser automation to detect:
- Runtime errors.
- Failed network assets.
- Blank screens.
- Missing textures.
- Broken input.
- Unresponsive UI.
- Invalid camera state.

Do not claim that visual or browser tests passed unless they actually ran.

---

# 23. DEVELOPMENT PHASES

Execute the entire project in phases.

Each phase must result in working integrated code.

### Phase 1 — Foundation

- Initialize project.
- Configure dependencies.
- Define architecture.
- Implement application routing/state.
- Create main menu.
- Create base 3D canvas.
- Add graphics settings.
- Configure testing.

### Phase 2 — Playable World

- Generate terrain.
- Create biomes.
- Add trees and vegetation.
- Add water.
- Add lighting and atmosphere.
- Implement player movement.
- Implement collisions.
- Create world map.

Acceptance: The player can explore a continuous outdoor environment.

### Phase 3 — Wildlife

- Create species database.
- Implement wildlife entity architecture.
- Integrate recognizable animal assets.
- Implement animation.
- Implement locomotion behavior.
- Implement basic ecosystem interactions.

Acceptance: Multiple animal species visibly move and behave differently.

### Phase 4 — Research Tools

- Camera mode.
- Binocular mode.
- Scanner.
- Raycast identification.
- Photography.
- Photo quality scoring.
- Species information panels.

Acceptance: The player can discover and photograph species.

### Phase 5 — Video and Scientific Inspection

- Video recording.
- Video playback.
- Slow-motion simulation.
- Close-up inspection.
- Species 3D preview.
- Biological information overlay.

Acceptance: The player can record, inspect, and review wildlife.

### Phase 6 — Journal and Missions

- Species encyclopedia.
- Photo gallery.
- Video archive.
- Quest system.
- Research rewards.
- Exploration tracking.

Acceptance: A complete research expedition is playable.

### Phase 7 — Polish

- Weather.
- Day/night.
- Ambient audio.
- UI transitions.
- Camera effects.
- World detail.
- Additional animal behaviors.
- Environmental storytelling.

### Phase 8 — Optimization and Release

- Performance audit.
- Asset optimization.
- Automated tests.
- Browser testing.
- Save/reload verification.
- Production build.
- Deployment instructions.
- Documentation.

Do not abandon earlier features when implementing later phases.

---

# 24. ACCEPTANCE TEST SCENARIO

The finished game must support the following complete scenario:

1. I open the game in Chrome.
2. I see a polished main menu.
3. I select New Expedition.
4. I choose Wildlife Biologist.
5. I spawn at a beautiful research camp.
6. I can move using WASD and look with the mouse.
7. I walk into a forest.
8. I see animated trees, vegetation, and wildlife.
9. I approach a deer.
10. The deer reacts to my presence.
11. I press B to observe through binoculars.
12. I press C to open the digital camera.
13. I zoom in and focus on the deer.
14. I take a photograph.
15. The game evaluates the photograph and identifies the species.
16. I open a scientific information panel.
17. I see the Vietnamese and English species names, scientific name, family, habitat, and survival characteristics.
18. I activate inspection mode to observe the animal more closely.
19. I record a short video of its behavior.
20. I replay the recording at 0.5× speed.
21. I save the video to my journal.
22. I travel to a river.
23. I observe fish swimming underwater.
24. I identify and photograph a fish.
25. I open the world map and create a waypoint.
26. I reach another biome.
27. I complete a research mission.
28. I return to the main menu.
29. I reload the saved game.
30. My discoveries, photographs, quests, and position are preserved.

All essential steps must work in the actual browser.

---

# 25. DEFINITION OF DONE

Do not consider the project done based on source-code quantity.

A feature is complete when:
- Its intended gameplay behavior exists.
- It is integrated with the relevant systems.
- It works through real player input.
- Its state is correctly managed.
- It has meaningful error handling.
- It does not break the build.
- Its behavior is verified.

Maintain a feature checklist with statuses:
- Not Started
- In Progress
- Implemented
- Verified
- Blocked

Do not falsely label implemented but untested features as verified.

---

# 26. QUALITY AND ANTI-SHORTCUT RULES

Do not:
- Return only pseudocode.
- Produce just an architecture document.
- Create disconnected example components.
- Leave critical buttons nonfunctional.
- Replace the game with a video or animation.
- Use static screenshots instead of an actual 3D environment.
- Use random fabricated biological metadata.
- Pretend that video recording works.
- Claim successful testing without running tests.
- Claim full completion with broken gameplay.
- Silently remove requested systems to reduce scope.
- Stop after implementing only the first phase.

Do:
- Write actual project files.
- Integrate all systems.
- Use sensible temporary fallbacks.
- Replace important placeholders with finished assets or high-quality procedural versions.
- Document limitations accurately.
- Resolve integration defects.
- Run builds frequently.
- Continue toward the full acceptance scenario.
- Keep the project playable throughout development.

If scope exceeds the available execution context, preserve an accurate state of completed work and the remaining tasks. Never misrepresent unfinished work as complete.

---

# 27. EXECUTION AND PROGRESS REPORTING

Start by inspecting the project workspace.

If empty, initialize a new project.

Create and maintain:
- `docs/game-design.md`
- `docs/architecture.md`
- `docs/implementation-status.md`
- `docs/asset-licenses.md`
- `docs/species-sources.md`

The status document must include:
- Current phase.
- Completed work.
- Verified functionality.
- Known bugs.
- Remaining work.
- Latest test results.
- Next implementation tasks.

Keep progress updates concise.

Avoid repeatedly explaining the plan instead of implementing it.

Use available subagents or parallel workers when helpful, provided their work can be safely integrated.

Prefer clear ownership of separate modules and a single integration process.

---

# 28. FINAL DELIVERABLES

The final deliverable must include:

1. Complete TypeScript/React game source code.
2. Working browser-based 3D game.
3. Playable natural environment.
4. Multiple animated animal species.
5. Interactive plants and species data.
6. Functional camera and photography system.
7. Functional video recording system.
8. Slow-motion and scientific inspection.
9. Species encyclopedia with Vietnamese and English.
10. Field journal and media gallery.
11. Research mission system.
12. Save/load support.
13. Automated test suite.
14. Optimization and graphics settings.
15. Documentation.
16. Build and deployment instructions.

At the end, report:
- What was actually implemented.
- What was verified.
- Test results.
- Remaining issues.
- Exact instructions to run the game.
- Build output location.
- Known limitations.

Do not claim that everything is complete if any required feature remains unfinished.

---

# 29. FIRST ACTION

Begin implementation now.

Your first actions should be:

1. Inspect the workspace.
2. Establish the technical architecture.
3. Create the repository structure and configuration.
4. Implement a working 3D scene with basic player controls.
5. Run the application and verify it.
6. Continue through the development phases until the complete acceptance scenario works.

Make engineering decisions autonomously.

The ultimate objective is a beautiful, immersive, functional, and educational wildlife exploration game that I can open and play directly in a web browser.

**Build the game, not just the proposal.**