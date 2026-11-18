/**
 * Per-frame gameplay glue: finds what the player is looking at (with occlusion),
 * runs autofocus, scanning and behaviour observation, tracks exploration
 * (biomes, landmarks, map cells, waypoint) and offers contextual interactions.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { CAMP, PLAYER, SCAN } from '../../config';
import { ANIMAL_CATEGORIES, getSpecies, speciesText } from '../../data/species';
import { audio } from '../../engine/audio/audio';
import { frameFraction } from '../../engine/camera/zoom';
import { isFeeding } from '../../entities/wildlife/behavior';
import { directionKey, translate } from '../../i18n/translate';
import { useGame, type Tool } from '../../store/gameStore';
import { runtime, type TargetInfo } from '../../store/runtime';
import { cellsAround } from '../../ui/map/coords';
import { degToRad } from '../../utils/math';
import { getStructureBlockers, registry } from '../../world/registry';
import { chunkCoord } from '../../world/streaming/chunks';
import { INTERACTABLES, type Interactable } from '../../world/structures/structures';
import { getWorld } from '../../world/terrain/heightmap';
import { LANDMARKS } from '../../world/terrain/layout';
import { getChunkContent } from '../../world/vegetation/placement';
import { pickTarget, type Blocker, type TargetCandidate } from '../identification/targeting';

interface Nearby {
  interactable: Interactable | null;
  rock: boolean;
}

const nearby: Nearby = { interactable: null, rock: false };

function pickOptions(tool: Tool, zoom: number, biologist: boolean): { maxDistance: number; tolerance: number } {
  switch (tool) {
    case 'camera':
    case 'video':
      return { maxDistance: Math.min(60 + 45 * zoom, 420), tolerance: 0.032 / zoom };
    case 'binoculars':
      return { maxDistance: 80 + 40 * zoom, tolerance: 0.032 / zoom };
    case 'scanner':
      return { maxDistance: SCAN.range * (biologist ? 1.35 : 1), tolerance: 0.03 };
    case 'macro':
      return { maxDistance: 8, tolerance: 0.045 };
    default:
      return { maxDistance: 14, tolerance: 0.03 };
  }
}

/** Performs the contextual interaction (E key or click with empty hands). */
export function interact(): void {
  const st = useGame.getState();
  if (st.screen !== 'playing' || st.overlay !== 'none') return;
  const lang = st.settings.language;
  const it = nearby.interactable;
  if (it) {
    audio.page();
    if (it.landmark && st.visitLandmark(it.landmark)) {
      st.notify('landmark.discovered', { name: translate(lang, `landmark.${it.landmark}` as 'landmark.camp') }, 'discovery');
    }
    switch (it.kind) {
      case 'sign':
      case 'shelter':
        if (it.panorama) {
          st.revealLandmarks(LANDMARKS.map((l) => l.id));
          st.notify('notify.viewpoint', undefined, 'discovery');
        }
        st.collectNote(it.id);
        st.openReader({ title: it.title, body: it.body });
        break;
      case 'stele':
        st.collectNote(it.id);
        st.emit({ type: 'document', id: 'ruins' });
        st.notify('notify.documented', undefined, 'discovery');
        st.openReader({ title: it.title, body: st.role === 'archaeologist' ? 'read.stele.bodyFull' : it.body });
        break;
      case 'note':
        if (st.collectNote(it.id)) st.notify('notify.note', undefined, 'discovery');
        st.openReader({ title: it.title, body: it.body });
        break;
      case 'artifact':
        if (st.collectArtifact(it.id)) st.notify('notify.artifact', { name: translate(lang, it.name) }, 'discovery');
        st.openReader({ title: it.title, body: it.body });
        break;
      case 'tracks': {
        st.collectNote(it.id);
        const species = it.speciesId ? getSpecies(it.speciesId) : undefined;
        const dir = it.toward ? translate(lang, directionKey(it.toward[0] - it.x, it.toward[1] - it.z)) : '';
        if (species && st.discovered[species.id]) st.notify('notify.tracks', { name: speciesText.name(species, lang), dir }, 'discovery');
        else st.notify('notify.tracksUnknown', { dir }, 'info');
        break;
      }
    }
    return;
  }
  const t = runtime.target;
  if (t && t.distance <= PLAYER.interactRange + 1) {
    audio.ui();
    st.openInspect({ speciesId: t.speciesId, behavior: t.behavior });
    return;
  }
  if (nearby.rock) {
    audio.page();
    st.openReader({ title: 'rock.title', body: 'rock.body' });
  }
}

export function InteractionSystem(): null {
  const local = useRef({
    frame: 0,
    candidates: [] as TargetCandidate[],
    pool: [] as TargetCandidate[],
    blockers: [] as Blocker[],
    blockerVersion: -1,
    lastTargetId: '',
    lastDir: [0, 0, 0] as [number, number, number],
    scanDone: false,
    scanTick: 0,
    leftCamp: false,
    seenNear: new Set<string>(),
    biomeCooldown: 0,
    worldTick: 0,
    recordSeconds: new Map<string, number>(),
  });

  useEffect(() => {
    const L = local.current;
    return useGame.subscribe((s, prev) => {
      if (s.screen === 'playing' && prev.screen !== 'playing') {
        L.leftCamp = false;
        L.seenNear.clear();
        L.lastTargetId = '';
        runtime.target = null;
        runtime.scan.progress = 0;
        runtime.scan.targetId = null;
      }
    });
  }, []);

  useFrame((_, rawDt) => {
    const st = useGame.getState();
    if (st.screen !== 'playing') {
      runtime.target = null;
      return;
    }
    const L = local.current;
    const dt = Math.min(rawDt, 0.1);
    const world = getWorld();
    const p = runtime.player;
    L.frame++;

    /* ---- exploration tracking (4 times a second) ---- */
    L.worldTick -= dt;
    L.biomeCooldown -= dt;
    if (L.worldTick <= 0) {
      L.worldTick = 0.25;
      const biome = world.biomeAt(p.pos.x, p.pos.z);
      if (biome !== p.biome || !st.visitedBiomes.includes(biome)) {
        const changed = biome !== p.biome;
        p.biome = biome;
        st.visitBiome(biome);
        if (changed && L.biomeCooldown <= 0) {
          st.notify('notify.biome', { name: translate(st.settings.language, `biome.${biome}`) });
          L.biomeCooldown = 10;
        }
      }
      for (const c of cellsAround(p.pos.x, p.pos.z, 1)) st.exploreCell(c);
      for (const lm of LANDMARKS) {
        if (Math.hypot(p.pos.x - lm.x, p.pos.z - lm.z) < lm.r && useGame.getState().visitLandmark(lm.id)) {
          st.notify('landmark.discovered', { name: translate(st.settings.language, `landmark.${lm.id}` as 'landmark.camp') }, 'discovery');
          audio.discovery();
        }
      }
      if (!L.leftCamp && Math.hypot(p.pos.x - CAMP.x, p.pos.z - CAMP.z) > 24) {
        L.leftCamp = true;
        st.emit({ type: 'left-camp' });
      }
      const wp = st.waypoint;
      if (wp && Math.hypot(p.pos.x - wp[0], p.pos.z - wp[1]) < 7) {
        st.setWaypoint(null);
        st.notify('map.waypointReached', undefined, 'discovery');
      }
      // Nearest interactable prop, then a boulder within reach.
      let best: Interactable | null = null;
      let bestD = Infinity;
      for (const it of INTERACTABLES) {
        const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
        if (d < it.radius && d < bestD && Math.abs(world.heightAt(it.x, it.z) - p.pos.y) < 3) {
          best = it;
          bestD = d;
        }
      }
      nearby.interactable = best;
      nearby.rock = false;
      if (!best) {
        for (const r of getChunkContent(chunkCoord(p.pos.x), chunkCoord(p.pos.z)).rocks) {
          if (r.scale > 0.6 && Math.hypot(p.pos.x - r.x, p.pos.z - r.z) < 0.9 * r.scale + 1.4) {
            nearby.rock = true;
            break;
          }
        }
      }
    }

    if (runtime.paused) return;

    /* ---- targeting (every other frame) ---- */
    if (L.frame % 2 === 0) {
      const tickDt = dt * 2;
      // A recording runs on the wall clock, so time in the reticle is counted in real seconds
      // (the simulation step above is clamped and would under-count on a slow machine).
      const recDt = Math.min(rawDt, 1) * 2;
      const cam = runtime.camera;
      if (L.blockerVersion !== registry.vegetationVersion) {
        L.blockers = [...registry.plantBlockers, ...getStructureBlockers()];
        L.blockerVersion = registry.vegetationVersion;
      }
      const list = L.candidates;
      list.length = 0;
      for (const c of registry.plants) list.push(c);
      const agents = registry.wildlife?.agents ?? [];
      let n = 0;
      for (const a of agents) {
        if (!a.active) continue;
        let c = L.pool[n];
        if (!c) L.pool[n] = c = { id: '', kind: 'animal', speciesId: '', x: 0, y: 0, z: 0, radius: 1 };
        n++;
        c.id = a.id;
        c.speciesId = a.speciesId;
        c.x = a.position.x;
        c.y = a.position.y + a.rigDef.centerY;
        c.z = a.position.z;
        c.radius = Math.max(a.rigDef.radius, 0.09);
        list.push(c);
      }
      const opt = pickOptions(st.tool, cam.zoom, st.role === 'biologist');
      const hit = pickTarget(cam.pos, cam.dir, list, L.blockers, (x, z) => world.heightAt(x, z), opt);
      if (hit) {
        const c = hit.candidate;
        const fovRad = degToRad(cam.fov);
        const dx = c.x - cam.pos.x;
        const dy = c.y - cam.pos.y;
        const dz = c.z - cam.pos.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const dir: [number, number, number] = [dx / len, dy / len, dz / len];
        let screenSpeed = cam.angularSpeed / fovRad;
        if (L.lastTargetId === c.id) {
          const dot = Math.min(1, dir[0] * L.lastDir[0] + dir[1] * L.lastDir[1] + dir[2] * L.lastDir[2]);
          screenSpeed += Math.acos(dot) / tickDt / fovRad;
        }
        L.lastDir = dir;
        const agent = c.kind === 'animal' ? registry.wildlife?.get(c.id) : undefined;
        const info: TargetInfo = {
          id: c.id,
          kind: c.kind,
          speciesId: c.speciesId,
          distance: hit.distance,
          visibility: hit.visibility,
          frameFraction: frameFraction(c.radius, hit.distance, cam.fov),
          offCenter: Math.atan2(hit.miss, hit.distance) / (fovRad / 2),
          behavior: agent?.currentBehavior === 'drinking' && !agent.atTarget ? 'walking' : agent?.currentBehavior,
          screenSpeed,
          x: c.x,
          y: c.y,
          z: c.z,
          radius: c.radius,
        };
        const same = L.lastTargetId === c.id;
        runtime.target = info;
        const focusing = st.tool === 'camera' || st.tool === 'video' || st.tool === 'binoculars';
        runtime.focusLock = focusing ? Math.min(1, (same ? runtime.focusLock : 0) + tickDt / 0.45) : 0;
        L.lastTargetId = c.id;

        // Scanner.
        if (st.tool === 'scanner') {
          if (runtime.scan.targetId !== c.id) {
            runtime.scan.targetId = c.id;
            const rec = st.discovered[c.speciesId];
            L.scanDone = Boolean(rec?.scanned);
            runtime.scan.progress = L.scanDone ? 1 : 0;
            L.scanTick = 0;
            if (L.scanDone) emitScan(c.speciesId);
          } else if (!L.scanDone) {
            runtime.scan.progress = Math.min(1, runtime.scan.progress + tickDt / (SCAN.duration * (st.role === 'biologist' ? 0.75 : 1)));
            if (runtime.scan.progress - L.scanTick > 0.2) {
              L.scanTick = runtime.scan.progress;
              audio.scanTick(runtime.scan.progress);
            }
            if (runtime.scan.progress >= 1) {
              L.scanDone = true;
              audio.scanComplete();
              useGame.getState().discover(c.speciesId, 'scan', [c.x, c.y, c.z], p.biome);
              const g = useGame.getState();
              g.patch({ stats: { ...g.stats, scans: g.stats.scans + 1 } });
              emitScan(c.speciesId);
            }
          }
        }

        if (info.kind === 'animal') {
          if (hit.distance < 55 && !L.seenNear.has(c.speciesId)) {
            L.seenNear.add(c.speciesId);
            st.emit({ type: 'animal-near', speciesId: c.speciesId });
          }
          // Feeding observation: hold a feeding animal in view for three seconds.
          if (info.behavior && isFeeding(info.behavior) && info.visibility >= 0.6) {
            if (runtime.observe.targetId !== c.id) {
              runtime.observe.targetId = c.id;
              runtime.observe.seconds = 0;
            }
            runtime.observe.seconds += tickDt;
            if (runtime.observe.seconds >= 3) {
              useGame.getState().recordBehavior(c.speciesId, info.behavior, false);
              runtime.observe.seconds = -1e9;
            }
          } else if (runtime.observe.targetId !== c.id) {
            runtime.observe.targetId = null;
          }
          if (runtime.recording.active && info.behavior) {
            const rec = runtime.recording;
            const total = (rec.species.get(c.speciesId) ?? 0) + recDt;
            rec.species.set(c.speciesId, total);
            const key = `${c.speciesId}:${info.behavior}`;
            const secs = (L.recordSeconds.get(key) ?? 0) + recDt;
            L.recordSeconds.set(key, secs);
            if (secs >= 1) {
              let set = rec.behaviors.get(c.speciesId);
              if (!set) rec.behaviors.set(c.speciesId, (set = new Set()));
              set.add(info.behavior);
            }
          }
        }
      } else {
        runtime.target = null;
        runtime.focusLock = 0;
        L.lastTargetId = '';
        if (st.tool === 'scanner') {
          runtime.scan.targetId = null;
          runtime.scan.progress = 0;
        }
      }
      if (!runtime.recording.active && L.recordSeconds.size > 0) L.recordSeconds.clear();
      if (st.tool !== 'scanner' && runtime.scan.targetId) {
        runtime.scan.targetId = null;
        runtime.scan.progress = 0;
      }
    }

    /* ---- contextual prompt ---- */
    if (L.frame % 6 === 0) {
      const lang = st.settings.language;
      let prompt: string | null = null;
      const it = nearby.interactable;
      const t = runtime.target;
      const handsFree = st.tool === 'none' || st.tool === 'macro';
      if (it && handsFree) {
        const what =
          it.kind === 'sign'
            ? translate(lang, 'prompt.read', { name: translate(lang, it.name) })
            : it.kind === 'note'
              ? translate(lang, 'prompt.collect')
              : it.kind === 'tracks'
                ? translate(lang, 'prompt.tracks')
                : it.kind === 'stele'
                  ? translate(lang, 'prompt.document')
                  : translate(lang, 'prompt.examine', { name: translate(lang, it.name) });
        prompt = translate(lang, 'prompt.interact', { what });
      } else if (t && handsFree && t.distance <= PLAYER.interactRange + 1) {
        const species = getSpecies(t.speciesId);
        const known = species && st.discovered[t.speciesId];
        const what = known ? translate(lang, 'prompt.inspect', { name: speciesText.name(species, lang) }) : translate(lang, 'prompt.inspectUnknown');
        prompt = translate(lang, 'prompt.interact', { what });
      } else if (nearby.rock && handsFree && !t) {
        prompt = translate(lang, 'prompt.interact', { what: translate(lang, 'prompt.examine', { name: translate(lang, 'rock.title') }) });
      }
      st.setPrompt(prompt);
    }
  }, -1);

  return null;
}

function emitScan(speciesId: string): void {
  const species = getSpecies(speciesId);
  if (!species) return;
  useGame.getState().emit({
    type: 'scan',
    speciesId,
    category: species.category,
    group: ANIMAL_CATEGORIES.includes(species.category) ? 'animal' : 'plant',
    biome: runtime.player.biome,
  });
}
