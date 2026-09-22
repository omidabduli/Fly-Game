import { SwatterPhase } from '../player/Swatter';
import type { Camera } from './Camera';
import { LIGHT_DX, LIGHT_DY } from './SceneRenderer';

type Ctx = CanvasRenderingContext2D;

export interface SwatterPose {
  x: number;
  y: number;
  z: number;
  groundH: number;
  phase: number;
  vz: number;
  hx: number;
  hy: number;
  r: number;
}

/** Visual perspective factor for an object `h` mm above the surface it would hit. */
export function swatterScale(h: number): number {
  return 1 + Math.max(0, h) / 600;
}

/**
 * Draws the swatter: a see-through mesh head (so the fly stays visible under
 * it), a handle reaching toward the player, a soft shadow, and the exact
 * footprint it will strike outlined on the surface (so every hit is fair).
 */
export class SwatterRenderer {
  private head: HTMLCanvasElement | null = null;
  private headPx = 0;
  private shadow: HTMLCanvasElement | null = null;
  private shadowPx = 0;

  /**
   * The soft shadow is blurred once into a sprite. Using shadowBlur every
   * frame is very slow in Safari, especially on iPhones.
   */
  private buildShadow(hx: number, hy: number, r: number): void {
    const k = 4; // sprite px per mm
    const blur = 2.5; // mm
    const pad = blur * 2.5;
    const c = document.createElement('canvas');
    c.width = Math.ceil((2 * hx + 2 * pad) * k);
    c.height = Math.ceil((2 * hy + 2 * pad) * k);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgb(25,15,5)';
    ctx.shadowColor = 'rgb(25,15,5)';
    ctx.shadowBlur = blur * k;
    ctx.beginPath();
    ctx.roundRect(pad * k, pad * k, 2 * hx * k, 2 * hy * k, r * k);
    ctx.fill();
    this.shadow = c;
    this.shadowPx = k;
  }

  private buildHead(hx: number, hy: number, r: number): void {
    const k = 8; // sprite px per mm
    const pad = 3;
    const w = Math.ceil((2 * hx + 2 * pad) * k);
    const h = Math.ceil((2 * hy + 2 * pad) * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.scale(k, k);
    ctx.translate(pad + hx, pad + hy);
    // translucent plastic panel
    ctx.beginPath();
    ctx.roundRect(-hx, -hy, 2 * hx, 2 * hy, r);
    ctx.fillStyle = 'rgba(126, 211, 33, 0.16)';
    ctx.fill();
    // mesh
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(70, 150, 20, 0.55)';
    ctx.lineWidth = 0.45;
    for (let x = -hx; x <= hx; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, -hy);
      ctx.lineTo(x, hy);
      ctx.stroke();
    }
    for (let y = -hy; y <= hy; y += 4) {
      ctx.beginPath();
      ctx.moveTo(-hx, y);
      ctx.lineTo(hx, y);
      ctx.stroke();
    }
    ctx.restore();
    // rim
    ctx.beginPath();
    ctx.roundRect(-hx, -hy, 2 * hx, 2 * hy, r);
    ctx.strokeStyle = '#4c9a12';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,255,170,0.55)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(-hx + 0.9, -hy + 0.9, 2 * hx - 1.8, 2 * hy - 1.8, Math.max(0, r - 0.9));
    ctx.stroke();
    // neck where the handle attaches
    ctx.fillStyle = '#3f8a0e';
    ctx.beginPath();
    ctx.roundRect(-5, hy - 3, 10, 7, 2);
    ctx.fill();
    this.head = c;
    this.headPx = k;
  }

  /** Shadow + aim footprint (drawn under the fly). */
  drawUnder(ctx: Ctx, p: SwatterPose): void {
    const h = Math.max(0, p.z - p.groundH);
    // soft shadow
    const sx = p.x + h * LIGHT_DX;
    const sy = p.y + h * LIGHT_DY;
    const grow = 1 + h / 500;
    const alpha = 0.22 * Math.exp(-h / 420) + 0.05;
    if (!this.shadow) this.buildShadow(p.hx, p.hy, p.r);
    const img = this.shadow;
    if (img) {
      const w = (img.width / this.shadowPx) * grow;
      const hh = (img.height / this.shadowPx) * grow;
      ctx.globalAlpha = Math.min(1, alpha * 1.6);
      ctx.drawImage(img, sx - w / 2, sy - hh / 2, w, hh);
      ctx.globalAlpha = 1;
    }
    // exact contact footprint
    const striking = p.phase === SwatterPhase.PREP || p.phase === SwatterPhase.SWING;
    ctx.save();
    ctx.setLineDash([2.2, 1.6]);
    ctx.lineWidth = striking ? 0.7 : 0.45;
    ctx.strokeStyle = striking ? 'rgba(255,70,50,0.75)' : 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.roundRect(p.x - p.hx, p.y - p.hy, 2 * p.hx, 2 * p.hy, p.r);
    ctx.stroke();
    ctx.restore();
  }

  /** Handle + head (drawn over the fly). */
  drawOver(ctx: Ctx, p: SwatterPose, cam: Camera): void {
    if (!this.head) this.buildHead(p.hx, p.hy, p.r);
    const h = Math.max(0, p.z - p.groundH);
    const s = swatterScale(h);
    // handle: held from below-right, at a fixed angle, fading out toward the hand
    const ang = 1.12; // ~64 deg below horizontal
    const len = 150 * s;
    const bx = p.x + 3 * s;
    const by = p.y + p.hy * s - 1;
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const w0 = 2.2 * s;
    const w1 = 3.6 * s;
    ctx.beginPath();
    ctx.moveTo(bx + nx * w0, by + ny * w0);
    ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1);
    ctx.lineTo(bx - nx * w0, by - ny * w0);
    ctx.closePath();
    const hg = ctx.createLinearGradient(bx, by, ex, ey);
    hg.addColorStop(0, 'rgba(84,170,28,0.95)');
    hg.addColorStop(0.55, 'rgba(110,200,50,0.75)');
    hg.addColorStop(1, 'rgba(110,200,50,0)');
    ctx.fillStyle = hg;
    ctx.fill();
    void cam;
    // motion blur ghosts during the swing
    const img = this.head!;
    const k = this.headPx;
    const draw = (hh: number, alpha: number) => {
      const ss = swatterScale(hh);
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, p.x - (img.width / k / 2) * ss, p.y - (img.height / k / 2) * ss, (img.width / k) * ss, (img.height / k) * ss);
    };
    if (p.phase === SwatterPhase.SWING && p.vz < -500) {
      const trail = Math.min(60, -p.vz * 0.012);
      draw(h + trail, 0.18);
      draw(h + trail * 0.5, 0.3);
    }
    draw(h, 1);
    ctx.globalAlpha = 1;
  }
}
