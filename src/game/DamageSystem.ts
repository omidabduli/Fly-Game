import { POSTER_RECT, type SurfaceObject } from '../environment/Scene';
import { shapeContains } from '../physics/geometry';

export type BreakableId = 'window' | 'monitor' | 'phone' | 'lamp' | 'plant' | 'cup' | 'plate' | 'fruit' | 'books' | 'crumbs' | 'poster';

/** Decides the sound and the debris of a break. */
export type BreakKind = 'glass' | 'screen' | 'metal' | 'bulb' | 'leaves' | 'terracotta' | 'ceramic' | 'liquid' | 'fruit' | 'paper' | 'crumbs';

export interface BreakStage {
  /** repair cost in dollars */
  cost: number;
  /** receipt line */
  label: string;
  /** comic sound word shown at the impact */
  word: string;
  kind: BreakKind;
}

export interface BreakableDef {
  id: BreakableId;
  name: string;
  /** scene objects that belong to it (hitting any of them damages it) */
  objects: string[];
  /** damage marks are placed on this object (e.g. cracks go on the glass even when the frame was hit) */
  markObject?: string;
  stages: BreakStage[];
}

export const BREAKABLES: BreakableDef[] = [
  {
    id: 'window',
    name: 'window',
    objects: ['window-glass', 'window-frame-top', 'window-frame-bottom', 'window-frame-left', 'window-frame-right', 'window-mullion-v', 'window-mullion-h'],
    markObject: 'window-glass',
    stages: [
      { cost: 90, label: 'Window cracked', word: 'CRACK!', kind: 'glass' },
      { cost: 140, label: 'Window badly cracked', word: 'CRACK!!', kind: 'glass' },
      { cost: 320, label: 'Window shattered', word: 'SMASH!', kind: 'glass' },
    ],
  },
  {
    id: 'monitor',
    name: 'monitor',
    objects: ['monitor-screen', 'monitor-bezel'],
    markObject: 'monitor-screen',
    stages: [
      { cost: 250, label: 'Monitor screen cracked', word: 'CRACK!', kind: 'screen' },
      { cost: 650, label: 'Monitor destroyed', word: 'ZAP!', kind: 'screen' },
    ],
  },
  {
    id: 'phone',
    name: 'phone',
    objects: ['phone'],
    stages: [
      { cost: 180, label: 'Phone screen cracked', word: 'CRACK!', kind: 'screen' },
      { cost: 420, label: 'Phone destroyed', word: 'CRUNCH!', kind: 'screen' },
    ],
  },
  {
    id: 'lamp',
    name: 'lamp',
    objects: ['lamp-shade'],
    stages: [
      { cost: 35, label: 'Lamp shade dented', word: 'CLANG!', kind: 'metal' },
      { cost: 65, label: 'Lamp bulb smashed', word: 'POP!', kind: 'bulb' },
    ],
  },
  {
    id: 'plant',
    name: 'plant',
    objects: ['plant-leaves', 'plant-pot'],
    stages: [
      { cost: 12, label: 'Plant leaves knocked off', word: 'THWACK!', kind: 'leaves' },
      { cost: 25, label: 'Flower pot cracked', word: 'CRACK!', kind: 'terracotta' },
      { cost: 45, label: 'Flower pot smashed', word: 'SMASH!', kind: 'terracotta' },
    ],
  },
  {
    id: 'cup',
    name: 'coffee mug',
    objects: ['coffee', 'cup-rim', 'cup-body', 'cup-handle'],
    stages: [
      { cost: 6, label: 'Coffee spilled', word: 'SPLASH!', kind: 'liquid' },
      { cost: 10, label: 'Coffee mug cracked', word: 'CRACK!', kind: 'ceramic' },
      { cost: 14, label: 'Coffee mug smashed', word: 'SMASH!', kind: 'ceramic' },
    ],
  },
  {
    id: 'plate',
    name: 'plate',
    objects: ['plate'],
    stages: [
      { cost: 8, label: 'Plate chipped', word: 'CLINK!', kind: 'ceramic' },
      { cost: 22, label: 'Plate smashed', word: 'SMASH!', kind: 'ceramic' },
    ],
  },
  {
    id: 'fruit',
    name: 'fruit',
    objects: ['fruit-apple', 'fruit-banana'],
    stages: [
      { cost: 3, label: 'Fruit squashed', word: 'SPLAT!', kind: 'fruit' },
      { cost: 3, label: 'Fruit pulverised', word: 'SQUISH!', kind: 'fruit' },
    ],
  },
  {
    id: 'books',
    name: 'books',
    objects: ['book-top', 'book-bottom'],
    stages: [
      { cost: 10, label: 'Book covers bent', word: 'THUD!', kind: 'paper' },
      { cost: 18, label: 'Pages torn out', word: 'RIIIP!', kind: 'paper' },
    ],
  },
  {
    id: 'crumbs',
    name: 'cookie crumbs',
    objects: ['crumbs'],
    stages: [{ cost: 1, label: 'Cookie crumbs everywhere', word: 'CRUNCH!', kind: 'crumbs' }],
  },
  {
    id: 'poster',
    name: 'framed print',
    objects: [],
    stages: [
      { cost: 25, label: 'Picture glass cracked', word: 'CRACK!', kind: 'glass' },
      { cost: 35, label: 'Picture knocked crooked', word: 'CLATTER!', kind: 'glass' },
    ],
  },
];

/** Swings slower than this (mm/s at impact) don't break anything. */
export const MIN_DAMAGE_SPEED = 1200;

export interface DamageMark {
  x: number;
  y: number;
  /** deterministic seed so a repaint draws the same cracks */
  seed: number;
  /** scene object that was hit */
  objectId: string;
  /** stage reached by this hit (1-based) */
  stage: number;
}

export interface BreakableState {
  stage: number;
  marks: DamageMark[];
}

export interface DamageEvent {
  id: BreakableId;
  name: string;
  /** new stage, 1-based */
  stage: number;
  /** reached the last stage (fully broken) */
  final: boolean;
  cost: number;
  label: string;
  word: string;
  kind: BreakKind;
  x: number;
  y: number;
  objectId: string;
}

export interface ReceiptLine {
  id: BreakableId;
  label: string;
  cost: number;
}

export interface DamageRank {
  title: string;
  line: string;
}

/** Title for a round's total damage bill. */
export function damageRank(total: number): DamageRank {
  if (total <= 0) return { title: 'SURGICAL', line: 'Not a scratch on anything.' };
  if (total < 50) return { title: 'TIDY', line: 'Barely a mess.' };
  if (total < 300) return { title: 'MESSY', line: 'Someone will notice.' };
  if (total < 1000) return { title: 'HOME WRECKER', line: 'Was the fly worth it?' };
  return { title: 'DEMOLITION', line: 'The fly is dead. So is the room.' };
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Keeps track of what the swatter has broken in the room during one round
 * (one fly) and what it costs. Purely cosmetic for the simulation: breaking
 * things never changes the physics or the fly's behaviour.
 */
export class DamageSystem {
  readonly defs: ReadonlyMap<BreakableId, BreakableDef>;
  private readonly byObject = new Map<string, BreakableDef>();
  state!: Record<BreakableId, BreakableState>;
  receipt: ReceiptLine[] = [];
  total = 0;
  /** incremented on every visible change, so the renderer knows when to repaint */
  version = 0;
  private seed = 1;

  constructor() {
    const defs = new Map<BreakableId, BreakableDef>();
    for (const d of BREAKABLES) {
      defs.set(d.id, d);
      for (const o of d.objects) this.byObject.set(o, d);
    }
    this.defs = defs;
    this.reset();
  }

  reset(): void {
    const s = {} as Record<BreakableId, BreakableState>;
    for (const d of BREAKABLES) s[d.id] = { stage: 0, marks: [] };
    this.state = s;
    this.receipt = [];
    this.total = 0;
    this.version++;
  }

  stage(id: BreakableId): number {
    return this.state[id].stage;
  }

  maxStage(id: BreakableId): number {
    return this.defs.get(id)!.stages.length;
  }

  isBroken(id: BreakableId): boolean {
    return this.stage(id) >= this.maxStage(id);
  }

  /** Number of objects damaged at least once this round. */
  get damagedCount(): number {
    let n = 0;
    for (const d of BREAKABLES) if (this.state[d.id].stage > 0) n++;
    return n;
  }

  /** What breakable (if any) a swatter footprint centred on (x, y) hits when it lands on `obj`. */
  breakableFor(obj: SurfaceObject, x: number, y: number, hx: number, hy: number): BreakableDef | null {
    const d = this.byObject.get(obj.id);
    if (d) return d;
    if (obj.id === 'wall') {
      const P = POSTER_RECT;
      if (x + hx > P.x && x - hx < P.x + P.w && y + hy > P.y && y - hy < P.y + P.h) return this.defs.get('poster')!;
    }
    return null;
  }

  /**
   * The swatter landed on `obj` with its head centred on (x, y).
   * Returns what broke, or null if nothing (more) could break.
   */
  impact(obj: SurfaceObject, x: number, y: number, hx: number, hy: number, speed: number, objectById: (id: string) => SurfaceObject | undefined): DamageEvent | null {
    if (speed < MIN_DAMAGE_SPEED) return null;
    const d = this.breakableFor(obj, x, y, hx, hy);
    if (!d) return null;
    const st = this.state[d.id];
    if (st.stage >= d.stages.length) return null;
    st.stage++;
    const stage = d.stages[st.stage - 1];
    const [mx, my] = this.markPoint(d, obj, x, y, objectById);
    st.marks.push({ x: mx, y: my, seed: this.nextSeed(), objectId: obj.id, stage: st.stage });
    this.receipt.push({ id: d.id, label: stage.label, cost: stage.cost });
    this.total += stage.cost;
    this.version++;
    return {
      id: d.id,
      name: d.name,
      stage: st.stage,
      final: st.stage >= d.stages.length,
      cost: stage.cost,
      label: stage.label,
      word: stage.word,
      kind: stage.kind,
      x: mx,
      y: my,
      objectId: obj.id,
    };
  }

  private nextSeed(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed;
  }

  /** Where the damage shows: the swatter centre, pulled onto the marked object. */
  private markPoint(d: BreakableDef, hit: SurfaceObject, x: number, y: number, objectById: (id: string) => SurfaceObject | undefined): [number, number] {
    if (d.id === 'poster') {
      const P = POSTER_RECT;
      return [Math.min(P.x + P.w - 4, Math.max(P.x + 4, x)), Math.min(P.y + P.h - 4, Math.max(P.y + 4, y))];
    }
    const target = (d.markObject && objectById(d.markObject)) || hit;
    const b = target.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    // clamp into the bounding box (with a small inset), then walk toward the centre until inside
    let px = Math.min(b.maxX - 2, Math.max(b.minX + 2, x));
    let py = Math.min(b.maxY - 2, Math.max(b.minY + 2, y));
    for (let i = 0; i < 12 && !shapeContains(target.shape, px, py); i++) {
      px += (cx - px) * 0.3;
      py += (cy - py) * 0.3;
    }
    return [px, py];
  }
}
