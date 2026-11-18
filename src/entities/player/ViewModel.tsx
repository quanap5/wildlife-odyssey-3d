/**
 * First-person hand-held items. The props live in their own small scene with
 * its own fixed-angle camera and are drawn by the render loop in a separate
 * pass after the depth buffer is cleared, so they never poke into the world
 * and are unaffected by zoom. They are not part of the world scene, so they
 * cannot appear in the depth-of-field pass, and the render loop redraws the
 * world before any capture (see engine/rendering/framePlan.ts).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  type BufferGeometry,
  type Material,
  type WebGLRenderer,
} from 'three';
import { PLAYER } from '../../config';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { clamp, damp } from '../../utils/math';
import { HELD_ITEMS, SCANNER_SCREEN, SCANNER_SCREEN_COLOR, VIEW_SCALE, buildProp, isHeldItem, viewModelPose, type HeldItem } from './heldItems';

/** Fixed lens for held items: they keep their size whatever the world camera's zoom. */
export const VIEW_MODEL_FOV = 48;

interface Rig {
  scene: Scene;
  camera: PerspectiveCamera;
  root: Group;
  meshes: Map<HeldItem, Mesh>;
  screen: Mesh;
  material: Material;
  hemi: HemisphereLight | null;
  sun: DirectionalLight | null;
  show: (item: HeldItem | null) => void;
  render: (gl: WebGLRenderer) => void;
  dispose: () => void;
}

function createRig(simple: boolean): Rig {
  const scene = new Scene();
  const camera = new PerspectiveCamera(VIEW_MODEL_FOV, 16 / 9, 0.02, 4);
  const root = new Group();
  scene.add(root);
  // Low preset: unlit vertex colours, no extra lights.
  const material: Material = simple ? new MeshBasicMaterial({ vertexColors: true }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 });
  let hemi: HemisphereLight | null = null;
  let sun: DirectionalLight | null = null;
  if (!simple) {
    hemi = new HemisphereLight(0xdfeaff, 0x4d4a3a, 1.1);
    sun = new DirectionalLight(0xfff2dd, 1.7);
    sun.position.set(-0.5, 0.9, 0.7);
    scene.add(hemi, sun);
  }
  const meshes = new Map<HeldItem, Mesh>();
  const geometries: BufferGeometry[] = [];
  const screenGeometry = new PlaneGeometry(SCANNER_SCREEN.w, SCANNER_SCREEN.h);
  const screenMaterial = new MeshBasicMaterial({ color: SCANNER_SCREEN_COLOR, toneMapped: false });
  const screen = new Mesh(screenGeometry, screenMaterial);
  screen.position.set(SCANNER_SCREEN.x, SCANNER_SCREEN.y, SCANNER_SCREEN.z);
  let shown: HeldItem | null = null;
  const show = (item: HeldItem | null): void => {
    if (item === shown) return;
    shown = item;
    for (const m of meshes.values()) m.visible = false;
    if (!item) return;
    let mesh = meshes.get(item);
    if (!mesh) {
      // Built on first use: most sessions never hold every item.
      const geometry = buildProp(item, simple);
      geometries.push(geometry);
      mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      if (item === 'scanner') mesh.add(screen);
      meshes.set(item, mesh);
      root.add(mesh);
    }
    mesh.visible = true;
  };
  const render = (gl: WebGLRenderer): void => {
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(scene, camera);
    gl.autoClear = auto;
  };
  const dispose = (): void => {
    for (const g of geometries) g.dispose();
    screenGeometry.dispose();
    screenMaterial.dispose();
    material.dispose();
    hemi?.dispose();
    sun?.dispose();
  };
  return { scene, camera, root, meshes, screen, material, hemi, sun, show, render, dispose };
}

export function ViewModel(): null {
  const quality = useGame((s) => s.settings.quality);
  const size = useThree((s) => s.size);
  const rig = useMemo(() => createRig(quality === 'low'), [quality]);
  const local = useRef({ yaw: 0, pitch: 0, swayX: 0, swayY: 0, recGuard: 0, primed: false });

  useEffect(() => {
    runtime.viewModel.render = (gl) => rig.render(gl as WebGLRenderer);
    return () => {
      runtime.viewModel.render = null;
      runtime.viewModel.visible = false;
      rig.dispose();
    };
  }, [rig]);

  useEffect(() => {
    rig.camera.aspect = size.width / Math.max(1, size.height);
    rig.camera.updateProjectionMatrix();
  }, [rig, size]);

  // Between the player controller (-3) and the render loop (1).
  useFrame((_, rawDt) => {
    const st = useGame.getState();
    const L = local.current;
    const dt = Math.min(rawDt, 0.1);
    const held = runtime.held;
    const p = runtime.player;

    // Recorded video takes the canvas as displayed, so nothing is held up while recording or just after.
    L.recGuard = runtime.recording.active ? 0.35 : Math.max(0, L.recGuard - dt);

    const item = isHeldItem(held.item) ? held.item : null;
    const visible =
      st.screen === 'playing' &&
      st.settings.heldItems &&
      item !== null &&
      held.raise > 0.001 &&
      !held.atEye &&
      runtime.camera.third < 0.05 &&
      !(st.hudHidden && st.tool !== 'none') &&
      L.recGuard <= 0;
    runtime.viewModel.visible = visible;

    // Lag behind camera turns (always tracked so there is no jump when an item comes up).
    if (!L.primed) {
      L.yaw = p.yaw;
      L.pitch = p.pitch;
      L.primed = true;
    }
    const dYaw = clamp(p.yaw - L.yaw, -0.2, 0.2);
    const dPitch = clamp(p.pitch - L.pitch, -0.2, 0.2);
    L.yaw = p.yaw;
    L.pitch = p.pitch;
    L.swayX = damp(L.swayX, clamp(dYaw * 0.35, -0.02, 0.02), 9, dt);
    L.swayY = damp(L.swayY, clamp(-dPitch * 0.3, -0.016, 0.016), 9, dt);

    if (!visible || !item) {
      rig.show(null);
      return;
    }
    rig.show(item);
    const pose = viewModelPose(item, held.raise, {
      time: runtime.time.real,
      bob: p.distanceWalked * 4.2,
      pace: p.grounded ? p.speed / PLAYER.walkSpeed : 0,
      swayX: L.swayX,
      swayY: L.swayY,
    });
    rig.root.position.set(pose.x, pose.y, pose.z);
    rig.root.rotation.set(pose.rx, pose.ry, pose.rz, 'YXZ');
    rig.root.scale.setScalar(VIEW_SCALE[item]);

    // Follow the daylight so a tool held at night is not lit like noon.
    const light = 0.3 + 0.7 * runtime.time.daylight;
    if (rig.hemi) rig.hemi.intensity = 1.1 * light;
    if (rig.sun) rig.sun.intensity = 1.7 * light;
    if (rig.material instanceof MeshBasicMaterial) rig.material.color.setScalar(0.4 + 0.6 * runtime.time.daylight);
  }, 0.5);

  return null;
}

/** Items for which a prop exists; used by tests to check every tool has one. */
export const VIEW_MODEL_ITEMS: readonly HeldItem[] = HELD_ITEMS;
