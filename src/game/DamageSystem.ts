import { type PersonId, POSTER_RECT, type SurfaceObject } from '../environment/Scene';
import { shapeContains } from '../physics/geometry';

export type BreakableId =
  | 'window'
  | 'menu'
  | 'clock'
  | 'sneeze-guard'
  | 'plant'
  | 'juergen'
  | 'schmidt'
  | 'lukas'
  | 'mia'
  | 'meyer'
  | 'currywurst'
  | 'fries'
  | 'plate-juergen'
  | 'spezi'
  | 'coffee'
  | 'cake'
  | 'plate-schmidt'
  | 'exams'
  | 'laptop'
  | 'mate'
  | 'brezel'
  | 'salad'
  | 'bowl'
  | 'schorle'
  | 'phone'
  | 'poster';

/** Decides the sound and the debris of a break. */
export type BreakKind = 'glass' | 'screen' | 'metal' | 'leaves' | 'terracotta' | 'ceramic' | 'liquid' | 'food' | 'paper' | 'crumbs' | 'person';

export interface BreakStage {
  /** repair cost in euros */
  cost: number;
  /** receipt line (German, it's a Mensa in Bremen) */
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
  /** whose it is: they get upset when it breaks */
  owner?: PersonId;
  stages: BreakStage[];
}

/** A person: hitting their head or shoulders costs Schmerzensgeld (and sometimes their stuff). */
const person = (id: PersonId, name: string, stages: BreakStage[]): BreakableDef => ({ id, name, objects: [`${id}-head`, `${id}-body`], owner: id, stages });
const hurt = (cost: number, label: string, word: string): BreakStage => ({ cost, label, word, kind: 'person' });

export const BREAKABLES: BreakableDef[] = [
  {
    id: 'window',
    name: 'window',
    objects: ['window-glass', 'window-frame-top', 'window-frame-bottom', 'window-frame-left', 'window-frame-right', 'window-mullion-1', 'window-mullion-2', 'window-mullion-h'],
    markObject: 'window-glass',
    stages: [
      { cost: 120, label: 'Fenster gesprungen', word: 'KNACK!', kind: 'glass' },
      { cost: 200, label: 'Fenster noch mehr gesprungen', word: 'KNACK!!', kind: 'glass' },
      { cost: 450, label: 'Fenster zerbrochen', word: 'KLIRR!', kind: 'glass' },
    ],
  },
  {
    id: 'menu',
    name: 'menu screen',
    objects: ['menu-screen'],
    stages: [
      { cost: 280, label: 'Speiseplan-Bildschirm gesprungen', word: 'KNACK!', kind: 'screen' },
      { cost: 520, label: 'Speiseplan-Bildschirm kaputt', word: 'ZAPP!', kind: 'screen' },
    ],
  },
  {
    id: 'clock',
    name: 'clock',
    objects: ['clock'],
    stages: [
      { cost: 25, label: 'Uhr gesprungen', word: 'KNACK!', kind: 'glass' },
      { cost: 35, label: 'Uhr steht still', word: 'KLONK!', kind: 'metal' },
    ],
  },
  {
    id: 'sneeze-guard',
    name: 'sneeze guard',
    objects: ['sneeze-guard', 'counter-food'],
    markObject: 'sneeze-guard',
    owner: 'meyer',
    stages: [
      { cost: 150, label: 'Spuckschutz gesprungen', word: 'KNACK!', kind: 'glass' },
      { cost: 250, label: 'Spuckschutz zerbrochen', word: 'KLIRR!', kind: 'glass' },
    ],
  },
  {
    id: 'plant',
    name: 'ficus',
    objects: ['plant-leaves', 'plant-pot'],
    stages: [
      { cost: 12, label: 'Ficus entlaubt', word: 'ZACK!', kind: 'leaves' },
      { cost: 25, label: 'Blumentopf gesprungen', word: 'KNACK!', kind: 'terracotta' },
      { cost: 45, label: 'Blumentopf zerbrochen', word: 'RUMMS!', kind: 'terracotta' },
    ],
  },
  person('juergen', 'Jürgen', [hurt(50, 'Schmerzensgeld Jürgen', 'AUA!'), hurt(80, 'Beule auf Jürgens Glatze', 'BONK!'), hurt(150, 'Jürgens Anwalt', 'AUAAA!')]),
  person('schmidt', 'Frau Dr. Schmidt', [
    { cost: 260, label: 'Brille von Frau Dr. Schmidt', word: 'KNACK!', kind: 'glass' },
    hurt(120, 'Schmerzensgeld Frau Dr. Schmidt', 'AUA!'),
    hurt(200, 'Dienstaufsichtsbeschwerde', 'BONK!'),
  ]),
  person('lukas', 'Lukas', [
    hurt(50, 'Schmerzensgeld Lukas', 'AUA!'),
    { cost: 180, label: 'Kopfhörer von Lukas', word: 'KNACKS!', kind: 'screen' },
    hurt(150, "Lukas' Anwalt", 'BONK!'),
  ]),
  person('mia', 'Mia', [hurt(50, 'Schmerzensgeld Mia', 'AUA!'), hurt(25, 'Mias Mütze ruiniert', 'PLOPP!'), hurt(150, 'Mias Anwältin', 'BONK!')]),
  person('meyer', 'Frau Meyer', [hurt(60, 'Schmerzensgeld Frau Meyer', 'AUA!'), hurt(90, 'Frau Meyer ist beleidigt', 'BONK!')]),
  { id: 'currywurst', name: 'Currywurst', objects: ['currywurst'], owner: 'juergen', stages: [{ cost: 3.2, label: 'Currywurst zermatscht', word: 'SPLATSCH!', kind: 'food' }] },
  { id: 'fries', name: 'fries', objects: ['fries'], owner: 'juergen', stages: [{ cost: 2.1, label: 'Pommes überall', word: 'ZACK!', kind: 'crumbs' }] },
  {
    id: 'plate-juergen',
    name: 'plate',
    objects: ['plate-juergen', 'tray-juergen'],
    markObject: 'plate-juergen',
    owner: 'juergen',
    stages: [
      { cost: 8, label: 'Teller gesprungen', word: 'KLIRR!', kind: 'ceramic' },
      { cost: 12, label: 'Teller zerbrochen', word: 'SCHEPPER!', kind: 'ceramic' },
    ],
  },
  {
    id: 'spezi',
    name: 'Spezi',
    objects: ['spezi', 'spezi-rim', 'spezi-body'],
    markObject: 'spezi-body',
    owner: 'juergen',
    stages: [
      { cost: 2.5, label: 'Spezi verschüttet', word: 'PLATSCH!', kind: 'liquid' },
      { cost: 4, label: 'Glas zerbrochen', word: 'KLIRR!', kind: 'glass' },
    ],
  },
  {
    id: 'coffee',
    name: 'coffee cup',
    objects: ['coffee', 'cup-rim', 'cup-body', 'cup-handle'],
    markObject: 'cup-body',
    owner: 'schmidt',
    stages: [
      { cost: 1.8, label: 'Kaffee verschüttet', word: 'PLATSCH!', kind: 'liquid' },
      { cost: 6, label: 'Tasse gesprungen', word: 'KNACK!', kind: 'ceramic' },
      { cost: 9, label: 'Tasse zerbrochen', word: 'SCHEPPER!', kind: 'ceramic' },
    ],
  },
  { id: 'cake', name: 'cheesecake', objects: ['cake'], owner: 'schmidt', stages: [{ cost: 2.4, label: 'Käsekuchen platt', word: 'MATSCH!', kind: 'food' }] },
  {
    id: 'plate-schmidt',
    name: 'plate',
    objects: ['plate-schmidt', 'tray-schmidt'],
    markObject: 'plate-schmidt',
    owner: 'schmidt',
    stages: [
      { cost: 8, label: 'Kuchenteller gesprungen', word: 'KLIRR!', kind: 'ceramic' },
      { cost: 12, label: 'Kuchenteller zerbrochen', word: 'SCHEPPER!', kind: 'ceramic' },
    ],
  },
  {
    id: 'exams',
    name: 'exams',
    objects: ['exams'],
    owner: 'schmidt',
    stages: [
      { cost: 5, label: 'Klausuren zerknittert', word: 'KNITTER!', kind: 'paper' },
      { cost: 15, label: 'Klausuren zerrissen', word: 'RATSCH!', kind: 'paper' },
    ],
  },
  {
    id: 'laptop',
    name: 'laptop',
    objects: ['laptop-lid', 'laptop-keys'],
    markObject: 'laptop-lid',
    owner: 'lukas',
    stages: [
      { cost: 350, label: 'Laptop-Display gesprungen', word: 'KNACK!', kind: 'screen' },
      { cost: 900, label: 'Laptop Totalschaden (ohne Backup)', word: 'ZAPP!', kind: 'screen' },
    ],
  },
  {
    id: 'mate',
    name: 'Mate bottle',
    objects: ['mate-body', 'mate-cap'],
    markObject: 'mate-body',
    owner: 'lukas',
    stages: [
      { cost: 2.2, label: 'Mate umgekippt', word: 'BLUBB!', kind: 'liquid' },
      { cost: 0.08, label: 'Flasche kaputt – Pfand weg', word: 'KLIRR!', kind: 'glass' },
    ],
  },
  { id: 'brezel', name: 'Brezel', objects: ['brezel', 'napkin'], markObject: 'brezel', owner: 'lukas', stages: [{ cost: 1.2, label: 'Brezel zerbröselt', word: 'KRÜMEL!', kind: 'crumbs' }] },
  { id: 'salad', name: 'salad', objects: ['salad'], owner: 'mia', stages: [{ cost: 3.5, label: 'Salat verteilt', word: 'ZACK!', kind: 'leaves' }] },
  {
    id: 'bowl',
    name: 'salad bowl',
    objects: ['bowl', 'tray-mia'],
    markObject: 'bowl',
    owner: 'mia',
    stages: [
      { cost: 6, label: 'Schüssel gesprungen', word: 'KLIRR!', kind: 'ceramic' },
      { cost: 10, label: 'Schüssel zerbrochen', word: 'SCHEPPER!', kind: 'ceramic' },
    ],
  },
  {
    id: 'schorle',
    name: 'Apfelschorle',
    objects: ['schorle', 'schorle-rim', 'schorle-body'],
    markObject: 'schorle-body',
    owner: 'mia',
    stages: [
      { cost: 2.3, label: 'Apfelschorle verschüttet', word: 'PLATSCH!', kind: 'liquid' },
      { cost: 4, label: 'Glas zerbrochen', word: 'KLIRR!', kind: 'glass' },
    ],
  },
  {
    id: 'phone',
    name: 'phone',
    objects: ['phone'],
    owner: 'mia',
    stages: [
      { cost: 180, label: 'Handy-Display gesprungen', word: 'KNACK!', kind: 'screen' },
      { cost: 420, label: 'Handy kaputt', word: 'KNIRSCH!', kind: 'screen' },
    ],
  },
  {
    id: 'poster',
    name: 'poster',
    objects: [],
    stages: [
      { cost: 15, label: 'Stadtmusikanten-Poster zerrissen', word: 'RATSCH!', kind: 'paper' },
      { cost: 20, label: 'Poster ganz kaputt', word: 'RATSCH!!', kind: 'paper' },
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
  owner: PersonId | null;
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

/** Title for a round's total damage bill (German, like the receipt). */
export function damageRank(total: number): DamageRank {
  if (total <= 0) return { title: 'SAUBER', line: 'Not a scratch on anything. Ordnung muss sein.' };
  if (total < 20) return { title: 'ORDENTLICH', line: 'Barely a mess.' };
  if (total < 200) return { title: 'SCHLAMPIG', line: 'Frau Meyer is not amused.' };
  if (total < 800) return { title: 'CHAOT', line: 'The whole Mensa is staring at you.' };
  return { title: 'TOTALSCHADEN', line: 'The fly is dead. So is the Mensa.' };
}

/** German money format: "3,20 €", "1.250 €". */
export function formatMoney(n: number): string {
  const cents = Math.round(n * 100);
  const whole = cents % 100 === 0;
  return `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })} €`;
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

  /** The breakable a scene object belongs to (e.g. 'cup-rim' -> coffee). */
  ofObject(objectId: string): BreakableDef | null {
    return this.byObject.get(objectId) ?? null;
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
    this.total = Math.round((this.total + stage.cost) * 100) / 100; // whole cents, no float dust
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
      owner: d.owner ?? null,
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
