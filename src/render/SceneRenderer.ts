import { POSTER_RECT, type Scene, type SurfaceObject, TABLE_Y } from '../environment/Scene';
import type { BreakableId, DamageMark, DamageSystem } from '../game/DamageSystem';
import { Rng } from '../math/rng';
import type { Shape } from '../physics/geometry';
import type { Camera } from './Camera';
import { crackStar, deadLines, jaggedPoly, polyPath, screenBleed, shards, splatter } from './DamagePainter';

/** Light comes from the windows (upper right): shadows fall down-left. */
export const LIGHT_DX = -0.08;
export const LIGHT_DY = 0.16;

type Ctx = CanvasRenderingContext2D;
type RectS = Extract<Shape, { kind: 'rect' }>;
type EllS = Extract<Shape, { kind: 'ellipse' }>;

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

/** The table and everything standing on it are painted from here down (tall glasses reach up to ~200). */
const FRONT_Y0 = 186;

interface Layer {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** world y range the layer covers (x always covers the world plus the margin) */
  y0: number;
  y1: number;
}

const GLASS_CRACK = { color: 'rgba(255,255,255,0.88)', shadow: 'rgba(40,60,80,0.3)', width: 0.35 };

/**
 * Pre-renders the Mensa into two offscreen canvases: the back (wall, food
 * counter, window, the rest of the dining hall) and the front (the table and
 * everything on it). The people are drawn live in between. Everything is
 * drawn from the same shapes the physics uses, so what you see is what the
 * swatter hits.
 */
export class SceneRenderer {
  private back: Layer | null = null;
  private front: Layer | null = null;
  private k = 1; // buffer px per mm
  private readonly margin: number;
  /** damage version that is currently painted into the buffers */
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

  /**
   * (Re)build both layers at `pxPerMm` device pixels per mm, using at most
   * `maxPx` pixels in total. iOS Safari has a hard limit on total canvas
   * memory, so old buffers are shrunk to 0x0 first, which frees them right away.
   */
  build(pxPerMm: number, maxPx = 14e6): void {
    const M = this.margin;
    const W = this.scene.width + 2 * M;
    const backY: [number, number] = [-M, TABLE_Y + 10];
    const frontY: [number, number] = [FRONT_Y0, this.scene.height + M];
    const area = W * (backY[1] - backY[0] + frontY[1] - frontY[0]);
    let k = Math.min(pxPerMm, Math.sqrt(maxPx / area));
    for (const old of [this.back, this.front]) {
      if (old) {
        old.canvas.width = 0;
        old.canvas.height = 0;
      }
    }
    this.back = this.front = null;
    // If the browser refuses a big canvas (out of memory), retry smaller.
    for (let attempt = 0; attempt < 3; attempt++, k *= 0.7) {
      const back = this.makeLayer(W, backY, k);
      const front = this.makeLayer(W, frontY, k);
      if (!back || !front) continue;
      this.k = k;
      this.back = back;
      this.front = front;
      this.paintAll();
      return;
    }
  }

  private makeLayer(W: number, [y0, y1]: [number, number], k: number): Layer | null {
    const cw = Math.ceil(W * k);
    const ch = Math.ceil((y1 - y0) * k);
    const c: HTMLCanvasElement | OffscreenCanvas =
      typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: cw, height: ch }) : new OffscreenCanvas(cw, ch);
    return c.getContext('2d') ? { canvas: c, y0, y1 } : null;
  }

  private paintAll(): void {
    this.paintedVersion = this.damage ? this.damage.version : -1;
    for (const [L, paint] of [
      [this.back, (c: Ctx) => this.paintBack(c)],
      [this.front, (c: Ctx) => this.paintFront(c)],
    ] as const) {
      if (!L) continue;
      const ctx = L.canvas.getContext('2d') as Ctx;
      const k = this.k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
      ctx.setTransform(k, 0, 0, k, this.margin * k, -L.y0 * k);
      ctx.save();
      paint(ctx);
      ctx.restore();
    }
  }

  /** Repaints the buffers if something broke since the last paint (no reallocation). */
  refresh(): void {
    if (!this.back || !this.damage || this.damage.version === this.paintedVersion) return;
    this.paintAll();
  }

  get built(): boolean {
    return this.back !== null;
  }

  /** Background: wall, counter, window, the dining hall (draws over the whole canvas). */
  drawBack(ctx: Ctx, cam: Camera, dpr: number, shx = 0, shy = 0): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#d9d3c9';
    ctx.fillRect(0, 0, cam.viewW * dpr, cam.viewH * dpr);
    if (this.back) this.blit(ctx, this.back, cam, dpr, shx, shy);
  }

  /** The table and what's on it (in front of the people). */
  drawFront(ctx: Ctx, cam: Camera, dpr: number, shx = 0, shy = 0): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.front) this.blit(ctx, this.front, cam, dpr, shx, shy);
  }

  /** Copy the part of a layer that is in view (source rect clipped to the buffer: Safari draws nothing otherwise). */
  private blit(ctx: Ctx, L: Layer, cam: Camera, dpr: number, shx: number, shy: number): void {
    const M = this.margin;
    const k = this.k;
    const wx0 = cam.x0 - shx / cam.scale;
    const wy0 = cam.y0 - shy / cam.scale;
    const ix0 = Math.max(wx0, -M);
    const iy0 = Math.max(wy0, L.y0);
    const ix1 = Math.min(wx0 + cam.viewWmm, this.scene.width + M);
    const iy1 = Math.min(wy0 + cam.viewHmm, L.y1);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    const s = cam.scale * dpr;
    ctx.drawImage(L.canvas as CanvasImageSource, (ix0 + M) * k, (iy0 - L.y0) * k, (ix1 - ix0) * k, (iy1 - iy0) * k, (ix0 - wx0) * s, (iy0 - wy0) * s, (ix1 - ix0) * s, (iy1 - iy0) * s);
  }

  private obj(id: string): SurfaceObject {
    const o = this.scene.byId(id);
    if (!o) throw new Error(`missing scene object ${id}`);
    return o;
  }

  private rectOf(id: string): RectS {
    return this.obj(id).shape as RectS;
  }

  private ellOf(id: string): EllS {
    return this.obj(id).shape as EllS;
  }

  private contactShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(40,25,10,${alpha})`);
    g.addColorStop(1, 'rgba(40,25,10,0)');
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

  // ===========================================================================
  // Back layer
  // ===========================================================================

  private paintBack(ctx: Ctx): void {
    const S = this.scene;
    const M = this.margin;
    const W = S.width;
    const rng = new Rng(7);
    // --- wall ---
    const wall = ctx.createLinearGradient(0, -M, 0, 200);
    wall.addColorStop(0, '#f1ede6');
    wall.addColorStop(1, '#e2dcd2');
    ctx.fillStyle = wall;
    ctx.fillRect(-M, -M, W + 2 * M, TABLE_Y + 10 + M);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(110,100,90,0.05)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(rng.range(-M, W + M), rng.range(-M, 90), rng.range(0.3, 1), rng.range(0.3, 1));
    }
    this.ceilingLights(ctx);
    this.slatPanel(ctx);
    this.kitchenWall(ctx);
    this.mensaSign(ctx);
    this.clock(ctx);
    this.menuScreen(ctx);
    this.window(ctx);
    this.poster(ctx);
    this.diningHall(ctx);
    this.counter(ctx);
    this.plant(ctx);
  }

  private ceilingLights(ctx: Ctx): void {
    for (const x of [100, 290, 460]) {
      const g = ctx.createRadialGradient(x, -2, 2, x, 10, 110);
      g.addColorStop(0, 'rgba(255,238,200,0.5)');
      g.addColorStop(1, 'rgba(255,238,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 110, -30, 220, 140);
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, -40);
      ctx.lineTo(x, -10);
      ctx.stroke();
      ctx.fillStyle = '#2f3a36';
      ctx.beginPath();
      ctx.moveTo(x - 16, 0);
      ctx.lineTo(x - 5, -10);
      ctx.lineTo(x + 5, -10);
      ctx.lineTo(x + 16, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath();
      ctx.ellipse(x, 0, 16, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Wooden acoustic slats on the dining-hall wall with a coloured stripe on top. */
  private slatPanel(ctx: Ctx): void {
    const W = this.scene.width + this.margin;
    const x0 = 205;
    const y0 = 88;
    const g = ctx.createLinearGradient(0, y0, 0, 200);
    g.addColorStop(0, '#c9a57a');
    g.addColorStop(1, '#b08a5f');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, W - x0, 200 - y0);
    ctx.fillStyle = 'rgba(70,45,20,0.28)';
    for (let x = x0 + 3; x < W; x += 6) ctx.fillRect(x, y0, 1, 200 - y0);
    ctx.fillStyle = 'rgba(255,240,215,0.14)';
    for (let x = x0 + 1; x < W; x += 6) ctx.fillRect(x, y0, 0.8, 200 - y0);
    // accent stripe
    ctx.fillStyle = '#1f8a86';
    ctx.fillRect(x0, y0 - 5, W - x0, 5);
    ctx.fillStyle = '#e9a23b';
    ctx.fillRect(x0, y0 - 7, W - x0, 2);
  }

  /** White kitchen tiles behind the food counter. */
  private kitchenWall(ctx: Ctx): void {
    ctx.fillStyle = '#eef1f0';
    ctx.fillRect(-this.margin, 44, 205 + this.margin, 80);
    ctx.strokeStyle = 'rgba(120,140,140,0.28)';
    ctx.lineWidth = 0.35;
    for (let y = 44; y <= 124; y += 8) {
      ctx.beginPath();
      ctx.moveTo(-this.margin, y);
      ctx.lineTo(205, y);
      ctx.stroke();
    }
    for (let x = -40; x <= 205; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 44);
      ctx.lineTo(x, 124);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(203, 40, 3, 90);
  }

  private mensaSign(ctx: Ctx): void {
    ctx.save();
    ctx.font = '900 25px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillText('MENSA', 67, 38);
    ctx.fillStyle = '#1f8a86';
    ctx.fillText('MENSA', 66, 37);
    ctx.font = '700 5px system-ui, sans-serif';
    ctx.fillStyle = '#6b6258';
    ctx.fillText('Mahlzeit! · Bremen', 68, 44.5);
    ctx.restore();
  }

  private clock(ctx: Ctx): void {
    const c = this.ellOf('clock');
    const stage = this.stage('clock');
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(c.cx - 0.8, c.cy + 1.6, c.rx + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f33';
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbfaf6';
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.rx - 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f33';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = i % 3 === 0 ? 2.4 : 1.2;
      ctx.save();
      ctx.translate(c.cx + Math.sin(a) * (c.rx - 3.5), c.cy - Math.cos(a) * (c.rx - 3.5));
      ctx.rotate(a);
      ctx.fillRect(-0.3, -l / 2, 0.6, l);
      ctx.restore();
    }
    // 12:10, lunchtime. A broken clock's hands have dropped to half past six.
    const hand = (a: number, len: number, w: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.cx, c.cy);
      ctx.lineTo(c.cx + Math.sin(a) * len, c.cy - Math.cos(a) * len);
      ctx.stroke();
    };
    const dead = stage >= 2;
    hand(dead ? Math.PI * 1.02 : (12 + 10 / 60) * (Math.PI / 6), 7, 1.1, '#2b2f33');
    hand(dead ? Math.PI * 0.97 : (10 / 60) * Math.PI * 2, 10.5, 0.8, '#2b2f33');
    hand(dead ? Math.PI : (37 / 60) * Math.PI * 2, 11, 0.3, '#d23a2a');
    ctx.fillStyle = '#d23a2a';
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, 0.9, 0, Math.PI * 2);
    ctx.fill();
    if (stage >= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, c.rx - 1.6, 0, Math.PI * 2);
      ctx.clip();
      for (const m of this.marks('clock')) crackStar(ctx, m.x, m.y, 12 + 5 * m.stage, m.seed, { ...GLASS_CRACK, color: 'rgba(120,130,140,0.8)', rings: 1 });
      ctx.restore();
    }
  }

  private menuScreen(ctx: Ctx): void {
    const r = this.rectOf('menu-screen');
    const stage = this.stage('menu');
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.roundRect(r.x - 1.2, r.y + 2, r.w, r.h, 3);
    ctx.fill();
    ctx.fillStyle = '#16181c';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 3);
    ctx.fill();
    const s = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.x, s.y, s.w, s.h);
    ctx.clip();
    if (stage >= 2) {
      ctx.fillStyle = '#1668c4';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#fff';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(':(', s.x + 8, s.y + 26);
      ctx.font = '700 5.2px system-ui, sans-serif';
      ctx.fillText('Speiseplan nicht gefunden.', s.x + 8, s.y + 38);
      ctx.font = '4px system-ui, sans-serif';
      ctx.fillText('Fehler 404: Essen 2 ist aus.', s.x + 8, s.y + 46);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(s.x + 8, s.y + 52, 60, 1.4);
    } else {
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g.addColorStop(0, '#1d4f4c');
      g.addColorStop(1, '#123634');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#e9a23b';
      ctx.fillRect(s.x, s.y, s.w, 11);
      ctx.fillStyle = '#1d1a14';
      ctx.font = '900 6.4px ui-rounded, system-ui, sans-serif';
      ctx.fillText('SPEISEPLAN', s.x + 4, s.y + 8);
      ctx.font = '700 4px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Dienstag · 12:10', s.x + s.w - 4, s.y + 7.6);
      ctx.textAlign = 'left';
      const rows: [string, string, string][] = [
        ['Essen 1', 'Currywurst mit Pommes', '3,20 €'],
        ['Essen 2', 'Kohl und Pinkel', '3,90 €'],
        ['Vegan', 'Linsen-Dal mit Reis', '2,80 €'],
        ['Beilage', 'Salatbar (100 g)', '0,95 €'],
        ['Dessert', 'Schokopudding', '0,90 €'],
      ];
      rows.forEach(([a, b, c], i) => {
        const y = s.y + 19 + i * 9.4;
        ctx.fillStyle = '#e9a23b';
        ctx.font = '800 3.8px system-ui, sans-serif';
        ctx.fillText(a.toUpperCase(), s.x + 4, y);
        ctx.fillStyle = '#f3efe6';
        ctx.font = '600 4.6px system-ui, sans-serif';
        ctx.fillText(b, s.x + 27, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9be15d';
        ctx.fillText(c, s.x + s.w - 4, y);
        ctx.textAlign = 'left';
        if (i === 1) {
          // sold out, as always
          ctx.fillStyle = '#e8413a';
          ctx.save();
          ctx.translate(s.x + 78, y - 1.8);
          ctx.rotate(-0.12);
          ctx.fillRect(-1, -3.2, 20, 5.2);
          ctx.fillStyle = '#fff';
          ctx.font = '900 3.6px system-ui, sans-serif';
          ctx.fillText('AUS!', 2.4, 0.9);
          ctx.restore();
        }
      });
    }
    for (const m of this.marks('menu')) {
      screenBleed(ctx, m.x, m.y, 9 + 7 * m.stage, m.seed);
      deadLines(ctx, s.x, s.y, s.w, s.h, m.x, m.seed + 1, 2 + 3 * m.stage);
      crackStar(ctx, m.x, m.y, 20 + 12 * m.stage, m.seed + 2, { color: 'rgba(235,240,255,0.8)', shadow: 'rgba(0,0,0,0.6)', width: 0.35, rings: 1 + m.stage });
    }
    const gl = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
    gl.addColorStop(0, 'rgba(255,255,255,0.1)');
    gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
  }

  // --- window ------------------------------------------------------------------

  /** Rainy Bremen: grey sky, red-brick campus, trees, bikes, drizzle. */
  private outdoor(ctx: Ctx, g: RectS): void {
    const sky = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
    sky.addColorStop(0, '#9fb0bd');
    sky.addColorStop(0.65, '#c8d3da');
    sky.addColorStop(1, '#d6dcd8');
    ctx.fillStyle = sky;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    const cloud = (cx: number, cy: number, s: number, a: number) => {
      ctx.fillStyle = `rgba(235,240,245,${a})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 12 * s, cy + 2 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 12 * s, cy + 1.5 * s, 13 * s, 5.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    cloud(400, 24, 1.1, 0.7);
    cloud(480, 34, 1.3, 0.55);
    cloud(530, 20, 0.9, 0.6);
    // red-brick buildings
    const base = g.y + g.h;
    const bld = (x: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, base - h, w, h);
      ctx.fillStyle = 'rgba(40,50,60,0.35)';
      for (let yy = base - h + 5; yy < base - 8; yy += 7) for (let xx = x + 3; xx < x + w - 4; xx += 7) ctx.fillRect(xx, yy, 3.5, 4);
    };
    bld(378, 44, 58, '#9a4b3b');
    bld(420, 30, 40, '#a8584a');
    bld(492, 60, 70, '#8f4436');
    // trees
    ctx.fillStyle = '#5f7f5a';
    for (const [x, r] of [[455, 16], [476, 12], [376, 10]] as const) {
      ctx.beginPath();
      ctx.arc(x, base - 22, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.6, base - 18, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6f7a6a';
    ctx.fillRect(g.x, base - 9, g.w, 9);
    // a row of bikes (it's Bremen)
    ctx.strokeStyle = 'rgba(40,45,50,0.75)';
    ctx.lineWidth = 0.5;
    for (let x = 440; x < 530; x += 13) {
      ctx.beginPath();
      ctx.arc(x, base - 4, 3, 0, Math.PI * 2);
      ctx.arc(x + 7, base - 4, 3, 0, Math.PI * 2);
      ctx.moveTo(x, base - 4);
      ctx.lineTo(x + 3, base - 8);
      ctx.lineTo(x + 7, base - 4);
      ctx.stroke();
    }
    // drizzle
    const rng = new Rng(13);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    for (let i = 0; i < 140; i++) {
      const x = rng.range(g.x, g.x + g.w);
      const y = rng.range(g.y, g.y + g.h);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 1.5, y + 5);
    }
    ctx.stroke();
  }

  private window(ctx: Ctx): void {
    const glass = this.rectOf('window-glass');
    ctx.save();
    ctx.beginPath();
    ctx.rect(glass.x, glass.y, glass.w, glass.h);
    ctx.clip();
    this.outdoor(ctx, glass);
    // raindrops on the glass
    const rng = new Rng(17);
    for (let i = 0; i < 70; i++) {
      const x = rng.range(glass.x, glass.x + glass.w);
      const y = rng.range(glass.y, glass.y + glass.h);
      const r = rng.range(0.4, 1.2);
      ctx.fillStyle = 'rgba(80,95,110,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.4, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(glass.x + 70, glass.y);
    ctx.lineTo(glass.x + 90, glass.y);
    ctx.lineTo(glass.x + 40, glass.y + glass.h);
    ctx.lineTo(glass.x + 20, glass.y + glass.h);
    ctx.fill();
    this.windowDamage(ctx, glass);
    ctx.restore();
    for (const id of ['window-frame-top', 'window-frame-bottom', 'window-frame-left', 'window-frame-right', 'window-mullion-1', 'window-mullion-2', 'window-mullion-h']) {
      shapePath(ctx, this.obj(id).shape);
      ctx.fillStyle = '#4b5359';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    if (this.stage('window') >= 3) {
      const f = this.rectOf('window-frame-bottom');
      for (const m of this.marks('window')) shards(ctx, Math.min(548, Math.max(372, m.x)), f.y + 3, 16, 2.5, m.seed + 5, 18, 'rgba(225,240,255,0.85)', 'rgba(90,120,150,0.6)', 2);
    }
  }

  /** Cracks in the glass; the last stage knocks holes into the panes. */
  private windowDamage(ctx: Ctx, glass: RectS): void {
    const stage = this.stage('window');
    if (!stage) return;
    const marks = this.marks('window');
    if (stage >= 3) {
      const cols = [
        [glass.x, this.rectOf('window-mullion-1').x],
        [this.rectOf('window-mullion-1').x + 5, this.rectOf('window-mullion-2').x],
        [this.rectOf('window-mullion-2').x + 5, glass.x + glass.w],
      ];
      const mh = this.rectOf('window-mullion-h');
      const done = new Set<string>();
      for (const m of marks) {
        const col = cols.find(([a, b]) => m.x >= a - 3 && m.x <= b + 3) ?? cols[0];
        const top = m.y < mh.y + mh.h / 2;
        const key = `${col[0]}${top}`;
        if (done.has(key)) continue;
        done.add(key);
        const [px0, px1] = col;
        const py0 = top ? glass.y : mh.y + mh.h;
        const py1 = top ? mh.y : glass.y + glass.h;
        const cx = Math.min(px1 - 10, Math.max(px0 + 10, m.x));
        const cy = Math.min(py1 - 10, Math.max(py0 + 10, m.y));
        const hole = jaggedPoly(m.seed + 11, cx, cy, Math.min(px1 - px0, py1 - py0) * 0.62, 16, 0.4, 1.1, 0.95);
        ctx.save();
        ctx.beginPath();
        ctx.rect(px0, py0, px1 - px0, py1 - py0);
        ctx.clip();
        ctx.fillStyle = 'rgba(235,245,255,0.3)';
        ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
        polyPath(ctx, hole);
        ctx.save();
        ctx.clip();
        this.outdoor(ctx, glass);
        ctx.restore();
        polyPath(ctx, hole);
        ctx.strokeStyle = 'rgba(40,60,80,0.35)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(240,250,255,0.95)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        crackStar(ctx, cx, cy, Math.max(px1 - px0, py1 - py0) * 0.75, m.seed + 3, GLASS_CRACK);
        ctx.restore();
      }
    }
    for (const m of marks) crackStar(ctx, m.x, m.y, 16 + 9 * m.stage, m.seed, { ...GLASS_CRACK, rings: m.stage });
  }

  /** The Bremen Town Musicians: donkey, dog, cat and rooster. */
  private poster(ctx: Ctx): void {
    const { x, y, w, h } = POSTER_RECT;
    const stage = this.stage('poster');
    ctx.fillStyle = 'rgba(40,25,10,0.2)';
    ctx.fillRect(x - 0.8, y + 1.4, w, h);
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x + 2, y + 2, w - 4, 5);
    ctx.fillStyle = '#fff';
    ctx.font = '800 3.2px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BREMER STADTMUSIKANTEN', x + w / 2, y + 5.6);
    ctx.textAlign = 'left';
    // silhouettes stacked up
    const cx = x + w / 2;
    const by = y + h - 6;
    ctx.fillStyle = '#2d2a26';
    // donkey
    ctx.beginPath();
    ctx.ellipse(cx, by - 9, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 9, by - 6, 2, 7);
    ctx.fillRect(cx + 7, by - 6, 2, 7);
    ctx.beginPath();
    ctx.ellipse(cx + 13, by - 14, 3, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + 12, by - 22, 1.3, 5);
    ctx.fillRect(cx + 14.5, by - 22, 1.3, 5);
    // dog
    ctx.beginPath();
    ctx.ellipse(cx, by - 18, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, by - 21, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // cat
    ctx.beginPath();
    ctx.ellipse(cx - 1, by - 25, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3, by - 28, 2, 0, Math.PI * 2);
    ctx.fill();
    // rooster
    ctx.beginPath();
    ctx.ellipse(cx, by - 32, 3, 2.4, 0, 0, Math.PI * 2);
    ctx.arc(cx + 2.6, by - 35, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(cx + 2, by - 37.8, 1.6, 1.3);
    ctx.fillStyle = 'rgba(60,50,40,0.7)';
    ctx.font = 'italic 2.6px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('„Etwas Besseres als den Tod', cx, y + h - 3.2);
    ctx.fillText('findest du überall.“', cx, y + h - 0.6);
    ctx.textAlign = 'left';
    if (stage >= 1) {
      // torn corner hanging down
      const m = this.marks('poster')[0];
      const rng = new Rng(m.seed);
      const tx = x + rng.range(8, w - 8);
      ctx.fillStyle = '#e2dcd2';
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h * (stage >= 2 ? 0.95 : 0.45));
      ctx.lineTo(tx + 3, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8cdb5';
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx + 3, y + 8);
      ctx.lineTo(x + w, y + h * (stage >= 2 ? 0.95 : 0.45));
      ctx.lineTo(x + w - 6, y + h * (stage >= 2 ? 0.95 : 0.45) + 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The rest of the Mensa behind our table: another table with students. */
  private diningHall(ctx: Ctx): void {
    const W = this.scene.width + this.margin;
    const rng = new Rng(29);
    ctx.save();
    ctx.beginPath();
    ctx.rect(205, 120, W - 205, 90);
    ctx.clip();
    const shirts = ['#8aa0b4', '#b48a8a', '#9ab08c', '#b4a27a', '#8c8fb0', '#a89a8e'];
    for (let x = 212; x < W; x += rng.range(24, 36)) {
      const hy = 150 + rng.range(-3, 4);
      ctx.fillStyle = shirts[rng.int(0, shirts.length)];
      ctx.beginPath();
      ctx.roundRect(x - 10, hy + 7, 20, 30, 6);
      ctx.fill();
      ctx.fillStyle = rng.chance(0.5) ? '#d9b89c' : '#c29a7a';
      ctx.beginPath();
      ctx.arc(x, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ['#4a3a2c', '#2e2621', '#8a6a3c', '#b7b0a6'][rng.int(0, 4)];
      ctx.beginPath();
      ctx.arc(x, hy - 2, 6, Math.PI, 0);
      ctx.fill();
    }
    // their table
    ctx.fillStyle = '#cdb28c';
    ctx.fillRect(205, 178, W - 205, 7);
    ctx.fillStyle = 'rgba(80,60,40,0.3)';
    ctx.fillRect(205, 185, W - 205, 1.5);
    for (let x = 220; x < W; x += rng.range(20, 34)) {
      ctx.fillStyle = '#a89378';
      ctx.fillRect(x, 176, 14, 2.5);
      ctx.fillStyle = '#f2efe8';
      ctx.beginPath();
      ctx.ellipse(x + 7, 176.5, 4, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // floor
    const fl = ctx.createLinearGradient(0, 186, 0, TABLE_Y + 10);
    fl.addColorStop(0, '#9aa0a0');
    fl.addColorStop(1, '#7f8686');
    ctx.fillStyle = fl;
    ctx.fillRect(205, 186, W - 205, 60);
    // atmospheric haze: it's far away
    ctx.fillStyle = 'rgba(225,220,212,0.35)';
    ctx.fillRect(205, 120, W - 205, 90);
    ctx.restore();
  }

  /** Stainless-steel food counter with trays of food behind the sneeze guard. */
  private counter(ctx: Ctx): void {
    const c = this.rectOf('counter');
    const food = this.rectOf('counter-food');
    const guard = this.rectOf('sneeze-guard');
    const M = this.margin;
    // floor under the counter
    ctx.fillStyle = '#8a9090';
    ctx.fillRect(-M, c.y + c.h, 205 + M, 60);
    // food in its pans
    ctx.fillStyle = '#9aa3a8';
    ctx.fillRect(-M, food.y, food.x + food.w + M, food.h);
    const pans: [string, (x: number, y: number, w: number, h: number, r: Rng) => void][] = [
      ['#b83a22', (x, y, w, h, r) => this.foodBits(ctx, x, y, w, h, r, ['#8c3b1a', '#c9542c', '#6e2a12'], 26, 2.2)], // currywurst
      ['#e8b44a', (x, y, w, h, r) => this.foodBits(ctx, x, y, w, h, r, ['#f2c65a', '#d9a23a', '#fbd97a'], 40, 3)], // fries
      ['#3f6b2f', (x, y, w, h, r) => this.foodBits(ctx, x, y, w, h, r, ['#2f5a24', '#4a7f38', '#5d8f45'], 34, 2.4)], // Grünkohl
      ['#e0c79a', (x, y, w, h, r) => this.foodBits(ctx, x, y, w, h, r, ['#e9d7b0', '#d4b88a'], 30, 1.6)], // rice
      ['#c79a2c', (x, y, w, h, r) => this.foodBits(ctx, x, y, w, h, r, ['#b07c1c', '#d9aa3c', '#8d5a14'], 26, 2)], // dal
    ];
    const pw = (food.w - 8) / pans.length;
    const rng = new Rng(41);
    pans.forEach(([bg, fill], i) => {
      const x = food.x + 4 + i * pw;
      ctx.fillStyle = '#c9d0d4';
      ctx.fillRect(x, food.y + 1, pw - 2, food.h - 2);
      ctx.fillStyle = bg;
      ctx.fillRect(x + 1, food.y + 2, pw - 4, food.h - 4);
      fill(x + 1, food.y + 2, pw - 4, food.h - 4, rng);
    });
    // Kohl und Pinkel: sausages on the kale
    ctx.fillStyle = '#9a6a4a';
    const kx = food.x + 4 + 2 * pw;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(kx + 8 + i * 8, food.y + 7, 4, 1.8, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // warm light on the food
    const gl = ctx.createLinearGradient(0, food.y - 4, 0, food.y + food.h);
    gl.addColorStop(0, 'rgba(255,190,90,0.35)');
    gl.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(food.x, food.y - 4, food.w, food.h + 4);
    // counter front
    const cg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    cg.addColorStop(0, '#d9dee1');
    cg.addColorStop(0.5, '#b9c0c4');
    cg.addColorStop(1, '#9aa2a7');
    ctx.fillStyle = cg;
    ctx.fillRect(-M, c.y, c.x + c.w + M, c.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = -M; x < c.x + c.w; x += 2.2) ctx.fillRect(x, c.y, 0.6, c.h);
    ctx.fillStyle = '#f4f6f7';
    ctx.fillRect(-M, c.y, c.x + c.w + M, 2);
    // tray slide rails
    for (const ry of [c.y + 24, c.y + 30]) {
      ctx.fillStyle = '#e9edef';
      ctx.fillRect(-M, ry, c.x + c.w + M, 2.4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-M, ry + 2.4, c.x + c.w + M, 0.8);
    }
    // price cards
    const cards: [string, string, string][] = [
      ['ESSEN 1', '3,20 €', '#e9a23b'],
      ['ESSEN 2', '3,90 €', '#1f8a86'],
      ['VEGAN', '2,80 €', '#5aa43c'],
    ];
    cards.forEach(([a, b, col], i) => {
      const x = 16 + i * 62;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(x, c.y + 6, 40, 13, 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 4px system-ui, sans-serif';
      ctx.fillText(a, x + 3, c.y + 11.5);
      ctx.font = '800 4.6px system-ui, sans-serif';
      ctx.fillText(b, x + 3, c.y + 17);
    });
    ctx.fillStyle = 'rgba(40,50,55,0.55)';
    ctx.font = '800 4.4px system-ui, sans-serif';
    ctx.fillText('AUSGABE  →', 150, c.y + 52);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(c.x + c.w - 1, c.y, 2, c.h);
    // sneeze guard ("Spuckschutz")
    const stage = this.stage('sneeze-guard');
    ctx.fillStyle = '#8e979c';
    ctx.fillRect(-M, guard.y - 1.2, guard.x + guard.w + M, 1.4);
    for (let x = 20; x < guard.x + guard.w; x += 60) ctx.fillRect(x, guard.y - 1, 1.2, guard.h + 14);
    ctx.fillStyle = 'rgba(210,235,245,0.28)';
    ctx.fillRect(-M, guard.y, guard.x + guard.w + M, guard.h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-M, guard.y + 1, guard.x + guard.w + M, 0.8);
    if (stage >= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(guard.x, guard.y, guard.w, guard.h);
      ctx.clip();
      for (const m of this.marks('sneeze-guard')) {
        if (stage >= 2) {
          polyPath(ctx, jaggedPoly(m.seed + 4, m.x, guard.y + guard.h / 2, 16, 12, 0.35, 1.4, 0.6));
          ctx.fillStyle = 'rgba(154,163,168,0.9)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
        crackStar(ctx, m.x, m.y, 14 + 8 * m.stage, m.seed, { ...GLASS_CRACK, rings: 1 });
      }
      ctx.restore();
      if (stage >= 2) for (const m of this.marks('sneeze-guard')) shards(ctx, m.x, food.y + food.h / 2, 16, 4, m.seed + 9, 16, 'rgba(225,240,255,0.9)', 'rgba(90,120,150,0.6)', 2);
    }
  }

  private foodBits(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng, cols: string[], n: number, size: number): void {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = cols[rng.int(0, cols.length)];
      ctx.beginPath();
      ctx.ellipse(x + rng.range(1, w - 1), y + rng.range(1, h - 1), size * rng.range(0.4, 1), size * rng.range(0.25, 0.6), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private plant(ctx: Ctx): void {
    const pot = this.rectOf('plant-pot');
    const leaves = this.ellOf('plant-leaves');
    const stage = this.stage('plant');
    const marks = this.marks('plant');
    // trunk
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(pot.x + pot.w / 2, pot.y + 2);
    ctx.quadraticCurveTo(pot.x + pot.w / 2 - 4, leaves.cy + 10, leaves.cx, leaves.cy);
    ctx.stroke();
    const pg = ctx.createLinearGradient(pot.x, 0, pot.x + pot.w, 0);
    pg.addColorStop(0, '#a54f2c');
    pg.addColorStop(0.45, '#d06a3e');
    pg.addColorStop(1, '#94452a');
    ctx.fillStyle = pg;
    shapePath(ctx, pot as Shape);
    ctx.fill();
    ctx.fillStyle = '#4a3222';
    ctx.fillRect(pot.x + 2, pot.y + 1, pot.w - 4, 2);
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
      const seed = marks[marks.length - 1].seed;
      polyPath(ctx, jaggedPoly(seed + 3, pot.x + pot.w / 2 - 6, pot.y + pot.h + 1, 24, 18, 0.3, 1, 0.26));
      ctx.fillStyle = '#4a3222';
      ctx.fill();
      shards(ctx, pot.x + pot.w / 2 - 6, pot.y + pot.h + 4, 22, 3, seed + 4, 12, '#c9643a', 'rgba(80,30,10,0.6)', 2.4);
      const nx = pot.x + pot.w * 0.45;
      const nr = new Rng(seed + 5);
      const notch: [number, number][] = [[nx - 10, pot.y]];
      for (let i = 1; i < 7; i++) notch.push([nx - 10 + i * 3 + nr.range(-0.8, 0.8), pot.y + 3 + 8 * Math.sin((i / 7) * Math.PI) + nr.range(-1.5, 2)]);
      notch.push([nx + 11, pot.y]);
      polyPath(ctx, notch);
      ctx.fillStyle = '#4a3222';
      ctx.fill();
      ctx.strokeStyle = '#e8946a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const rng = new Rng(5);
    const greens = stage >= 3 ? ['#5d7a3a', '#6f8a45', '#7d9448'] : ['#2f6b34', '#3f7d3c', '#4f9a47', '#62b155'];
    const n = stage >= 1 ? 16 : 30;
    for (let i = 0; i < 30; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(rng.next());
      const x = leaves.cx + Math.cos(a) * leaves.rx * rr * 0.9;
      const y = leaves.cy + Math.sin(a) * leaves.ry * rr * 0.9 + (stage >= 3 ? 6 : 0);
      const rot = rng.range(0, Math.PI * 2);
      if (i >= n) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = greens[i % greens.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (stage >= 1) {
      const lr = new Rng(marks[0].seed);
      for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.translate(pot.x + lr.range(-26, 30), pot.y + pot.h + lr.range(2, 10));
        ctx.rotate(Math.PI / 2 + lr.range(-0.7, 0.7));
        ctx.fillStyle = greens[i % greens.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.8, 4.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ===========================================================================
  // Front layer: the table and everything on it
  // ===========================================================================

  private paintFront(ctx: Ctx): void {
    const S = this.scene;
    const M = this.margin;
    const W = S.width;
    const H = S.height;
    const t = this.rectOf('table');
    // table top (light beech laminate)
    const tg = ctx.createLinearGradient(0, t.y, 0, H);
    tg.addColorStop(0, '#d8bf98');
    tg.addColorStop(0.15, '#e6cfa8');
    tg.addColorStop(1, '#dcc29a');
    ctx.fillStyle = tg;
    ctx.fillRect(-M, t.y, W + 2 * M, H - t.y);
    const rng = new Rng(3);
    ctx.lineWidth = 0.3;
    for (let i = 0; i < 45; i++) {
      const y = rng.range(t.y + 2, H - 2);
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(150,110,60,0.12)' : 'rgba(255,245,225,0.18)';
      ctx.beginPath();
      ctx.moveTo(-M, y);
      let x = -M;
      let yy = y;
      while (x < W + M) {
        x += rng.range(30, 70);
        yy += rng.range(-0.6, 0.6);
        ctx.quadraticCurveTo(x - 20, yy + rng.range(-0.8, 0.8), x, yy);
      }
      ctx.stroke();
    }
    // shade along the back edge (the diners lean over it)
    const sh = ctx.createLinearGradient(0, t.y, 0, t.y + 12);
    sh.addColorStop(0, 'rgba(60,40,20,0.35)');
    sh.addColorStop(1, 'rgba(60,40,20,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-M, t.y, W + 2 * M, 12);
    ctx.fillStyle = 'rgba(255,250,235,0.6)';
    ctx.fillRect(-M, t.y, W + 2 * M, 0.8);
    // front edge + beyond
    ctx.fillStyle = '#b89a70';
    ctx.fillRect(-M, H, W + 2 * M, 5);
    ctx.fillStyle = '#5b5f60';
    ctx.fillRect(-M, H + 5, W + 2 * M, M);
    ctx.fillStyle = 'rgba(255,250,235,0.5)';
    ctx.fillRect(-M, H - 1, W + 2 * M, 1);
    // bits on the table
    this.tableCrumbs(ctx);
    this.juergenPlace(ctx);
    this.schmidtPlace(ctx);
    this.lukasPlace(ctx);
    this.miaPlace(ctx);
  }

  private tableCrumbs(ctx: Ctx): void {
    const rng = new Rng(61);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(170,120,60,0.6)' : 'rgba(120,80,40,0.5)';
      ctx.beginPath();
      ctx.arc(rng.range(10, 550), rng.range(292, 316), rng.range(0.3, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    // a lost chip
    ctx.fillStyle = '#e9b64d';
    ctx.save();
    ctx.translate(150, 300);
    ctx.rotate(0.4);
    ctx.fillRect(-4, -1, 8, 2);
    ctx.restore();
  }

  /** Mensa tray: brown plastic with a raised rim. */
  private tray(ctx: Ctx, id: string): void {
    const r = this.rectOf(id);
    this.contactShadow(ctx, r.x + r.w / 2 - 2, r.y + r.h / 2 + 4, r.w * 0.6, r.h * 0.6, 0.25);
    shapePath(ctx, r as Shape);
    ctx.fillStyle = '#8c7a66';
    ctx.fill();
    shapePath(ctx, r as Shape, 2);
    ctx.fillStyle = '#a28e77';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,230,0.3)';
    ctx.lineWidth = 0.4;
    shapePath(ctx, r as Shape, 0.4);
    ctx.stroke();
  }

  /** White plate; smashed plates are pushed apart into wedges. */
  private plate(ctx: Ctx, id: string, breakId: BreakableId): void {
    const p = this.ellOf(id);
    this.contactShadow(ctx, p.cx - 1, p.cy + 4, p.rx * 1.02, p.ry * 0.9, 0.28);
    const g = ctx.createLinearGradient(0, p.cy - p.ry, 0, p.cy + p.ry);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#dcd7ce');
    const draw = () => {
      ctx.fillStyle = g;
      shapePath(ctx, p as Shape);
      ctx.fill();
      ctx.fillStyle = '#f2eee6';
      ctx.beginPath();
      ctx.ellipse(p.cx, p.cy + 0.8, p.rx * 0.72, p.ry * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,140,125,0.35)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
    };
    const stage = this.stage(breakId);
    const marks = this.marks(breakId);
    if (stage >= 2) {
      const rng = new Rng(marks[marks.length - 1].seed);
      const cuts: number[] = [];
      let a0 = rng.range(0, Math.PI * 2);
      for (let i = 0; i < 6; i++) cuts.push((a0 += rng.range(0.7, 1.35)));
      for (let i = 0; i < cuts.length; i++) {
        const s0 = cuts[i];
        const s1 = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + Math.PI * 2;
        const mid = (s0 + s1) / 2;
        const off = rng.range(0.8, 2);
        ctx.save();
        ctx.translate(Math.cos(mid) * off, Math.sin(mid) * off * 0.5);
        ctx.beginPath();
        ctx.moveTo(p.cx, p.cy);
        ctx.lineTo(p.cx + Math.cos(s0) * p.rx * 1.5, p.cy + Math.sin(s0) * p.ry * 1.5);
        ctx.lineTo(p.cx + Math.cos(mid) * p.rx * 1.6, p.cy + Math.sin(mid) * p.ry * 1.6);
        ctx.lineTo(p.cx + Math.cos(s1) * p.rx * 1.5, p.cy + Math.sin(s1) * p.ry * 1.5);
        ctx.closePath();
        ctx.clip();
        draw();
        ctx.restore();
      }
      shards(ctx, p.cx, p.cy + p.ry + 3, p.rx, 3, 55, 10, '#f4f0e8', 'rgba(120,110,95,0.6)', 1.8);
    } else {
      draw();
      if (stage >= 1) {
        ctx.save();
        shapePath(ctx, p as Shape);
        ctx.clip();
        for (const m of marks) crackStar(ctx, m.x, m.y, 14, m.seed, { color: 'rgba(110,95,80,0.75)', width: 0.3 });
        ctx.restore();
      }
    }
  }

  /** A drinking glass with its drink (`rgb` like '120,58,20'); spilled and smashed variants. */
  private glass(ctx: Ctx, id: string, breakId: BreakableId, rgb: string, foam: string): void {
    const drink = `rgb(${rgb})`;
    const body = this.rectOf(`${id}-body`);
    const stage = this.stage(breakId);
    const marks = this.marks(breakId);
    const seed = marks[0]?.seed ?? 1;
    this.contactShadow(ctx, body.x + body.w / 2 - 1, body.y + body.h + 1, body.w * 0.8, 3, 0.3);
    if (stage >= 1) {
      polyPath(ctx, jaggedPoly(seed + 1, body.x + body.w / 2 - 6, body.y + body.h + 3, 20, 18, 0.25, 1.1, 0.3));
      ctx.fillStyle = `rgba(${rgb},0.6)`;
      ctx.fill();
      splatter(ctx, body.x + body.w / 2, body.y + body.h / 2, 26, seed + 2, `rgba(${rgb},0.55)`, 14, 0.6, false);
    }
    const topY = stage >= 2 ? body.y + body.h * 0.45 : body.y;
    const level = stage >= 1 ? body.y + body.h * 0.62 : body.y + 5;
    ctx.save();
    ctx.beginPath();
    if (stage >= 2) {
      // jagged broken top
      ctx.moveTo(body.x, body.y + body.h);
      ctx.lineTo(body.x, topY + 3);
      const rng = new Rng(seed + 3);
      for (let x = body.x + 2; x < body.x + body.w; x += 2.5) ctx.lineTo(x, topY + rng.range(-3, 4));
      ctx.lineTo(body.x + body.w, topY + 2);
      ctx.lineTo(body.x + body.w, body.y + body.h);
      ctx.closePath();
    } else ctx.roundRect(body.x, body.y, body.w, body.h, 3);
    ctx.clip();
    ctx.fillStyle = 'rgba(225,238,245,0.4)';
    ctx.fillRect(body.x, body.y - 2, body.w, body.h + 4);
    ctx.fillStyle = drink;
    ctx.fillRect(body.x, Math.max(level, topY), body.w, body.y + body.h - Math.max(level, topY));
    ctx.fillStyle = foam;
    ctx.fillRect(body.x, Math.max(level, topY) - 0.2, body.w, 1.4);
    // bubbles
    const rb = new Rng(seed + 5);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(body.x + rb.range(2, body.w - 2), rb.range(Math.max(level, topY) + 2, body.y + body.h - 2), rb.range(0.3, 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(body.x + 2, body.y, 1.8, body.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,140,150,0.6)';
    ctx.lineWidth = 0.4;
    if (stage < 2) {
      ctx.beginPath();
      ctx.roundRect(body.x, body.y, body.w, body.h, 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,245,250,0.6)';
      ctx.beginPath();
      ctx.ellipse(body.x + body.w / 2, body.y, body.w / 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = drink;
      ctx.beginPath();
      ctx.ellipse(body.x + body.w / 2, body.y + 0.4, body.w / 2 - 2, 2, 0, 0, Math.PI * 2);
      ctx.globalAlpha = stage >= 1 ? 0.25 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else shards(ctx, body.x + body.w / 2, body.y + body.h + 4, 20, 4, seed + 6, 14, 'rgba(230,242,250,0.9)', 'rgba(100,130,150,0.6)', 1.8);
    for (const m of marks) {
      if (m.stage < 2 || stage < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(body.x, topY, body.w, body.y + body.h - topY);
      ctx.clip();
      crackStar(ctx, body.x + body.w / 2, (topY + body.y + body.h) / 2, 14, m.seed, GLASS_CRACK);
      ctx.restore();
    }
  }

  // --- Jürgen ---
  private juergenPlace(ctx: Ctx): void {
    this.tray(ctx, 'tray-juergen');
    this.plate(ctx, 'plate-juergen', 'plate-juergen');
    // fries: rot-weiß (ketchup and mayo)
    const f = this.ellOf('fries');
    if (this.stage('fries')) {
      const rng = new Rng(this.marks('fries')[0].seed);
      for (let i = 0; i < 26; i++) this.fry(ctx, f.cx + rng.range(-50, 50), f.cy + rng.range(-14, 26), rng.range(0, Math.PI), rng);
    } else {
      const rng = new Rng(19);
      for (let i = 0; i < 18; i++) this.fry(ctx, f.cx + rng.range(-f.rx, f.rx) * 0.8, f.cy + rng.range(-f.ry, f.ry) * 0.6, rng.range(-0.6, 0.6) + (i % 2 ? 0.3 : -0.4), rng);
      ctx.fillStyle = '#d23a2a';
      ctx.beginPath();
      ctx.ellipse(f.cx + 2, f.cy - 2, 5, 2.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbf6e6';
      ctx.beginPath();
      ctx.ellipse(f.cx + 7, f.cy + 1, 4.2, 2.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Currywurst: sliced, in sauce, with curry powder and the little wooden fork
    const c = this.ellOf('currywurst');
    if (this.stage('currywurst')) {
      const m = this.marks('currywurst')[0];
      splatter(ctx, c.cx, c.cy, 30, m.seed, 'rgba(178,48,24,0.85)', 24, 0.5);
      const rng = new Rng(m.seed + 1);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = '#8c4a26';
        ctx.beginPath();
        ctx.ellipse(c.cx + rng.range(-20, 20), c.cy + rng.range(-5, 8), rng.range(1.5, 3), rng.range(1, 1.8), rng.range(0, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#b8321d';
      shapePath(ctx, c as Shape);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const x = c.cx - c.rx + 3.5 + i * 4.6;
        ctx.fillStyle = '#9c5a32';
        ctx.beginPath();
        ctx.ellipse(x, c.cy - 0.6, 2.2, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d9a17a';
        ctx.beginPath();
        ctx.ellipse(x, c.cy - 1.2, 1.4, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(190,60,30,0.75)';
      ctx.beginPath();
      ctx.ellipse(c.cx, c.cy + 1, c.rx * 0.9, c.ry * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const rng = new Rng(23);
      ctx.fillStyle = '#e0a526';
      for (let i = 0; i < 30; i++) ctx.fillRect(c.cx + rng.range(-c.rx, c.rx) * 0.8, c.cy + rng.range(-3, 2), 0.5, 0.5);
      ctx.strokeStyle = '#d9b17a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(c.cx + 4, c.cy - 1);
      ctx.lineTo(c.cx + 10, c.cy - 9);
      ctx.stroke();
    }
    this.glass(ctx, 'spezi', 'spezi', '120,58,20', 'rgba(220,170,120,0.9)');
  }

  private fry(ctx: Ctx, x: number, y: number, a: number, rng: Rng): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = rng.chance(0.5) ? '#f0c35a' : '#e2aa42';
    ctx.fillRect(-4.5, -0.8, 9, 1.6);
    ctx.fillStyle = 'rgba(160,90,20,0.35)';
    ctx.fillRect(-4.5, 0.4, 9, 0.4);
    ctx.restore();
  }

  // --- Frau Dr. Schmidt ---
  private schmidtPlace(ctx: Ctx): void {
    this.tray(ctx, 'tray-schmidt');
    this.exams(ctx);
    this.plate(ctx, 'plate-schmidt', 'plate-schmidt');
    // Käsekuchen
    const cake = this.obj('cake');
    const cb = cake.bounds;
    if (this.stage('cake')) {
      const m = this.marks('cake')[0];
      splatter(ctx, (cb.minX + cb.maxX) / 2, (cb.minY + cb.maxY) / 2, 18, m.seed, 'rgba(246,228,170,0.95)', 16, 0.5);
      polyPath(ctx, jaggedPoly(m.seed + 1, (cb.minX + cb.maxX) / 2, (cb.minY + cb.maxY) / 2 + 1, 12, 14, 0.35, 1.3, 0.45));
      ctx.fillStyle = '#c8894a';
      ctx.fill();
    } else {
      shapePath(ctx, cake.shape);
      ctx.fillStyle = '#f4e1a6';
      ctx.fill();
      ctx.strokeStyle = '#c8894a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cb.maxX - 1, cb.minY + 2);
      ctx.lineTo(cb.maxX - 3, cb.maxY - 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,137,74,0.8)';
      ctx.fillRect(cb.minX + 3, cb.maxY - 4, cb.maxX - cb.minX - 6, 1.6);
    }
    this.coffeeCup(ctx);
  }

  /** Stack of exams with red marks (and coffee stains when the cup gets hit). */
  private exams(ctx: Ctx): void {
    const r = this.rectOf('exams');
    const stage = this.stage('exams');
    const rng = new Rng(stage ? this.marks('exams')[0].seed : 5);
    this.contactShadow(ctx, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w * 0.7, r.h * 0.6, 0.2);
    const sheets = stage >= 2 ? 4 : 3;
    for (let i = 0; i < sheets; i++) {
      ctx.save();
      const off = stage >= 1 ? 1 : 0.2;
      const ox = stage >= 2 && i > 0 ? rng.range(-30, 12) : rng.range(-1.5, 1.5) * off;
      const oy = stage >= 2 && i > 0 ? rng.range(-4, 26) : rng.range(-1, 1) * off;
      ctx.translate(r.x + r.w / 2 + ox, r.y + r.h / 2 + oy);
      ctx.rotate(rng.range(-0.08, 0.08) * (stage >= 1 ? 4 : 1));
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(-r.w / 2 + 0.6, -r.h / 2 + 0.8, r.w, r.h);
      ctx.fillStyle = '#fbfaf5';
      ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.fillStyle = 'rgba(60,60,80,0.35)';
      for (let y = -r.h / 2 + 5; y < r.h / 2 - 3; y += 2.6) ctx.fillRect(-r.w / 2 + 3, y, r.w * rng.range(0.4, 0.8), 0.35);
      if (i === sheets - 1) {
        ctx.fillStyle = '#d23a2a';
        ctx.font = '800 6px system-ui, sans-serif';
        ctx.fillText('5,0', r.w / 2 - 12, -r.h / 2 + 8);
        ctx.strokeStyle = '#d23a2a';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(-r.w / 2 + 4, 4);
        ctx.lineTo(-r.w / 2 + 14, 6);
        ctx.stroke();
      }
      if (stage >= 1 && i === sheets - 1) {
        ctx.strokeStyle = 'rgba(120,110,90,0.4)';
        ctx.lineWidth = 0.3;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(rng.range(-r.w / 2, r.w / 2), -r.h / 2);
          ctx.lineTo(rng.range(-r.w / 2, r.w / 2), r.h / 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    // coffee rings from the spilled cup
    if (this.stage('coffee') >= 1) {
      ctx.strokeStyle = 'rgba(120,70,30,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.6, r.y + r.h * 0.35, 7, 0.3, Math.PI * 1.8);
      ctx.stroke();
      splatter(ctx, r.x + r.w * 0.5, r.y + r.h * 0.5, 16, 77, 'rgba(110,62,26,0.6)', 10, 0.8);
    }
    ctx.fillStyle = '#c0392b';
    ctx.save();
    ctx.translate(r.x + r.w + 2, r.y + r.h - 6);
    ctx.rotate(-0.5);
    ctx.fillRect(-9, -0.8, 18, 1.6);
    ctx.restore();
  }

  private coffeeCup(ctx: Ctx): void {
    const body = this.rectOf('cup-body');
    const handle = this.rectOf('cup-handle');
    const rim = this.ellOf('cup-rim');
    const coffee = this.ellOf('coffee');
    const stage = this.stage('coffee');
    const marks = this.marks('coffee');
    const seed = marks[0]?.seed ?? 1;
    this.contactShadow(ctx, body.x + body.w / 2 - 2, body.y + body.h + 1, 20, 4, 0.3);
    if (stage >= 1) {
      polyPath(ctx, jaggedPoly(seed + 1, body.x + body.w / 2 - 8, body.y + body.h + 4, stage >= 3 ? 28 : 20, 20, 0.22, 1, 0.3));
      ctx.fillStyle = 'rgba(80,44,18,0.82)';
      ctx.fill();
    }
    ctx.strokeStyle = '#f1ede4';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.ellipse(handle.x + 1, handle.y + handle.h / 2, handle.w - 2, handle.h / 2 - 2, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    const g = ctx.createLinearGradient(body.x, 0, body.x + body.w, 0);
    g.addColorStop(0, '#dcd6cb');
    g.addColorStop(0.35, '#ffffff');
    g.addColorStop(1, '#cfc8bb');
    ctx.fillStyle = g;
    shapePath(ctx, body as Shape);
    ctx.fill();
    ctx.fillStyle = '#1f8a86';
    ctx.fillRect(body.x, body.y + 12, body.w, 4);
    if (stage >= 1) {
      const rng = new Rng(seed + 2);
      ctx.fillStyle = 'rgba(80,44,18,0.8)';
      for (let i = 0; i < 4; i++) {
        const x = body.x + 3 + rng.range(0, body.w - 6);
        const len = rng.range(5, 18);
        ctx.beginPath();
        ctx.roundRect(x, body.y, rng.range(0.8, 1.6), len, 0.8);
        ctx.arc(x + 0.6, body.y + len, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (stage >= 2) {
      ctx.save();
      shapePath(ctx, body as Shape);
      ctx.clip();
      for (const m of marks) if (m.stage >= 2) crackStar(ctx, body.x + body.w / 2, body.y + body.h / 2 + 4, 20, m.seed, { color: 'rgba(90,80,70,0.8)', width: 0.35 });
      ctx.restore();
    }
    ctx.fillStyle = '#f7f4ee';
    shapePath(ctx, rim as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.fillStyle = stage >= 3 ? '#2a1c14' : '#4a2a16';
    shapePath(ctx, coffee as Shape);
    ctx.fill();
    if (stage >= 3) {
      const m = marks[marks.length - 1];
      const rng = new Rng(m.seed);
      const nx = body.x + body.w * 0.5;
      const notch: [number, number][] = [[nx - 8, rim.cy + 1]];
      for (let i = 1; i < 6; i++) notch.push([nx - 8 + i * 3, rim.cy + 3 + rng.range(3, 8) * Math.sin((i / 6) * Math.PI)]);
      notch.push([nx + 10, rim.cy + 1]);
      polyPath(ctx, notch);
      ctx.fillStyle = '#6e4b30';
      ctx.fill();
      ctx.strokeStyle = '#fbf8f2';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      shards(ctx, body.x + body.w / 2 - 6, body.y + body.h + 5, 20, 3, m.seed + 4, 10, '#f4f0e8', 'rgba(120,110,95,0.6)', 2);
    }
  }

  // --- Lukas ---
  private lukasPlace(ctx: Ctx): void {
    // napkin + Brezel
    const nap = this.rectOf('napkin');
    ctx.save();
    ctx.translate(nap.x + nap.w / 2, nap.y + nap.h / 2);
    ctx.rotate(0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(-nap.w / 2 + 0.6, -nap.h / 2 + 0.8, nap.w, nap.h);
    ctx.fillStyle = '#fbfbf8';
    ctx.fillRect(-nap.w / 2, -nap.h / 2, nap.w, nap.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(-nap.w / 2 + 2, -nap.h / 2 + 2, nap.w - 4, nap.h - 4);
    ctx.restore();
    const b = this.ellOf('brezel');
    if (this.stage('brezel')) {
      const rng = new Rng(this.marks('brezel')[0].seed);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rng.chance(0.6) ? '#8a4a1c' : '#c78a4a';
        ctx.beginPath();
        ctx.ellipse(b.cx + rng.range(-22, 22), b.cy + rng.range(-8, 14), rng.range(1, 3), rng.range(0.8, 2), rng.range(0, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else this.brezel(ctx, b.cx, b.cy);
    this.laptop(ctx);
    this.mate(ctx);
  }

  /** The classic knot. */
  private brezel(ctx: Ctx, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a3e14';
    ctx.lineWidth = 3.6;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-9, 6);
      ctx.bezierCurveTo(-16, -2, -8, -10, 0, -3);
      ctx.bezierCurveTo(8, -10, 16, -2, 9, 6);
      ctx.moveTo(-9, 6);
      ctx.bezierCurveTo(-4, 4, 4, -1, 5, -5);
      ctx.moveTo(9, 6);
      ctx.bezierCurveTo(4, 4, -4, -1, -5, -5);
    };
    path();
    ctx.stroke();
    ctx.strokeStyle = '#a4581f';
    ctx.lineWidth = 2;
    path();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    const rng = new Rng(31);
    for (let i = 0; i < 14; i++) ctx.fillRect(rng.range(-12, 12), rng.range(-7, 5), 0.6, 0.6);
    ctx.restore();
  }

  /** Laptop seen from behind: the lid's back faces us, covered in stickers. */
  private laptop(ctx: Ctx): void {
    const lid = this.rectOf('laptop-lid');
    const keys = this.rectOf('laptop-keys');
    const stage = this.stage('laptop');
    const marks = this.marks('laptop');
    this.contactShadow(ctx, keys.x + keys.w / 2, keys.y + keys.h / 2 + 3, keys.w * 0.6, keys.h * 0.6, 0.3);
    // base
    shapePath(ctx, keys as Shape);
    ctx.fillStyle = '#aeb4ba';
    ctx.fill();
    ctx.fillStyle = '#c6ccd1';
    ctx.fillRect(keys.x + 2, keys.y + keys.h - 5, keys.w - 4, 3);
    if (stage >= 2) {
      // keys popped off
      const rng = new Rng(marks[marks.length - 1].seed + 7);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = '#2b2e33';
        ctx.save();
        ctx.translate(keys.x + keys.w / 2 + rng.range(-50, 50), keys.y + rng.range(0, 34));
        ctx.rotate(rng.range(0, 1.5));
        ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
        ctx.restore();
      }
    }
    // lid (tilted slightly back)
    ctx.save();
    if (stage >= 2) {
      ctx.translate(lid.x + lid.w / 2, lid.y + lid.h);
      ctx.rotate(-0.12);
      ctx.translate(-(lid.x + lid.w / 2), -(lid.y + lid.h));
    }
    const lg = ctx.createLinearGradient(lid.x, lid.y, lid.x + lid.w, lid.y + lid.h);
    lg.addColorStop(0, '#d4d9de');
    lg.addColorStop(1, '#9aa1a8');
    ctx.fillStyle = lg;
    shapePath(ctx, lid as Shape);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,80,0.4)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // stickers
    const sticker = (x: number, y: number, a: number, fn: () => void) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      fn();
      ctx.restore();
    };
    sticker(lid.x + 16, lid.y + 16, -0.2, () => {
      ctx.fillStyle = '#1f8a86';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 3.4px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MOIN', 0, 1.2);
      ctx.textAlign = 'left';
    });
    sticker(lid.x + 46, lid.y + 20, 0.15, () => {
      ctx.fillStyle = '#e9a23b';
      ctx.fillRect(-12, -5, 24, 10);
      ctx.fillStyle = '#1d1a14';
      ctx.font = '900 3.4px system-ui, sans-serif';
      ctx.fillText('NO WIFI', -10, 1.2);
    });
    sticker(lid.x + 30, lid.y + 40, 0.1, () => {
      // a little fly
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b58a52';
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c3242e';
      ctx.beginPath();
      ctx.arc(-1.3, -2, 1.2, 0, Math.PI * 2);
      ctx.arc(1.3, -2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,180,220,0.6)';
      ctx.beginPath();
      ctx.ellipse(-3, 0, 2.6, 1.3, -0.5, 0, Math.PI * 2);
      ctx.ellipse(3, 0, 2.6, 1.3, 0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    sticker(lid.x + 54, lid.y + 44, -0.3, () => {
      ctx.fillStyle = '#d23a2a';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 4);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
    });
    if (stage >= 1) {
      ctx.beginPath();
      ctx.rect(lid.x, lid.y, lid.w, lid.h);
      ctx.clip();
      for (const m of marks) {
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 12);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 12, m.y - 12, 24, 24);
        crackStar(ctx, m.x, m.y, 16 + 10 * m.stage, m.seed, { color: 'rgba(60,65,72,0.8)', shadow: 'rgba(255,255,255,0.4)', width: 0.4 });
      }
    }
    ctx.restore();
  }

  private mate(ctx: Ctx): void {
    const body = this.rectOf('mate-body');
    const stage = this.stage('mate');
    const seed = this.marks('mate')[0]?.seed ?? 3;
    this.contactShadow(ctx, body.x + body.w / 2 - 1, body.y + body.h + 1, 10, 3, 0.3);
    if (stage >= 1) {
      polyPath(ctx, jaggedPoly(seed + 1, body.x - 4, body.y + body.h + 4, 18, 16, 0.25, 1.1, 0.3));
      ctx.fillStyle = 'rgba(150,100,30,0.55)';
      ctx.fill();
    }
    const topY = stage >= 2 ? body.y + body.h * 0.5 : body.y;
    ctx.save();
    ctx.beginPath();
    if (stage >= 2) {
      const rng = new Rng(seed + 2);
      ctx.moveTo(body.x, body.y + body.h);
      ctx.lineTo(body.x, topY + 2);
      for (let x = body.x + 2; x < body.x + body.w; x += 2.4) ctx.lineTo(x, topY + rng.range(-3, 3));
      ctx.lineTo(body.x + body.w, topY + 2);
      ctx.lineTo(body.x + body.w, body.y + body.h);
      ctx.closePath();
    } else {
      // bottle shape: neck then shoulders
      const cx = body.x + body.w / 2;
      ctx.moveTo(cx - 2.6, body.y);
      ctx.lineTo(cx + 2.6, body.y);
      ctx.lineTo(cx + 2.6, body.y + 10);
      ctx.quadraticCurveTo(body.x + body.w, body.y + 14, body.x + body.w, body.y + 20);
      ctx.lineTo(body.x + body.w, body.y + body.h - 1);
      ctx.lineTo(body.x, body.y + body.h - 1);
      ctx.lineTo(body.x, body.y + 20);
      ctx.quadraticCurveTo(body.x, body.y + 14, cx - 2.6, body.y + 10);
      ctx.closePath();
    }
    ctx.fillStyle = '#6b4a1c';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(40,20,5,0.4)';
    ctx.fillRect(body.x, body.y, body.w, stage >= 1 ? body.h * 0.55 : 14);
    ctx.fillStyle = '#f2d34a';
    ctx.fillRect(body.x, body.y + 26, body.w, 16);
    ctx.fillStyle = '#1f3b8a';
    ctx.font = '900 3.2px system-ui, sans-serif';
    ctx.fillText('MATE', body.x + 2.3, body.y + 35.5);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(body.x + 2, body.y + 12, 1.4, body.h - 16);
    ctx.restore();
    if (stage < 2) {
      ctx.fillStyle = '#c9ccd0';
      ctx.beginPath();
      ctx.ellipse(body.x + body.w / 2, body.y, 3.4, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else shards(ctx, body.x + body.w / 2, body.y + body.h + 3, 16, 3, seed + 5, 12, '#7a5222', 'rgba(40,20,5,0.6)', 2);
  }

  // --- Mia ---
  private miaPlace(ctx: Ctx): void {
    this.tray(ctx, 'tray-mia');
    const bowl = this.ellOf('bowl');
    const bstage = this.stage('bowl');
    const bmarks = this.marks('bowl');
    this.contactShadow(ctx, bowl.cx - 1, bowl.cy + 5, bowl.rx, bowl.ry, 0.3);
    const drawBowl = () => {
      const g = ctx.createLinearGradient(0, bowl.cy - bowl.ry, 0, bowl.cy + bowl.ry);
      g.addColorStop(0, '#f5f1ea');
      g.addColorStop(1, '#c9c0b2');
      ctx.fillStyle = g;
      shapePath(ctx, bowl as Shape);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,110,140,0.5)';
      const rng = new Rng(9);
      for (let i = 0; i < 20; i++) ctx.fillRect(bowl.cx + rng.range(-bowl.rx, bowl.rx) * 0.9, bowl.cy + rng.range(0, bowl.ry * 0.8), 0.6, 0.6);
    };
    if (bstage >= 2) {
      const rng = new Rng(bmarks[bmarks.length - 1].seed);
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * Math.PI * 2 + rng.range(0, 0.4);
        const a1 = a0 + Math.PI / 2;
        ctx.save();
        ctx.translate(Math.cos((a0 + a1) / 2) * 2, Math.sin((a0 + a1) / 2) * 1.2);
        ctx.beginPath();
        ctx.moveTo(bowl.cx, bowl.cy);
        ctx.arc(bowl.cx, bowl.cy, bowl.rx * 1.5, a0, a1);
        ctx.closePath();
        ctx.clip();
        drawBowl();
        ctx.restore();
      }
    } else {
      drawBowl();
      if (bstage >= 1) {
        ctx.save();
        shapePath(ctx, bowl as Shape);
        ctx.clip();
        for (const m of bmarks) crackStar(ctx, m.x, m.y, 16, m.seed, { color: 'rgba(110,95,80,0.75)', width: 0.3 });
        ctx.restore();
      }
    }
    // salad
    const s = this.ellOf('salad');
    const scattered = this.stage('salad') > 0;
    const rng = new Rng(scattered ? this.marks('salad')[0].seed : 12);
    const spread = scattered ? 2.4 : 1;
    const cols = ['#4f9a47', '#62b155', '#3f7d3c', '#8cc63f'];
    for (let i = 0; i < 26; i++) {
      ctx.save();
      ctx.translate(s.cx + rng.range(-s.rx, s.rx) * 0.85 * spread, s.cy + rng.range(-s.ry, s.ry) * 0.8 * spread + (scattered ? 6 : 0));
      ctx.rotate(rng.range(0, Math.PI * 2));
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#d9362b' : '#e8e0a0';
      ctx.beginPath();
      ctx.arc(s.cx + rng.range(-s.rx, s.rx) * 0.7 * spread, s.cy + rng.range(-s.ry, s.ry) * 0.6 * spread + (scattered ? 6 : 0), i % 2 ? 2.2 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    this.glass(ctx, 'schorle', 'schorle', '222,168,58', 'rgba(255,250,230,0.95)');
    this.phone(ctx);
  }

  private phone(ctx: Ctx): void {
    const p = this.rectOf('phone');
    const stage = this.stage('phone');
    this.contactShadow(ctx, p.x + p.w / 2 - 1, p.y + p.h / 2 + 2, p.w * 0.7, p.h * 0.55, 0.28);
    shapePath(ctx, p as Shape);
    ctx.fillStyle = '#7fcbb5';
    ctx.fill();
    const s = { x: p.x + 1.5, y: p.y + 1.5, w: p.w - 3, h: p.h - 3 };
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 3);
    ctx.clip();
    if (stage >= 2) {
      ctx.fillStyle = '#050608';
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else {
      const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
      g.addColorStop(0, '#26315e');
      g.addColorStop(1, '#c0567a');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 6px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('12:10', s.x + s.w / 2, s.y + 12);
      ctx.textAlign = 'left';
    }
    for (const m of this.marks('phone')) {
      if (stage >= 2) deadLines(ctx, s.x, s.y, s.w, s.h, m.x, m.seed + 1, 5);
      crackStar(ctx, m.x, m.y, 12 + 8 * m.stage, m.seed, { color: 'rgba(240,245,255,0.85)', shadow: 'rgba(0,0,0,0.55)', width: 0.3, rings: 2 });
    }
    ctx.restore();
    ctx.fillStyle = '#0b0c0f';
    ctx.beginPath();
    ctx.roundRect(p.x + p.w / 2 - 3.5, p.y + 2.5, 7, 1.8, 0.9);
    ctx.fill();
  }
}
