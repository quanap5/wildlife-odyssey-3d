/** Time-of-day and weather model (pure). Rendering reads the resulting state. */
import { clamp01, lerp, smoothstep } from '../../utils/math';
import type { WeatherState } from '../../store/runtime';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface EnvironmentState {
  sunDir: [number, number, number];
  /** 0 night .. 1 day. */
  daylight: number;
  /** Direction of the key light (sun by day, moon at night). */
  lightDir: [number, number, number];
  sunColor: Rgb;
  skyTop: Rgb;
  skyHorizon: Rgb;
  sunIntensity: number;
  ambientIntensity: number;
  fogDensity: number;
  /** Overall scene light for photo scoring, 0..1. */
  lightLevel: number;
  night: number;
}

const rgb = (r: number, g: number, b: number): Rgb => ({ r: r / 255, g: g / 255, b: b / 255 });
const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });

const DAY_TOP = rgb(52, 118, 212);
const DAY_HORIZON = rgb(176, 208, 236);
const DUSK_TOP = rgb(62, 78, 150);
const DUSK_HORIZON = rgb(246, 164, 96);
const NIGHT_TOP = rgb(6, 10, 26);
const NIGHT_HORIZON = rgb(20, 28, 52);
const OVERCAST = rgb(150, 158, 164);
const SUN_HIGH = rgb(255, 246, 228);
const SUN_LOW = rgb(255, 170, 104);
const MOON = rgb(150, 178, 230);

/** Sun direction for an hour of day; rises in the east (+x), sets in the west. */
export function sunDirection(hour: number): [number, number, number] {
  const a = ((hour - 6) / 12) * Math.PI;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const z = 0.38;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

export function daylightFactor(hour: number): number {
  return clamp01((sunDirection(hour)[1] + 0.1) / 0.36);
}

export interface WeatherLevels {
  rain: number;
  fog: number;
  cloud: number;
}

export const WEATHER_TARGETS: Record<WeatherState, WeatherLevels> = {
  clear: { rain: 0, fog: 0, cloud: 0.22 },
  cloudy: { rain: 0, fog: 0.05, cloud: 0.78 },
  rain: { rain: 1, fog: 0.18, cloud: 0.95 },
  fog: { rain: 0, fog: 1, cloud: 0.6 },
};

export function computeEnvironment(hour: number, w: WeatherLevels): EnvironmentState {
  const sunDir = sunDirection(hour);
  const elev = sunDir[1];
  const daylight = clamp01((elev + 0.1) / 0.36);
  const night = 1 - daylight;
  // Golden hour: strongest when the sun is just above the horizon.
  const golden = smoothstep(0.42, 0.02, elev) * smoothstep(-0.16, 0.02, elev);
  let top = mix(NIGHT_TOP, DAY_TOP, daylight);
  let horizon = mix(NIGHT_HORIZON, DAY_HORIZON, daylight);
  top = mix(top, DUSK_TOP, golden * 0.7);
  horizon = mix(horizon, DUSK_HORIZON, golden * 0.85);
  const grey = clamp01(w.cloud * 0.75 + w.fog * 0.6);
  const overcast: Rgb = { r: OVERCAST.r * (0.12 + 0.88 * daylight), g: OVERCAST.g * (0.12 + 0.88 * daylight), b: OVERCAST.b * (0.14 + 0.86 * daylight) };
  top = mix(top, overcast, grey * 0.8);
  horizon = mix(horizon, overcast, grey * 0.7);
  const sunColor = elev > 0 ? mix(SUN_LOW, SUN_HIGH, smoothstep(0.02, 0.45, elev)) : MOON;
  const cover = 1 - w.cloud * 0.6 - w.fog * 0.25;
  const sunIntensity = elev > -0.05 ? 3.1 * daylight * cover : 0.28 * cover;
  const ambientIntensity = (0.16 + 0.95 * daylight) * (1 - w.cloud * 0.18);
  const lightDir: [number, number, number] = elev > -0.05 ? sunDir : [-sunDir[0], Math.max(0.35, -sunDir[1]), -sunDir[2]];
  return {
    sunDir,
    daylight,
    lightDir,
    sunColor,
    skyTop: top,
    skyHorizon: horizon,
    sunIntensity,
    ambientIntensity,
    fogDensity: 0.0015 + w.fog * 0.02 + w.rain * 0.0035 + night * 0.0006,
    lightLevel: clamp01(daylight * (1 - w.cloud * 0.28 - w.fog * 0.2 - w.rain * 0.1) + 0.04),
    night,
  };
}

/** Advances the clock. `dayMinutes` real minutes per in-game day; 0 = paused. */
export function advanceHour(hour: number, dtSeconds: number, dayMinutes: number): number {
  if (dayMinutes <= 0) return hour;
  return (hour + (dtSeconds / (dayMinutes * 60)) * 24) % 24;
}

/** Deterministic-ish weather sequence: pick the next state from a roll. */
export function nextWeather(current: WeatherState, roll: number): WeatherState {
  const table: [WeatherState, number][] = [
    ['clear', 0.5],
    ['cloudy', 0.25],
    ['rain', 0.13],
    ['fog', 0.12],
  ];
  const options = table.filter(([s]) => s !== current);
  const total = options.reduce((a, [, w]) => a + w, 0);
  let r = roll * total;
  for (const [s, w] of options) {
    r -= w;
    if (r <= 0) return s;
  }
  return 'clear';
}
