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
  { min: 1, app: '💬', from: 'Mom', text: 'What was that noise?!' },
  { min: 1, app: '💬', from: 'Neighbour', text: 'Everything ok in there??' },
  { min: 1, app: '🏠', from: 'Landlord', text: 'Reminder: no damage to the flat 🙂' },
  { min: 1, app: '💬', from: 'Sam', text: 'bro why are you yelling at a fly' },
  { min: 150, app: '💳', from: 'Bank', text: 'Card used at: Hardware Store' },
  { min: 150, app: '💬', from: 'Mom', text: 'Are you breaking things again?' },
  { min: 400, app: '🛡️', from: 'Insurance', text: 'Claim #4471 received. Again.' },
  { min: 400, app: '💬', from: 'Mom', text: "I'm coming home. NOW." },
  { min: 900, app: '📰', from: 'News', text: 'Local man loses war against fruit fly' },
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
 * Things in the room that keep reacting after they broke: a flickering lamp,
 * a glitching monitor, sparks, and a phone that lights up with messages
 * about all the noise you're making.
 */
export class RoomFx {
  private lampFlicker = 0;
  private lampNext = 1.5;
  private glitchT = 0;
  private glitchNext = 2;
  private glitchSeed = 1;
  private sparkNext = 3;
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
    this.lampFlicker = 0;
    this.glitchT = 0;
  }

  /** Something broke: maybe someone texts about it in a moment. */
  onDamage(): void {
    if (this.noticeAt < 0 && this.noticeCooldown <= 0 && !this.notice) this.noticeAt = 1.4 + Math.random() * 1.6;
  }

  update(dt: number, damage: DamageSystem, effects: Effects): void {
    // lamp: dented shade flickers now and then; a smashed bulb sputters
    const lamp = damage.stage('lamp');
    if (lamp === 1) {
      this.lampNext -= dt;
      if (this.lampNext <= 0) {
        this.lampFlicker = 0.25 + Math.random() * 0.5;
        this.lampNext = 1.5 + Math.random() * 4;
      }
    }
    this.lampFlicker = Math.max(0, this.lampFlicker - dt);
    // monitor / phone glitches and sparks
    const mon = damage.stage('monitor');
    this.glitchNext -= dt;
    if (mon > 0 && this.glitchNext <= 0) {
      this.glitchT = 0.08 + Math.random() * (mon > 1 ? 0.3 : 0.15);
      this.glitchSeed = (Math.random() * 1e9) | 0;
      this.glitchNext = (mon > 1 ? 0.6 : 1.8) + Math.random() * 3;
    }
    this.glitchT = Math.max(0, this.glitchT - dt);
    this.sparkNext -= dt;
    if (this.sparkNext <= 0) {
      this.sparkNext = 2.5 + Math.random() * 5;
      const spots: [number, number][] = [];
      if (lamp >= 2) spots.push([422, 106]);
      if (mon >= 2) for (const m of damage.state.monitor.marks) spots.push([m.x, m.y]);
      if (damage.stage('phone') >= 2) for (const m of damage.state.phone.marks) spots.push([m.x, m.y]);
      if (spots.length) {
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        effects.sparks(x, y, 5 + Math.floor(Math.random() * 6));
        this.onSpark?.();
      }
    }
    // phone notifications
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);
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
    const options = MESSAGES.map((m, i) => ({ m, i })).filter(({ m, i }) => total >= m.min && !this.shown.has(i));
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

  /** World-space overlays (context has the world transform). */
  draw(ctx: Ctx, damage: DamageSystem, time: number): void {
    // flickering lamp: dim the light it throws
    if (this.lampFlicker > 0) {
      const dim = Math.sin(time * 90) > 0.2 || Math.random() < 0.3 ? 0.85 : 0.25;
      for (const [x, y, r] of [[420, 140, 150], [410, 212, 140], [422, 110, 60]] as const) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(30,20,5,${0.2 * dim})`);
        g.addColorStop(1, 'rgba(30,20,5,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
    // monitor glitch bars
    if (this.glitchT > 0) {
      const scr = this.scene.byId('monitor-screen')!.bounds;
      let s = this.glitchSeed;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const cols = ['255,43,214', '43,255,136', '53,200,255', '255,255,255', '0,0,0'];
      for (let i = 0; i < 7; i++) {
        const y = scr.minY + rnd() * (scr.maxY - scr.minY - 4);
        ctx.fillStyle = `rgba(${cols[Math.floor(rnd() * cols.length)]},${0.35 + rnd() * 0.4})`;
        ctx.fillRect(scr.minX + rnd() * 20, y, (scr.maxX - scr.minX) * (0.3 + rnd() * 0.7), 0.8 + rnd() * 5);
      }
    }
    // phone lights up while a message is showing
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
      ctx.roundRect(p.minX + 3, p.minY + 24, p.maxX - p.minX - 6, 9, 2);
      ctx.fill();
      ctx.fillStyle = `rgba(60,60,70,${0.7 * a})`;
      ctx.fillRect(p.minX + 5, p.minY + 26.2, 12, 1.2);
      ctx.fillRect(p.minX + 5, p.minY + 29, 20, 1);
      // buzzing on the desk
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
