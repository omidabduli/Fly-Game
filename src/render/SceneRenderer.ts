import type { Scene, SurfaceObject } from '../environment/Scene';
import { Rng } from '../math/rng';
import type { Shape } from '../physics/geometry';
import type { Camera } from './Camera';

/** Light comes from the window (upper-left): shadows fall down-right. */
export const LIGHT_DX = 0.1;
export const LIGHT_DY = 0.16;

type Ctx = CanvasRenderingContext2D;

export function shapePath(ctx: Ctx, s: Shape, inset = 0): void {
  ctx.beginPath();
  switch (s.kind) {
    case 'rect': {
      const r = Math.max(0, s.r - inset);
      ctx.roundRect(s.x + inset, s.y + inset, s.w - 2 * inset, s.h - 2 * inset, r);
      break;
    }
    case 'ellipse':
      ctx.ellipse(s.cx, s.cy, Math.max(0.1, s.rx - inset), Math.max(0.1, s.ry - inset), 0, 0, Math.PI * 2);
      break;
    case 'poly':
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.closePath();
      break;
  }
}

/**
 * Pre-renders the static room (wall, window, monitor, lamp, desk, cup, plate,
 * books, plant) into an offscreen canvas. Everything is drawn from the same
 * shapes the physics uses, so what you see is exactly what the swatter hits.
 */
export class SceneRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private k = 1; // buffer px per mm
  private readonly margin: number;

  constructor(
    private readonly scene: Scene,
    margin = 40,
  ) {
    this.margin = margin;
  }

  /**
   * (Re)build the background at `pxPerMm` device pixels per mm, using at most
   * `maxPx` pixels. iOS Safari has a hard limit on total canvas memory, so the
   * old buffer is shrunk to 0x0 first, which frees it right away.
   */
  build(pxPerMm: number, maxPx = 14e6): void {
    const M = this.margin;
    const W = this.scene.width + 2 * M;
    const H = this.scene.height + 2 * M;
    let k = pxPerMm;
    if (W * H * k * k > maxPx) k = Math.sqrt(maxPx / (W * H));
    const old = this.canvas;
    if (old) {
      old.width = 0;
      old.height = 0;
      this.canvas = null;
    }
    // If the browser refuses a big canvas (out of memory), retry smaller.
    for (let attempt = 0; attempt < 3; attempt++, k *= 0.7) {
      const cw = Math.ceil(W * k);
      const ch = Math.ceil(H * k);
      const c: HTMLCanvasElement | OffscreenCanvas =
        typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: cw, height: ch }) : new OffscreenCanvas(cw, ch);
      const ctx = c.getContext('2d') as Ctx | null;
      if (!ctx) continue;
      this.k = k;
      ctx.setTransform(k, 0, 0, k, M * k, M * k);
      this.paint(ctx);
      this.canvas = c;
      return;
    }
  }

  get built(): boolean {
    return this.canvas !== null;
  }

  draw(ctx: Ctx, cam: Camera, dpr: number): void {
    if (!this.canvas) return;
    const M = this.margin;
    const k = this.k;
    const sx = (cam.x0 + M) * k;
    const sy = (cam.y0 + M) * k;
    const sw = cam.viewWmm * k;
    const sh = cam.viewHmm * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9e1d3';
    ctx.fillRect(0, 0, cam.viewW * dpr, cam.viewH * dpr);
    ctx.drawImage(this.canvas as CanvasImageSource, sx, sy, sw, sh, 0, 0, cam.viewW * dpr, cam.viewH * dpr);
  }

  // ---------------------------------------------------------------------------

  private paint(ctx: Ctx): void {
    const S = this.scene;
    const M = this.margin;
    const W = S.width;
    const H = S.height;
    const deskY = 190;
    const rng = new Rng(7);

    // --- wall -------------------------------------------------------------------
    const wall = ctx.createLinearGradient(0, -M, W, deskY);
    wall.addColorStop(0, '#f3ece0');
    wall.addColorStop(0.55, '#ebe2d3');
    wall.addColorStop(1, '#ddd2c0');
    ctx.fillStyle = wall;
    ctx.fillRect(-M, -M, W + 2 * M, deskY + M + 2);
    // window light spilling onto the wall
    const spill = ctx.createRadialGradient(100, 90, 20, 100, 90, 260);
    spill.addColorStop(0, 'rgba(255,250,235,0.55)');
    spill.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(-M, -M, W + 2 * M, deskY + M);
    // lamp glow on the wall
    const glow = ctx.createRadialGradient(420, 140, 5, 420, 140, 150);
    glow.addColorStop(0, 'rgba(255,214,140,0.45)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(250, 40, W + M - 250, deskY - 40);
    // plaster texture
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(-M, W + M);
      const y = rng.range(-M, deskY);
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(120,100,80,0.05)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, rng.range(0.3, 1.1), rng.range(0.3, 1.1));
    }
    this.poster(ctx);

    // --- drop shadows of wall-mounted / free-standing objects onto the wall ----
    this.dropShadow(ctx, 'window-sill', 40, 0.18);
    this.dropShadow(ctx, 'monitor-bezel', 110, 0.2);
    this.dropShadow(ctx, 'monitor-neck', 100, 0.16);
    this.dropShadow(ctx, 'plant-pot', 30, 0.18);
    this.dropShadow(ctx, 'plant-leaves', 36, 0.14);
    this.dropShadow(ctx, 'lamp-shade', 175, 0.14);
    this.dropShadow(ctx, 'lamp-arm-upper', 165, 0.12);
    this.dropShadow(ctx, 'lamp-arm-lower', 165, 0.12);

    this.window(ctx);
    this.monitor(ctx);

    // --- desk ---------------------------------------------------------------------
    const desk = ctx.createLinearGradient(0, deskY, 0, H + M);
    desk.addColorStop(0, '#9c6a41');
    desk.addColorStop(0.12, '#b27d4f');
    desk.addColorStop(1, '#a06b40');
    ctx.fillStyle = desk;
    ctx.fillRect(-M, deskY, W + 2 * M, H - deskY);
    // wood grain
    ctx.lineWidth = 0.35;
    for (let i = 0; i < 70; i++) {
      const y = rng.range(deskY + 2, H - 1);
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(90,50,20,0.16)' : 'rgba(255,220,170,0.1)';
      ctx.beginPath();
      ctx.moveTo(-M, y);
      let x = -M;
      let yy = y;
      while (x < W + M) {
        x += rng.range(20, 60);
        yy += rng.range(-1.2, 1.2);
        ctx.quadraticCurveTo(x - 15, yy + rng.range(-1.5, 1.5), x, yy);
      }
      ctx.stroke();
    }
    // back edge: the desk meets the wall
    const edge = ctx.createLinearGradient(0, deskY - 3, 0, deskY + 6);
    edge.addColorStop(0, 'rgba(60,35,15,0.35)');
    edge.addColorStop(0.4, 'rgba(60,35,15,0.25)');
    edge.addColorStop(1, 'rgba(60,35,15,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(-M, deskY - 3, W + 2 * M, 9);
    // lamp light pool on the desk
    const pool = ctx.createRadialGradient(410, 200, 10, 410, 215, 140);
    pool.addColorStop(0, 'rgba(255,215,150,0.28)');
    pool.addColorStop(1, 'rgba(255,215,150,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(250, deskY, W + M - 250, H - deskY);
    // front edge + apron
    ctx.fillStyle = '#7a4c2a';
    ctx.fillRect(-M, H, W + 2 * M, M);
    ctx.fillStyle = 'rgba(255,225,185,0.35)';
    ctx.fillRect(-M, H - 1.2, W + 2 * M, 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-M, H, W + 2 * M, 2.5);

    // --- things on the desk --------------------------------------------------------
    this.contactShadow(ctx, 298, 205, 48, 8, 0.28);
    this.monitorBase(ctx);
    this.crumbs(ctx);
    this.contactShadow(ctx, 440, 218, 30, 6, 0.3);
    this.books(ctx);
    this.plate(ctx);
    this.lamp(ctx);
    this.contactShadow(ctx, 180, 248, 36, 6, 0.32);
    this.cup(ctx);
    this.plant(ctx);
  }

  private obj(id: string): SurfaceObject {
    const o = this.scene.byId(id);
    if (!o) throw new Error(`missing scene object ${id}`);
    return o;
  }

  private dropShadow(ctx: Ctx, id: string, dh: number, alpha: number): void {
    const o = this.obj(id);
    const far = 10000;
    ctx.save();
    ctx.translate(-far, 0);
    shapePath(ctx, o.shape);
    ctx.shadowColor = `rgba(40,25,10,${alpha})`;
    ctx.shadowBlur = Math.max(2, dh * 0.08) * this.k;
    ctx.shadowOffsetX = (far + dh * LIGHT_DX) * this.k;
    ctx.shadowOffsetY = dh * LIGHT_DY * this.k;
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  private contactShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(40,20,5,${alpha})`);
    g.addColorStop(1, 'rgba(40,20,5,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private poster(ctx: Ctx): void {
    // A small framed anatomy print on the wall (flat decoration).
    const x = 412;
    const y = 10;
    const w = 48;
    const h = 36;
    ctx.save();
    ctx.shadowColor = 'rgba(40,25,10,0.18)';
    ctx.shadowBlur = 2 * this.k;
    ctx.shadowOffsetX = 0.6 * this.k;
    ctx.shadowOffsetY = 1 * this.k;
    ctx.fillStyle = '#3a3129';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = '#f6f0e2';
    ctx.fillRect(x + 2.5, y + 2.5, w - 5, h - 5);
    // tiny fly sketch
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2 + 1);
    ctx.strokeStyle = 'rgba(60,40,30,0.7)';
    ctx.lineWidth = 0.35;
    ctx.fillStyle = 'rgba(200,210,225,0.6)';
    ctx.beginPath();
    ctx.ellipse(-6, -4, 8, 3.2, -0.5, 0, Math.PI * 2);
    ctx.ellipse(6, -4, 8, 3.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b08850';
    ctx.beginPath();
    ctx.ellipse(0, 1, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b3202a';
    ctx.beginPath();
    ctx.arc(-1.4, -4.8, 1.2, 0, Math.PI * 2);
    ctx.arc(1.4, -4.8, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,40,30,0.75)';
    ctx.font = '2.4px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drosophila melanogaster', 0, 12);
    ctx.restore();
  }

  private window(ctx: Ctx): void {
    const glass = this.obj('window-glass').shape as Extract<Shape, { kind: 'rect' }>;
    // sky
    const sky = ctx.createLinearGradient(0, glass.y, 0, glass.y + glass.h);
    sky.addColorStop(0, '#7fb8e8');
    sky.addColorStop(0.7, '#bfe0f6');
    sky.addColorStop(1, '#dcefe9');
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(glass.x, glass.y, glass.w, glass.h);
    ctx.clip();
    // clouds
    const cloud = (cx: number, cy: number, s: number) => {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 14 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 8 * s, cy + 1.5 * s, 8 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 9 * s, cy + 1 * s, 9 * s, 4.5 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 2 * s, cy - 3 * s, 8 * s, 4.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    cloud(62, 48, 1);
    cloud(138, 62, 0.8);
    cloud(118, 40, 0.55);
    // distant trees / roofs
    ctx.fillStyle = '#7fa893';
    ctx.beginPath();
    ctx.moveTo(glass.x, glass.y + glass.h);
    for (let x = glass.x; x <= glass.x + glass.w; x += 6) {
      ctx.lineTo(x, glass.y + glass.h - 14 - 6 * Math.abs(Math.sin(x * 0.11)) - 4 * Math.sin(x * 0.037));
    }
    ctx.lineTo(glass.x + glass.w, glass.y + glass.h);
    ctx.fill();
    ctx.fillStyle = '#9db8ad';
    ctx.fillRect(glass.x + 18, glass.y + glass.h - 26, 16, 26);
    ctx.fillRect(glass.x + 86, glass.y + glass.h - 20, 22, 20);
    ctx.beginPath();
    ctx.moveTo(glass.x + 16, glass.y + glass.h - 26);
    ctx.lineTo(glass.x + 26, glass.y + glass.h - 34);
    ctx.lineTo(glass.x + 36, glass.y + glass.h - 26);
    ctx.fill();
    // reflections
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(glass.x + 20, glass.y);
    ctx.lineTo(glass.x + 36, glass.y);
    ctx.lineTo(glass.x - 10, glass.y + glass.h);
    ctx.lineTo(glass.x - 26, glass.y + glass.h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(glass.x + 110, glass.y);
    ctx.lineTo(glass.x + 116, glass.y);
    ctx.lineTo(glass.x + 76, glass.y + glass.h);
    ctx.lineTo(glass.x + 70, glass.y + glass.h);
    ctx.fill();
    ctx.restore();
    // frame pieces
    for (const id of ['window-frame-top', 'window-frame-bottom', 'window-frame-left', 'window-frame-right', 'window-mullion-v', 'window-mullion-h']) {
      const o = this.obj(id);
      shapePath(ctx, o.shape);
      ctx.fillStyle = '#f5f2ec';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,110,95,0.35)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    // inner shadow along the frame
    ctx.strokeStyle = 'rgba(60,70,80,0.18)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(glass.x + 0.6, glass.y + 0.6, glass.w - 1.2, glass.h - 1.2);
    // sill
    const sill = this.obj('window-sill').shape as Extract<Shape, { kind: 'rect' }>;
    const sg = ctx.createLinearGradient(0, sill.y, 0, sill.y + sill.h);
    sg.addColorStop(0, '#fbf9f4');
    sg.addColorStop(0.6, '#ece7dd');
    sg.addColorStop(1, '#d9d2c4');
    ctx.fillStyle = sg;
    shapePath(ctx, sill as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(110,100,85,0.35)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  private monitor(ctx: Ctx): void {
    const bez = this.obj('monitor-bezel');
    const scr = this.obj('monitor-screen').shape as Extract<Shape, { kind: 'rect' }>;
    const neck = this.obj('monitor-neck').shape as Extract<Shape, { kind: 'rect' }>;
    // neck
    const ng = ctx.createLinearGradient(neck.x, 0, neck.x + neck.w, 0);
    ng.addColorStop(0, '#6b707a');
    ng.addColorStop(0.5, '#9aa0a9');
    ng.addColorStop(1, '#5d626b');
    ctx.fillStyle = ng;
    ctx.fillRect(neck.x, neck.y - 2, neck.w, neck.h + 2);
    // bezel
    shapePath(ctx, bez.shape);
    const bg = ctx.createLinearGradient(0, 34, 0, 162);
    bg.addColorStop(0, '#2b2e35');
    bg.addColorStop(1, '#1b1d22');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // screen
    ctx.save();
    shapePath(ctx, scr as Shape);
    ctx.clip();
    ctx.fillStyle = '#161a26';
    ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    // editor chrome
    ctx.fillStyle = '#1d2233';
    ctx.fillRect(scr.x, scr.y, scr.w, 7);
    ctx.fillStyle = '#12151f';
    ctx.fillRect(scr.x, scr.y + 7, 26, scr.h - 7);
    const dots = ['#ff5f57', '#febc2e', '#28c840'];
    dots.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(scr.x + 4 + i * 3.2, scr.y + 3.5, 1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#262c40';
    ctx.fillRect(scr.x + 30, scr.y + 1.5, 26, 4.5);
    // file tree
    const rng = new Rng(21);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i === 3 ? 'rgba(130,170,255,0.55)' : 'rgba(180,190,210,0.28)';
      ctx.fillRect(scr.x + 3 + (i % 3 === 0 ? 0 : 3), scr.y + 11 + i * 6.2, rng.range(8, 17), 2);
    }
    // code lines
    const palette = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#a6accd'];
    let y = scr.y + 11;
    let indent = 0;
    while (y < scr.y + scr.h - 3) {
      ctx.fillStyle = 'rgba(120,130,160,0.35)';
      ctx.fillRect(scr.x + 29, y, 3, 1.6);
      if (rng.chance(0.12)) {
        y += 4.6;
        continue;
      }
      if (rng.chance(0.25)) indent = Math.max(0, Math.min(3, indent + (rng.chance(0.5) ? 1 : -1)));
      let x = scr.x + 36 + indent * 6;
      const tokens = rng.int(2, 6);
      for (let k = 0; k < tokens && x < scr.x + scr.w - 8; k++) {
        const w = rng.range(4, 16);
        ctx.fillStyle = palette[rng.int(0, palette.length)];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, w, 1.8);
        x += w + rng.range(1.5, 3);
      }
      ctx.globalAlpha = 1;
      y += 4.6;
    }
    // cursor
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(scr.x + 92, scr.y + 57, 0.8, 3);
    // glare
    const gl = ctx.createLinearGradient(scr.x, scr.y, scr.x + scr.w, scr.y + scr.h);
    gl.addColorStop(0, 'rgba(255,255,255,0.1)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    ctx.restore();
    // brand dot
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(298, 156, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private monitorBase(ctx: Ctx): void {
    const b = this.obj('monitor-base').shape as Extract<Shape, { kind: 'ellipse' }>;
    const g = ctx.createLinearGradient(0, b.cy - b.ry, 0, b.cy + b.ry);
    g.addColorStop(0, '#a3a8b0');
    g.addColorStop(1, '#5c6068');
    ctx.fillStyle = g;
    shapePath(ctx, b as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(b.cx, b.cy - b.ry * 0.35, b.rx * 0.7, b.ry * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private lamp(ctx: Ctx): void {
    const base = this.obj('lamp-base').shape as Extract<Shape, { kind: 'ellipse' }>;
    const bg = ctx.createLinearGradient(0, base.cy - base.ry, 0, base.cy + base.ry);
    bg.addColorStop(0, '#4a5a62');
    bg.addColorStop(1, '#233036');
    ctx.fillStyle = bg;
    shapePath(ctx, base as Shape);
    ctx.fill();
    for (const id of ['lamp-arm-lower', 'lamp-arm-upper']) {
      shapePath(ctx, this.obj(id).shape);
      ctx.fillStyle = '#34444c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
    }
    // joints
    ctx.fillStyle = '#1f2a2f';
    for (const [x, y] of [[438, 208], [452, 133], [421, 88]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // bulb glow under the shade
    const glow = ctx.createRadialGradient(422, 106, 2, 422, 110, 60);
    glow.addColorStop(0, 'rgba(255,236,190,0.9)');
    glow.addColorStop(0.25, 'rgba(255,214,140,0.35)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(360, 95, 130, 90);
    // shade
    const shade = this.obj('lamp-shade');
    shapePath(ctx, shade.shape);
    const sg = ctx.createLinearGradient(382, 0, 462, 0);
    sg.addColorStop(0, '#1f6f6f');
    sg.addColorStop(0.4, '#2f9494');
    sg.addColorStop(1, '#1a5959');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // rim + opening
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.ellipse(422, 104, 38, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(404, 60);
    ctx.lineTo(412, 60);
    ctx.lineTo(398, 101);
    ctx.lineTo(391, 101);
    ctx.fill();
  }

  private crumbs(ctx: Ctx): void {
    const c = this.obj('crumbs').shape as Extract<Shape, { kind: 'ellipse' }>;
    const rng = new Rng(31);
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next());
      const x = c.cx + Math.cos(a) * c.rx * r;
      const y = c.cy + Math.sin(a) * c.ry * r;
      ctx.fillStyle = rng.chance(0.5) ? '#d9a55c' : '#b77a38';
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(0.4, 1.3), rng.range(0.3, 0.9), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private books(ctx: Ctx): void {
    const b1 = this.obj('book-bottom').shape as Extract<Shape, { kind: 'rect' }>;
    const b2 = this.obj('book-top').shape as Extract<Shape, { kind: 'rect' }>;
    this.contactShadow(ctx, b1.x + b1.w / 2, b1.y + b1.h, b1.w * 0.55, 5, 0.3);
    const book = (r: Extract<Shape, { kind: 'rect' }>, cover: string, band: string) => {
      shapePath(ctx, r as Shape);
      ctx.fillStyle = cover;
      ctx.fill();
      // pages on the right end
      ctx.fillStyle = '#efe7d6';
      ctx.fillRect(r.x + r.w - 7, r.y + 2.5, 5.5, r.h - 5);
      ctx.strokeStyle = 'rgba(120,100,80,0.35)';
      ctx.lineWidth = 0.25;
      for (let y = r.y + 4; y < r.y + r.h - 3; y += 1.6) {
        ctx.beginPath();
        ctx.moveTo(r.x + r.w - 7, y);
        ctx.lineTo(r.x + r.w - 1.5, y);
        ctx.stroke();
      }
      ctx.fillStyle = band;
      ctx.fillRect(r.x + 10, r.y + r.h * 0.3, r.w - 26, r.h * 0.18);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 9, 1.2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.4;
      shapePath(ctx, r as Shape);
      ctx.stroke();
    };
    book(b1, '#2f5d7c', '#d8b25c');
    book(b2, '#8e3b33', '#e9dcc0');
    ctx.fillStyle = 'rgba(255,245,225,0.8)';
    ctx.font = 'bold 3.2px Georgia, serif';
    ctx.fillText('NEURO', b1.x + 14, b1.y + b1.h * 0.72);
    ctx.fillText('FLIGHT', b2.x + 12, b2.y + b2.h * 0.8);
  }

  private plate(ctx: Ctx): void {
    const p = this.obj('plate').shape as Extract<Shape, { kind: 'ellipse' }>;
    this.contactShadow(ctx, p.cx + 4, p.cy + 6, p.rx * 1.05, p.ry * 0.9, 0.3);
    const g = ctx.createLinearGradient(0, p.cy - p.ry, 0, p.cy + p.ry);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9d4ca');
    ctx.fillStyle = g;
    shapePath(ctx, p as Shape);
    ctx.fill();
    ctx.fillStyle = '#f1ede4';
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy + 1, p.rx * 0.72, p.ry * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,140,125,0.35)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // apple slice
    const a = this.obj('fruit-apple').shape as Extract<Shape, { kind: 'ellipse' }>;
    this.contactShadow(ctx, a.cx + 2, a.cy + 4, a.rx, a.ry * 0.7, 0.25);
    ctx.fillStyle = '#b8322a';
    shapePath(ctx, a as Shape);
    ctx.fill();
    ctx.fillStyle = '#f3e4b8';
    ctx.beginPath();
    ctx.ellipse(a.cx, a.cy - 1.2, a.rx * 0.93, a.ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,160,90,0.4)';
    ctx.beginPath();
    ctx.ellipse(a.cx + 1, a.cy - 1, a.rx * 0.35, a.ry * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a2a18';
    ctx.beginPath();
    ctx.ellipse(a.cx - 1.5, a.cy - 1.5, 1, 1.6, 0.4, 0, Math.PI * 2);
    ctx.ellipse(a.cx + 3, a.cy - 0.8, 1, 1.6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // banana piece
    const b = this.obj('fruit-banana').shape as Extract<Shape, { kind: 'ellipse' }>;
    this.contactShadow(ctx, b.cx + 2, b.cy + 3, b.rx, b.ry * 0.7, 0.22);
    const bg = ctx.createLinearGradient(0, b.cy - b.ry, 0, b.cy + b.ry);
    bg.addColorStop(0, '#fbeea0');
    bg.addColorStop(1, '#d9b84a');
    ctx.fillStyle = bg;
    shapePath(ctx, b as Shape);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,70,20,0.55)';
    for (const [dx, dy] of [[-5, -1], [3, 1.5], [6, -2], [-1, 2.5]]) {
      ctx.beginPath();
      ctx.arc(b.cx + dx, b.cy + dy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private cup(ctx: Ctx): void {
    const body = this.obj('cup-body').shape as Extract<Shape, { kind: 'rect' }>;
    const handle = this.obj('cup-handle').shape as Extract<Shape, { kind: 'rect' }>;
    const rim = this.obj('cup-rim').shape as Extract<Shape, { kind: 'ellipse' }>;
    const coffee = this.obj('coffee').shape as Extract<Shape, { kind: 'ellipse' }>;
    // handle (ring)
    ctx.strokeStyle = '#3564a8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(handle.x + 2, handle.y + handle.h / 2, handle.w - 4, handle.h / 2 - 3, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // body with cylindrical shading
    const g = ctx.createLinearGradient(body.x, 0, body.x + body.w, 0);
    g.addColorStop(0, '#244d8a');
    g.addColorStop(0.3, '#4b82cf');
    g.addColorStop(0.55, '#3c70bd');
    g.addColorStop(1, '#1f427a');
    ctx.fillStyle = g;
    shapePath(ctx, body as Shape);
    ctx.fill();
    // band + logo
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(body.x, body.y + 28, body.w, 9);
    ctx.fillStyle = '#244d8a';
    ctx.font = 'bold 5px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LAB', body.x + body.w / 2, body.y + 34.6);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(body.x + 9, body.y + 8, 4, body.h - 16);
    // rim & coffee
    ctx.fillStyle = '#f1ece2';
    shapePath(ctx, rim as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    const cg = ctx.createRadialGradient(coffee.cx - 6, coffee.cy - 1, 1, coffee.cx, coffee.cy, coffee.rx);
    cg.addColorStop(0, '#6b4028');
    cg.addColorStop(1, '#2f1a0f');
    ctx.fillStyle = cg;
    shapePath(ctx, coffee as Shape);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,220,0.25)';
    ctx.beginPath();
    ctx.ellipse(coffee.cx - 7, coffee.cy - 1.3, 5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private plant(ctx: Ctx): void {
    const pot = this.obj('plant-pot').shape as Extract<Shape, { kind: 'rect' }>;
    const leaves = this.obj('plant-leaves').shape as Extract<Shape, { kind: 'ellipse' }>;
    const pg = ctx.createLinearGradient(pot.x, 0, pot.x + pot.w, 0);
    pg.addColorStop(0, '#a54f2c');
    pg.addColorStop(0.45, '#d06a3e');
    pg.addColorStop(1, '#94452a');
    ctx.fillStyle = pg;
    shapePath(ctx, pot as Shape);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(pot.x, pot.y, pot.w, 4);
    ctx.fillStyle = '#4a3222';
    ctx.fillRect(pot.x + 2, pot.y + 1, pot.w - 4, 2);
    // leaves (drawn inside the leaves ellipse)
    const rng = new Rng(5);
    const greens = ['#3f7d3c', '#4f9a47', '#62b155', '#3a6e36'];
    for (let i = 0; i < 14; i++) {
      const a = rng.range(-Math.PI, 0.25);
      const len = rng.range(10, 17);
      const cx = leaves.cx + Math.cos(a) * (leaves.rx - len * 0.55);
      const cy = leaves.cy + Math.sin(a) * (leaves.ry - len * 0.35) + 3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 2 + rng.range(-0.3, 0.3));
      ctx.fillStyle = greens[i % greens.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, len * 0.28, len * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,50,20,0.35)';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, -len * 0.5);
      ctx.lineTo(0, len * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}
