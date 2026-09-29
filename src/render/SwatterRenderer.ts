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
  return 1 + Math.max(0, h) / 900;
}

const INK = '#1d1c1a';
const CLAY = '#c15f3c';

/** Small deterministic random for the speed lines (so they flicker instead of shimmering). */
function rnd(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** White lines read on dark things, ink lines on light ones, a few in clay for accent. */
function lineColor(i: number, a: number): string {
  if (i % 3 === 0) return `rgba(29,28,26,${0.55 * a})`;
  if (i % 3 === 1) return `rgba(255,255,255,${0.9 * a})`;
  return `rgba(226,104,64,${0.75 * a})`;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

/**
 * The swatter: a slim charcoal frame with a clay edge and a honeycomb mesh,
 * a soft shadow, and the exact footprint it will strike outlined on the
 * surface. When it moves fast it leaves anime-style speed lines and ghost
 * images behind it, and a downswing "zooms" in with lines bursting outward.
 */
export class SwatterRenderer {
  private head: HTMLCanvasElement | null = null;
  private headPx = 0;
  private shadow: HTMLCanvasElement | null = null;
  private shadowPx = 0;
  private trail: Sample[] = [];
  private tilt = 0;
  private lastPhase = -1;
  private phaseSince = 0;

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
    const k = 10; // sprite px per mm
    const pad = 3;
    const w = Math.ceil((2 * hx + 2 * pad) * k);
    const h = Math.ceil((2 * hy + 2 * pad) * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.scale(k, k);
    ctx.translate(pad + hx, pad + hy);
    const body = () => {
      ctx.beginPath();
      ctx.roundRect(-hx, -hy, 2 * hx, 2 * hy, r);
    };
    // see-through panel with a cool tint
    body();
    const pg = ctx.createLinearGradient(-hx, -hy, hx, hy);
    pg.addColorStop(0, 'rgba(255,255,255,0.14)');
    pg.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    pg.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = pg;
    ctx.fill();
    // honeycomb mesh
    ctx.save();
    body();
    ctx.clip();
    const hr = 3.3;
    const dx = hr * Math.sqrt(3);
    ctx.lineWidth = 0.24;
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    for (let row = -Math.ceil(hy / (hr * 1.5)) - 1; row <= Math.ceil(hy / (hr * 1.5)) + 1; row++) {
      for (let col = -Math.ceil(hx / dx) - 1; col <= Math.ceil(hx / dx) + 1; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        const cy = row * hr * 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = cx + Math.cos(a) * hr;
          const py = cy + Math.sin(a) * hr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    // soft glare across the mesh
    const gl = ctx.createLinearGradient(-hx, -hy, hx * 0.2, hy * 0.2);
    gl.addColorStop(0, 'rgba(255,255,255,0.2)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(-hx, -hy, 2 * hx, 2 * hy);
    ctx.restore();
    // charcoal frame with a thin clay line inside
    body();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-hx + 1.5, -hy + 1.5, 2 * hx - 3, 2 * hy - 3, Math.max(0, r - 1.5));
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = CLAY;
    ctx.stroke();
    // highlight on the top-left of the frame
    ctx.beginPath();
    ctx.roundRect(-hx - 0.5, -hy - 0.5, 2 * hx + 1, 2 * hy + 1, r + 0.5);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-hx + r, -hy - 0.5);
    ctx.lineTo(hx * 0.3, -hy - 0.5);
    ctx.moveTo(-hx - 0.5, -hy + r);
    ctx.lineTo(-hx - 0.5, hy * 0.2);
    ctx.stroke();
    ctx.restore();
    // neck where the handle attaches
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(-4.5, hy - 2.5, 9, 6.5, 2);
    ctx.fill();
    ctx.fillStyle = CLAY;
    ctx.fillRect(-4.5, hy + 1.3, 9, 0.9);
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
    // exact contact footprint: clean dashes, red-orange while the swing is on its way
    const striking = p.phase === SwatterPhase.PREP || p.phase === SwatterPhase.SWING;
    ctx.save();
    ctx.setLineDash(striking ? [2.6, 1.6] : [1.8, 2.2]);
    ctx.lineWidth = striking ? 0.75 : 0.5;
    ctx.strokeStyle = striking ? 'rgba(232,84,48,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.roundRect(p.x - p.hx, p.y - p.hy, 2 * p.hx, 2 * p.hy, p.r);
    ctx.stroke();
    ctx.setLineDash([]);
    // a small crosshair marks the centre
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(p.x - 2.2, p.y);
    ctx.lineTo(p.x + 2.2, p.y);
    ctx.moveTo(p.x, p.y - 2.2);
    ctx.lineTo(p.x, p.y + 2.2);
    ctx.stroke();
    ctx.restore();
  }

  /** Speed lines trailing a fast sideways motion (anime style: thin, tapered, a few brighter). */
  private speedLines(ctx: Ctx, p: SwatterPose, s: number, vx: number, vy: number, seed: number): void {
    const speed = Math.hypot(vx, vy);
    if (speed < 260) return;
    const ux = vx / speed;
    const uy = vy / speed;
    const nx = -uy;
    const ny = ux;
    const strength = Math.min(1, (speed - 260) / 1500);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const off = (rnd(seed + i * 7.3) * 2 - 1) * (Math.abs(nx) * p.hx + Math.abs(ny) * p.hy) * s * 1.05;
      const len = (14 + 46 * rnd(seed + i * 3.1)) * strength * s;
      const start = (p.hx * Math.abs(ux) + p.hy * Math.abs(uy)) * s * (0.55 + 0.4 * rnd(seed + i));
      const w = (0.45 + 0.9 * rnd(seed + i * 5.9)) * s;
      const sx = p.x - ux * start + nx * off;
      const sy = p.y - uy * start + ny * off;
      const ex = sx - ux * len;
      const ey = sy - uy * len;
      const g = ctx.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, lineColor(i, strength));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx + nx * w, sy + ny * w);
      ctx.lineTo(ex, ey);
      ctx.lineTo(sx - nx * w, sy - ny * w);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** On a downswing the head rushes toward the surface: lines burst outward from it. */
  private zoomLines(ctx: Ctx, p: SwatterPose, s: number, k: number, seed: number): void {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(seed + i) * 0.25;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // start on the head's outline
      const t = 1 / Math.max(Math.abs(ca) / (p.hx * s), Math.abs(sa) / (p.hy * s));
      const r0 = t * (1.03 + 0.06 * rnd(seed + i * 2));
      const len = (8 + 40 * rnd(seed + i * 4.3)) * k * s;
      const w = (0.35 + 0.8 * rnd(seed + i * 6.1)) * s;
      const sx = p.x + ca * r0;
      const sy = p.y + sa * r0;
      const ex = p.x + ca * (r0 + len);
      const ey = p.y + sa * (r0 + len);
      const g = ctx.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, lineColor(i, k));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - sa * w, sy + ca * w);
      ctx.lineTo(ex, ey);
      ctx.lineTo(sx + sa * w, sy - ca * w);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Handle + head (drawn over the fly), with motion streaks and ghosts. */
  drawOver(ctx: Ctx, p: SwatterPose, cam: Camera): void {
    void cam;
    if (!this.head) this.buildHead(p.hx, p.hy, p.r);
    const now = performance.now();
    const h = Math.max(0, p.z - p.groundH);
    const s = swatterScale(h);

    // velocity from the last few frames
    this.trail.push({ x: p.x, y: p.y, t: now });
    while (this.trail.length > 2 && now - this.trail[0].t > 110) this.trail.shift();
    let vx = 0;
    let vy = 0;
    const first = this.trail[0];
    const dt = (now - first.t) / 1000;
    if (dt > 0.008) {
      vx = (p.x - first.x) / dt;
      vy = (p.y - first.y) / dt;
    }
    // a jump (new fly, replay scrub) is not a swing
    if (Math.hypot(vx, vy) > 9000) {
      this.trail.length = 0;
      vx = vy = 0;
    }

    // tilt: wind up backwards, then snap forward on the downswing
    if (p.phase !== this.lastPhase) {
      this.lastPhase = p.phase;
      this.phaseSince = now;
    }
    const pt = (now - this.phaseSince) / 1000;
    let tiltT = 0;
    if (p.phase === SwatterPhase.PREP) tiltT = -0.2 * Math.min(1, pt / 0.08);
    else if (p.phase === SwatterPhase.SWING) tiltT = 0.1 * Math.min(1, -p.vz / 3000);
    else if (p.phase === SwatterPhase.HOLD) tiltT = 0.03;
    this.tilt += (tiltT - this.tilt) * 0.3;
    const sway = Math.max(-0.3, Math.min(0.3, vx * 0.00012));

    // handle: held from below-right, shorter and slimmer than the head
    const ang = 1.12;
    const len = 120 * s;
    const bx = p.x + 2.5 * s;
    const by = p.y + p.hy * s - 1;
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const w0 = 1.6 * s;
    const w1 = 2.7 * s;
    ctx.beginPath();
    ctx.moveTo(bx + nx * w0, by + ny * w0);
    ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1);
    ctx.lineTo(bx - nx * w0, by - ny * w0);
    ctx.closePath();
    const hg = ctx.createLinearGradient(bx, by, ex, ey);
    hg.addColorStop(0, 'rgba(29,28,26,0.98)');
    hg.addColorStop(0.55, 'rgba(45,43,40,0.85)');
    hg.addColorStop(1, 'rgba(45,43,40,0)');
    ctx.fillStyle = hg;
    ctx.fill();
    // grip stripes in clay
    ctx.strokeStyle = 'rgba(193,95,60,0.75)';
    ctx.lineWidth = 0.9 * s;
    for (let i = 0; i < 4; i++) {
      const t = 0.3 + i * 0.06;
      const gx = bx + Math.cos(ang) * len * t;
      const gy = by + Math.sin(ang) * len * t;
      const gw = (w0 + (w1 - w0) * t) * 1.05;
      ctx.globalAlpha = 1 - t * 0.9;
      ctx.beginPath();
      ctx.moveTo(gx + nx * gw, gy + ny * gw);
      ctx.lineTo(gx - nx * gw, gy - ny * gw);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const img = this.head!;
    const k = this.headPx;
    const draw = (x: number, y: number, hh: number, alpha: number, tilt: number) => {
      const ss = swatterScale(hh);
      const w = (img.width / k) * ss;
      const ht = (img.height / k) * ss;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.drawImage(img, -w / 2, -ht / 2, w, ht);
      ctx.restore();
    };

    // effects behind the head
    const seed = Math.floor(now / 55);
    const swinging = p.phase === SwatterPhase.SWING && p.vz < -500;
    if (swinging) this.zoomLines(ctx, p, s, Math.min(1, -p.vz / 3600), seed);
    this.speedLines(ctx, p, s, vx, vy, seed);

    // ghost images along the path of a fast move
    const speed = Math.hypot(vx, vy);
    if (speed > 400 && this.trail.length > 2) {
      const n = this.trail.length;
      const picks = [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)];
      picks.forEach((idx, i) => draw(this.trail[idx].x, this.trail[idx].y, h, 0.1 + 0.08 * i, this.tilt));
    }
    if (swinging) {
      const trailH = Math.min(70, -p.vz * 0.014);
      draw(p.x, p.y, h + trailH, 0.14, this.tilt);
      draw(p.x, p.y, h + trailH * 0.5, 0.26, this.tilt);
    }
    // a warm glow around the head while a strike is on its way
    if (p.phase === SwatterPhase.PREP || p.phase === SwatterPhase.SWING) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.tilt);
      ctx.strokeStyle = 'rgba(232,110,70,0.35)';
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.roundRect(-p.hx * s - 1.2, -p.hy * s - 1.2, 2 * p.hx * s + 2.4, 2 * p.hy * s + 2.4, p.r * s + 1.2);
      ctx.stroke();
      ctx.restore();
    }
    draw(p.x, p.y, h, 1, this.tilt + sway);
  }
}
