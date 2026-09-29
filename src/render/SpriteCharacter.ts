import type { PersonState } from '../game/People';

/**
 * Every pose a character can have. The first five are the starter set; the rest
 * are optional and picked up automatically when the file exists
 * (public/characters/<name>/<name>_<pose>.webp).
 */
export const POSES = [
  'neutral',
  'talking',
  'happy',
  'angry',
  'blink',
  'scared',
  'hurt',
  'disgusted',
  'laugh',
  'shoo1',
  'shoo2',
  'eat',
  'stand_angry',
  'stand_cheer',
  // personality poses
  'facepalm',
  'eyeroll',
  'stand_slam',
  'startled',
  'armscrossed',
] as const;
export type Pose = (typeof POSES)[number];

const STARTERS = ['neutral', 'talking', 'happy', 'angry', 'blink'] as const;

/** Where a sprite sits on the screen and how big it is. */
export interface SpriteLayout {
  /** mm per pixel of the 1024 x 1536 source canvas */
  mmPerPx: number;
  /** eye height in the source canvas (px) */
  eyeY: number;
}

const SRC_W = 1024;

/**
 * Where the eyes sit in each pose, relative to the neutral pose (source px),
 * an extra scale, and how far the person rises (mm): standing poses lift her
 * out of the chair.
 */
const FRAMING: Partial<Record<Pose, { dEye: number; scale: number; lift: number }>> = {
  hurt: { dEye: -8, scale: 1, lift: 0 },
  disgusted: { dEye: 18, scale: 1, lift: 0 },
  laugh: { dEye: 20, scale: 1, lift: 0 },
  eat: { dEye: 10, scale: 1, lift: 0 },
  facepalm: { dEye: 40, scale: 1, lift: 0 },
  stand_slam: { dEye: 30, scale: 1, lift: 4 },
  stand_angry: { dEye: 40, scale: 1, lift: 7 },
  stand_cheer: { dEye: 295, scale: 0.86, lift: 12 },
};

/**
 * A character drawn from ready-made transparent images, one per pose.
 * All poses share one canvas size and framing, so switching never makes
 * the person jump.
 */
export class SpriteCharacter {
  private readonly images = new Map<Pose, HTMLImageElement>();
  private starters = 0;
  private cur: Pose = 'neutral';
  private prev: Pose | null = null;
  private switchAt = 0;

  constructor(
    private readonly baseUrl: string,
    readonly name: string,
    private readonly layout: SpriteLayout,
  ) {
    // the five starter poses load right away; the rest come later (see loadExtras)
    for (const pose of STARTERS) this.load(pose);
  }

  private load(pose: Pose): void {
    const img = new Image();
    img.onload = () => {
      if ((STARTERS as readonly string[]).includes(pose)) this.starters++;
    };
    img.onerror = () => this.images.delete(pose); // an optional pose that doesn't exist (yet)
    img.src = `${this.baseUrl}characters/${this.name}/${this.name}_${pose}.webp`;
    this.images.set(pose, img);
  }

  /**
   * Load the other poses one at a time in the background, so a phone never
   * has to decode all of them at once (every image is a few MB in memory).
   */
  loadExtras(startDelayMs = 0): void {
    if (this.extrasStarted) return;
    this.extrasStarted = true;
    const extras = POSES.filter((p) => !(STARTERS as readonly string[]).includes(p));
    extras.forEach((pose, i) => window.setTimeout(() => this.load(pose), startDelayMs + i * 220));
  }

  private extrasStarted = false;

  /** 0..1 progress of the starter poses. */
  get progress(): number {
    return Math.min(1, this.starters / STARTERS.length);
  }

  get ready(): boolean {
    return this.starters >= STARTERS.length;
  }

  private has(pose: Pose): boolean {
    const i = this.images.get(pose);
    return !!i && i.complete && i.naturalWidth > 0;
  }

  /** The first pose in the list that exists. */
  private pick(...poses: Pose[]): Pose {
    for (const p of poses) if (this.has(p)) return p;
    return 'neutral';
  }

  /** Which pose fits what the person is doing right now. */
  pose(p: PersonState, time: number): Pose {
    const talking = p.bubble !== null && p.bubble.t < p.bubble.life - 0.3;
    if (p.hurtT > 0) return this.pick('hurt', 'angry');
    if (p.shooT > 0) return Math.floor(time * 6) % 2 ? this.pick('shoo2', 'shoo1', 'angry') : this.pick('shoo1', 'angry');
    if (p.mood === 'scared' || p.mood === 'nervous' || p.flinch > 0.35) {
      if (p.seat.id === 'mia') return this.pick('startled', 'scared', 'neutral');
      if (p.seat.id === 'lena') return this.pick('facepalm', 'scared', 'neutral');
      return this.pick('scared', 'neutral');
    }
    if (p.mood === 'disgusted') {
      if (p.seat.id === 'schmidt') return this.pick('eyeroll', 'disgusted', 'angry');
      if (p.seat.id === 'lukas') return this.pick('armscrossed', 'disgusted', 'angry');
      return this.pick('disgusted', 'angry');
    }
    if (p.mood === 'angry') {
      if (p.seat.id === 'juergen') return this.pick('stand_slam', 'stand_angry', 'angry');
      return this.pick('stand_angry', 'angry');
    }
    if (p.clapT > 0) return this.pick('stand_cheer', 'happy');
    if (p.mood === 'happy') return this.pick(talking ? 'laugh' : 'happy', 'happy');
    if (p.bite >= 0 && p.bite < 0.9) return this.pick('eat', 'talking');
    if (p.chewT > 0) return Math.sin(time * 9) > 0 ? 'talking' : 'neutral';
    if (talking) return 'talking';
    if (p.blinkT > 0) return 'blink';
    return 'neutral';
  }

  /** Draw with the eyes at (x, eyeLevelY) in world mm; `scale` shrinks a whole character (e.g. behind the counter). */
  draw(c: CanvasRenderingContext2D, p: PersonState, x: number, eyeLevelY: number, time: number, scale = 1): void {
    const want = this.pose(p, time);
    if (want !== this.cur) {
      this.prev = this.cur;
      this.cur = want;
      this.switchAt = time;
    }
    const u = Math.min(1, (time - this.switchAt) / 0.12);
    if (this.prev && u < 1) {
      this.drawPose(c, this.prev, x, eyeLevelY, scale, 1);
      this.drawPose(c, this.cur, x, eyeLevelY, scale, u);
    } else this.drawPose(c, this.cur, x, eyeLevelY, scale, 1);
  }

  private drawPose(c: CanvasRenderingContext2D, pose: Pose, x: number, eyeLevelY: number, scale: number, alpha: number): void {
    const img = this.images.get(pose);
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const f = FRAMING[pose] ?? { dEye: 0, scale: 1, lift: 0 };
    const k = this.layout.mmPerPx * scale * f.scale;
    const w = SRC_W * k;
    const h = (img.naturalHeight / img.naturalWidth) * SRC_W * k;
    const top = eyeLevelY - f.lift * scale - (this.layout.eyeY + f.dEye) * k;
    c.globalAlpha = alpha;
    c.drawImage(img, x - w / 2, top, w, h);
    c.globalAlpha = 1;
  }
}
