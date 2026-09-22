/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic seeds make the Monte-Carlo benchmark reproducible; the live game
 * seeds from the clock so every session differs.
 */
export interface Dist {
  /** mean */
  mean: number;
  /** standard deviation */
  sd: number;
  /** hard lower bound */
  min: number;
  /** hard upper bound */
  max: number;
}

export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed = 1) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  static fromTime(): Rng {
    const t = typeof performance !== 'undefined' ? performance.now() : 0;
    return new Rng((Date.now() ^ Math.floor(t * 1000) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b). */
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Standard normal via Box-Muller (cached pair). */
  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    return mean + sd * u * m;
  }

  /** Truncated normal sample (rejection, then clamp as a fallback). */
  sample(d: Dist, scale = 1): number {
    const mean = d.mean * scale;
    const sd = d.sd * scale;
    const lo = d.min * scale;
    const hi = d.max * scale;
    for (let i = 0; i < 12; i++) {
      const x = this.normal(mean, sd);
      if (x >= lo && x <= hi) return x;
    }
    return Math.min(hi, Math.max(lo, mean));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Index sampled proportionally to non-negative weights. */
  weightedIndex(weights: ArrayLike<number>): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) return Math.floor(this.next() * weights.length);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /** A child generator with an independent stream. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }
}
