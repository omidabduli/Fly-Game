import type { Material } from '../environment/Scene';
import type { BreakKind } from '../game/DamageSystem';
import { loadJSON, saveJSON } from '../analytics/storage';

/**
 * Procedural sound with the Web Audio API (no audio files). Everything is kept
 * quiet: the buzz is only audible when the fly is flying near the swatter, and
 * it fades in and out so it doesn't drone the whole time.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private buzzGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private buzzFilter: BiquadFilterNode | null = null;
  private reverb: ConvolverNode | null = null;
  muted: boolean;
  private earshot = 0.6;
  private earshotTarget = 0.6;
  private nextEarshotChange = 0;

  constructor() {
    this.muted = loadJSON<boolean>('muted', false);
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture (iOS/Safari autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      // Safari also has an "interrupted" state (phone call, other app took the audio).
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => {});
      return;
    }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    // 1 s of white noise, reused by all noise-based sounds
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // small room reverb (synthetic impulse response) for breaking glass, fanfares ...
    try {
      const len = Math.round(ctx.sampleRate * 1.3);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(this.master);
    } catch {
      this.reverb = null;
    }
    // continuous buzz voice (gain 0 until the fly flies)
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    this.buzzFilter = ctx.createBiquadFilter();
    this.buzzFilter.type = 'bandpass';
    this.buzzFilter.frequency.value = 650;
    this.buzzFilter.Q.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 210;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 421;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    // flutter (amplitude modulation)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    const am = ctx.createGain();
    am.gain.value = 0.7;
    lfo.connect(lfoGain).connect(am.gain);
    this.osc1.connect(this.buzzFilter);
    this.osc2.connect(g2).connect(this.buzzFilter);
    this.buzzFilter.connect(lp).connect(am).connect(this.buzzGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    lfo.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    saveJSON('muted', m);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => {});
  }

  /**
   * Per-frame buzz update.
   * @param flying fly is airborne
   * @param speed fly speed (mm/s)
   * @param proximity 0..1 (1 = right next to the player's swatter / close to the camera)
   */
  updateBuzz(flying: boolean, speed: number, proximity: number, now: number): void {
    if (!this.ctx || !this.buzzGain || !this.osc1 || !this.osc2) return;
    if (now > this.nextEarshotChange) {
      this.earshotTarget = 0.25 + Math.random() * 0.75;
      this.nextEarshotChange = now + 0.8 + Math.random() * 2.5;
    }
    this.earshot += (this.earshotTarget - this.earshot) * 0.03;
    const vol = flying ? 0.05 * (0.15 + 0.85 * proximity) * this.earshot * (0.7 + Math.min(0.6, speed / 2000)) : 0;
    const t = this.ctx.currentTime;
    this.buzzGain.gain.setTargetAtTime(vol, t, flying ? 0.04 : 0.08);
    const f = 205 + Math.min(45, speed / 30) + Math.sin(now * 7.3) * 3 + (Math.random() - 0.5) * 2;
    this.osc1.frequency.setTargetAtTime(f, t, 0.02);
    this.osc2.frequency.setTargetAtTime(f * 2.004, t, 0.02);
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private envGain(peak: number, attack: number, decay: number, delay = 0): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Output node: dry to the master bus plus `wet` of it into the reverb. */
  private out(wet = 0): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.master!);
    if (wet > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.reverb);
    }
    return g;
  }

  private tone(freq: number, peak: number, decay: number, type: OscillatorType = 'sine', delay = 0, endFreq?: number, wet = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    const g = this.envGain(peak, 0.004, decay, delay);
    o.connect(g).connect(this.out(wet));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** Filtered noise burst. */
  private hiss(
    type: BiquadFilterType,
    freq: number,
    peak: number,
    decay: number,
    o: { q?: number; endFreq?: number; attack?: number; delay?: number; wet?: number } = {},
  ): void {
    if (!this.ctx || !this.master) return;
    const n = this.noiseSource();
    if (!n) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay ?? 0);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(freq, t);
    if (o.endFreq) f.frequency.exponentialRampToValueAtTime(o.endFreq, t + (o.attack ?? 0.003) + decay);
    const g = this.envGain(peak, o.attack ?? 0.003, decay, o.delay ?? 0);
    n.connect(f).connect(g).connect(this.out(o.wet ?? 0));
    n.start(t, Math.random() * 0.5);
    n.stop(t + (o.attack ?? 0.003) + decay + 0.05);
  }

  /** Scattered high pings: glass tinkling, falling shards. */
  private tinkle(n: number, lo: number, hi: number, spread: number, peak: number, wet = 0.4): void {
    for (let i = 0; i < n; i++) {
      const d = Math.random() * spread;
      this.tone(lo + Math.random() * (hi - lo), peak * (0.4 + Math.random() * 0.6), 0.05 + Math.random() * 0.12, 'sine', d, undefined, wet);
    }
  }

  takeoff(escape: boolean): void {
    if (!this.ctx || !this.master) return;
    const n = this.noiseSource();
    if (!n) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    const t = this.ctx.currentTime;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.07);
    const g = this.envGain(escape ? 0.05 : 0.02, 0.003, 0.07);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.1);
    this.tone(260, escape ? 0.02 : 0.01, 0.06, 'sawtooth', 0, 330);
  }

  whoosh(speed: number): void {
    if (!this.ctx || !this.master) return;
    const n = this.noiseSource();
    if (!n) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    const t = this.ctx.currentTime;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
    const g = this.ctx.createGain();
    const peak = 0.05 + Math.min(0.08, speed / 60000);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.22);
  }

  impact(material: Material, hit: boolean, speed: number): void {
    if (!this.ctx || !this.master) return;
    const loud = Math.min(1, speed / 3800);
    const n = this.noiseSource();
    if (n) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = material === 'glass' || material === 'metal' ? 3200 : 1600;
      const g = this.envGain(0.22 * loud + 0.05, 0.002, 0.09);
      n.connect(lp).connect(g).connect(this.master);
      const t = this.ctx.currentTime;
      n.start(t);
      n.stop(t + 0.14);
    }
    const thumpFreq = material === 'wood' ? 95 : material === 'wall' ? 80 : 120;
    this.tone(thumpFreq, 0.28 * loud + 0.05, 0.1, 'sine', 0, 45);
    switch (material) {
      case 'glass':
        this.tone(2400, 0.035, 0.09, 'sine');
        this.tone(3700, 0.02, 0.06, 'sine');
        break;
      case 'ceramic':
      case 'coffee':
        this.tone(1850, 0.04, 0.12, 'triangle');
        break;
      case 'metal':
        this.tone(930, 0.03, 0.22, 'triangle');
        this.tone(1410, 0.02, 0.18, 'sine');
        break;
      case 'screen':
      case 'plastic':
        this.tone(420, 0.03, 0.05, 'square');
        break;
      default:
        break;
    }
    if (hit) {
      const s = this.noiseSource();
      if (s) {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 3;
        const g = this.envGain(0.12, 0.004, 0.08, 0.01);
        s.connect(bp).connect(g).connect(this.master);
        const t = this.ctx.currentTime;
        s.start(t);
        s.stop(t + 0.12);
      }
    }
  }

  land(): void {
    this.tone(2100, 0.006, 0.012, 'sine');
  }

  /** Something in the room broke. `final` = it's now completely broken (bigger sound). */
  smash(kind: BreakKind, final: boolean): void {
    if (!this.ctx || !this.master) return;
    const big = final ? 1 : 0.6;
    switch (kind) {
      case 'glass':
        this.hiss('highpass', 2600, 0.16 * big, final ? 0.45 : 0.12, { wet: 0.5 });
        this.tone(3100, 0.05, 0.08, 'sine', 0, 2600, 0.4);
        this.tinkle(final ? 22 : 7, 2600, 7800, final ? 0.75 : 0.18, 0.04, 0.5);
        if (final) this.hiss('bandpass', 5200, 0.05, 0.5, { delay: 0.25, q: 2, wet: 0.6 });
        break;
      case 'screen':
        this.hiss('highpass', 3000, 0.12 * big, 0.1, { wet: 0.3 });
        this.tinkle(final ? 10 : 5, 3000, 6000, 0.25, 0.03);
        this.zap(final);
        break;
      case 'metal':
        [523, 1311, 2149, 3212].forEach((f, i) => this.tone(f, 0.05 / (i + 1), 0.55, i % 2 ? 'sine' : 'triangle', 0, f * 0.985, 0.4));
        this.hiss('bandpass', 4000, 0.06, 0.05, { q: 3 });
        break;
      case 'bulb':
        this.hiss('lowpass', 2400, 0.25, 0.04);
        this.tone(190, 0.2, 0.12, 'sine', 0, 60);
        this.tinkle(10, 3200, 7000, 0.35, 0.035, 0.5);
        this.zap(false);
        this.tone(120, 0.05, 0.5, 'sawtooth', 0.02, 40, 0.2);
        break;
      case 'leaves':
        for (let i = 0; i < 5; i++) this.hiss('bandpass', 3500 + Math.random() * 2500, 0.06, 0.06, { q: 1.5, delay: i * 0.05 });
        break;
      case 'terracotta':
        this.hiss('lowpass', 900, 0.2 * big, 0.25, { wet: 0.2 });
        for (let i = 0; i < (final ? 9 : 4); i++) this.tone(600 + Math.random() * 900, 0.05, 0.07, 'triangle', Math.random() * 0.2);
        break;
      case 'ceramic':
        this.hiss('bandpass', 1800, 0.15 * big, 0.12, { q: 1.2, wet: 0.3 });
        for (let i = 0; i < (final ? 12 : 4); i++) this.tone(1300 + Math.random() * 2600, 0.045, 0.08 + Math.random() * 0.12, 'triangle', Math.random() * (final ? 0.4 : 0.1), undefined, 0.35);
        break;
      case 'liquid':
        this.hiss('lowpass', 3200, 0.2, 0.3, { endFreq: 400, q: 0.8, wet: 0.2 });
        for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 400, 0.04, 0.05, 'sine', 0.03 + Math.random() * 0.25, 900 + Math.random() * 600);
        break;
      case 'fruit':
        this.tone(220, 0.16, 0.14, 'sine', 0, 70);
        this.hiss('lowpass', 1200, 0.16, 0.12, { endFreq: 300 });
        this.tone(500, 0.05, 0.06, 'sine', 0.05, 1400);
        break;
      case 'paper':
        if (final) this.hiss('bandpass', 700, 0.12, 0.35, { endFreq: 4200, q: 2.5 });
        for (let i = 0; i < 4; i++) this.hiss('bandpass', 1800 + Math.random() * 1500, 0.07, 0.05, { q: 1, delay: i * 0.07 });
        this.tone(140, 0.12, 0.08, 'sine', 0, 70);
        break;
      case 'crumbs':
        for (let i = 0; i < 8; i++) this.hiss('bandpass', 2200 + Math.random() * 2000, 0.07, 0.015, { q: 2, delay: Math.random() * 0.12 });
        break;
    }
  }

  /** Electric crackle, and a power-down whine when the thing is dead. */
  private zap(dead: boolean): void {
    if (!this.ctx) return;
    this.tone(60, 0.06, 0.25, 'square', 0, 45);
    for (let i = 0; i < 7; i++) this.hiss('bandpass', 2500 + Math.random() * 3000, 0.08, 0.012, { q: 4, delay: Math.random() * 0.25 });
    if (dead) this.tone(1100, 0.05, 0.7, 'sine', 0.08, 55, 0.3);
  }

  /** Little electric sputter from a broken lamp or monitor. */
  sputter(): void {
    for (let i = 0; i < 3; i++) this.hiss('bandpass', 3000 + Math.random() * 2500, 0.03, 0.01, { q: 4, delay: Math.random() * 0.08 });
  }

  /** The damage bill goes up. */
  kaChing(): void {
    if (!this.ctx) return;
    this.tone(1318.5, 0.03, 0.04, 'square', 0);
    this.tone(1760, 0.03, 0.05, 'square', 0.06);
    this.tone(2637, 0.04, 0.5, 'sine', 0.12, undefined, 0.4);
    this.tone(3951, 0.025, 0.4, 'sine', 0.12, undefined, 0.4);
  }

  /** The fly got squashed. */
  splat(): void {
    if (!this.ctx) return;
    this.tone(95, 0.3, 0.2, 'sine', 0, 38);
    this.hiss('lowpass', 1400, 0.22, 0.16, { endFreq: 250 });
    this.hiss('bandpass', 2400, 0.06, 0.04, { q: 2, delay: 0.02 });
  }

  /** Slow-motion "bwoom" for the kill cam. */
  slowmo(): void {
    if (!this.ctx) return;
    this.tone(420, 0.07, 0.9, 'sine', 0, 55, 0.4);
    this.tone(210, 0.05, 0.9, 'triangle', 0, 40, 0.4);
    this.hiss('lowpass', 300, 0.06, 0.8, { attack: 0.15, endFreq: 1800, wet: 0.5 });
  }

  catchJingle(): void {
    if (!this.ctx) return;
    // quick rising arpeggio, then a sustained major chord
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.045, 0.22, 'triangle', 0.05 + i * 0.075, undefined, 0.35));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
      this.tone(f, 0.035, 1.1, 'triangle', 0.45, undefined, 0.5);
      this.tone(f * 1.003, 0.02, 1.1, 'sawtooth', 0.45, undefined, 0.3);
    });
    this.tinkle(8, 3000, 6000, 0.6, 0.012, 0.6);
  }

  /** Fly mocks you: "bzz-BZZ!" */
  taunt(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const notes = [300, 380, 300, 450];
    notes.forEach((f, i) => {
      const s = t + i * 0.085;
      o.frequency.setValueAtTime(f, s);
      o.frequency.linearRampToValueAtTime(f * 1.08, s + 0.07);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(i === 3 ? 0.07 : 0.045, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + (i === 3 ? 0.16 : 0.075));
    });
    o.connect(bp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** A new fly buzzes in from off-screen. */
  flyIn(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(170, t);
    o.frequency.linearRampToValueAtTime(240, t + 0.45);
    o.frequency.linearRampToValueAtTime(200, t + 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.linearRampToValueAtTime(1300, t + 0.45);
    bp.frequency.linearRampToValueAtTime(700, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }

  /** Phone vibrating on the desk: bzzt bzzt. */
  phoneBuzz(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    for (const d of [0, 0.22]) {
      const t = ctx.currentTime + d;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 155;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.setValueAtTime(0.05, t + 0.13);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
    }
    this.tone(1568, 0.02, 0.12, 'sine', 0.02, undefined, 0.2);
    this.tone(2093, 0.018, 0.16, 'sine', 0.1, undefined, 0.2);
  }

  /** Receipt counter tick. */
  tick(): void {
    this.tone(2600 + Math.random() * 200, 0.012, 0.015, 'square');
  }

  /** Rubber stamp slamming onto the receipt. */
  stamp(): void {
    this.tone(130, 0.22, 0.12, 'sine', 0, 50);
    this.hiss('lowpass', 700, 0.14, 0.08);
  }

  achievement(): void {
    this.tone(880, 0.035, 0.22, 'triangle', 0, undefined, 0.3);
    this.tone(1318.5, 0.03, 0.3, 'triangle', 0.1, undefined, 0.3);
    this.tone(1760, 0.025, 0.4, 'triangle', 0.2, undefined, 0.4);
  }

  click(): void {
    this.tone(1400, 0.012, 0.03, 'sine');
  }

  /** Soft UI tap. */
  uiTap(): void {
    this.tone(1250, 0.025, 0.035, 'sine', 0, 1900);
  }

  /** Difficulty picked. */
  select(level: number): void {
    const base = [523.25, 659.25, 783.99][level] ?? 659.25;
    this.tone(base, 0.035, 0.12, 'triangle', 0, undefined, 0.2);
    this.tone(base * 1.5, 0.03, 0.18, 'triangle', 0.07, undefined, 0.3);
  }
}
