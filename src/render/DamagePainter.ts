import { Rng } from '../math/rng';

type Ctx = CanvasRenderingContext2D;

/**
 * Drawing helpers for broken things (cracks, splatters, shards). Everything is
 * driven by a seed, so repainting the room draws exactly the same damage.
 */

/** Random walk from (x, y) in direction `a`; returns the end point. */
function crackLine(ctx: Ctx, rng: Rng, x: number, y: number, a: number, len: number, seg: number): [number, number] {
  ctx.moveTo(x, y);
  let d = 0;
  while (d < len) {
    const step = Math.min(len - d, seg * rng.range(0.6, 1.4));
    a += rng.range(-0.45, 0.45);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    ctx.lineTo(x, y);
    d += step;
  }
  return [x, y];
}

export interface CrackStyle {
  /** main crack colour */
  color: string;
  /** darker offset line that gives the crack some depth */
  shadow?: string;
  width: number;
  /** concentric rings (spider-web look for screens and glass) */
  rings?: number;
}

/** A star of cracks radiating from an impact point. */
export function crackStar(ctx: Ctx, x: number, y: number, radius: number, seed: number, style: CrackStyle): void {
  const rng = new Rng(seed);
  const n = rng.int(6, 10);
  const arms: [number, number, number][] = [];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pass = (color: string, dx: number, dy: number, w: number) => {
    const r2 = new Rng(seed);
    r2.int(6, 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    arms.length = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r2.range(-0.3, 0.3);
      const len = radius * r2.range(0.55, 1.1);
      const [ex, ey] = crackLine(ctx, r2, x + dx, y + dy, a, len, radius * 0.18);
      arms.push([a, ex, ey]);
      // a side branch
      if (r2.chance(0.7)) {
        const t = r2.range(0.3, 0.7);
        const bx = x + dx + (ex - x - dx) * t;
        const by = y + dy + (ey - y - dy) * t;
        crackLine(ctx, r2, bx, by, a + r2.sign() * r2.range(0.5, 1.1), len * r2.range(0.2, 0.45), radius * 0.12);
      }
    }
    // spider-web rings connecting neighbouring arms
    const rings = style.rings ?? 0;
    for (let k = 1; k <= rings; k++) {
      const rr = (radius * k) / (rings + 1.2);
      for (let i = 0; i < n; i++) {
        if (r2.chance(0.25)) continue;
        const a0 = arms[i][0];
        const a1 = arms[(i + 1) % n][0] + (i === n - 1 ? Math.PI * 2 : 0);
        const j0 = rr * r2.range(0.85, 1.15);
        const j1 = rr * r2.range(0.85, 1.15);
        ctx.moveTo(x + dx + Math.cos(a0) * j0, y + dy + Math.sin(a0) * j0);
        ctx.lineTo(x + dx + Math.cos((a0 + a1) / 2) * rr * r2.range(0.9, 1.1), y + dy + Math.sin((a0 + a1) / 2) * rr * r2.range(0.9, 1.1));
        ctx.lineTo(x + dx + Math.cos(a1) * j1, y + dy + Math.sin(a1) * j1);
      }
    }
    ctx.stroke();
  };
  if (style.shadow) pass(style.shadow, 0.25, 0.3, style.width * 1.3);
  pass(style.color, 0, 0, style.width);
  // crushed centre
  ctx.fillStyle = style.color;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, radius * 0.06), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Points of a jagged blob around (cx, cy). */
export function jaggedPoly(seed: number, cx: number, cy: number, r: number, n: number, jag: number, sx = 1, sy = 1): [number, number][] {
  const rng = new Rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const rr = r * (1 - jag + rng.range(0, 2 * jag)) * (i % 2 ? rng.range(0.7, 1) : 1);
    pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr * sy]);
  }
  return pts;
}

export function polyPath(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Liquid splatter: a central blob (optional) plus flying drops. */
export function splatter(ctx: Ctx, x: number, y: number, radius: number, seed: number, color: string, drops = 18, sy = 1, blob = true): void {
  const rng = new Rng(seed);
  ctx.save();
  ctx.fillStyle = color;
  if (blob) {
    polyPath(ctx, jaggedPoly(seed + 1, x, y, radius * 0.35, 14, 0.35, 1, sy));
    ctx.fill();
  }
  for (let i = 0; i < drops; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = radius * Math.sqrt(rng.range(0.05, 1));
    const r = rng.range(0.25, 1.1) * (1 - (0.5 * d) / radius);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d * sy;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.4, r, a, 0, Math.PI * 2);
    ctx.fill();
    // streak toward the drop
    if (rng.chance(0.35)) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * d * 0.75, y + Math.sin(a) * d * 0.75 * sy, r * 1.8, r * 0.35, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** Small scattered shards (glass, ceramic, terracotta) lying on a surface. */
export function shards(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, n: number, fill: string, edge: string, size = 1.6): void {
  const rng = new Rng(seed);
  ctx.save();
  ctx.lineWidth = 0.2;
  for (let i = 0; i < n; i++) {
    const cx = x + rng.range(-w, w);
    const cy = y + rng.range(-h, h);
    const s = size * rng.range(0.4, 1.2);
    const a = rng.range(0, Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
    ctx.lineTo(cx + Math.cos(a + 2.3) * s * rng.range(0.4, 0.9), cy + Math.sin(a + 2.3) * s * rng.range(0.4, 0.9));
    ctx.lineTo(cx + Math.cos(a + 4) * s * rng.range(0.3, 0.8), cy + Math.sin(a + 4) * s * rng.range(0.3, 0.8));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.stroke();
  }
  ctx.restore();
}

/** A dark, blotchy LCD bleed where a screen panel was crushed. */
export function screenBleed(ctx: Ctx, x: number, y: number, r: number, seed: number): void {
  const rng = new Rng(seed);
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const px = x + rng.range(-r, r) * 0.4;
    const py = y + rng.range(-r, r) * 0.4;
    const rr = r * rng.range(0.35, 0.8);
    const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.55, 'rgba(10,0,25,0.8)');
    g.addColorStop(0.8, 'rgba(90,40,160,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dead pixel columns: thin vertical lines of pure colour across a screen. */
export function deadLines(ctx: Ctx, x0: number, y0: number, w: number, h: number, nearX: number, seed: number, n: number): void {
  const rng = new Rng(seed);
  const cols = ['#ff2bd6', '#2bff88', '#35c8ff', '#ffffff', '#ffe23b'];
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = Math.min(x0 + w - 1, Math.max(x0 + 0.5, nearX + rng.normal(0, w * 0.12)));
    ctx.fillStyle = cols[rng.int(0, cols.length)];
    ctx.globalAlpha = rng.range(0.55, 0.9);
    ctx.fillRect(x, y0, rng.range(0.25, 0.7), h);
  }
  ctx.restore();
}
