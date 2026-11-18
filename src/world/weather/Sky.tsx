/**
 * Atmosphere: sky dome with procedural clouds, sun and stars; sun/moon and
 * ambient lights; distance fog; rain. Also advances the clock and the weather
 * and publishes the result to `runtime` for wildlife, audio and photo scoring.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { translate } from '../../i18n/translate';
import { useGame } from '../../store/gameStore';
import { runtime, type WeatherState } from '../../store/runtime';
import { damp } from '../../utils/math';
import { windUniforms } from '../../engine/rendering/windMaterial';
import { animalUniforms } from '../../entities/wildlife/models';
import { terrainUniforms } from '../terrain/terrainMaterial';
import { WEATHER_TARGETS, advanceHour, computeEnvironment, nextWeather, type Rgb } from './environment';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFragment = /* glsl */ `
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uCloud;
uniform float uNight;
uniform float uDay;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.42));
  col = mix(col, uHorizon * 0.72, clamp(-d.y * 4.0, 0.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  float clear = 1.0 - uCloud * 0.85;
  col += uSunColor * (pow(s, 1400.0) * 8.0 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.06) * clear * step(0.0, uSunDir.y + 0.06);
  // Moon and stars.
  float m = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.75, 0.82, 1.0) * pow(m, 2600.0) * 5.0 * uNight * clear;
  vec3 sd = d * 190.0;
  vec3 cell = floor(sd);
  float star = hash(cell.xy + cell.z * 13.7);
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + star * 90.0);
  col += vec3(1.0) * step(0.9965, star) * tw * uNight * clear * smoothstep(0.02, 0.25, d.y);
  // Cloud deck projected onto a plane above the viewer.
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.14) * 1.25 + vec2(uTime * 0.006, uTime * 0.0025);
    float c = fbm(p * 1.4) * 0.7 + fbm(p * 3.7 + 9.0) * 0.3;
    float density = smoothstep(0.74 - uCloud * 0.5, 0.98 - uCloud * 0.36, c) * smoothstep(0.0, 0.16, d.y);
    vec3 lit = mix(vec3(1.0), vec3(0.5, 0.53, 0.57), uCloud * 0.75);
    vec3 cloudCol = lit * (0.1 + 0.9 * uDay) + uSunColor * pow(s, 6.0) * 0.5 * uDay;
    cloudCol = mix(cloudCol, uHorizon, 0.25);
    col = mix(col, cloudCol, density * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const RAIN_COUNT = 1400;
const setColor = (c: Color, v: Rgb): Color => c.setRGB(v.r, v.g, v.b, SRGBColorSpace);

export function Sky(): React.JSX.Element {
  const { scene, camera } = useThree();
  const dayMinutes = useGame((s) => s.settings.dayMinutes);
  const weatherMode = useGame((s) => s.weatherMode);
  const shadows = useGame((s) => s.settings.shadows);
  const sunRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const domeRef = useRef<Mesh>(null);
  const rainRef = useRef<LineSegments>(null);

  const res = useMemo(() => {
    const dome = new ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uTime: { value: 0 },
        uCloud: { value: 0.2 },
        uNight: { value: 0 },
        uDay: { value: 1 },
      },
    });
    const domeGeo = new SphereGeometry(1, 32, 20);
    const rainGeo = new BufferGeometry();
    const rainPos = new Float32Array(RAIN_COUNT * 6);
    const seeds = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 36;
      seeds[i * 3 + 1] = Math.random() * 22;
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    rainGeo.setAttribute('position', new BufferAttribute(rainPos, 3));
    const rainMat = new LineBasicMaterial({ color: '#c9d6e2', transparent: true, opacity: 0, depthWrite: false });
    return { dome, domeGeo, rainGeo, rainPos, seeds, rainMat, fog: new FogExp2('#b7d6ee', 0.002), fogColor: new Color(), weatherTimer: 60 + Math.random() * 60, target: new Vector3() };
  }, []);

  useEffect(() => {
    scene.fog = res.fog;
    return () => {
      scene.fog = null;
      res.dome.dispose();
      res.domeGeo.dispose();
      res.rainGeo.dispose();
      res.rainMat.dispose();
    };
  }, [scene, res]);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const size = shadows === 'high' ? 2048 : 1024;
    sun.castShadow = shadows !== 'off';
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    const cam = sun.shadow.camera;
    const span = shadows === 'high' ? 70 : 48;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 1;
    cam.far = 320;
    cam.updateProjectionMatrix();
    // Shade under a canopy is dappled, not black: let a share of the sun through.
    sun.shadow.intensity = 0.72;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.7;
  }, [shadows]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = runtime.time;
    const w = runtime.weather;
    if (!runtime.paused) t.hour = advanceHour(t.hour, dt * t.scale, dayMinutes);

    // Weather: fixed by the player, or drifting on its own.
    if (weatherMode !== 'auto') {
      w.state = weatherMode;
    } else if (!runtime.paused) {
      res.weatherTimer -= dt;
      if (res.weatherTimer <= 0) {
        w.state = nextWeather(w.state, Math.random()) as WeatherState;
        res.weatherTimer = 110 + Math.random() * 140;
        useGame.getState().notify('notify.weather', { name: weatherLabel(w.state) });
      }
    }
    const targets = WEATHER_TARGETS[w.state];
    w.rain = damp(w.rain, targets.rain, 0.5, dt);
    w.fog = damp(w.fog, targets.fog, 0.35, dt);
    w.cloud = damp(w.cloud, targets.cloud, 0.3, dt);

    const env = computeEnvironment(t.hour, w);
    t.daylight = env.lightLevel;
    t.sunDir.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]);

    // Shared shader inputs: leaf translucency and bed caustics follow the sun.
    windUniforms.uSunDir.value.copy(t.sunDir);
    setColor(windUniforms.uSunGlow.value, env.sunColor).multiplyScalar(env.sunDir[1] > 0 ? env.daylight * (1 - w.cloud * 0.6) * 0.9 : 0);
    terrainUniforms.uTime.value = t.sim;
    terrainUniforms.uLight.value = env.lightLevel;
    setColor(animalUniforms.uRim.value, env.skyTop).lerp(WHITE, 0.5).multiplyScalar(0.12 + 0.55 * env.daylight);

    const u = res.dome.uniforms;
    setColor(u.uTop!.value as Color, env.skyTop);
    setColor(u.uHorizon!.value as Color, env.skyHorizon);
    setColor(u.uSunColor!.value as Color, env.sunColor);
    (u.uSunDir!.value as Vector3).copy(t.sunDir);
    u.uTime!.value = t.sim;
    u.uCloud!.value = w.cloud;
    u.uNight!.value = env.night;
    u.uDay!.value = env.daylight;

    const underwater = runtime.camera.underwater;
    if (underwater) {
      res.fog.color.setRGB(0.05, 0.26 * (0.25 + 0.75 * env.daylight), 0.27 * (0.25 + 0.75 * env.daylight));
      res.fog.density = 0.085;
    } else {
      setColor(res.fog.color, env.skyHorizon);
      // A touch more haze than the physical model: distance should read as depth.
      res.fog.density = env.fogDensity * 1.3;
    }

    const dome = domeRef.current;
    if (dome) {
      dome.position.copy(camera.position);
      dome.scale.setScalar(camera.far * 0.9);
    }
    const sun = sunRef.current;
    if (sun) {
      const p = runtime.player.pos;
      // Snap the shadow frustum to whole metres to stop shadow shimmer.
      res.target.set(Math.round(p.x), p.y, Math.round(p.z));
      sun.position.set(res.target.x + env.lightDir[0] * 150, res.target.y + env.lightDir[1] * 150, res.target.z + env.lightDir[2] * 150);
      sun.target.position.copy(res.target);
      sun.target.updateMatrixWorld();
      sun.intensity = env.sunIntensity * (underwater ? 0.5 : 1);
      setColor(sun.color, env.sunColor);
    }
    const hemi = hemiRef.current;
    if (hemi) {
      // Lifted skylight keeps the forest floor readable under a closed canopy.
      hemi.intensity = env.ambientIntensity * 1.45;
      setColor(hemi.color, env.skyTop).lerp(WHITE, 0.45);
      setColor(hemi.groundColor, GROUND).multiplyScalar(0.3 + 0.7 * env.daylight);
    }

    // Rain streaks fall through a box that follows the camera.
    const rain = rainRef.current;
    if (rain) {
      res.rainMat.opacity = w.rain * 0.4;
      rain.visible = w.rain > 0.02 && !underwater;
      if (rain.visible) {
        const fall = t.sim * 17;
        const pos = res.rainPos;
        for (let i = 0; i < RAIN_COUNT; i++) {
          const x = res.seeds[i * 3]!;
          const z = res.seeds[i * 3 + 2]!;
          const y = 22 - ((res.seeds[i * 3 + 1]! + fall) % 22);
          pos[i * 6] = x;
          pos[i * 6 + 1] = y;
          pos[i * 6 + 2] = z;
          pos[i * 6 + 3] = x + 0.06;
          pos[i * 6 + 4] = y - 0.55;
          pos[i * 6 + 5] = z;
        }
        (res.rainGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
        rain.position.set(camera.position.x, camera.position.y - 8, camera.position.z);
      }
    }
  }, -6);

  return (
    <>
      <mesh ref={domeRef} geometry={res.domeGeo} material={res.dome} frustumCulled={false} renderOrder={-10} />
      <directionalLight ref={sunRef} castShadow />
      <hemisphereLight ref={hemiRef} />
      <lineSegments ref={rainRef} geometry={res.rainGeo} material={res.rainMat} frustumCulled={false} visible={false} />
    </>
  );
}

const WHITE = new Color('#ffffff');
const GROUND: Rgb = { r: 0.4, g: 0.42, b: 0.27 };

function weatherLabel(state: WeatherState): string {
  return translate(useGame.getState().settings.language, `settings.weather.${state}`);
}
