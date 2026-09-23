import type { Scene } from '../environment/Scene';
import type { DamageSystem } from '../game/DamageSystem';
import type { Camera } from './Camera';
import type { Effects } from './Effects';

type Ctx = CanvasRenderingContext2D;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface Notice {
  app: string;
  from: string;
  text: string;
  t: number;
  life: number;
}

const MESSAGES: { min: number; app: string; from: string; text: string }[] = [
  { min: 0, app: '💬', from: 'Mama', text: 'Isst du auch genug, Schatz?' },
  { min: 0, app: '👥', from: 'WG-Gruppe', text: 'Wer hat meinen Joghurt gegessen?!' },
  { min: 0, app: '💳', from: 'Mensakarte', text: 'Guthaben: 0,40 €' },
  { min: 1, app: '💬', from: 'Mama', text: 'Was ist das für ein Lärm?!' },
  { min: 1, app: '💬', from: 'Oma', text: 'Kind, haust du wieder Fliegen?' },
  { min: 150, app: '🏦', from: 'Bank', text: 'Kartenzahlung: Baumarkt 89,99 €' },
  { min: 150, app: '👥', from: 'WG-Gruppe', text: 'Bist du das in der Mensa-Story?? 😂' },
  { min: 400, app: '🛡️', from: 'Versicherung', text: 'Schadensmeldung erhalten. Schon wieder.' },
  { min: 400, app: '🧹', from: 'Hausmeister', text: 'WER WAR DAS?!' },
  { min: 900, app: '📰', from: 'Eilmeldung', text: 'Chaos in der Uni-Mensa: Fliege überlebt' },
];

/** Screen-space speech bubble with a tail pointing down at (x, y). */
export function drawBubble(ctx: Ctx, x: number, y: number, lines: [string, string?], alpha: number, scale: number, viewW: number, dark = false): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const [head, body] = lines;
  ctx.font = `800 14px ${FONT}`;
  const w1 = ctx.measureText(head).width;
  ctx.font = `500 12.5px ${FONT}`;
  const w2 = body ? ctx.measureText(body).width : 0;
  const w = Math.max(w1, w2) + 22;
  const h = body ? 44 : 30;
  const bx = Math.min(viewW - w / 2 - 8, Math.max(w / 2 + 8, x));
  const by = y - 10 - h;
  ctx.translate(bx, by + h);
  ctx.scale(scale, scale);
  ctx.translate(-bx, -(by + h));
  const tx = Math.min(bx + w / 2 - 14, Math.max(bx - w / 2 + 14, x));
  const shape = (dy: number) => {
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, by + dy, w, h, 12);
    // tail
    ctx.moveTo(tx - 7, by + h - 1 + dy);
    ctx.lineTo(tx, by + h + 8 + dy);
    ctx.lineTo(tx + 7, by + h - 1 + dy);
  };
  // cheap drop shadow (shadowBlur is very slow in Safari on iPhones)
  shape(3);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  shape(0);
  ctx.fillStyle = dark ? 'rgba(24,26,32,0.94)' : 'rgba(252,252,250,0.96)';
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dark ? '#fff' : '#17181c';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillText(head, bx - w / 2 + 11, by + (body ? 15 : h / 2));
  if (body) {
    ctx.font = `500 12.5px ${FONT}`;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.8)' : '#3b3d44';
    ctx.fillText(body, bx - w / 2 + 11, by + 31);
  }
  ctx.restore();
}

/**
 * Things in the Mensa that keep reacting after they broke: the glitching menu
 * screen, sparking electronics, and Mia's phone lighting up with messages
 * about all the noise you're making.
 */
export class RoomFx {
  private glitchT = 0;
  private glitchNext = 2;
  private glitchSeed = 1;
  private sparkNext = 3;
  /** a message now and then even when nothing broke */
  private quietNotice = 18;
  private notice: Notice | null = null;
  private noticeAt = -1;
  private noticeCooldown = 0;
  private shown = new Set<number>();
  /** set by the game: vibrate sound when a message arrives */
  onNotice: (() => void) | null = null;
  onSpark: (() => void) | null = null;

  constructor(private readonly scene: Scene) {}

  reset(): void {
    this.notice = null;
    this.noticeAt = -1;
    this.noticeCooldown = 0;
    this.shown.clear();
    this.glitchT = 0;
  }

  /** Something broke: maybe someone texts about it in a moment. */
  onDamage(): void {
    if (this.noticeAt < 0 && this.noticeCooldown <= 0 && !this.notice) this.noticeAt = 1.4 + Math.random() * 1.6;
  }

  update(dt: number, damage: DamageSystem, effects: Effects): void {
    // the menu screen glitches once it's cracked
    const menu = damage.stage('menu');
    this.glitchNext -= dt;
    if (menu > 0 && this.glitchNext <= 0) {
      this.glitchT = 0.08 + Math.random() * (menu > 1 ? 0.3 : 0.15);
      this.glitchSeed = (Math.random() * 1e9) | 0;
      this.glitchNext = (menu > 1 ? 0.6 : 1.8) + Math.random() * 3;
    }
    this.glitchT = Math.max(0, this.glitchT - dt);
    // broken electronics spark now and then
    this.sparkNext -= dt;
    if (this.sparkNext <= 0) {
      this.sparkNext = 2.5 + Math.random() * 5;
      const spots: [number, number][] = [];
      for (const id of ['menu', 'laptop', 'phone'] as const) if (damage.stage(id) >= 2) for (const m of damage.state[id].marks) spots.push([m.x, m.y]);
      if (spots.length) {
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        effects.sparks(x, y, 5 + Math.floor(Math.random() * 6));
        this.onSpark?.();
      }
    }
    // Mia's phone gets messages about all the noise (and some anyway)
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);
    this.quietNotice -= dt;
    if (this.quietNotice <= 0 && this.noticeAt < 0 && !this.notice && this.noticeCooldown <= 0) {
      this.quietNotice = 25 + Math.random() * 25;
      this.noticeAt = 0.1;
    }
    if (this.noticeAt >= 0) {
      this.noticeAt -= dt;
      if (this.noticeAt < 0 && damage.stage('phone') < 2) this.pushNotice(damage.total);
    }
    if (this.notice) {
      this.notice.t += dt;
      if (this.notice.t >= this.notice.life) this.notice = null;
    }
  }

  private pushNotice(total: number): void {
    const options = MESSAGES.map((m, i) => ({ m, i })).filter(({ m, i }) => total >= m.min && !this.shown.has(i) && (m.min > 0) === total > 0);
    if (!options.length) return;
    // prefer the most dramatic message the damage allows
    const top = Math.max(...options.map((o) => o.m.min));
    const pool = options.filter((o) => o.m.min === top || Math.random() < 0.3);
    const { m, i } = pool[Math.floor(Math.random() * pool.length)];
    this.shown.add(i);
    this.notice = { app: m.app, from: m.from, text: m.text, t: 0, life: 3.4 };
    this.noticeCooldown = 9;
    this.onNotice?.();
  }

  /** World-space overlays on the back layer (context has the world transform). */
  draw(ctx: Ctx): void {
    // menu screen glitch bars
    if (this.glitchT > 0) {
      const scr = this.scene.byId('menu-screen')!.bounds;
      let s = this.glitchSeed;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const cols = ['255,43,214', '43,255,136', '53,200,255', '255,255,255', '0,0,0'];
      for (let i = 0; i < 7; i++) {
        const y = scr.minY + 3 + rnd() * (scr.maxY - scr.minY - 10);
        ctx.fillStyle = `rgba(${cols[Math.floor(rnd() * cols.length)]},${0.35 + rnd() * 0.4})`;
        ctx.fillRect(scr.minX + 3 + rnd() * 20, y, (scr.maxX - scr.minX - 6) * (0.3 + rnd() * 0.6), 0.8 + rnd() * 4);
      }
    }
  }

  /** Overlays on the table layer: the phone lighting up. */
  drawFront(ctx: Ctx, damage: DamageSystem): void {
    if (this.notice && damage.stage('phone') < 2) {
      const p = this.scene.byId('phone')!.bounds;
      const u = this.notice.t / this.notice.life;
      const a = u < 0.1 ? u / 0.1 : u > 0.8 ? (1 - u) / 0.2 : 1;
      ctx.fillStyle = `rgba(255,255,255,${0.22 * a})`;
      ctx.beginPath();
      ctx.roundRect(p.minX + 1.6, p.minY + 1.6, p.maxX - p.minX - 3.2, p.maxY - p.minY - 3.2, 4);
      ctx.fill();
      ctx.fillStyle = `rgba(250,250,250,${0.85 * a})`;
      ctx.beginPath();
      ctx.roundRect(p.minX + 2.5, p.minY + 15, p.maxX - p.minX - 5, 7, 1.5);
      ctx.fill();
      ctx.fillStyle = `rgba(60,60,70,${0.7 * a})`;
      ctx.fillRect(p.minX + 4, p.minY + 16.8, 8, 1);
      ctx.fillRect(p.minX + 4, p.minY + 19, 13, 0.8);
      // buzzing on the table
      const g = ctx.createRadialGradient((p.minX + p.maxX) / 2, (p.minY + p.maxY) / 2, 10, (p.minX + p.maxX) / 2, (p.minY + p.maxY) / 2, 55);
      g.addColorStop(0, `rgba(255,255,255,${0.12 * a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.minX - 40, p.minY - 40, p.maxX - p.minX + 80, p.maxY - p.minY + 80);
    }
  }

  /** Screen-space message card above the phone. */
  drawScreen(ctx: Ctx, cam: Camera, reducedMotion: boolean): void {
    const n = this.notice;
    if (!n) return;
    const p = this.scene.byId('phone')!.bounds;
    const x = cam.sx((p.minX + p.maxX) / 2);
    const y = cam.sy(p.minY);
    const u = n.t / n.life;
    const a = u < 0.08 ? u / 0.08 : u > 0.85 ? (1 - u) / 0.15 : 1;
    const pop = reducedMotion ? 1 : Math.min(1, 0.6 + (n.t / 0.18) * 0.4);
    const wob = reducedMotion || n.t > 0.5 ? 0 : Math.sin(n.t * 70) * 2;
    drawBubble(ctx, x + wob, y, [`${n.app} ${n.from}`, n.text], a, pop, cam.viewW, true);
  }
}
