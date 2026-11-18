/**
 * Air-borne detail that makes the scene feel alive: drifting pollen and dust
 * in daylight, leaves falling under the forest canopy, fireflies after dark.
 * One Points object; all motion is computed in the vertex shader from a seed
 * per particle, wrapped into a box that follows the camera, so it costs no
 * CPU per frame.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial, Vector3 } from 'three';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { damp } from '../../utils/math';
import { mulberry32 } from '../../utils/rng';

const vertex = /* glsl */ `
attribute vec3 aSeed;
attribute float aKind;
uniform float uTime;
uniform vec3 uCam;
uniform float uPx;
uniform float uDay;
uniform float uNight;
uniform float uForest;
uniform float uRain;
varying float vAlpha;
varying float vKind;
varying float vSpin;
void main() {
  vec3 box = vec3(34.0, 15.0, 34.0);
  vec3 p = aSeed * box;
  float k = aKind;
  float t = uTime;
  vec3 vel = k < 0.5 ? vec3(0.22, 0.03, 0.1) : (k < 1.5 ? vec3(0.45, -0.85, 0.25) : vec3(0.05, 0.0, 0.03));
  p += vel * t * (0.55 + aSeed.x * 0.9);
  float sway = k < 0.5 ? 0.35 : (k < 1.5 ? 1.1 : 1.5);
  p.x += sin(t * 0.7 + aSeed.y * 40.0) * sway;
  p.z += cos(t * 0.5 + aSeed.x * 40.0) * sway;
  p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
  if (k > 1.5) {
    // Fireflies keep to the first couple of metres above the ground.
    p.y = uCam.y - 1.5 + aSeed.y * 2.6 + sin(t * 0.9 + aSeed.z * 30.0) * 0.35;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float size = k < 0.5 ? 0.022 + aSeed.z * 0.022 : (k < 1.5 ? 0.16 + aSeed.z * 0.1 : 0.07);
  gl_PointSize = clamp(size * uPx / max(d, 0.2), 0.0, 42.0);
  float fade = smoothstep(0.6, 2.2, d) * (1.0 - smoothstep(13.0, 17.0, d));
  float a = k < 0.5 ? 0.4 * uDay * (1.0 - uRain) : (k < 1.5 ? 0.95 * uForest * uDay : uNight * (1.0 - uRain) * smoothstep(0.35, 0.8, sin(t * 1.7 + aSeed.x * 60.0) * 0.5 + 0.5));
  vAlpha = a * fade;
  vKind = k;
  vSpin = t * (1.0 + aSeed.y * 2.0) + aSeed.z * 20.0;
}`;

const fragment = /* glsl */ `
uniform vec3 uSun;
varying float vAlpha;
varying float vKind;
varying float vSpin;
void main() {
  if (vAlpha < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  vec3 col;
  float a;
  if (vKind < 0.5) {
    a = smoothstep(0.5, 0.05, length(c));
    col = uSun;
  } else if (vKind < 1.5) {
    // A tumbling leaf: an ellipse that turns edge-on as it spins.
    float cs = cos(vSpin); float sn = sin(vSpin);
    vec2 q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    q.y /= 0.25 + 0.75 * abs(sin(vSpin * 0.7));
    a = step(length(q * vec2(1.0, 1.9)), 0.42);
    col = mix(vec3(0.42, 0.36, 0.1), vec3(0.3, 0.42, 0.12), fract(vSpin * 0.13)) * (0.35 + 0.65 * uSun.g);
  } else {
    float r = length(c);
    a = smoothstep(0.5, 0.0, r);
    a = a * a + smoothstep(0.12, 0.0, r);
    col = vec3(0.82, 1.0, 0.32) * 1.6;
  }
  gl_FragColor = vec4(col, a * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const COUNTS = { low: [160, 30, 50], medium: [420, 80, 110], high: [700, 130, 170] } as const;

export function Ambience(): React.JSX.Element {
  const quality = useGame((s) => s.settings.quality);
  const ref = useRef<Points>(null);
  const forest = useRef(0);

  const res = useMemo(() => {
    const counts = COUNTS[quality];
    const total = counts[0] + counts[1] + counts[2];
    const r = mulberry32(4242);
    const seed = new Float32Array(total * 3);
    const kind = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      seed[i * 3] = r();
      seed[i * 3 + 1] = r();
      seed[i * 3 + 2] = r();
      kind[i] = i < counts[0] ? 0 : i < counts[0] + counts[1] ? 1 : 2;
    }
    const geometry = new BufferGeometry();
    // Positions are computed in the shader; the attribute only sets the draw count.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seed, 3));
    geometry.setAttribute('aKind', new BufferAttribute(kind, 1));
    const make = (additive: boolean): ShaderMaterial =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uCam: { value: new Vector3() },
          uPx: { value: 600 },
          uDay: { value: 1 },
          uNight: { value: 0 },
          uForest: { value: 0 },
          uRain: { value: 0 },
          uSun: { value: new Color(1, 0.95, 0.8) },
        },
      });
    return { geometry, material: make(false) };
  }, [quality]);

  useEffect(
    () => () => {
      res.geometry.dispose();
      res.material.dispose();
    },
    [res],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const u = res.material.uniforms;
    const biome = runtime.player.biome;
    forest.current = damp(forest.current, biome === 'rainforest' || biome === 'ruins' ? 1 : 0, 0.8, dt);
    const day = runtime.time.daylight;
    u.uTime!.value = runtime.time.sim;
    (u.uCam!.value as Vector3).copy(state.camera.position);
    // Convert metres to pixels at one metre for the current projection.
    u.uPx!.value = state.size.height * state.viewport.dpr * (state.camera.projectionMatrix.elements[5] ?? 1) * 0.5;
    u.uDay!.value = Math.min(1, day * 1.4);
    u.uNight!.value = Math.max(0, 1 - day * 2.2);
    u.uForest!.value = forest.current;
    u.uRain!.value = runtime.weather.rain;
    const warm = Math.max(0, runtime.time.sunDir.y);
    (u.uSun!.value as Color).setRGB(1, 0.86 + 0.12 * warm, 0.62 + 0.3 * warm);
    const pts = ref.current;
    if (pts) pts.visible = !runtime.camera.underwater && useGame.getState().screen === 'playing';
  });

  return <points ref={ref} geometry={res.geometry} material={res.material} frustumCulled={false} renderOrder={5} />;
}
