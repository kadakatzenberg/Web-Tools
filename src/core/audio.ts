/**
 * The soundscape is synthesised rather than streamed: a low mountain drone,
 * moving air, and two one-shot voices used at the convergence and the climax.
 * Nothing is created until the visitor asks for sound, so no audio context is
 * ever opened without consent.
 */
export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private detuneA: OscillatorNode | null = null;
  private detuneB: OscillatorNode | null = null;
  private started = false;
  private _enabled = false;
  private targetLevel = 0.5;

  get enabled(): boolean {
    return this._enabled;
  }

  get available(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  async enable(): Promise<void> {
    if (!this.available) return;
    if (!this.started) this.build();
    await this.ctx?.resume();
    this._enabled = true;
    this.rampMaster(this.targetLevel, 2.2);
  }

  disable(): void {
    if (!this.ctx) {
      this._enabled = false;
      return;
    }
    this._enabled = false;
    this.rampMaster(0, 0.7);
    window.setTimeout(() => {
      if (!this._enabled) void this.ctx?.suspend();
    }, 820);
  }

  private rampMaster(value: number, seconds: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private build(): void {
    const Ctor = window.AudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.started = true;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // Mountain drone: two close voices under a soft filter.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.22;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.7;
    droneGain.connect(droneFilter).connect(master);

    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = 55;
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = 82.41;
    b.detune.value = -6;
    const c = ctx.createOscillator();
    c.type = 'triangle';
    c.frequency.value = 110;
    const cGain = ctx.createGain();
    cGain.gain.value = 0.05;
    a.connect(droneGain);
    b.connect(droneGain);
    c.connect(cGain).connect(droneGain);
    a.start();
    b.start();
    c.start();
    this.detuneA = a;
    this.detuneB = b;

    // Slow swell so the drone never sits still.
    const swell = ctx.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.045;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 90;
    swell.connect(swellGain).connect(droneFilter.frequency);
    swell.start();

    // Air across the ridge.
    const noise = ctx.createBufferSource();
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    noise.buffer = buffer;
    noise.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.4;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();

    const gust = ctx.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.07;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 190;
    gust.connect(gustGain).connect(windFilter.frequency);
    gust.start();

    this.droneGain = droneGain;
    this.windGain = windGain;
    this.droneFilter = droneFilter;
    this.windFilter = windFilter;
  }

  /** Moves the whole bed from settled to unsettled. */
  setMood(mood: number, intensity: number): void {
    if (!this.ctx || !this._enabled) return;
    const now = this.ctx.currentTime;
    const glide = 0.6;
    this.droneFilter?.frequency.setTargetAtTime(200 + mood * 520, now, glide);
    this.windFilter?.frequency.setTargetAtTime(360 + mood * 900, now, glide);
    this.windGain?.gain.setTargetAtTime(0.1 + intensity * 0.16 + mood * 0.12, now, glide);
    this.droneGain?.gain.setTargetAtTime(0.16 + intensity * 0.12, now, glide);
    this.detuneA?.detune.setTargetAtTime(mood * -34, now, glide);
    this.detuneB?.detune.setTargetAtTime(-6 + mood * 44, now, glide);
  }

  /** A struck resonance, used once when the systems converge. */
  bell(): void {
    if (!this.ctx || !this.master || !this._enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 6.5);
    gain.connect(this.master);

    [220, 329.6, 493.9, 659.3].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const partial = ctx.createGain();
      partial.gain.value = 1 / (index + 1.6);
      osc.connect(partial).connect(gain);
      osc.start(now);
      osc.stop(now + 7);
    });
  }

  /** A single low pressure wave for the climax. */
  pulse(strength = 1): void {
    if (!this.ctx || !this.master || !this._enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(72, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.34 * strength, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  /** Silence with a short fall, used for the held black frame. */
  duck(seconds = 1.4): void {
    if (!this.ctx || !this.master || !this._enabled) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 0.45);
    this.master.gain.linearRampToValueAtTime(this.targetLevel, now + seconds + 1.6);
  }
}

export const soundscape = new Soundscape();
