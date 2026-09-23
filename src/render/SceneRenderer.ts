import { POSTER_RECT, type Scene, type SurfaceObject } from '../environment/Scene';
import type { BreakableId, DamageMark, DamageSystem } from '../game/DamageSystem';
import { Rng } from '../math/rng';
import type { Shape } from '../physics/geometry';
import type { Camera } from './Camera';
import { crackStar, deadLines, jaggedPoly, polyPath, screenBleed, shards, splatter } from './DamagePainter';

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
  /** damage version that is currently painted into the buffer */
  private paintedVersion = -1;

  constructor(
    private readonly scene: Scene,
    private readonly damage: DamageSystem | null = null,
    margin = 40,
  ) {
    this.margin = margin;
  }

  private stage(id: BreakableId): number {
    return this.damage ? this.damage.stage(id) : 0;
  }

  private marks(id: BreakableId): DamageMark[] {
    return this.damage ? this.damage.state[id].marks : [];
  }

  /** Repaints the buffer if something broke since the last paint (no reallocation). */
  refresh(): void {
    if (!this.canvas || !this.damage || this.damage.version === this.paintedVersion) return;
    const ctx = this.canvas.getContext('2d') as Ctx | null;
    if (!ctx) return;
    const M = this.margin;
    const k = this.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, M * k, M * k);
    this.paint(ctx);
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
    this.paintedVersion = this.damage ? this.damage.version : -1;
    const lampOn = this.stage('lamp') < 2;

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
    if (lampOn) {
      const glow = ctx.createRadialGradient(420, 140, 5, 420, 140, 150);
      glow.addColorStop(0, 'rgba(255,214,140,0.45)');
      glow.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(250, 40, W + M - 250, deskY - 40);
    }
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
    if (lampOn) {
      const pool = ctx.createRadialGradient(410, 200, 10, 410, 215, 140);
      pool.addColorStop(0, 'rgba(255,215,150,0.28)');
      pool.addColorStop(1, 'rgba(255,215,150,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(250, deskY, W + M - 250, H - deskY);
    }
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
    this.phone(ctx);
    this.contactShadow(ctx, 440, 218, 30, 6, 0.3);
    this.books(ctx);
    this.plate(ctx);
    this.lamp(ctx, lampOn);
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
    const { x, y, w, h } = POSTER_RECT;
    const stage = this.stage('poster');
    ctx.save();
    if (stage >= 2) {
      // knocked crooked: it hangs from the nail at the top centre
      ctx.translate(x + w / 2, y);
      ctx.rotate(0.13);
      ctx.translate(-(x + w / 2), -y + 1.5);
    }
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
    if (stage >= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2.5, y + 2.5, w - 5, h - 5);
      ctx.clip();
      for (const m of this.marks('poster')) {
        crackStar(ctx, m.x, m.y, 14 + 6 * m.stage, m.seed, { color: 'rgba(255,255,255,0.9)', shadow: 'rgba(60,50,40,0.35)', width: 0.3, rings: 1 });
      }
      ctx.restore();
    }
    ctx.restore();
    if (stage >= 2) {
      // the nail it used to hang straight from
      ctx.fillStyle = '#6b5a48';
      ctx.beginPath();
      ctx.arc(x + w / 2, y - 0.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The view outside: sky, clouds, trees and roofs (no glass reflections). */
  private outdoor(ctx: Ctx, glass: Extract<Shape, { kind: 'rect' }>): void {
    const sky = ctx.createLinearGradient(0, glass.y, 0, glass.y + glass.h);
    sky.addColorStop(0, '#7fb8e8');
    sky.addColorStop(0.7, '#bfe0f6');
    sky.addColorStop(1, '#dcefe9');
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
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
  }

  private window(ctx: Ctx): void {
    const glass = this.obj('window-glass').shape as Extract<Shape, { kind: 'rect' }>;
    ctx.save();
    ctx.beginPath();
    ctx.rect(glass.x, glass.y, glass.w, glass.h);
    ctx.clip();
    this.outdoor(ctx, glass);
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
    this.windowDamage(ctx, glass);
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
    // broken glass lying on the sill
    if (this.stage('window') >= 3) {
      for (const m of this.marks('window')) {
        shards(ctx, Math.min(170, Math.max(30, m.x)), sill.y + 5, 16, 3.5, m.seed + 5, 22, 'rgba(225,240,255,0.85)', 'rgba(90,120,150,0.6)', 2.2);
      }
    }
  }

  /** Cracks in the glass; the last stage knocks holes into the panes (drawn inside the glass clip). */
  private windowDamage(ctx: Ctx, glass: Extract<Shape, { kind: 'rect' }>): void {
    const stage = this.stage('window');
    if (!stage) return;
    const marks = this.marks('window');
    if (stage >= 3) {
      // the pane (between frame bars) each hit landed in gets a jagged hole
      const mv = this.obj('window-mullion-v').shape as Extract<Shape, { kind: 'rect' }>;
      const mh = this.obj('window-mullion-h').shape as Extract<Shape, { kind: 'rect' }>;
      const done = new Set<string>();
      for (const m of marks) {
        const left = m.x < mv.x + mv.w / 2;
        const top = m.y < mh.y + mh.h / 2;
        const key = `${left}${top}`;
        if (done.has(key)) continue;
        done.add(key);
        const px0 = left ? glass.x : mv.x + mv.w;
        const px1 = left ? mv.x : glass.x + glass.w;
        const py0 = top ? glass.y : mh.y + mh.h;
        const py1 = top ? mh.y : glass.y + glass.h;
        const cx = Math.min(px1 - 10, Math.max(px0 + 10, m.x));
        const cy = Math.min(py1 - 10, Math.max(py0 + 10, m.y));
        const hole = jaggedPoly(m.seed + 11, cx, cy, Math.min(px1 - px0, py1 - py0) * 0.62, 16, 0.4, 1.15, 0.95);
        ctx.save();
        ctx.beginPath();
        ctx.rect(px0, py0, px1 - px0, py1 - py0);
        ctx.clip();
        // the glass that's left is slightly hazy, so the hole looks clear next to it
        ctx.fillStyle = 'rgba(235,245,255,0.28)';
        ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
        polyPath(ctx, hole);
        ctx.save();
        ctx.clip();
        this.outdoor(ctx, glass); // no glass = no reflections
        ctx.restore();
        polyPath(ctx, hole);
        ctx.strokeStyle = 'rgba(40,60,80,0.35)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(240,250,255,0.95)';
        ctx.lineWidth = 0.45;
        ctx.stroke();
        // cracks from the hole to the frame
        crackStar(ctx, cx, cy, Math.max(px1 - px0, py1 - py0) * 0.75, m.seed + 3, { color: 'rgba(255,255,255,0.85)', shadow: 'rgba(40,60,80,0.3)', width: 0.35 });
        ctx.restore();
      }
    }
    for (const m of marks) {
      crackStar(ctx, m.x, m.y, 16 + 9 * m.stage, m.seed, { color: 'rgba(255,255,255,0.88)', shadow: 'rgba(40,60,80,0.3)', width: 0.35, rings: m.stage });
    }
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
    const stage = this.stage('monitor');
    if (stage >= 2) this.blueScreen(ctx, scr);
    else this.editor(ctx, scr);
    for (const m of this.marks('monitor')) {
      screenBleed(ctx, m.x, m.y, 10 + 8 * m.stage, m.seed);
      deadLines(ctx, scr.x, scr.y, scr.w, scr.h, m.x, m.seed + 1, 2 + 3 * m.stage);
      crackStar(ctx, m.x, m.y, 22 + 14 * m.stage, m.seed + 2, { color: 'rgba(235,240,255,0.8)', shadow: 'rgba(0,0,0,0.6)', width: 0.35, rings: 1 + m.stage });
    }
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

  /** The monitor gave up. */
  private blueScreen(ctx: Ctx, scr: Extract<Shape, { kind: 'rect' }>): void {
    ctx.fillStyle = '#1668c4';
    ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(':(', scr.x + 16, scr.y + 38);
    ctx.font = '600 5.2px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Your desk ran into a problem.', scr.x + 16, scr.y + 52);
    ctx.font = '4px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('FLY_NOT_FOUND · SWATTER_OVERLOAD', scr.x + 16, scr.y + 61);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 3; i++) ctx.fillRect(scr.x + 16, scr.y + 68 + i * 5, 70 - i * 14, 1.6);
    // QR code
    const rng = new Rng(99);
    const qx = scr.x + 16;
    const qy = scr.y + 86;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx - 1, qy - 1, 17, 17);
    ctx.fillStyle = '#1668c4';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (rng.chance(0.5)) ctx.fillRect(qx + i * 2.2, qy + j * 2.2, 2.2, 2.2);
  }

  private editor(ctx: Ctx, scr: Extract<Shape, { kind: 'rect' }>): void {
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

  private lamp(ctx: Ctx, lampOn: boolean): void {
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
    if (lampOn) {
      const glow = ctx.createRadialGradient(422, 106, 2, 422, 110, 60);
      glow.addColorStop(0, 'rgba(255,236,190,0.9)');
      glow.addColorStop(0.25, 'rgba(255,214,140,0.35)');
      glow.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(360, 95, 130, 90);
    } else {
      // bits of the bulb on the desk below
      shards(ctx, 424, 204, 18, 5, 404, 14, 'rgba(240,240,230,0.9)', 'rgba(120,110,90,0.6)', 1.4);
    }
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
    // dents where the swatter hit
    ctx.save();
    shapePath(ctx, shade.shape);
    ctx.clip();
    for (const m of this.marks('lamp')) {
      const g = ctx.createRadialGradient(m.x - 2, m.y - 2, 0, m.x, m.y, 11);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 12, 8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,255,245,0.35)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(m.x + 1.5, m.y + 1.5, 9, 5.5, 0.4, Math.PI * 0.1, Math.PI * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    // rim + opening
    ctx.fillStyle = lampOn ? '#fff3d6' : '#4a4639';
    ctx.beginPath();
    ctx.ellipse(422, 104, 38, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!lampOn) {
      // broken bulb stub
      ctx.fillStyle = 'rgba(210,205,190,0.9)';
      polyPath(ctx, jaggedPoly(77, 422, 104, 5, 10, 0.5, 1, 0.5));
      ctx.fill();
    }
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
    // squashed crumbs get spread all over the desk
    const spread = this.stage('crumbs') ? 2.6 : 1;
    const n = this.stage('crumbs') ? 70 : 26;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next());
      const x = c.cx + Math.cos(a) * c.rx * r * spread;
      const y = c.cy + Math.sin(a) * c.ry * r * spread;
      ctx.fillStyle = rng.chance(0.5) ? '#d9a55c' : '#b77a38';
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(0.4, 1.3), rng.range(0.3, 0.9), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private phone(ctx: Ctx): void {
    const p = this.obj('phone').shape as Extract<Shape, { kind: 'rect' }>;
    this.contactShadow(ctx, p.x + p.w / 2 + 2, p.y + p.h / 2 + 3, p.w * 0.75, p.h * 0.55, 0.3);
    // body
    shapePath(ctx, p as Shape);
    ctx.fillStyle = '#23262d';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,225,0.45)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // screen
    const s = { x: p.x + 1.6, y: p.y + 1.6, w: p.w - 3.2, h: p.h - 3.2 };
    const stage = this.stage('phone');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 4);
    ctx.clip();
    if (stage >= 2) {
      ctx.fillStyle = '#050608';
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else {
      const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
      g.addColorStop(0, '#3a2a6e');
      g.addColorStop(0.55, '#b0457a');
      g.addColorStop(1, '#f39a4c');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 8.5px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('9:41', s.x + s.w / 2, s.y + 19);
      ctx.font = '600 2.6px system-ui, sans-serif';
      ctx.fillText('Tuesday, 23 September', s.x + s.w / 2, s.y + 10.5);
      ctx.textAlign = 'left';
      // lock-screen buttons
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(s.x + 6, s.y + s.h - 7, 2.6, 0, Math.PI * 2);
      ctx.arc(s.x + s.w - 6, s.y + s.h - 7, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(s.x + s.w / 2 - 6, s.y + s.h - 2.2, 12, 0.7);
    }
    for (const m of this.marks('phone')) {
      if (stage >= 2) deadLines(ctx, s.x, s.y, s.w, s.h, m.x, m.seed + 1, 6);
      crackStar(ctx, m.x, m.y, 14 + 10 * m.stage, m.seed, { color: 'rgba(240,245,255,0.85)', shadow: 'rgba(0,0,0,0.55)', width: 0.3, rings: 2 });
    }
    // glass sheen
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.w * 0.6, s.y);
    ctx.lineTo(s.x, s.y + s.h * 0.45);
    ctx.fill();
    ctx.restore();
    // camera island
    ctx.fillStyle = '#0b0c0f';
    ctx.beginPath();
    ctx.roundRect(p.x + p.w / 2 - 5, p.y + 3, 10, 2.6, 1.3);
    ctx.fill();
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
    const stage = this.stage('books');
    // torn-out pages lying on the desk (under the books)
    if (stage >= 2) this.loosePages(ctx, b1.x - 6, b1.y + b1.h - 2, 5, 404);
    book(b1, '#2f5d7c', '#d8b25c');
    book(b2, '#8e3b33', '#e9dcc0');
    ctx.fillStyle = 'rgba(255,245,225,0.8)';
    ctx.font = 'bold 3.2px Georgia, serif';
    ctx.fillText('NEURO', b1.x + 14, b1.y + b1.h * 0.72);
    ctx.fillText('FLIGHT', b2.x + 12, b2.y + b2.h * 0.8);
    if (stage >= 1) {
      // bent covers: crease lines and pages sticking out
      for (const m of this.marks('books')) {
        const rng = new Rng(m.seed);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(m.x - rng.range(8, 14), m.y - rng.range(-6, 6));
        ctx.lineTo(m.x + rng.range(-2, 2), m.y + rng.range(-2, 2));
        ctx.lineTo(m.x + rng.range(8, 14), m.y + rng.range(-6, 6));
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.stroke();
      }
      this.loosePages(ctx, b2.x + b2.w - 4, b2.y + 6, 2, 17, true);
    }
  }

  /** Paper sheets with a few lines of text on them. */
  private loosePages(ctx: Ctx, x: number, y: number, n: number, seed: number, stickingOut = false): void {
    const rng = new Rng(seed);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(x + (stickingOut ? rng.range(0, 3) : rng.range(-30, 60)), y + (stickingOut ? i * 5 : rng.range(0, 14)));
      ctx.rotate(stickingOut ? rng.range(-0.35, 0.1) : rng.range(-0.6, 0.6));
      const w = stickingOut ? 10 : 15;
      const h = stickingOut ? 6 : 11;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0.6, 0.8, w, h);
      ctx.fillStyle = '#f6f1e4';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(80,70,60,0.4)';
      for (let l = 1.6; l < h - 1; l += 1.5) ctx.fillRect(1.2, l, w * rng.range(0.5, 0.85), 0.35);
      ctx.restore();
    }
  }

  private plate(ctx: Ctx): void {
    const p = this.obj('plate').shape as Extract<Shape, { kind: 'ellipse' }>;
    this.contactShadow(ctx, p.cx + 4, p.cy + 6, p.rx * 1.05, p.ry * 0.9, 0.3);
    const g = ctx.createLinearGradient(0, p.cy - p.ry, 0, p.cy + p.ry);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9d4ca');
    const drawPlate = () => {
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
    };
    const plateStage = this.stage('plate');
    const plateMarks = this.marks('plate');
    if (plateStage >= 2) {
      // smashed: wedges pushed apart a little
      const rng = new Rng(plateMarks[plateMarks.length - 1]?.seed ?? 3);
      const cuts: number[] = [];
      let a0 = rng.range(0, Math.PI * 2);
      for (let i = 0; i < 6; i++) cuts.push((a0 += rng.range(0.7, 1.35)));
      for (let i = 0; i < cuts.length; i++) {
        const s0 = cuts[i];
        const s1 = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + Math.PI * 2;
        const mid = (s0 + s1) / 2;
        const off = rng.range(1, 2.4);
        ctx.save();
        ctx.translate(Math.cos(mid) * off, Math.sin(mid) * off * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.cx, p.cy);
        ctx.lineTo(p.cx + Math.cos(s0) * p.rx * 1.5, p.cy + Math.sin(s0) * p.ry * 1.5);
        ctx.lineTo(p.cx + Math.cos(mid) * p.rx * 1.6, p.cy + Math.sin(mid) * p.ry * 1.6);
        ctx.lineTo(p.cx + Math.cos(s1) * p.rx * 1.5, p.cy + Math.sin(s1) * p.ry * 1.5);
        ctx.closePath();
        ctx.clip();
        drawPlate();
        ctx.restore();
      }
      shards(ctx, p.cx, p.cy + p.ry + 3, p.rx, 4, 55, 12, '#f4f0e8', 'rgba(120,110,95,0.6)', 2);
    } else {
      drawPlate();
      for (const m of plateMarks) {
        ctx.save();
        shapePath(ctx, p as Shape);
        ctx.clip();
        crackStar(ctx, m.x, m.y, 16, m.seed, { color: 'rgba(110,95,80,0.75)', width: 0.3 });
        ctx.restore();
      }
    }
    const squashed = (id: string) => this.marks('fruit').filter((m) => m.objectId === id);
    // apple slice
    const a = this.obj('fruit-apple').shape as Extract<Shape, { kind: 'ellipse' }>;
    const appleHits = squashed('fruit-apple');
    if (appleHits.length) {
      for (const m of appleHits) splatter(ctx, a.cx, a.cy, 16 + 8 * m.stage, m.seed, 'rgba(236,214,150,0.85)', 16, 0.45);
      this.squashedFruit(ctx, a, appleHits[0].seed, '#b8322a', '#f3e4b8');
    } else {
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
    }
    // banana piece
    const b = this.obj('fruit-banana').shape as Extract<Shape, { kind: 'ellipse' }>;
    const bananaHits = squashed('fruit-banana');
    if (bananaHits.length) {
      for (const m of bananaHits) splatter(ctx, b.cx, b.cy, 14 + 8 * m.stage, m.seed, 'rgba(250,236,160,0.9)', 16, 0.45);
      this.squashedFruit(ctx, b, bananaHits[0].seed, '#d9b84a', '#fbeea0');
      return;
    }
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

  /** A flattened, burst piece of fruit. */
  private squashedFruit(ctx: Ctx, e: Extract<Shape, { kind: 'ellipse' }>, seed: number, skin: string, flesh: string): void {
    const outer = jaggedPoly(seed + 7, e.cx, e.cy, e.rx * 1.2, 18, 0.25, 1, (e.ry / e.rx) * 1.05);
    polyPath(ctx, outer);
    ctx.fillStyle = skin;
    ctx.fill();
    polyPath(ctx, jaggedPoly(seed + 8, e.cx, e.cy - 0.5, e.rx * 1.05, 18, 0.3, 1, (e.ry / e.rx) * 0.9));
    ctx.fillStyle = flesh;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    polyPath(ctx, jaggedPoly(seed + 9, e.cx - e.rx * 0.2, e.cy - 1, e.rx * 0.4, 10, 0.4, 1, 0.4));
    ctx.fill();
  }

  private cup(ctx: Ctx): void {
    const body = this.obj('cup-body').shape as Extract<Shape, { kind: 'rect' }>;
    const handle = this.obj('cup-handle').shape as Extract<Shape, { kind: 'rect' }>;
    const rim = this.obj('cup-rim').shape as Extract<Shape, { kind: 'ellipse' }>;
    const coffee = this.obj('coffee').shape as Extract<Shape, { kind: 'ellipse' }>;
    const stage = this.stage('cup');
    const marks = this.marks('cup');
    const seed = marks[0]?.seed ?? 1;
    if (stage >= 1) {
      // coffee splashed on the wall behind and a puddle on the desk
      splatter(ctx, rim.cx, rim.cy - 4, 46, seed, 'rgba(92,52,24,0.78)', 34, 0.8, false);
      polyPath(ctx, jaggedPoly(seed + 1, body.x + body.w / 2 + 8, body.y + body.h + 4, stage >= 3 ? 46 : 32, 20, 0.22, 1, 0.22));
      ctx.fillStyle = 'rgba(70,38,16,0.82)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,230,200,0.18)';
      ctx.beginPath();
      ctx.ellipse(body.x + body.w / 2 - 4, body.y + body.h + 2.5, 12, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
    if (stage >= 1) {
      // drips running down the outside
      const rng = new Rng(seed + 2);
      ctx.fillStyle = 'rgba(80,44,18,0.85)';
      for (let i = 0; i < 5; i++) {
        const x = body.x + 4 + rng.range(0, body.w - 8);
        const len = rng.range(6, 26);
        ctx.beginPath();
        ctx.roundRect(x, body.y, rng.range(1, 2.2), len, 1);
        ctx.arc(x + 0.8, body.y + len, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (stage >= 2) {
      ctx.save();
      shapePath(ctx, body as Shape);
      ctx.clip();
      for (const m of marks) if (m.stage >= 2) crackStar(ctx, Math.min(body.x + body.w - 6, Math.max(body.x + 6, m.x)), Math.max(body.y + 8, m.y + 12), 30, m.seed, { color: 'rgba(250,250,255,0.85)', shadow: 'rgba(10,20,40,0.5)', width: 0.4 });
      ctx.restore();
    }
    // rim & coffee
    ctx.fillStyle = '#f1ece2';
    shapePath(ctx, rim as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    const cg = ctx.createRadialGradient(coffee.cx - 6, coffee.cy - 1, 1, coffee.cx, coffee.cy, coffee.rx);
    cg.addColorStop(0, stage >= 3 ? '#3a2a22' : '#6b4028');
    cg.addColorStop(1, stage >= 3 ? '#1a120d' : '#2f1a0f');
    ctx.fillStyle = cg;
    shapePath(ctx, coffee as Shape);
    ctx.fill();
    if (stage < 3) {
      ctx.fillStyle = 'rgba(255,240,220,0.25)';
      ctx.beginPath();
      ctx.ellipse(coffee.cx - 7, coffee.cy - 1.3, 5, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (stage >= 3) {
      // a big chunk broken out of the rim, pieces on the desk
      const m = marks[marks.length - 1];
      const nx = Math.min(body.x + body.w - 14, Math.max(body.x + 14, m.x));
      const rng = new Rng(m.seed);
      const notch: [number, number][] = [[nx - 14, rim.cy + 1]];
      for (let i = 1; i < 9; i++) notch.push([nx - 14 + i * 3.5 + rng.range(-1, 1), rim.cy + 3 + rng.range(4, 9) * Math.sin((i / 9) * Math.PI) + rng.range(0, 5)]);
      notch.push([nx + 17, rim.cy + 1]);
      // the gap shows the coffee-stained inside wall of the mug
      polyPath(ctx, notch);
      const ig = ctx.createLinearGradient(0, rim.cy, 0, rim.cy + 18);
      ig.addColorStop(0, '#b39a80');
      ig.addColorStop(0.45, '#7a563a');
      ig.addColorStop(1, '#3e2716');
      ctx.fillStyle = ig;
      ctx.fill();
      // broken edge: white ceramic showing through the glaze
      ctx.strokeStyle = '#fbf8f2';
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(notch[0][0], notch[0][1]);
      for (let i = 1; i < notch.length; i++) ctx.lineTo(notch[i][0], notch[i][1]);
      ctx.stroke();
      shards(ctx, body.x + body.w / 2 + 6, body.y + body.h + 6, 30, 4, m.seed + 4, 14, '#3c70bd', 'rgba(240,240,255,0.7)', 2.6);
    }
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
    const stage = this.stage('plant');
    const marks = this.marks('plant');
    if (stage >= 2) {
      ctx.save();
      shapePath(ctx, pot as Shape);
      ctx.clip();
      for (const m of marks) {
        if (m.stage < 2) continue;
        crackStar(ctx, Math.min(pot.x + pot.w - 5, Math.max(pot.x + 5, m.x)), Math.min(pot.y + pot.h - 6, Math.max(pot.y + 6, m.y)), 22, m.seed, { color: 'rgba(70,25,10,0.8)', shadow: 'rgba(255,200,170,0.25)', width: 0.45 });
      }
      ctx.restore();
    }
    if (stage >= 3) {
      // chunk broken out of the pot, soil and shards on the sill
      const seed = marks[marks.length - 1].seed;
      polyPath(ctx, jaggedPoly(seed + 3, pot.x + pot.w / 2 + 3, pot.y + pot.h + 1, 26, 18, 0.3, 1, 0.26));
      ctx.fillStyle = '#4a3222';
      ctx.fill();
      shards(ctx, pot.x + pot.w / 2, pot.y + pot.h + 5, 26, 3, seed + 4, 12, '#c9643a', 'rgba(80,30,10,0.6)', 2.4);
      // a chunk broken out of the rim: soil inside, raw terracotta along the break
      const nx = pot.x + pot.w * 0.6;
      const nr = new Rng(seed + 5);
      const notch: [number, number][] = [[nx - 10, pot.y]];
      for (let i = 1; i < 7; i++) notch.push([nx - 10 + i * 3 + nr.range(-0.8, 0.8), pot.y + 3 + 8 * Math.sin((i / 7) * Math.PI) + nr.range(-1.5, 2)]);
      notch.push([nx + 11, pot.y]);
      polyPath(ctx, notch);
      ctx.fillStyle = '#4a3222';
      ctx.fill();
      ctx.strokeStyle = '#e8946a';
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(notch[0][0], notch[0][1]);
      for (let i = 1; i < notch.length; i++) ctx.lineTo(notch[i][0], notch[i][1]);
      ctx.stroke();
    }
    // leaves (drawn inside the leaves ellipse)
    const rng = new Rng(5);
    const greens = stage >= 3 ? ['#5d7a3a', '#6f8a45', '#7d9448', '#566f36'] : ['#3f7d3c', '#4f9a47', '#62b155', '#3a6e36'];
    if (stage >= 3) {
      // the plant slumps to one side
      ctx.save();
      ctx.translate(leaves.cx, pot.y);
      ctx.rotate(0.28);
      ctx.translate(-leaves.cx, -pot.y + 2);
    }
    for (let i = 0; i < 14; i++) {
      const a = rng.range(-Math.PI, 0.25);
      const len = rng.range(10, 17);
      const cx = leaves.cx + Math.cos(a) * (leaves.rx - len * 0.55);
      const cy = leaves.cy + Math.sin(a) * (leaves.ry - len * 0.35) + 3;
      const tilt = rng.range(-0.3, 0.3);
      // knocked-off leaves are missing
      if (stage >= 1 && i % 2 === 1) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 2 + tilt);
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
    if (stage >= 3) ctx.restore();
    if (stage >= 1) {
      // knocked-off leaves lying on the sill
      const lr = new Rng(marks[0].seed);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(pot.x + lr.range(-22, 48), pot.y + pot.h + lr.range(2, 8));
        // lying flat, so mostly sideways
        ctx.rotate(Math.PI / 2 + lr.range(-0.7, 0.7));
        ctx.fillStyle = greens[i % greens.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.7, 4.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,50,20,0.4)';
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(0, -4.4);
        ctx.lineTo(0, 4.4);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
