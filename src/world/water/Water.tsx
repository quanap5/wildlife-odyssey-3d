/**
 * Water rendering: one shader surface for river, lake and plunge pool whose
 * colour, transparency and shoreline foam come from the real terrain depth
 * (baked into a texture), plus the waterfall ribbon and its mist.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RedFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
} from 'three';
import { WORLD } from '../../config';
import { runtime } from '../../store/runtime';
import { getWorld } from '../terrain/heightmap';
import { WATERFALL } from '../terrain/layout';
import { computeEnvironment } from '../weather/environment';

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}`;

const waterVertex = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFragment = /* glsl */ `
varying vec3 vWorld;
uniform float uTime;
uniform sampler2D uHeight;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uLight;
uniform float uRain;
#include <fog_pars_fragment>
${NOISE}
float wave(vec2 p) {
  return noise(p * 0.42 + vec2(uTime * 0.3, uTime * 0.18)) * 0.5
       + noise(p * 1.15 - vec2(uTime * 0.42, uTime * 0.28)) * 0.27
       + noise(p * 3.1 + vec2(uTime * 0.8, -uTime * 0.55)) * 0.13
       + noise(p * 7.7 - vec2(uTime * 1.3, uTime * 0.9)) * (0.05 + uRain * 0.22);
}
void main() {
  vec2 uv = (vWorld.xz + ${WORLD.half.toFixed(1)}) / ${WORLD.size.toFixed(1)};
  float terrain = texture2D(uHeight, uv).r * 16.0 - 8.0;
  float depth = -terrain;
  if (depth < -0.03) discard;
  vec2 p = vWorld.xz;
  float e = 0.18;
  float h0 = wave(p);
  vec3 n = normalize(vec3((h0 - wave(p + vec2(e, 0.0))) * 0.85, e * 2.6, (h0 - wave(p + vec2(0.0, e))) * 0.85));
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 col;
  float alpha;
  if (gl_FrontFacing) {
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = reflect(-v, n);
    vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(r.y, 0.0, 1.0), 0.55)) * 0.92;
    // Near the banks the surface mirrors the dark vegetation, not the open sky.
    float bank = smoothstep(2.6, 0.15, depth) * smoothstep(0.75, 0.1, r.y);
    sky = mix(sky, vec3(0.05, 0.11, 0.06) * (0.15 + 0.85 * uLight), bank * 0.72);
    float sd = max(dot(r, uSunDir), 0.0);
    float spec = (pow(sd, 260.0) + pow(sd, 36.0) * 0.045) * step(0.0, uSunDir.y);
    float dT = smoothstep(0.0, 3.2, depth);
    vec3 body = mix(uShallow, uDeep, dT) * (0.12 + 0.88 * uLight);
    col = mix(body, sky, clamp(fres, 0.0, 1.0)) + uSunColor * spec * 2.2;
    alpha = mix(0.22, 0.9, smoothstep(0.0, 2.0, depth));
    alpha = max(alpha, fres * 0.85);
    float lap = 0.5 + 0.5 * sin(depth * 34.0 - uTime * 1.9 + noise(p * 1.8) * 6.0);
    float foam = smoothstep(0.24, 0.0, depth) * lap * lap + smoothstep(0.045, 0.0, depth) * 0.8;
    foam = clamp(foam, 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.95, 0.93) * (0.25 + 0.75 * uLight), foam * 0.7);
    alpha = max(alpha, foam * 0.65);
  } else {
    // Seen from below: bright, rippling window to the sky.
    float ripple = wave(p * 1.5);
    col = mix(uShallow, uSkyHorizon, 0.55 + ripple * 0.35) * (0.2 + 0.8 * uLight);
    alpha = 0.72;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const fallVertex = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fallFragment = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uLight;
#include <fog_pars_fragment>
${NOISE}
void main() {
  float streak = noise(vec2(vUv.x * 26.0, vUv.y * 0.9 - uTime * 3.2)) * 0.6 + noise(vec2(vUv.x * 60.0, vUv.y * 2.4 - uTime * 5.5)) * 0.4;
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  vec3 col = mix(vec3(0.62, 0.78, 0.86), vec3(1.0), smoothstep(0.35, 0.8, streak)) * (0.07 + 0.93 * uLight);
  float alpha = (0.55 + 0.45 * streak) * edge;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function makeHeightTexture(): DataTexture {
  const world = getWorld();
  const n = WORLD.grid;
  const data = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) data[i] = Math.max(0, Math.min(255, Math.round(((world.heights[i]! + 8) / 16) * 255)));
  const tex = new DataTexture(data, n, n, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  // Rows are 513 bytes wide, which is not a multiple of the default 4-byte alignment.
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Ribbon that follows the cliff face from the lip of the falls to the pool. */
function makeWaterfallGeometry(): { geometry: BufferGeometry; top: Vector3; base: Vector3 } {
  const world = getWorld();
  const steps = 26;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let run = 0;
  let prevY = 0;
  let prevZ = 0;
  const half = WATERFALL.width / 2;
  for (let k = 0; k <= steps; k++) {
    const z = WATERFALL.topZ + ((WATERFALL.bottomZ - WATERFALL.topZ) * k) / steps;
    const y = Math.max(world.heightAt(WATERFALL.x, z), 0) + 0.45;
    if (k > 0) run += Math.hypot(y - prevY, z - prevZ);
    prevY = y;
    prevZ = z;
    const w = half * (0.75 + 0.25 * (k / steps));
    pos.push(WATERFALL.x - w, y, z, WATERFALL.x + w, y, z);
    uv.push(0, run * 0.35, 1, run * 0.35);
    if (k < steps) {
      const a = k * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return {
    geometry,
    top: new Vector3(WATERFALL.x, Math.max(world.heightAt(WATERFALL.x, WATERFALL.topZ), 0), WATERFALL.topZ),
    base: new Vector3(WATERFALL.x, 0.3, WATERFALL.bottomZ + 2),
  };
}

function makeMistTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const MIST = 90;

export function Water(): React.JSX.Element {
  const mistRef = useRef<Points>(null);
  const res = useMemo(() => {
    const heightTex = makeHeightTexture();
    const water = new ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uHeight: { value: null },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color('#fff4e0') },
          uSkyTop: { value: new Color('#3f7fd6') },
          uSkyHorizon: { value: new Color('#b7d6ee') },
          uDeep: { value: new Color('#0d3d45') },
          uShallow: { value: new Color('#5aa79a') },
          uLight: { value: 1 },
          uRain: { value: 0 },
        },
      ]),
    });
    water.uniforms.uHeight!.value = heightTex;
    const plane = new PlaneGeometry(WORLD.size, WORLD.size, 1, 1);
    plane.rotateX(-Math.PI / 2);
    const fall = makeWaterfallGeometry();
    const fallMat = new ShaderMaterial({
      vertexShader: fallVertex,
      fragmentShader: fallFragment,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uLight: { value: 1 } }]),
    });
    const mistGeo = new BufferGeometry();
    const mistPos = new Float32Array(MIST * 3);
    const mistSeed = new Float32Array(MIST * 4);
    for (let i = 0; i < MIST; i++) {
      mistSeed[i * 4] = (Math.random() - 0.5) * WATERFALL.width * 1.6;
      mistSeed[i * 4 + 1] = Math.random();
      mistSeed[i * 4 + 2] = Math.random() * 9;
      mistSeed[i * 4 + 3] = 0.4 + Math.random() * 0.8;
    }
    mistGeo.setAttribute('position', new BufferAttribute(mistPos, 3));
    const mistTex = makeMistTexture();
    const mistMat = new PointsMaterial({ map: mistTex, size: 7, transparent: true, opacity: 0.16, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, fog: true });
    return { heightTex, water, plane, fall, fallMat, mistGeo, mistPos, mistSeed, mistTex, mistMat };
  }, []);

  useEffect(
    () => () => {
      res.heightTex.dispose();
      res.water.dispose();
      res.plane.dispose();
      res.fall.geometry.dispose();
      res.fallMat.dispose();
      res.mistGeo.dispose();
      res.mistTex.dispose();
      res.mistMat.dispose();
    },
    [res],
  );

  useFrame(() => {
    const t = runtime.time.sim;
    const env = computeEnvironment(runtime.time.hour, runtime.weather);
    const u = res.water.uniforms;
    u.uTime!.value = t;
    (u.uSunDir!.value as Vector3).copy(runtime.time.sunDir);
    (u.uSunColor!.value as Color).setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b, SRGBColorSpace);
    (u.uSkyTop!.value as Color).setRGB(env.skyTop.r, env.skyTop.g, env.skyTop.b, SRGBColorSpace);
    (u.uSkyHorizon!.value as Color).setRGB(env.skyHorizon.r, env.skyHorizon.g, env.skyHorizon.b, SRGBColorSpace);
    u.uLight!.value = env.lightLevel;
    u.uRain!.value = runtime.weather.rain;
    res.fallMat.uniforms.uTime!.value = t;
    res.fallMat.uniforms.uLight!.value = env.lightLevel;
    res.mistMat.opacity = 0.06 + 0.12 * env.lightLevel;
    // Mist drifts up and outwards from the plunge point.
    const p = res.mistPos;
    for (let i = 0; i < MIST; i++) {
      const life = (res.mistSeed[i * 4 + 1]! + t * 0.11 * res.mistSeed[i * 4 + 3]!) % 1;
      p[i * 3] = res.fall.base.x + res.mistSeed[i * 4]! * (0.6 + life);
      p[i * 3 + 1] = 0.4 + life * 9 + Math.sin(t * 0.6 + i) * 0.4;
      p[i * 3 + 2] = res.fall.base.z + res.mistSeed[i * 4 + 2]! * life + 1;
    }
    (res.mistGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    res.mistGeo.computeBoundingSphere();
  }, -3);

  return (
    <group name="water">
      <mesh geometry={res.plane} material={res.water} position={[0, WORLD.waterLevel, 0]} renderOrder={2} />
      <mesh geometry={res.fall.geometry} material={res.fallMat} renderOrder={3} />
      <points ref={mistRef} geometry={res.mistGeo} material={res.mistMat} renderOrder={4} />
    </group>
  );
}
