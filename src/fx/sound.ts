/**
 * Procedural combat sound.
 *
 * Entirely synthesised through the Web Audio API — no external files, nothing
 * to hotlink or preload. Starts muted and stays muted until the GM explicitly
 * enables it, because a roleplay session is usually already on voice chat.
 *
 * Sound never carries information on its own; every cue it marks also has a
 * visual and a screen-reader announcement.
 */

const STORAGE_KEY = "heimao.sound.enabled.v2";

export type SoundCue =
  | "phase"
  | "damage"
  | "shieldHit"
  | "shieldBreak"
  | "heal"
  | "abilityReady"
  | "chargeComplete"
  | "defeated";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

export function isSoundEnabled(): boolean {
  return enabled;
}

export function loadSoundPreference(): boolean {
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

/**
 * Enable or disable audio. Enabling must happen inside a user gesture so the
 * browser lets the context start.
 */
export function setSoundEnabled(next: boolean): boolean {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* preference is non-critical */
  }
  if (next) {
    ensureContext();
    void ctx?.resume();
  }
  return enabled;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.16; // deliberately quiet — this plays under conversation
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

interface ToneSpec {
  freq: number;
  toFreq?: number;
  type?: OscillatorType;
  duration: number;
  gain?: number;
  delay?: number;
  /** Adds a short noise burst for impact texture. */
  noise?: number;
}

function tone(spec: ToneSpec): void {
  const audio = ensureContext();
  if (!audio || !master) return;

  const t0 = audio.currentTime + (spec.delay ?? 0);
  const dur = spec.duration;
  const peak = spec.gain ?? 0.5;

  const osc = audio.createOscillator();
  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(spec.freq, t0);
  if (spec.toFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.toFreq), t0 + dur);
  }

  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);

  if (spec.noise) {
    const frames = Math.floor(audio.sampleRate * Math.min(dur, 0.18));
    const buffer = audio.createBuffer(1, frames, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const ng = audio.createGain();
    ng.gain.value = spec.noise;
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = spec.freq * 2;
    src.connect(filter).connect(ng).connect(master);
    src.start(t0);
  }
}

/** Play a cue. No-ops silently when audio is off or unavailable. */
export function playCue(cue: SoundCue): void {
  if (!enabled) return;
  switch (cue) {
    case "phase":
      // A struck bowl: low fundamental with a fifth above it.
      tone({ freq: 196, toFreq: 174, type: "sine", duration: 0.85, gain: 0.4 });
      tone({ freq: 294, type: "sine", duration: 0.6, gain: 0.16, delay: 0.04 });
      break;
    case "damage":
      tone({ freq: 150, toFreq: 55, type: "triangle", duration: 0.2, gain: 0.5, noise: 0.1 });
      break;
    case "shieldHit":
      tone({ freq: 620, toFreq: 480, type: "sine", duration: 0.16, gain: 0.3 });
      break;
    case "shieldBreak":
      tone({ freq: 900, toFreq: 180, type: "square", duration: 0.3, gain: 0.28, noise: 0.14 });
      break;
    case "heal":
      // Rising third — clearly the opposite gesture to damage.
      tone({ freq: 392, toFreq: 587, type: "sine", duration: 0.42, gain: 0.32 });
      break;
    case "abilityReady":
      tone({ freq: 784, type: "sine", duration: 0.14, gain: 0.22 });
      tone({ freq: 1046, type: "sine", duration: 0.16, gain: 0.18, delay: 0.08 });
      break;
    case "chargeComplete":
      tone({ freq: 330, toFreq: 660, type: "triangle", duration: 0.5, gain: 0.3 });
      break;
    case "defeated":
      tone({ freq: 130, toFreq: 48, type: "sine", duration: 0.9, gain: 0.42 });
      break;
  }
}

/** Release audio resources (used on unmount in tests and teardown). */
export function disposeSound(): void {
  try {
    void ctx?.close();
  } catch {
    /* nothing to do */
  }
  ctx = null;
  master = null;
}
