/**
 * Fully synthesised audio (Web Audio API): layered biome ambience, animal
 * calls with distance attenuation and stereo placement, tool sounds, footsteps
 * and a generative ambient score. No audio files are shipped. The context is
 * only created from a user gesture, as browser autoplay rules require.
 */
import { clamp, clamp01 } from '../../utils/math';

export interface AmbienceMix {
  wind: number;
  insects: number;
  river: number;
  waterfall: number;
  rain: number;
  night: number;
  underwater: number;
}

export type Voice = 'whistle' | 'chatter' | 'crow' | 'honk' | 'bark' | 'croak' | 'buzz';
type LayerName = keyof Omit<AmbienceMix, 'underwater'>;

interface Layer {
  gain: GainNode;
  level: number;
}

const CHORDS = [
  [220, 277.18, 329.63, 440],
  [196, 246.94, 293.66, 392],
  [174.61, 220, 261.63, 349.23],
  [146.83, 220, 293.66, 369.99],
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private music: GainNode | null = null;
  private ambience: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private layers = new Map<LayerName, Layer>();
  private noise: AudioBuffer | null = null;
  private musicTimer = 0;
  private chord = 0;
  private volumes = { master: 0.8, music: 0.5, effects: 0.8 };
  private lastStep = 0;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a click / key handler. Safe to call repeatedly. */
  start(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.build(this.ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      console.warn('[audio] unavailable:', err);
      this.ctx = null;
    }
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(ctx.destination);
    this.fx = ctx.createGain();
    this.music = ctx.createGain();
    this.ambience = ctx.createGain();
    this.fx.connect(this.master);
    this.music.connect(this.master);
    this.ambience.connect(this.master);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const noiseLayer = (name: LayerName, type: BiquadFilterType, freq: number, q: number, lfoHz = 0): void => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambience!);
      if (lfoHz > 0) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = lfoHz;
        depth.gain.value = freq * 0.35;
        lfo.connect(depth).connect(f.frequency);
        lfo.start();
      }
      src.start(0, Math.random() * 2);
      this.layers.set(name, { gain: g, level: 0 });
    };
    noiseLayer('wind', 'lowpass', 420, 0.4, 0.09);
    noiseLayer('river', 'bandpass', 950, 0.6, 0.31);
    noiseLayer('waterfall', 'lowpass', 1500, 0.3);
    noiseLayer('rain', 'highpass', 2600, 0.5);

    // Insects: amplitude-modulated high tones (cicada drone by day, crickets at night).
    const tone = (name: LayerName, freqs: number[], amHz: number): void => {
      const g = ctx.createGain();
      g.gain.value = 0;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = amHz;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(am.gain);
      lfo.start();
      for (const fq of freqs) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fq;
        o.connect(am);
        o.start();
      }
      am.connect(g).connect(this.ambience!);
      this.layers.set(name, { gain: g, level: 0 });
    };
    tone('insects', [4180, 4420, 5230], 17);
    tone('night', [3050, 3120], 6.5);
  }

  private applyVolumes(): void {
    if (!this.master || !this.fx || !this.music || !this.ambience) return;
    this.master.gain.value = this.volumes.master;
    this.fx.gain.value = this.volumes.effects;
    this.ambience.gain.value = this.volumes.effects * 0.9;
    this.music.gain.value = this.volumes.music * 0.5;
  }

  setVolumes(master: number, music: number, effects: number): void {
    this.volumes = { master: clamp01(master), music: clamp01(music), effects: clamp01(effects) };
    this.applyVolumes();
  }

  /** Called every frame with the desired ambience mix (each 0..1). */
  update(dt: number, mix: AmbienceMix): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const scale: Record<LayerName, number> = { wind: 0.16, insects: 0.012, river: 0.2, waterfall: 0.42, rain: 0.2, night: 0.014 };
    for (const [name, layer] of this.layers) {
      const target = clamp01(mix[name]) * scale[name];
      layer.level += (target - layer.level) * Math.min(1, dt * 1.5);
      layer.gain.gain.value = layer.level;
    }
    if (this.muffle) this.muffle.frequency.value = mix.underwater > 0.5 ? 480 : 20000;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && this.volumes.music > 0.01) {
      this.musicTimer = 9 + Math.random() * 5;
      this.playChord();
    }
  }

  private playChord(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const notes = CHORDS[this.chord++ % CHORDS.length]!;
    const t = ctx.currentTime;
    for (const [i, f] of notes.entries()) {
      if (Math.random() < 0.25) continue;
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? 'sine' : 'triangle';
      o.frequency.value = f * (Math.random() < 0.2 ? 2 : 1);
      const g = ctx.createGain();
      const start = t + i * 0.6 + Math.random() * 0.4;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.09, start + 2.5);
      g.gain.linearRampToValueAtTime(0, start + 9);
      o.connect(g).connect(this.music);
      o.start(start);
      o.stop(start + 9.2);
    }
  }

  private blip(freq: number, endFreq: number, dur: number, type: OscillatorType, vol: number, delay = 0, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  shutter(): void {
    this.burst(3200, 1.2, 0.05, 0.5);
    this.burst(1400, 2, 0.07, 0.4, 'bandpass', 0.08);
  }

  scanTick(progress: number): void {
    this.blip(700 + progress * 900, 720 + progress * 900, 0.04, 'square', 0.05);
  }

  scanComplete(): void {
    this.blip(880, 880, 0.09, 'sine', 0.22);
    this.blip(1320, 1320, 0.16, 'sine', 0.22, 0.1);
  }

  discovery(): void {
    [523.25, 659.25, 783.99].forEach((f, i) => this.blip(f, f, 0.35, 'triangle', 0.16, i * 0.11));
  }

  page(): void {
    this.burst(2400, 0.8, 0.16, 0.22, 'highpass');
  }

  ui(): void {
    this.blip(620, 760, 0.06, 'sine', 0.12);
  }

  recordBeep(on: boolean): void {
    this.blip(on ? 990 : 660, on ? 990 : 660, 0.12, 'sine', 0.16);
  }

  footstep(surface: 'grass' | 'water' | 'stone', loud: number): void {
    const now = performance.now();
    if (now - this.lastStep < 120) return;
    this.lastStep = now;
    if (surface === 'water') this.burst(700, 0.5, 0.22, 0.2 * loud, 'lowpass');
    else if (surface === 'stone') this.burst(2100, 1.5, 0.06, 0.18 * loud);
    else this.burst(1300 + Math.random() * 500, 0.9, 0.09, 0.12 * loud);
  }

  /** Animal vocalisation, attenuated by distance and panned by bearing. */
  call(voice: Voice, distance: number, pan: number): void {
    const vol = clamp01(1 - distance / 95) ** 2 * 0.3;
    if (vol < 0.004) return;
    switch (voice) {
      case 'whistle': {
        const base = 2200 + Math.random() * 1400;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.blip(base * (1 + i * 0.08), base * (1.25 + Math.random() * 0.3), 0.13, 'sine', vol, i * 0.17, pan);
        break;
      }
      case 'chatter':
        for (let i = 0; i < 7; i++) this.blip(1500 + Math.random() * 300, 1100, 0.045, 'square', vol * 0.35, i * 0.07, pan);
        break;
      case 'crow':
        [520, 700, 660, 480].forEach((f, i) => this.blip(f, f * 0.92, i === 3 ? 0.5 : 0.18, 'sawtooth', vol * 0.4, i * 0.2, pan));
        break;
      case 'honk':
        this.blip(430, 300, 0.32, 'sawtooth', vol * 0.5, 0, pan);
        break;
      case 'bark':
        this.blip(520, 240, 0.16, 'sawtooth', vol * 0.55, 0, pan);
        break;
      case 'croak':
        for (let i = 0; i < 5; i++) this.blip(210, 170, 0.07, 'square', vol * 0.35, i * 0.11, pan);
        break;
      case 'buzz':
        this.blip(190, 205, 0.5, 'sawtooth', vol * 0.2, 0, pan);
        break;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.layers.clear();
  }
}

export const audio = new AudioEngine();
