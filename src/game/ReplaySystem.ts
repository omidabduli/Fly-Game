import type { FlyPose } from '../render/FlyRenderer';
import type { SwatterPose } from '../render/SwatterRenderer';
import type { AttackResult } from './AttackTracker';
import type { Simulation } from './Simulation';

// Channel layout of one recorded sample.
const C = {
  fx: 0, fy: 1, fz: 2, fground: 3, fheading: 4, fstate: 5, fwing: 6, fspread: 7, fleg: 8,
  fgroomType: 9, fgroom: 10, froll: 11, flegExt: 12, fvx: 13, fvy: 14, fvz: 15,
  sx: 16, sy: 17, sz: 18, sground: 19, sphase: 20, svz: 21,
  threat: 22, theta: 23, thetaDot: 24, lc4: 25, lplc2: 26, motor: 27,
} as const;
const NCH = 28;

export interface ReplayEvent {
  /** ms relative to impact (negative = before) */
  ms: number;
  kind: 'threat' | 'perceived' | 'command' | 'takeoff' | 'clear' | 'impact' | 'hit';
  label: string;
  x: number;
  y: number;
}

export interface ReplayClip {
  /** sample times relative to impact (s) */
  times: Float64Array;
  data: Float32Array;
  events: ReplayEvent[];
  result: AttackResult;
  radius: number;
  tint: number;
  hx: number;
  hy: number;
  hr: number;
  predicted: { x: number; y: number; futureX: number; futureY: number; horizonMs: number } | null;
}

export interface ReplayFrame {
  fly: FlyPose;
  swatter: SwatterPose;
  threat: number;
  thetaDeg: number;
  thetaDotDeg: number;
  motor: number;
}

/**
 * Records the last ~2 s of the simulation every physics step (1 kHz) into a
 * ring buffer, and cuts a clip around each close call for slow-motion replay.
 */
export class ReplaySystem {
  private readonly n: number;
  private readonly times: Float64Array;
  private readonly data: Float32Array;
  private head = -1;
  private count = 0;
  clip: ReplayClip | null = null;

  constructor(private readonly sim: Simulation, seconds = 2.2) {
    this.n = Math.ceil(seconds / sim.dt);
    this.times = new Float64Array(this.n);
    this.data = new Float32Array(this.n * NCH);
    sim.onStep(() => this.record());
  }

  private record(): void {
    const sim = this.sim;
    const f = sim.fly;
    const sw = sim.swatter;
    const b = f.brain;
    this.head = (this.head + 1) % this.n;
    this.times[this.head] = sim.time;
    const o = this.head * NCH;
    const d = this.data;
    d[o + C.fx] = f.pos.x;
    d[o + C.fy] = f.pos.y;
    d[o + C.fz] = f.pos.z;
    d[o + C.fground] = f.ground;
    d[o + C.fheading] = f.heading;
    d[o + C.fstate] = f.state;
    d[o + C.fwing] = f.wingPhase;
    d[o + C.fspread] = f.wingSpread;
    d[o + C.fleg] = f.legPhase;
    d[o + C.fgroomType] = f.groomType;
    d[o + C.fgroom] = f.groomPhase;
    d[o + C.froll] = f.roll;
    d[o + C.flegExt] = f.legExtension;
    d[o + C.fvx] = f.vel.x;
    d[o + C.fvy] = f.vel.y;
    d[o + C.fvz] = f.vel.z;
    d[o + C.sx] = sw.x;
    d[o + C.sy] = sw.y;
    d[o + C.sz] = sw.z;
    d[o + C.sground] = sw.groundH;
    d[o + C.sphase] = sw.phase;
    d[o + C.svz] = sw.vz;
    const pc = b.percept;
    d[o + C.threat] = b.escape.output.threatLevel;
    d[o + C.theta] = pc.valid ? pc.theta : 0;
    d[o + C.thetaDot] = pc.valid ? pc.thetaDot : 0;
    d[o + C.lc4] = b.looming.output.lc4;
    d[o + C.lplc2] = b.looming.output.lplc2;
    d[o + C.motor] = b.motorActivity;
    if (this.count < this.n) this.count++;
  }

  /**
   * Cut a clip spanning [impact - before, impact + after]. Call once `after`
   * seconds have elapsed since impact.
   */
  capture(result: AttackResult, before = 0.5, after = 0.12): ReplayClip | null {
    const t0 = result.impactTime - before;
    const t1 = result.impactTime + after;
    const idx: number[] = [];
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - this.count + 1 + k + this.n) % this.n;
      const t = this.times[i];
      if (t >= t0 && t <= t1) idx.push(i);
    }
    if (idx.length < 20) return null;
    const times = new Float64Array(idx.length);
    const data = new Float32Array(idx.length * NCH);
    idx.forEach((i, j) => {
      times[j] = this.times[i] - result.impactTime;
      data.set(this.data.subarray(i * NCH, i * NCH + NCH), j * NCH);
    });
    const sim = this.sim;
    const f = sim.fly;
    const posAt = (ms: number): [number, number] => {
      const t = ms / 1000;
      let j = 0;
      while (j < times.length - 1 && times[j] < t) j++;
      return [data[j * NCH + C.fx], data[j * NCH + C.fy]];
    };
    const events: ReplayEvent[] = [];
    const add = (ms: number | null, kind: ReplayEvent['kind'], label: string) => {
      if (ms === null || !Number.isFinite(ms) || ms < -before * 1000 - 5) return;
      const [x, y] = posAt(ms);
      events.push({ ms, kind, label, x, y });
    };
    add(result.threatMs, 'threat', 'threat detected');
    add(result.perceivedMs, 'perceived', 'escape neuron fired');
    add(result.commandMs, 'command', 'escape direction chosen');
    add(result.takeoffMs, 'takeoff', result.flyAirborneAtStrike ? 'evasive manoeuvre' : 'take-off');
    add(result.clearMs, 'clear', 'cleared the swatter');
    add(0, result.hit ? 'hit' : 'impact', result.hit ? 'CAUGHT' : 'swatter impact');
    events.sort((a, b) => a.ms - b.ms);
    const clip: ReplayClip = {
      times,
      data,
      events,
      result,
      radius: f.radius,
      tint: f.genome.tint,
      hx: sim.swatter.hx,
      hy: sim.swatter.hy,
      hr: sim.swatter.r,
      predicted: result.plan
        ? { x: result.plan.predictedImpactX, y: result.plan.predictedImpactY, futureX: result.plan.futureX, futureY: result.plan.futureY, horizonMs: result.plan.horizonMs }
        : null,
    };
    this.clip = clip;
    return clip;
  }

  static duration(clip: ReplayClip): [number, number] {
    return [clip.times[0], clip.times[clip.times.length - 1]];
  }

  /** Interpolated frame at time `t` (s, relative to impact). */
  static frame(clip: ReplayClip, t: number): ReplayFrame {
    const ts = clip.times;
    let j = 0;
    let lo = 0;
    let hi = ts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    j = Math.max(1, lo);
    const i0 = j - 1;
    const i1 = Math.min(ts.length - 1, j);
    const u = ts[i1] > ts[i0] ? Math.min(1, Math.max(0, (t - ts[i0]) / (ts[i1] - ts[i0]))) : 0;
    const d = clip.data;
    const g = (ch: number) => d[i0 * NCH + ch] + (d[i1 * NCH + ch] - d[i0 * NCH + ch]) * u;
    const n = (ch: number) => (u < 0.5 ? d[i0 * NCH + ch] : d[i1 * NCH + ch]);
    let heading = d[i0 * NCH + C.fheading];
    let dh = d[i1 * NCH + C.fheading] - heading;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    heading += dh * u;
    return {
      fly: {
        x: g(C.fx),
        y: g(C.fy),
        z: g(C.fz),
        ground: g(C.fground),
        heading,
        state: n(C.fstate),
        wingPhase: n(C.fwing),
        wingSpread: g(C.fspread),
        legPhase: n(C.fleg),
        groomType: n(C.fgroomType),
        groomPhase: n(C.fgroom),
        roll: g(C.froll),
        legExtension: g(C.flegExt),
        vx: g(C.fvx),
        vy: g(C.fvy),
        vz: g(C.fvz),
        radius: clip.radius,
        tint: clip.tint,
      },
      swatter: {
        x: g(C.sx),
        y: g(C.sy),
        z: g(C.sz),
        groundH: g(C.sground),
        phase: n(C.sphase),
        vz: g(C.svz),
        hx: clip.hx,
        hy: clip.hy,
        r: clip.hr,
      },
      threat: g(C.threat),
      thetaDeg: (g(C.theta) * 180) / Math.PI,
      thetaDotDeg: (g(C.thetaDot) * 180) / Math.PI,
      motor: g(C.motor),
    };
  }

  /** Path (x, y) of the fly / swatter across the clip (for trajectory overlays). */
  static path(clip: ReplayClip, who: 'fly' | 'swatter', stepMs = 4): [number, number, number][] {
    const out: [number, number, number][] = [];
    const cx = who === 'fly' ? C.fx : C.sx;
    const cy = who === 'fly' ? C.fy : C.sy;
    let last = -Infinity;
    for (let i = 0; i < clip.times.length; i++) {
      const t = clip.times[i] * 1000;
      if (t - last < stepMs) continue;
      last = t;
      out.push([clip.data[i * NCH + cx], clip.data[i * NCH + cy], t]);
    }
    return out;
  }
}
