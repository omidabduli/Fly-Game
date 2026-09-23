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
 *
 * The scene is a Mensa (university canteen): people sit behind a long table,
 * so they are further from the viewer (lower tops) than the table and the
 * plates and glasses on it. Everything on the table lies within ~5 mm of the
 * tabletop (the swatter's mesh flexes that far), so glasses and plates break
 * instead of shielding the fly. Real cover comes from the sneeze guard over
 * the food counter and from people's heads.
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
  | 'terracotta'
  | 'skin'
  | 'cloth';

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

export const WORLD_W = 560;
export const WORLD_H = 320;

/** Back edge of the dining table: people sit behind it, their plates stand on it. */
export const TABLE_Y = 222;

export type PersonId = 'juergen' | 'schmidt' | 'lukas' | 'mia' | 'meyer';

export interface Seat {
  id: PersonId;
  /** centre of the head */
  x: number;
  y: number;
  /** head radii */
  rx: number;
  ry: number;
  /** stands behind the food counter instead of sitting at the table */
  staff?: boolean;
}

/** The four diners across the table, and Frau Meyer behind the food counter. */
export const SEATS: Seat[] = [
  { id: 'juergen', x: 88, y: 116, rx: 22, ry: 27 },
  { id: 'schmidt', x: 212, y: 116, rx: 21, ry: 26 },
  { id: 'lukas', x: 342, y: 116, rx: 22, ry: 27 },
  { id: 'mia', x: 470, y: 118, rx: 21, ry: 26 },
  { id: 'meyer', x: 150, y: 66, rx: 15, ry: 18, staff: true },
];

/** Framed poster of the Bremen Town Musicians (flat on the wall, not a surface). */
export const POSTER_RECT = { x: 252, y: 92, w: 46, h: 56 };

/** Front-row diner: head and shoulders, both surfaces the fly can sit on. */
function person(s: Seat, bald = false): SurfaceDef[] {
  return [
    { id: `${s.id}-body`, label: s.id, material: 'cloth', shape: rect(s.x - 46, s.y + 22, 92, TABLE_Y - s.y - 20, 16), top: 24, landable: true, attract: 0.22 },
    { id: `${s.id}-head`, label: s.id, material: 'skin', shape: ellipse(s.x, s.y, s.rx, s.ry), top: 26, landable: true, attract: bald ? 0.6 : 0.3, bright: bald },
  ];
}

/** Drinking glass standing on the table: body, rim (sticky, flies love it) and the drink. */
function glass(id: string, label: string, x: number, y: number, w: number, h: number, top: number): SurfaceDef[] {
  return [
    { id: `${id}-body`, label, material: 'glass', shape: rect(x, y, w, h, 4), top, landable: true, attract: 0.25 },
    { id: `${id}-rim`, label, material: 'glass', shape: ellipse(x + w / 2, y, w / 2, 3), top: top + 0.7, landable: true, attract: 0.7, food: true },
    { id, label, material: 'coffee', shape: ellipse(x + w / 2, y, w / 2 - 2, 2), top: top + 0.7, landable: false, attract: 0 },
  ];
}

/**
 * Lunchtime in the Mensa: a long table seen from across it, four people eating,
 * the food counter with Frau Meyer, the menu screen and a rainy Bremen outside.
 */
export function buildMensaLayout(): SurfaceDef[] {
  const [juergen, schmidt, lukas, mia, meyer] = SEATS;
  return [
    { id: 'wall', label: 'wall', material: 'wall', shape: rect(0, 0, WORLD_W, WORLD_H), top: 0, landable: true, attract: 0.3 },

    // --- window facade (glass flush with the wall, frame proud of it) ---
    { id: 'window-glass', label: 'window', material: 'glass', shape: rect(372, 12, 176, 108), top: 0, landable: true, attract: 0.6, bright: true },
    { id: 'window-frame-top', label: 'window frame', material: 'paint', shape: rect(366, 6, 188, 6), top: 3, landable: true, attract: 0.3 },
    { id: 'window-frame-bottom', label: 'window frame', material: 'paint', shape: rect(366, 120, 188, 6), top: 3, landable: true, attract: 0.3 },
    { id: 'window-frame-left', label: 'window frame', material: 'paint', shape: rect(366, 6, 6, 120), top: 3, landable: true, attract: 0.3 },
    { id: 'window-frame-right', label: 'window frame', material: 'paint', shape: rect(548, 6, 6, 120), top: 3, landable: true, attract: 0.3 },
    { id: 'window-mullion-1', label: 'window frame', material: 'paint', shape: rect(429, 12, 5, 108), top: 3, landable: true, attract: 0.3 },
    { id: 'window-mullion-2', label: 'window frame', material: 'paint', shape: rect(488, 12, 5, 108), top: 3, landable: true, attract: 0.3 },
    { id: 'window-mullion-h', label: 'window frame', material: 'paint', shape: rect(372, 64, 176, 4), top: 3, landable: true, attract: 0.3 },

    // --- wall: menu screen, clock ---
    { id: 'menu-screen', label: 'menu screen', material: 'screen', shape: rect(214, 12, 140, 70, 3), top: 4, landable: true, attract: 0.5, bright: true },
    { id: 'clock', label: 'clock', material: 'glass', shape: ellipse(36, 50, 16, 16), top: 3, landable: true, attract: 0.3 },

    // --- food counter: Frau Meyer behind the sneeze guard ---
    { id: 'meyer-body', label: 'meyer', material: 'cloth', shape: rect(meyer.x - 26, meyer.y + 14, 52, 40, 10), top: 8, landable: true, attract: 0.2 },
    { id: 'meyer-head', label: 'meyer', material: 'skin', shape: ellipse(meyer.x, meyer.y, meyer.rx, meyer.ry), top: 9, landable: true, attract: 0.3 },
    { id: 'counter', label: 'food counter', material: 'metal', shape: rect(0, 120, 205, 70, 2), top: 12, landable: true, attract: 0.35 },
    { id: 'counter-food', label: 'food counter', material: 'metal', shape: rect(6, 106, 192, 14, 1), top: 13, landable: true, attract: 0.9, food: true },
    { id: 'sneeze-guard', label: 'sneeze guard', material: 'glass', shape: rect(4, 94, 198, 12, 2), top: 20, landable: true, attract: 0.3 },

    // --- a big ficus in the corner ---
    { id: 'plant-pot', label: 'plant pot', material: 'terracotta', shape: rect(522, 150, 32, 44, 3), top: 14, landable: true, attract: 0.3 },
    { id: 'plant-leaves', label: 'plant', material: 'leaf', shape: ellipse(538, 128, 22, 28), top: 16, landable: true, attract: 0.55 },

    // --- the diners ---
    ...person(juergen, true),
    ...person(schmidt),
    ...person(lukas),
    ...person(mia),

    // --- the long Mensa table ---
    { id: 'table', label: 'table', material: 'wood', shape: rect(0, TABLE_Y, WORLD_W, WORLD_H - TABLE_Y), top: 28, landable: true, attract: 0.4 },

    // Jürgen: Currywurst mit Pommes and a Spezi
    { id: 'tray-juergen', label: 'tray', material: 'plastic', shape: rect(juergen.x - 50, 236, 100, 54, 4), top: 29.5, landable: true, attract: 0.35 },
    { id: 'plate-juergen', label: 'plate', material: 'ceramic', shape: ellipse(juergen.x - 8, 265, 36, 16), top: 30.5, landable: true, attract: 0.45 },
    { id: 'currywurst', label: 'Currywurst', material: 'fruit', shape: ellipse(juergen.x - 17, 262, 17, 5.5), top: 32, landable: true, attract: 1, food: true },
    { id: 'fries', label: 'fries', material: 'fruit', shape: ellipse(juergen.x + 9, 267, 14, 8), top: 31.8, landable: true, attract: 0.95, food: true },
    ...glass('spezi', 'Spezi', juergen.x + 30, 216, 18, 38, 32.5),

    // Frau Dr. Schmidt: coffee, Käsekuchen and exams to mark
    { id: 'tray-schmidt', label: 'tray', material: 'plastic', shape: rect(schmidt.x - 50, 236, 100, 54, 4), top: 29.5, landable: true, attract: 0.35 },
    { id: 'exams', label: 'exams', material: 'paper', shape: rect(schmidt.x - 46, 242, 34, 44, 1), top: 29.5, landable: true, attract: 0.35 },
    { id: 'plate-schmidt', label: 'plate', material: 'ceramic', shape: ellipse(schmidt.x + 2, 270, 24, 11), top: 30.5, landable: true, attract: 0.45 },
    { id: 'cake', label: 'cheesecake', material: 'fruit', shape: poly([[schmidt.x - 12, 272], [schmidt.x + 14, 264], [schmidt.x + 12, 274], [schmidt.x - 8, 278]]), top: 32, landable: true, attract: 1, food: true },
    { id: 'cup-handle', label: 'coffee cup', material: 'ceramic', shape: rect(schmidt.x + 48, 232, 9, 16, 4), top: 32, landable: true, attract: 0.25 },
    { id: 'cup-body', label: 'coffee cup', material: 'ceramic', shape: rect(schmidt.x + 22, 226, 26, 30, 4), top: 32.5, landable: true, attract: 0.45 },
    { id: 'cup-rim', label: 'coffee cup', material: 'ceramic', shape: ellipse(schmidt.x + 35, 226, 13, 3.5), top: 33.2, landable: true, attract: 0.75, food: true },
    { id: 'coffee', label: 'coffee', material: 'coffee', shape: ellipse(schmidt.x + 35, 226, 11, 2.6), top: 33.2, landable: false, attract: 0 },

    // Lukas: laptop, Mate and a Brezel
    { id: 'napkin', label: 'napkin', material: 'paper', shape: rect(lukas.x - 68, 258, 30, 26, 1), top: 28.5, landable: true, attract: 0.3 },
    { id: 'brezel', label: 'Brezel', material: 'fruit', shape: ellipse(lukas.x - 53, 270, 13, 9), top: 31.5, landable: true, attract: 0.9, food: true },
    { id: 'laptop-keys', label: 'laptop', material: 'plastic', shape: rect(lukas.x - 34, 262, 68, 26, 3), top: 30, landable: true, attract: 0.3 },
    { id: 'laptop-lid', label: 'laptop', material: 'plastic', shape: rect(lukas.x - 34, 204, 68, 58, 3), top: 32, landable: true, attract: 0.4, bright: true },
    { id: 'mate-body', label: 'Mate bottle', material: 'glass', shape: rect(lukas.x + 42, 204, 14, 52, 5), top: 32.8, landable: true, attract: 0.3 },
    { id: 'mate-cap', label: 'Mate bottle', material: 'metal', shape: ellipse(lukas.x + 49, 204, 5, 2.5), top: 33.4, landable: true, attract: 0.6, food: true },

    // Mia: salad, Apfelschorle and her phone
    { id: 'tray-mia', label: 'tray', material: 'plastic', shape: rect(mia.x - 50, 236, 100, 54, 4), top: 29.5, landable: true, attract: 0.35 },
    { id: 'bowl', label: 'salad bowl', material: 'ceramic', shape: ellipse(mia.x - 10, 265, 32, 15), top: 31, landable: true, attract: 0.5 },
    { id: 'salad', label: 'salad', material: 'leaf', shape: ellipse(mia.x - 10, 261, 25, 8), top: 32.5, landable: true, attract: 0.85, food: true },
    ...glass('schorle', 'Apfelschorle', mia.x + 24, 218, 16, 36, 32.5),
    { id: 'phone', label: 'phone', material: 'screen', shape: rect(mia.x + 56, 244, 22, 42, 4), top: 29.5, landable: true, attract: 0.45, bright: true },
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

  constructor(defs: SurfaceDef[] = buildMensaLayout()) {
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
