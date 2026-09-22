import {
  type Bounds,
  type Shape,
  boundsOverlap,
  ellipse,
  poly,
  rect,
  shapeArea,
  shapeBounds,
  shapeContains,
  shapeRoundRectGap,
  shapeSignedDistance,
} from '../physics/geometry';

/**
 * The room is modelled as a 2.5-D plateau heightfield seen from the player's
 * position: every surface object has a footprint in the XY plane and a `top`
 * elevation (mm toward the viewer). The swatter travels along -z and stops at
 * the highest surface under its head; the fly lands on tops and cannot fly
 * through the vertical steps between plateaus.
 *
 * Height rule: H(x, y) = max(top of every object containing (x, y)); the wall
 * is the base plane at 0. Ties resolve to the later object (for identity).
 */

export type Material =
  | 'wall'
  | 'glass'
  | 'paint'
  | 'wood'
  | 'plastic'
  | 'screen'
  | 'metal'
  | 'ceramic'
  | 'coffee'
  | 'fruit'
  | 'paper'
  | 'leaf'
  | 'terracotta';

export interface SurfaceDef {
  id: string;
  label: string;
  material: Material;
  shape: Shape;
  top: number;
  landable: boolean;
  /** base landing attractiveness 0..1 */
  attract: number;
  food?: boolean;
  bright?: boolean;
}

export interface SurfaceObject extends SurfaceDef {
  index: number;
  bounds: Bounds;
  area: number;
}

export const WORLD_W = 480;
export const WORLD_H = 300;

/** The single polished environment: a desk against a wall, next to a window. */
export function buildDeskLayout(): SurfaceDef[] {
  return [
    { id: 'wall', label: 'wall', material: 'wall', shape: rect(0, 0, WORLD_W, WORLD_H), top: 0, landable: true, attract: 0.3 },

    // --- window (glass flush with the wall plane, painted frame proud of it) ---
    { id: 'window-glass', label: 'window', material: 'glass', shape: rect(34, 30, 132, 110), top: 0, landable: true, attract: 0.6, bright: true },
    { id: 'window-frame-top', label: 'window frame', material: 'paint', shape: rect(24, 20, 152, 10), top: 4, landable: true, attract: 0.3 },
    { id: 'window-frame-bottom', label: 'window frame', material: 'paint', shape: rect(24, 140, 152, 10), top: 4, landable: true, attract: 0.3 },
    { id: 'window-frame-left', label: 'window frame', material: 'paint', shape: rect(24, 20, 10, 130), top: 4, landable: true, attract: 0.3 },
    { id: 'window-frame-right', label: 'window frame', material: 'paint', shape: rect(166, 20, 10, 130), top: 4, landable: true, attract: 0.3 },
    { id: 'window-mullion-v', label: 'window frame', material: 'paint', shape: rect(97, 30, 6, 110), top: 4, landable: true, attract: 0.3 },
    { id: 'window-mullion-h', label: 'window frame', material: 'paint', shape: rect(34, 82, 132, 6), top: 4, landable: true, attract: 0.3 },
    { id: 'window-sill', label: 'window sill', material: 'paint', shape: rect(14, 150, 172, 12, 2), top: 40, landable: true, attract: 0.5 },

    // --- potted plant on the sill ---
    { id: 'plant-pot', label: 'plant pot', material: 'terracotta', shape: rect(128, 118, 30, 32, 3), top: 70, landable: true, attract: 0.3 },
    { id: 'plant-leaves', label: 'plant', material: 'leaf', shape: ellipse(143, 104, 23, 17), top: 76, landable: true, attract: 0.6 },

    // --- monitor ---
    { id: 'monitor-bezel', label: 'monitor', material: 'plastic', shape: rect(204, 34, 188, 128, 4), top: 110, landable: true, attract: 0.35 },
    { id: 'monitor-screen', label: 'monitor screen', material: 'screen', shape: rect(211, 41, 174, 109, 2), top: 110, landable: true, attract: 0.5, bright: true },
    { id: 'monitor-neck', label: 'monitor stand', material: 'metal', shape: rect(287, 162, 22, 34), top: 100, landable: true, attract: 0.15 },

    // --- desk ---
    { id: 'desk', label: 'desk', material: 'wood', shape: rect(0, 190, WORLD_W, WORLD_H - 190), top: 150, landable: true, attract: 0.42 },
    { id: 'crumbs', label: 'cookie crumbs', material: 'fruit', shape: ellipse(300, 262, 11, 4), top: 151, landable: true, attract: 0.75, food: true },
    { id: 'monitor-base', label: 'monitor stand', material: 'metal', shape: ellipse(298, 200, 40, 8), top: 160, landable: true, attract: 0.2 },

    // --- desk lamp ---
    { id: 'lamp-base', label: 'lamp', material: 'metal', shape: ellipse(440, 213, 26, 7), top: 168, landable: true, attract: 0.2 },
    { id: 'lamp-arm-lower', label: 'lamp arm', material: 'metal', shape: poly([[435, 209], [441, 209], [455, 134], [449, 132]]), top: 165, landable: true, attract: 0.1 },
    { id: 'lamp-arm-upper', label: 'lamp arm', material: 'metal', shape: poly([[449, 131], [455, 136], [424, 86], [419, 90]]), top: 165, landable: true, attract: 0.1 },
    { id: 'lamp-shade', label: 'lamp shade', material: 'metal', shape: poly([[398, 58], [446, 58], [462, 104], [382, 104]]), top: 175, landable: true, attract: 0.55, bright: true },

    // --- books ---
    { id: 'book-bottom', label: 'books', material: 'paper', shape: rect(384, 250, 84, 32, 2), top: 180, landable: true, attract: 0.3 },
    { id: 'book-top', label: 'books', material: 'paper', shape: rect(392, 228, 70, 23, 2), top: 184, landable: true, attract: 0.3 },

    // --- plate with fruit (fruit flies!) ---
    { id: 'plate', label: 'plate', material: 'ceramic', shape: ellipse(78, 262, 62, 18), top: 156, landable: true, attract: 0.5 },
    { id: 'fruit-apple', label: 'apple slice', material: 'fruit', shape: ellipse(64, 257, 19, 8), top: 172, landable: true, attract: 1.0, food: true },
    { id: 'fruit-banana', label: 'banana', material: 'fruit', shape: ellipse(98, 265, 13, 6), top: 168, landable: true, attract: 0.95, food: true },

    // --- coffee cup ---
    { id: 'cup-body', label: 'coffee cup', material: 'ceramic', shape: rect(150, 182, 50, 62, 5), top: 225, landable: true, attract: 0.45 },
    { id: 'cup-handle', label: 'cup handle', material: 'ceramic', shape: rect(200, 194, 15, 34, 7), top: 222, landable: true, attract: 0.25 },
    { id: 'cup-rim', label: 'cup rim', material: 'ceramic', shape: ellipse(175, 182, 25, 6), top: 228, landable: true, attract: 0.75, food: true },
    { id: 'coffee', label: 'coffee cup', material: 'coffee', shape: ellipse(175, 182, 21, 4.3), top: 228, landable: false, attract: 0 },
  ];
}

const GRID = 20; // spatial hash cell size (mm)

export interface HeightSample {
  height: number;
  object: SurfaceObject;
}

export class Scene {
  readonly width = WORLD_W;
  readonly height = WORLD_H;
  readonly objects: SurfaceObject[];
  readonly base: SurfaceObject;
  private readonly byTopDesc: SurfaceObject[];
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];

  constructor(defs: SurfaceDef[] = buildDeskLayout()) {
    this.objects = defs.map((d, index) => ({ ...d, index, bounds: shapeBounds(d.shape), area: shapeArea(d.shape) }));
    this.base = this.objects[0];
    this.byTopDesc = this.objects.slice(1).sort((a, b) => b.top - a.top || b.index - a.index);
    this.cols = Math.ceil(WORLD_W / GRID);
    this.rows = Math.ceil(WORLD_H / GRID);
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell: Bounds = { minX: c * GRID, minY: r * GRID, maxX: (c + 1) * GRID, maxY: (r + 1) * GRID };
        const list: number[] = [];
        for (const o of this.objects) if (boundsOverlap(o.bounds, cell, 0.001)) list.push(o.index);
        this.cells.push(list);
      }
    }
  }

  byId(id: string): SurfaceObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  private cellList(x: number, y: number): number[] | null {
    const c = Math.floor(x / GRID);
    const r = Math.floor(y / GRID);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return this.cells[r * this.cols + c];
  }

  /** Elevation of the visible surface at (x, y). Outside the world: 0. */
  heightAt(x: number, y: number): number {
    const list = this.cellList(x, y);
    if (!list) return 0;
    let h = 0;
    for (let i = 0; i < list.length; i++) {
      const o = this.objects[list[i]];
      if (o.top > h && shapeContains(o.shape, x, y)) h = o.top;
    }
    return h;
  }

  /** Topmost surface object at (x, y). */
  surfaceAt(x: number, y: number): SurfaceObject {
    const list = this.cellList(x, y);
    if (!list) return this.base;
    let best = this.base;
    let h = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const o = this.objects[list[i]];
      if (o.top >= h && shapeContains(o.shape, x, y)) {
        h = o.top;
        best = o;
      }
    }
    return best;
  }

  /** Highest surface touched by an axis-aligned rounded rectangle (swatter footprint). */
  maxHeightInRoundRect(cx: number, cy: number, hx: number, hy: number, r: number): HeightSample {
    const fb: Bounds = { minX: cx - hx, minY: cy - hy, maxX: cx + hx, maxY: cy + hy };
    // Objects sorted by (top desc, index desc): the first overlap is the answer.
    for (const o of this.byTopDesc) {
      if (!boundsOverlap(o.bounds, fb)) continue;
      if (shapeRoundRectGap(o.shape, cx, cy, hx, hy, r) <= 0) return { height: o.top, object: o };
    }
    return { height: 0, object: this.base };
  }

  insideWorld(x: number, y: number, margin = 0): boolean {
    return x >= margin && y >= margin && x <= this.width - margin && y <= this.height - margin;
  }

  /**
   * March a 3-D ray and return the distance at which it first comes within
   * `clearance` of a surface (or leaves the world), or -1 if clear up to maxDist.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, clearance = 0, step = 1.5): number {
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    for (let s = step; s <= maxDist; s += step) {
      const x = ox + dx * s;
      const y = oy + dy * s;
      const z = oz + dz * s;
      if (!this.insideWorld(x, y, 1)) return s;
      if (z < this.heightAt(x, y) + clearance) return s;
    }
    return -1;
  }

  /**
   * How "sheltered" a spot is: how much taller the neighbourhood is (0..1).
   * A swatter aimed here is likely to be stopped by a taller neighbour.
   */
  shelterAt(x: number, y: number): number {
    const h0 = this.heightAt(x, y);
    let maxRise = 0;
    for (const rad of [12, 24, 36]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const hx = x + Math.cos(a) * rad;
        const hy = y + Math.sin(a) * rad;
        if (!this.insideWorld(hx, hy)) continue;
        const rise = this.heightAt(hx, hy) - h0;
        if (rise > maxRise) maxRise = rise;
      }
    }
    return Math.min(1, maxRise / 60);
  }

  /** Signed distance from (x, y) to the boundary of the object's visible top (approx). */
  edgeDistance(o: SurfaceObject, x: number, y: number): number {
    return -shapeSignedDistance(o.shape, x, y);
  }
}
