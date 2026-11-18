/**
 * Owns the render step. Advances the simulation clock, drives wind, applies
 * exposure and resolution scaling, renders (optionally through a depth-of-field
 * pass in photo mode), services photo capture requests with real pixels at the
 * requested resolution, and records performance metrics.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, Vector2, type PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { APERTURES } from '../../config';
import { windUniforms } from './windMaterial';

const _size = new Vector2();

/** Rolling frame statistics used by the overlay and adaptive resolution. */
export class FrameStats {
  private acc = 0;
  private frames = 0;
  fps = 60;
  frameMs = 16.7;
  /** Seconds spent continuously below / above the adaptive thresholds. */
  slowFor = 0;
  fastFor = 0;

  tick(dt: number): boolean {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return false;
    this.fps = this.frames / this.acc;
    this.frameMs = (this.acc / this.frames) * 1000;
    this.slowFor = this.fps < 27 ? this.slowFor + this.acc : 0;
    this.fastFor = this.fps > 56 ? this.fastFor + this.acc : 0;
    this.acc = 0;
    this.frames = 0;
    return true;
  }
}

/** Decides the next adaptive render scale (pure, unit-tested). */
export function nextAdaptiveScale(current: number, slowFor: number, fastFor: number): number {
  if (slowFor >= 3 && current > 0.5) return Math.max(0.5, current - 0.125);
  if (fastFor >= 12 && current < 1) return Math.min(1, current + 0.125);
  return current;
}

export function RenderLoop(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);
  const renderScale = useGame((s) => s.settings.renderScale);
  const shadows = useGame((s) => s.settings.shadows);
  const stats = useMemo(() => new FrameStats(), []);
  const adaptive = useRef(1);

  const post = useMemo(() => {
    try {
      const composer = new EffectComposer(gl);
      const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.00018, maxblur: 0.008 });
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(bokeh);
      composer.addPass(new OutputPass());
      return { composer, bokeh };
    } catch (err) {
      console.warn('[render] depth of field unavailable:', err);
      return null;
    }
  }, [gl, scene, camera]);

  useEffect(() => () => post?.composer.dispose(), [post]);

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.shadowMap.enabled = shadows !== 'off';
    gl.shadowMap.type = PCFShadowMap;
    gl.shadowMap.needsUpdate = true;
  }, [gl, shadows]);

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * renderScale * adaptive.current;
    setDpr(dpr);
    runtime.perf.renderScale = renderScale * adaptive.current;
  }, [renderScale, setDpr]);

  useEffect(() => {
    post?.composer.setPixelRatio(gl.getPixelRatio());
    post?.composer.setSize(size.width, size.height);
  }, [post, gl, size]);

  useFrame((_, rawDt) => {
    const st = useGame.getState();
    const dt = Math.min(rawDt, 0.1);
    const t = runtime.time;
    t.real += dt;
    runtime.paused = st.screen === 'playing' && st.overlay !== 'none' && st.overlay !== 'wheel';
    if (!runtime.paused) t.sim += dt * t.scale;
    windUniforms.uTime.value = t.sim;
    windUniforms.uWind.value = 1 + runtime.weather.rain * 0.9;

    const photoTool = st.screen === 'playing' && (st.tool === 'camera' || st.tool === 'video');
    gl.toneMappingExposure = 1.05 * Math.pow(2, photoTool ? runtime.camera.exposure : 0);

    const useDof = Boolean(post) && photoTool && st.dof && st.settings.quality !== 'low' && runtime.target !== null;
    const draw = (): void => {
      if (useDof && post) {
        const u = post.bokeh.uniforms as Record<string, { value: number }>;
        u.focus!.value = runtime.target ? runtime.target.distance : 30;
        u.aspect!.value = camera.aspect;
        // Longer lenses give a shallower depth of field.
        // f/4 is the reference; each stop wider doubles the blur, each stop narrower halves it.
        const fNumber = APERTURES[st.aperture] ?? 4;
        u.aperture!.value = 0.00012 * runtime.camera.zoom * (0.3 + 0.7 * runtime.focusLock) * Math.pow(4 / fNumber, 2);
        u.maxblur!.value = 0.0035 + 0.01 / fNumber;
        post.composer.render();
      } else {
        gl.render(scene, camera);
      }
    };
    // Count every pass of the frame (the depth-of-field path renders the scene twice plus two full-screen passes).
    gl.info.autoReset = false;
    gl.info.reset();
    draw();
    runtime.perf.calls = gl.info.render.calls;
    runtime.perf.triangles = gl.info.render.triangles;

    const req = runtime.capture;
    if (req) {
      runtime.capture = null;
      try {
        const out = document.createElement('canvas');
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('2D canvas unavailable');
        if (req.width <= 0 || req.height <= 0) {
          out.width = gl.domElement.width;
          out.height = gl.domElement.height;
          ctx.drawImage(gl.domElement, 0, 0);
        } else {
          // Re-render the scene at the requested resolution, then restore the view.
          gl.getSize(_size);
          const ratio = gl.getPixelRatio();
          const aspect = camera.aspect;
          try {
            gl.setPixelRatio(1);
            gl.setSize(req.width, req.height, false);
            post?.composer.setPixelRatio(1);
            post?.composer.setSize(req.width, req.height);
            camera.aspect = req.width / req.height;
            camera.updateProjectionMatrix();
            draw();
            out.width = req.width;
            out.height = req.height;
            ctx.drawImage(gl.domElement, 0, 0, req.width, req.height);
          } finally {
            gl.setPixelRatio(ratio);
            gl.setSize(_size.x, _size.y, false);
            post?.composer.setPixelRatio(ratio);
            post?.composer.setSize(_size.x, _size.y);
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
            draw();
          }
        }
        req.resolve(out);
      } catch (err) {
        req.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (stats.tick(rawDt)) {
      const perf = runtime.perf;
      perf.fps = stats.fps;
      perf.frameMs = stats.frameMs;
      perf.width = gl.domElement.width;
      perf.height = gl.domElement.height;
      // Live GPU resource counts: these must level off, or something is not being disposed.
      perf.geometries = gl.info.memory.geometries;
      perf.textures = gl.info.memory.textures;
      perf.programs = gl.info.programs?.length ?? 0;
      if (st.settings.adaptive && st.screen === 'playing' && !runtime.paused) {
        const next = nextAdaptiveScale(adaptive.current, stats.slowFor, stats.fastFor);
        if (next !== adaptive.current) {
          const lowered = next < adaptive.current;
          adaptive.current = next;
          stats.slowFor = 0;
          stats.fastFor = 0;
          setDpr(Math.min(window.devicePixelRatio || 1, 2) * st.settings.renderScale * next);
          perf.renderScale = st.settings.renderScale * next;
          if (lowered) st.notify('notify.adaptive', { n: Math.round(perf.renderScale * 100) }, 'warn');
        }
      }
    }
  }, 1);

  return null;
}
