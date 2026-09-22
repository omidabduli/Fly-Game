/**
 * Ring buffer of past swatter states. The fly's eyes sample it with a delay
 * (visual processing latency), so like a real animal it always reacts to where
 * the swatter was a moment ago. O(1) interpolated lookup.
 */
export interface SwatterSample {
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  visible: boolean;
}

export class SwatterHistory {
  private readonly n: number;
  private readonly t: Float64Array;
  private readonly d: Float64Array; // x y z vx vy vz per entry
  private readonly vis: Uint8Array;
  private head = -1;
  private count = 0;

  constructor(capacity: number) {
    this.n = Math.max(8, capacity);
    this.t = new Float64Array(this.n);
    this.d = new Float64Array(this.n * 6);
    this.vis = new Uint8Array(this.n);
  }

  clear(): void {
    this.head = -1;
    this.count = 0;
  }

  push(t: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, visible: boolean): void {
    this.head = (this.head + 1) % this.n;
    const i = this.head;
    this.t[i] = t;
    const o = i * 6;
    this.d[o] = x;
    this.d[o + 1] = y;
    this.d[o + 2] = z;
    this.d[o + 3] = vx;
    this.d[o + 4] = vy;
    this.d[o + 5] = vz;
    this.vis[i] = visible ? 1 : 0;
    if (this.count < this.n) this.count++;
  }

  get latestTime(): number {
    return this.count ? this.t[this.head] : -Infinity;
  }

  /** Interpolated state at time `t`; returns false if `t` is not covered. */
  sampleAt(t: number, out: SwatterSample): boolean {
    if (!this.count) return false;
    // Walk back from head (entries are uniformly spaced but we don't assume it).
    let i = this.head;
    let steps = 0;
    while (steps < this.count - 1 && this.t[i] > t) {
      i = (i - 1 + this.n) % this.n;
      steps++;
    }
    if (this.t[i] > t) return false; // older than the buffer
    const j = (i + 1) % this.n;
    const hasNext = steps > 0;
    const o = i * 6;
    if (!hasNext) {
      out.t = this.t[i];
      out.x = this.d[o];
      out.y = this.d[o + 1];
      out.z = this.d[o + 2];
      out.vx = this.d[o + 3];
      out.vy = this.d[o + 4];
      out.vz = this.d[o + 5];
      out.visible = this.vis[i] === 1;
      return true;
    }
    const t0 = this.t[i];
    const t1 = this.t[j];
    const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    const p = j * 6;
    out.t = t;
    out.x = this.d[o] + (this.d[p] - this.d[o]) * u;
    out.y = this.d[o + 1] + (this.d[p + 1] - this.d[o + 1]) * u;
    out.z = this.d[o + 2] + (this.d[p + 2] - this.d[o + 2]) * u;
    out.vx = this.d[o + 3] + (this.d[p + 3] - this.d[o + 3]) * u;
    out.vy = this.d[o + 4] + (this.d[p + 4] - this.d[o + 4]) * u;
    out.vz = this.d[o + 5] + (this.d[p + 5] - this.d[o + 5]) * u;
    out.visible = this.vis[i] === 1 && this.vis[j] === 1;
    return true;
  }
}

export function emptySample(): SwatterSample {
  return { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, visible: false };
}
