import { clamp } from '../math/vec';

/**
 * Orthographic camera mapping world millimetres to CSS pixels.
 * On large screens the whole room fits; on small screens the view is zoomed
 * so the fly stays visible (at least minScale px/mm) and pans to follow it.
 */
export class Camera {
  /** CSS px per mm */
  scale = 3;
  /** world coordinates of the viewport's top-left corner */
  x0 = 0;
  y0 = 0;
  viewW = 800;
  viewH = 500;
  /** true when the view is smaller than the world (panning active) */
  panning = false;
  /** CSS px at the top covered by the HUD; the follow zone sits below it */
  insetTop = 0;
  private tx = 0;
  private ty = 0;
  private vx = 0;
  private vy = 0;

  constructor(
    private readonly worldW: number,
    private readonly worldH: number,
    private readonly minScale = 2.3,
    readonly margin = 36,
  ) {}

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    const fit = Math.min(viewW / this.worldW, viewH / this.worldH);
    // Allow cropping up to 8% so there are no thin bars at the edges.
    const cover = Math.max(viewW / this.worldW, viewH / this.worldH);
    let s = Math.min(cover, fit * 1.08);
    s = Math.max(s, this.minScale);
    this.scale = s;
    const vwMm = viewW / s;
    const vhMm = viewH / s;
    this.panning = vwMm < this.worldW - 1 || vhMm < this.worldH - 1;
    this.x0 = this.tx = this.clampX((this.worldW - vwMm) / 2);
    this.y0 = this.ty = this.clampY((this.worldH - vhMm) / 2);
  }

  get viewWmm(): number {
    return this.viewW / this.scale;
  }

  get viewHmm(): number {
    return this.viewH / this.scale;
  }

  /** usable inset in mm (never more than a third of the view) */
  private get topMm(): number {
    return Math.min(this.insetTop, this.viewH / 3) / this.scale;
  }

  private clampX(x: number): number {
    const vw = this.viewWmm;
    if (vw >= this.worldW) return (this.worldW - vw) / 2;
    return clamp(x, -this.margin * 0.5, this.worldW - vw + this.margin * 0.5);
  }

  private clampY(y: number): number {
    const vh = this.viewHmm;
    if (vh >= this.worldH) return (this.worldH - vh) / 2;
    return clamp(y, -this.margin * 0.5 - this.topMm, this.worldH - vh + this.margin * 0.5);
  }

  /** Keep `x, y` inside a central dead zone, with a smooth critically damped pan. */
  follow(x: number, y: number, dt: number, frozen: boolean): void {
    if (!this.panning) return;
    if (!frozen) {
      const vw = this.viewWmm;
      const top = this.topMm;
      const vh = this.viewHmm - top;
      const dzx = vw * 0.22;
      const dzy = vh * 0.22;
      const cx = this.tx + vw / 2;
      const cy = this.ty + top + vh / 2;
      if (x < cx - dzx) this.tx = x + dzx - vw / 2;
      else if (x > cx + dzx) this.tx = x - dzx - vw / 2;
      if (y < cy - dzy) this.ty = y + dzy - vh / 2 - top;
      else if (y > cy + dzy) this.ty = y - dzy - vh / 2 - top;
      this.tx = this.clampX(this.tx);
      this.ty = this.clampY(this.ty);
    }
    const w = 6;
    const ax = w * w * (this.tx - this.x0) - 2 * w * this.vx;
    const ay = w * w * (this.ty - this.y0) - 2 * w * this.vy;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x0 += this.vx * dt;
    this.y0 += this.vy * dt;
  }

  /** Jump the view so (x, y) is in the middle of the visible area (e.g. when a new fly spawns). */
  centerOn(x: number, y: number): void {
    const top = this.topMm;
    this.tx = this.x0 = this.clampX(x - this.viewWmm / 2);
    this.ty = this.y0 = this.clampY(y - top - (this.viewHmm - top) / 2);
    this.vx = this.vy = 0;
  }

  sx(x: number): number {
    return (x - this.x0) * this.scale;
  }

  sy(y: number): number {
    return (y - this.y0) * this.scale;
  }

  toWorldX(px: number): number {
    return px / this.scale + this.x0;
  }

  toWorldY(py: number): number {
    return py / this.scale + this.y0;
  }
}
