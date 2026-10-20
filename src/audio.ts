import { DURATION, RESET_PULSE, type Trajectory } from "./sim/physics.ts";

const RATE = 44100;
const SEED = 20261020;

export type Score = {
  unlock: () => Promise<void>;
  play: (from: number) => void;
  pause: () => void;
  playingTime: (fallback: number) => number;
  setGains: (music: number, effects: number, muted: boolean) => void;
  dispose: () => void;
};

export async function createScore(tr: Trajectory, onEnded: () => void): Promise<Score> {
  const musicData = renderMusic();
  const effectData = renderEffects(tr);
  let music: AudioBuffer | null = null;
  let effects: AudioBuffer | null = null;
  let ctx: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let effectGain: GainNode | null = null;
  let master: GainNode | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let effectSource: AudioBufferSourceNode | null = null;
  let playId = 0;
  let startedAt = 0;
  let offset = 0;
  let musicLevel = 0.7;
  let effectLevel = 0.8;
  let muted = false;

  function applyGains() {
    if (!musicGain || !effectGain || !master) return;
    musicGain.gain.value = musicLevel;
    effectGain.gain.value = effectLevel;
    master.gain.value = muted ? 0 : 0.9;
  }

  async function unlock() {
    if (!ctx) {
      const context = new AudioContext();
      ctx = context;
      music = makeBuffer(context, musicData);
      effects = makeBuffer(context, effectData);
      master = context.createGain();
      musicGain = context.createGain();
      effectGain = context.createGain();
      musicGain.connect(master);
      effectGain.connect(master);
      master.connect(context.destination);
      applyGains();
    }
    if (ctx.state === "suspended") await ctx.resume();
  }

  function stopSources() {
    playId += 1;
    if (musicSource) {
      try { musicSource.stop(); } catch { /* already stopped */ }
      musicSource.disconnect();
      musicSource = null;
    }
    if (effectSource) {
      try { effectSource.stop(); } catch { /* already stopped */ }
      effectSource.disconnect();
      effectSource = null;
    }
  }

  function play(from: number) {
    if (!ctx || !musicGain || !effectGain || !music || !effects) return;
    stopSources();
    const id = playId;
    const start = Math.min(DURATION, Math.max(0, from));
    offset = start;
    startedAt = ctx.currentTime;
    const musicNode = ctx.createBufferSource();
    musicNode.buffer = music;
    musicNode.connect(musicGain);
    musicNode.onended = () => {
      if (id === playId) onEnded();
    };
    const effectNode = ctx.createBufferSource();
    effectNode.buffer = effects;
    effectNode.connect(effectGain);
    if (start < DURATION) {
      musicNode.start(0, start, DURATION - start);
      effectNode.start(0, start, DURATION - start);
    }
    musicSource = musicNode;
    effectSource = effectNode;
  }

  return {
    unlock,
    play,
    pause: () => stopSources(),
    playingTime: (fallback) => (ctx && musicSource ? offset + (ctx.currentTime - startedAt) : fallback),
    setGains: (musicValue, effectsValue, mute) => {
      musicLevel = musicValue;
      effectLevel = effectsValue;
      muted = mute;
      applyGains();
    },
    dispose: () => {
      stopSources();
      void ctx?.close();
    },
  };
}

function renderMusic(): Float32Array {
  const length = Math.floor(RATE * DURATION);
  const data = new Float32Array(length);
  const rand = mulberry32(SEED);
  let noise = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    const drone = 0.34 * Math.sin(2 * Math.PI * 73.42 * t)
      + 0.16 * Math.sin(2 * Math.PI * 110 * t)
      + 0.08 * Math.sin(2 * Math.PI * 164.81 * t);
    const tremolo = 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.07 * t);
    noise += (rand() * 2 - 1 - noise) * 0.02;
    const pulse = Math.exp(-(t % 4) * 3.2) * Math.sin(2 * Math.PI * 220 * t) * 0.05;
    let sample = drone * tremolo + noise * 0.35 + pulse;
    const fadeIn = Math.min(1, t / 0.6);
    const fadeOut = Math.min(1, Math.max(0, (DURATION - t) / 0.9));
    sample *= fadeIn * fadeOut;
    data[i] = Math.tanh(sample * 1.15) * 0.32;
  }
  return data;
}

function renderEffects(tr: Trajectory): Float32Array {
  const length = Math.floor(RATE * DURATION);
  const data = new Float32Array(length);
  const rand = mulberry32(SEED + 17);
  let noise = 0;
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    noise += (rand() * 2 - 1 - noise) * 0.08;
    const loading = t >= 10 && t <= 25 ? Math.abs(Math.sin(Math.PI * (t - 10) / 15)) : 0;
    data[i] += noise * 0.045 * loading;
  }
  for (const time of tr.snapTimes) {
    if (time > 0) addChirp(data, time, 480, 170, 0.26, 0.22);
  }
  addChirp(data, RESET_PULSE.t0, 190, 420, 0.34, 0.16);
  const fade = Math.floor(RATE * 0.8);
  for (let i = 0; i < fade; i++) data[length - 1 - i] *= i / fade;
  return data;
}

function addChirp(data: Float32Array, start: number, f0: number, f1: number, duration: number, amplitude: number) {
  const i0 = Math.floor(start * RATE);
  const n = Math.floor(duration * RATE);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const index = i0 + i;
    if (index < 0 || index >= data.length) continue;
    const u = i / n;
    const freq = f0 + (f1 - f0) * u;
    phase += (2 * Math.PI * freq) / RATE;
    data[index] += Math.sin(phase) * Math.exp(-3.4 * u) * amplitude;
  }
}

function makeBuffer(context: AudioContext, data: Float32Array): AudioBuffer {
  const buffer = context.createBuffer(1, data.length, RATE);
  buffer.getChannelData(0).set(data);
  return buffer;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
