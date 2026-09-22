import type { Material } from '../environment/Scene';
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

  private tone(freq: number, peak: number, decay: number, type: OscillatorType = 'sine', delay = 0, endFreq?: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay);
    const g = this.envGain(peak, 0.004, decay, delay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.05);
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

  catchJingle(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.05, 0.28, 'triangle', 0.08 + i * 0.11));
  }

  achievement(): void {
    this.tone(880, 0.035, 0.22, 'triangle', 0);
    this.tone(1318.5, 0.03, 0.3, 'triangle', 0.1);
  }

  click(): void {
    this.tone(1400, 0.012, 0.03, 'sine');
  }
}
