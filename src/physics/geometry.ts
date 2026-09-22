import type { Vec2 } from '../math/vec';

/**
 * 2-D shapes used for the scene's plateau heightfield and for swatter contact.
 * All shapes live in the world XY plane (mm). Rects are axis-aligned with an
 * optional corner radius. Polygons must be convex.
 */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'poly'; pts: Vec2[] };

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rect(x: number, y: number, w: number, h: number, r = 0): Shape {
  return { kind: 'rect', x, y, w, h, r: Math.min(r, w / 2, h / 2) };
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
  return { kind: 'ellipse', cx, cy, rx, ry };
}

export function poly(pts: [number, number][]): Shape {
  return { kind: 'poly', pts: pts.map(([x, y]) => ({ x, y })) };
}

/** Signed distance to an axis-aligned rounded rectangle (negative inside).
 * (cx, cy) centre, (hx, hy) full half-extents, r corner radius. */
export function sdRoundRect(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const inside = qx > qy ? qx : qy;
  return Math.sqrt(ox * ox + oy * oy) + (inside < 0 ? inside : 0) - r;
}

/** Signed distance to an axis-aligned box of half extents (bx, by) centred at origin. */
function sdBox(px: number, py: number, bx: number, by: number): number {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const inside = qx > qy ? qx : qy;
  return Math.sqrt(ox * ox + oy * oy) + (inside < 0 ? inside : 0);
}

export function shapeBounds(s: Shape): Bounds {
  switch (s.kind) {
    case 'rect':
      return { minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h };
    case 'ellipse':
      return { minX: s.cx - s.rx, minY: s.cy - s.ry, maxX: s.cx + s.rx, maxY: s.cy + s.ry };
    case 'poly': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of s.pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

export function shapeContains(s: Shape, x: number, y: number): boolean {
  switch (s.kind) {
    case 'rect':
      return sdRoundRect(x, y, s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, s.r) <= 0;
    case 'ellipse': {
      const dx = (x - s.cx) / s.rx;
      const dy = (y - s.cy) / s.ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'poly':
      return pointInConvexPoly(s.pts, x, y);
  }
}

function pointInConvexPoly(pts: Vec2[], x: number, y: number): boolean {
  let sign = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** Approximate signed distance from a point to a shape boundary (negative inside). */
export function shapeSignedDistance(s: Shape, x: number, y: number): number {
  switch (s.kind) {
    case 'rect':
      return sdRoundRect(x, y, s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, s.r);
    case 'ellipse': {
      // Inigo Quilez' first-order ellipse distance approximation.
      const px = x - s.cx;
      const py = y - s.cy;
      const k0 = Math.sqrt((px / s.rx) ** 2 + (py / s.ry) ** 2);
      const k1 = Math.sqrt((px / (s.rx * s.rx)) ** 2 + (py / (s.ry * s.ry)) ** 2);
      if (k1 < 1e-9) return -Math.min(s.rx, s.ry);
      return (k0 * (k0 - 1)) / k1;
    }
    case 'poly': {
      const pts = s.pts;
      let d = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        d = Math.min(d, distToSegment(x, y, a.x, a.y, b.x, b.y));
      }
      return pointInConvexPoly(pts, x, y) ? -d : d;
    }
  }
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + vx * t - px;
  const dy = ay + vy * t - py;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Minimum of the rounded-rect SDF along a segment (ternary search works because
 * the SDF of a convex shape is convex along any line). */
function minRoundRectSdfOnSegment(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, hx: number, hy: number, r: number,
): number {
  let lo = 0;
  let hi = 1;
  const f = (t: number) => sdRoundRect(ax + (bx - ax) * t, ay + (by - ay) * t, cx, cy, hx, hy, r);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  return Math.min(f(0), f(1), f((lo + hi) / 2));
}

/**
 * Does `s` overlap the axis-aligned rounded rectangle (cx, cy, hx, hy, r)?
 * Exact for rects and convex polygons; for ellipses the boundary is sampled and
 * refined (error well below 0.05 mm for scene-sized ellipses).
 */
export function shapeOverlapsRoundRect(s: Shape, cx: number, cy: number, hx: number, hy: number, r: number): boolean {
  return shapeRoundRectGap(s, cx, cy, hx, hy, r) <= 0;
}

/** Gap (mm) between a shape and a rounded rect; <= 0 means overlapping. */
export function shapeRoundRectGap(s: Shape, cx: number, cy: number, hx: number, hy: number, r: number): number {
  switch (s.kind) {
    case 'rect': {
      const scx = s.x + s.w / 2;
      const scy = s.y + s.h / 2;
      const bx = s.w / 2 - s.r + (hx - r);
      const by = s.h / 2 - s.r + (hy - r);
      return sdBox(scx - cx, scy - cy, bx, by) - s.r - r;
    }
    case 'poly': {
      if (pointInConvexPoly(s.pts, cx, cy)) return -1;
      let best = Infinity;
      const pts = s.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        best = Math.min(best, minRoundRectSdfOnSegment(a.x, a.y, b.x, b.y, cx, cy, hx, hy, r));
      }
      return best;
    }
    case 'ellipse': {
      const dx = (cx - s.cx) / s.rx;
      const dy = (cy - s.cy) / s.ry;
      if (dx * dx + dy * dy <= 1) return -1;
      const N = 72;
      let bestT = 0;
      let best = Infinity;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const d = sdRoundRect(s.cx + s.rx * Math.cos(t), s.cy + s.ry * Math.sin(t), cx, cy, hx, hy, r);
        if (d < best) {
          best = d;
          bestT = t;
        }
      }
      // Refine around the best sample.
      let lo = bestT - (Math.PI * 2) / N;
      let hi = bestT + (Math.PI * 2) / N;
      const f = (t: number) => sdRoundRect(s.cx + s.rx * Math.cos(t), s.cy + s.ry * Math.sin(t), cx, cy, hx, hy, r);
      for (let i = 0; i < 30; i++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) hi = m2;
        else lo = m1;
      }
      return Math.min(best, f((lo + hi) / 2));
    }
  }
}

export function boundsOverlap(a: Bounds, b: Bounds, margin = 0): boolean {
  return a.minX - margin <= b.maxX && a.maxX + margin >= b.minX && a.minY - margin <= b.maxY && a.maxY + margin >= b.minY;
}

/** Random point uniformly inside a shape (rejection sampling in its bounds). */
export function randomPointInShape(s: Shape, rand: () => number, inset = 0): Vec2 | null {
  const b = shapeBounds(s);
  for (let i = 0; i < 40; i++) {
    const x = b.minX + (b.maxX - b.minX) * rand();
    const y = b.minY + (b.maxY - b.minY) * rand();
    if (shapeContains(s, x, y) && shapeSignedDistance(s, x, y) <= -inset) return { x, y };
  }
  return null;
}

export function shapeArea(s: Shape): number {
  switch (s.kind) {
    case 'rect':
      return s.w * s.h - (4 - Math.PI) * s.r * s.r;
    case 'ellipse':
      return Math.PI * s.rx * s.ry;
    case 'poly': {
      let a = 0;
      const p = s.pts;
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a += p[i].x * p[j].y - p[j].x * p[i].y;
      }
      return Math.abs(a) / 2;
    }
  }
}
