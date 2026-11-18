/**
 * Builds a standalone 3D subject for a species (used by the inspection scene
 * and by encyclopedia thumbnails) and renders small thumbnail images with a
 * single shared off-screen renderer.
 */
import { AmbientLight, Color, DirectionalLight, Group, Mesh, PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from 'three';
import { isAnimal, type SpeciesRecord } from '../../data/species';
import { createWindMaterial } from '../../engine/rendering/windMaterial';
import { animateRig, type AnimState } from '../../entities/wildlife/animation';
import { createRig, getRigDef, type RigInstance } from '../../entities/wildlife/models';
import { PROFILES } from '../../entities/wildlife/profiles';
import type { Behavior } from '../../entities/wildlife/types';
import { PLANT_META, getPlantGeometry } from '../../world/vegetation/plantModels';

export interface PreviewSubject {
  object: Object3D;
  /** Bounding radius and centre height for framing. */
  radius: number;
  centerY: number;
  rig: RigInstance | null;
  /** Behaviours that have a distinct animation for this body plan. */
  animations: Behavior[];
  runSpeed: number;
  walkSpeed: number;
  dispose: () => void;
}

const ANIMATIONS: Record<string, Behavior[]> = {
  quadruped: ['idle', 'walking', 'running', 'feeding', 'alert', 'resting'],
  bird: ['perched', 'flying', 'feeding', 'calling'],
  fish: ['swimming', 'fleeing', 'resting'],
  lizard: ['idle', 'walking', 'alert'],
  toad: ['idle', 'walking', 'calling'],
  butterfly: ['flying', 'feeding', 'resting'],
  bee: ['flying', 'feeding'],
  dragonfly: ['flying', 'perched'],
  beetle: ['idle', 'walking'],
};

export function createPreviewSubject(species: SpeciesRecord): PreviewSubject {
  if (isAnimal(species)) {
    const def = getRigDef(species.model, 0);
    const rig = createRig(def, false);
    const profile = PROFILES[species.id];
    // Fish and flying insects are centred on the body; everything else stands on the ground.
    const centerY = def.centerY;
    return {
      object: rig.root,
      radius: def.radius * 1.15,
      centerY,
      rig,
      animations: ANIMATIONS[def.kind] ?? ['idle'],
      runSpeed: profile?.runSpeed ?? 3,
      walkSpeed: profile?.walkSpeed ?? 1,
      dispose: () => undefined,
    };
  }
  const meta = PLANT_META[species.model];
  const material = createWindMaterial(0.85);
  const mesh = new Mesh(getPlantGeometry(species.model), material);
  const group = new Group();
  group.add(mesh);
  const height = meta?.height ?? 2;
  return {
    object: group,
    radius: Math.max(height * 0.62, (meta?.radius ?? 1) * 1.6),
    centerY: height * 0.5,
    rig: null,
    animations: [],
    runSpeed: 0,
    walkSpeed: 0,
    dispose: () => material.dispose(),
  };
}

const anim: AnimState = { behavior: 'idle', speed: 0, runSpeed: 1, time: 0, airborne: false, pitch: 0, bank: 0, atTarget: true };

/** Advances the preview animation for the chosen behaviour. */
export function animatePreview(subject: PreviewSubject, behavior: Behavior, time: number, dt: number): void {
  if (!subject.rig) return;
  anim.behavior = behavior;
  anim.time = time;
  anim.runSpeed = subject.runSpeed;
  anim.atTarget = true;
  anim.airborne = behavior === 'flying' || behavior === 'soaring' || behavior === 'hovering';
  anim.speed =
    behavior === 'walking' || behavior === 'swimming' || behavior === 'flying'
      ? subject.walkSpeed
      : behavior === 'running' || behavior === 'fleeing'
        ? subject.runSpeed
        : 0;
  animateRig(subject.rig, anim, dt);
}

/* ---------------- thumbnails ---------------- */

let thumbRenderer: WebGLRenderer | null = null;
let thumbScene: Scene | null = null;
let thumbCamera: PerspectiveCamera | null = null;
const thumbCache = new Map<string, string>();
const SIZE = 192;

function ensureThumbRenderer(): boolean {
  if (thumbRenderer) return true;
  try {
    thumbRenderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(SIZE, SIZE, false);
    thumbRenderer.setClearColor(new Color('#000000'), 0);
    thumbScene = new Scene();
    thumbScene.add(new AmbientLight('#ffffff', 1.5));
    const key = new DirectionalLight('#fff3dd', 3);
    key.position.set(2, 4, 3);
    thumbScene.add(key);
    const rim = new DirectionalLight('#bcd8ff', 1.2);
    rim.position.set(-3, 2, -2);
    thumbScene.add(rim);
    thumbCamera = new PerspectiveCamera(30, 1, 0.01, 500);
    return true;
  } catch {
    thumbRenderer = null;
    return false;
  }
}

/** Renders (once) a transparent PNG thumbnail of the species' 3D model. */
export function getThumbnail(species: SpeciesRecord): string | null {
  const hit = thumbCache.get(species.id);
  if (hit) return hit;
  if (!ensureThumbRenderer() || !thumbRenderer || !thumbScene || !thumbCamera) return null;
  const subject = createPreviewSubject(species);
  try {
    if (subject.rig) animatePreview(subject, subject.animations[0] ?? 'idle', 0.4, 0.016);
    thumbScene.add(subject.object);
    const dist = subject.radius / Math.sin((thumbCamera.fov * Math.PI) / 360) + subject.radius * 0.2;
    thumbCamera.position.set(dist * 0.72, subject.centerY + dist * 0.22, dist * 0.66);
    thumbCamera.lookAt(0, subject.centerY, 0);
    thumbCamera.near = Math.max(0.005, dist * 0.02);
    thumbCamera.far = dist * 4;
    thumbCamera.updateProjectionMatrix();
    thumbRenderer.render(thumbScene, thumbCamera);
    const url = thumbRenderer.domElement.toDataURL('image/png');
    thumbCache.set(species.id, url);
    return url;
  } catch {
    return null;
  } finally {
    thumbScene.remove(subject.object);
    subject.dispose();
  }
}

export function disposeThumbnails(): void {
  thumbRenderer?.dispose();
  thumbRenderer?.forceContextLoss();
  thumbRenderer = null;
  thumbScene = null;
  thumbCamera = null;
}
