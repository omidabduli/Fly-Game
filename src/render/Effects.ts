import type { BreakKind } from '../game/DamageSystem';
import type { Camera } from './Camera';

type Ctx = CanvasRenderingContext2D;

interface Ring {
  x: number;
  y: number;
  hx: number;
  hy: number;
  r: number;
  t: number;
  life: number;
  color: string;
  /** round shockwave instead of the swatter outline */
  circle: boolean;
}

type PartShape = 'dot' | 'shard' | 'chunk' | 'leaf' | 'paper' | 'drop' | 'spark';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  shape: PartShape;
  rot: number;
  vr: number;
  /** "gravity" toward the bottom of the screen (mm/s²) */
  g: number;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  life: number;
  kind: 'word' | 'money';
  rot: number;
}

interface Imprint {
  x: number;
  y: number;
  hx: number;
  hy: number;
  r: number;
  t: number;
  life: number;
}

const MAX_PARTICLES = 320;
const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, -apple-system, sans-serif';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/**
 * Short-lived effects: impact rings, debris, sparks, comic words, money
 * labels, camera shake, screen flash and the steam over the coffee.
 */
export class Effects {
  private rings: Ring[] = [];
  private parts: Particle[] = [];
  private texts: FloatText[] = [];
  private imprints: Imprint[] = [];
  private flashT = 0;
  private flashLife = 0;
  private flashColor = '255,255,255';
  private flashAlpha = 0;
  shakeT = 0;
  shakeLife = 0.14;
  shakeAmp = 0;
  reducedMotion = false;

  impact(x: number, y: number, hx: number, hy: number, r: number, strength: number, hit: boolean): void {
    this.rings.push({ x, y, hx, hy, r, t: 0, life: 0.35, color: hit ? '255,80,60' : '255,255,255', circle: false });
    if (strength > 0.5) this.rings.push({ x, y, hx: hx * 0.8, hy: hx * 0.8, r: 0, t: 0, life: 0.45, color: '255,255,255', circle: true });
    this.imprints.push({ x, y, hx, hy, r, t: 0, life: 2.6 });
    if (this.imprints.length > 4) this.imprints.shift();
    const n = hit ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const edge = Math.random() < 0.6;
      const px = x + Math.cos(a) * hx * (edge ? 1 : Math.random());
      const py = y + Math.sin(a) * hy * (edge ? 1 : Math.random());
      const sp = 40 + Math.random() * 110 * strength;
      this.add({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.35, size: 0.6 + Math.random() * 1.3, color: hit ? '120,20,10' : '240,235,225', shape: 'dot', g: 0, drag: 6 });
    }
    this.shake(1.2 + 2.2 * strength, 0.14);
  }

  shake(amp: number, dur: number): void {
    if (this.reducedMotion) return;
    if (amp < this.shakeAmp * (this.shakeT / this.shakeLife)) return;
    this.shakeAmp = amp;
    this.shakeT = dur;
    this.shakeLife = dur;
  }

  flash(color: string, alpha: number, dur: number): void {
    this.flashColor = color;
    this.flashAlpha = this.reducedMotion ? alpha * 0.4 : alpha;
    this.flashT = 0;
    this.flashLife = dur;
  }

  private add(p: Omit<Particle, 't' | 'rot' | 'vr'> & { rot?: number; vr?: number }): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ t: 0, rot: p.rot ?? Math.random() * Math.PI * 2, vr: p.vr ?? rand(-12, 12), ...p });
  }

  /** Debris flying off something that just broke. */
  burst(x: number, y: number, kind: BreakKind, strength = 1): void {
    const spray = (n: number, shape: PartShape, colors: string[], speed: [number, number], life: [number, number], size: [number, number], g: number, drag = 2.5, up = 90) => {
      for (let i = 0; i < n * strength; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(speed[0], speed[1]);
        this.add({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - up, life: rand(life[0], life[1]), size: rand(size[0], size[1]), color: pick(colors), shape, g, drag });
      }
    };
    switch (kind) {
      case 'glass':
        spray(26, 'shard', ['225,242,255', '200,225,245', '255,255,255'], [60, 260], [0.6, 1.2], [1, 2.6], 520);
        spray(8, 'spark', ['255,255,255'], [150, 320], [0.15, 0.3], [1.5, 3], 0, 4, 0);
        break;
      case 'screen':
        spray(14, 'shard', ['40,48,68', '70,80,110', '180,200,230'], [60, 220], [0.5, 1.1], [1, 2.4], 520);
        spray(22, 'spark', ['255,236,140', '255,255,255', '120,200,255'], [180, 420], [0.2, 0.5], [1.5, 3.5], 260, 3, 40);
        break;
      case 'metal':
        spray(14, 'spark', ['255,230,150', '255,255,220'], [160, 360], [0.15, 0.35], [1.5, 3], 200, 3, 30);
        break;
      case 'bulb':
        spray(18, 'shard', ['250,250,240', '255,244,210'], [80, 240], [0.5, 1.1], [0.8, 2], 520);
        spray(26, 'spark', ['255,226,120', '255,255,230', '255,180,80'], [200, 460], [0.2, 0.6], [1.5, 3.5], 300, 3, 40);
        this.rings.push({ x, y, hx: 30, hy: 30, r: 0, t: 0, life: 0.5, color: '255,220,120', circle: true });
        break;
      case 'leaves':
        spray(14, 'leaf', ['63,125,60', '79,154,71', '98,177,85'], [40, 140], [1.1, 1.9], [2.2, 3.6], 110, 2.2, 60);
        break;
      case 'terracotta':
        spray(16, 'chunk', ['201,100,58', '165,79,44', '224,138,94'], [60, 220], [0.6, 1.1], [1.2, 2.6], 560);
        spray(14, 'dot', ['74,50,34', '96,66,44'], [30, 120], [0.5, 1], [0.8, 1.6], 380);
        spray(6, 'leaf', ['63,125,60', '79,154,71'], [40, 110], [1, 1.6], [2, 3], 110, 2.2, 40);
        break;
      case 'ceramic':
        spray(18, 'chunk', ['250,248,242', '75,130,207', '60,112,189', '230,226,216'], [70, 240], [0.6, 1.1], [1, 2.4], 560);
        break;
      case 'liquid':
        spray(30, 'drop', ['92,52,24', '120,72,36', '70,38,16'], [70, 260], [0.5, 0.9], [0.8, 2], 620, 1.5, 120);
        break;
      case 'fruit':
        spray(24, 'drop', ['245,225,140', '250,236,160', '236,214,150'], [60, 220], [0.5, 0.9], [0.8, 1.8], 620, 1.5, 100);
        spray(8, 'chunk', ['184,50,42', '217,184,74'], [60, 160], [0.5, 0.9], [1, 2], 560);
        break;
      case 'paper':
        spray(9, 'paper', ['246,241,228', '255,255,255', '235,228,210'], [40, 130], [1.3, 2.2], [2.5, 4], 90, 2, 60);
        break;
      case 'crumbs':
        spray(20, 'dot', ['217,165,92', '183,122,56'], [50, 170], [0.5, 0.9], [0.5, 1.2], 600, 2, 70);
        break;
    }
  }

  /** A few sparks (a broken lamp or monitor sputtering). */
  sparks(x: number, y: number, n: number, color = '255,226,140'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(80, 240);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: rand(0.15, 0.4), size: rand(1.2, 2.6), color, shape: 'spark', g: 300, drag: 3 });
    }
  }

  /** The fly got squashed. */
  splat(x: number, y: number): void {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(30, 140);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 0.7), size: rand(0.4, 1.1), color: pick(['120,20,10', '160,40,20', '90,60,30']), shape: 'drop', g: 0, drag: 7 });
    }
    this.rings.push({ x, y, hx: 14, hy: 14, r: 0, t: 0, life: 0.5, color: '255,90,60', circle: true });
  }

  /** Comic sound word ("CRASH!") popping up at a world position. */
  word(x: number, y: number, text: string, color: string, size = 30): void {
    this.texts.push({ x, y, text, color, size, t: 0, life: 1.1, kind: 'word', rot: rand(-0.18, 0.18) });
  }

  /** "−$120" floating up from a world position. */
  money(x: number, y: number, text: string): void {
    this.texts.push({ x, y, text, color: '#ff5d4f', size: 22, t: -0.12, life: 1.6, kind: 'money', rot: 0 });
  }

  update(dt: number): void {
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const p of this.parts) {
      p.t += dt;
      const k = Math.exp(-dt * p.drag);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      if (p.shape === 'leaf' || p.shape === 'paper') p.vx += Math.sin(p.t * 7 + p.rot) * 120 * dt; // flutter
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const m of this.imprints) m.t += dt;
    this.imprints = this.imprints.filter((m) => m.t < m.life);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flashLife > 0) this.flashT += dt;
  }

  /** Screen-space shake offset in CSS px. */
  shakeOffset(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeT / this.shakeLife;
    return [(Math.random() - 0.5) * 2 * this.shakeAmp * k, (Math.random() - 0.5) * 2 * this.shakeAmp * k];
  }

  /** Faint prints the swatter leaves on a surface (under the fly). */
  drawUnder(ctx: Ctx): void {
    for (const m of this.imprints) {
      const a = 1 - m.t / m.life;
      ctx.fillStyle = `rgba(60,40,20,${0.09 * a})`;
      ctx.beginPath();
      ctx.roundRect(m.x - m.hx, m.y - m.hy, 2 * m.hx, 2 * m.hy, m.r);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.16 * a})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  /** World-space draw (context has the world transform). */
  draw(ctx: Ctx): void {
    for (const r of this.rings) {
      const u = r.t / r.life;
      const g = 1 + u * (r.circle ? 1.4 : 0.35);
      ctx.strokeStyle = `rgba(${r.color},${(r.circle ? 0.7 : 0.55) * (1 - u)})`;
      ctx.lineWidth = (r.circle ? 2 : 1.2) * (1 - u) + 0.2;
      ctx.beginPath();
      if (r.circle) ctx.arc(r.x, r.y, r.hx * g, 0, Math.PI * 2);
      else ctx.roundRect(r.x - r.hx * g, r.y - r.hy * g, 2 * r.hx * g, 2 * r.hy * g, r.r * g);
      ctx.stroke();
    }
    for (const p of this.parts) {
      const u = p.t / p.life;
      const a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      switch (p.shape) {
        case 'dot':
          ctx.fillStyle = `rgba(${p.color},${0.65 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - u * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'drop': {
          ctx.fillStyle = `rgba(${p.color},${0.9 * a})`;
          const sp = Math.hypot(p.vx, p.vy);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * (1 + Math.min(1.5, sp / 200)), p.size * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'spark': {
          const len = Math.min(6, Math.hypot(p.vx, p.vy) * 0.02 + 1);
          const d = Math.hypot(p.vx, p.vy) || 1;
          ctx.strokeStyle = `rgba(${p.color},${a})`;
          ctx.lineWidth = p.size * 0.35;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / d) * len, p.y - (p.vy / d) * len);
          ctx.stroke();
          break;
        }
        default: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const s = p.size;
          ctx.fillStyle = `rgba(${p.color},${0.95 * a})`;
          ctx.beginPath();
          if (p.shape === 'shard') {
            ctx.moveTo(s, 0);
            ctx.lineTo(-s * 0.6, s * 0.5);
            ctx.lineTo(-s * 0.3, -s * 0.7);
          } else if (p.shape === 'chunk') {
            ctx.moveTo(s * 0.8, -s * 0.2);
            ctx.lineTo(s * 0.2, s * 0.7);
            ctx.lineTo(-s * 0.7, s * 0.3);
            ctx.lineTo(-s * 0.4, -s * 0.6);
          } else if (p.shape === 'leaf') {
            ctx.ellipse(0, 0, s * 0.45, s, 0, 0, Math.PI * 2);
          } else {
            // paper sheet seen at a changing angle
            ctx.rect(-s * 0.6, -s * 0.8 * Math.abs(Math.cos(p.rot * 2)), s * 1.2, s * 1.6 * Math.abs(Math.cos(p.rot * 2)) + 0.2);
          }
          ctx.closePath();
          ctx.fill();
          if (p.shape === 'shard') {
            ctx.strokeStyle = `rgba(90,120,150,${0.5 * a})`;
            ctx.lineWidth = 0.15;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
  }

  /** Screen-space overlays: floating words and money, then the flash (context in CSS px). */
  drawScreen(ctx: Ctx, cam: Camera): void {
    for (const t of this.texts) {
      if (t.t < 0) continue;
      const u = t.t / t.life;
      let x = cam.sx(t.x);
      let y = cam.sy(t.y);
      let scale = 1;
      let alpha = 1;
      if (t.kind === 'word') {
        // pop in with an overshoot, hold, then drift up and fade
        const p = Math.min(1, t.t / 0.16);
        scale = this.reducedMotion ? 1 : 0.4 + 0.6 * (1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2);
        y -= 34 + (u > 0.6 ? (u - 0.6) * 60 : 0);
        alpha = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
      } else {
        // starts just under the word and floats up past the impact point
        y += 6 - 34 * (1 - (1 - u) ** 2);
        alpha = u > 0.5 ? 1 - (u - 0.5) / 0.5 : Math.min(1, t.t / 0.1);
      }
      ctx.save();
      ctx.font = `900 ${t.size}px ${FONT}`;
      // keep it on screen (and below the HUD)
      const half = ctx.measureText(t.text).width / 2 + 10;
      x = Math.min(cam.viewW - half, Math.max(half, x));
      y = Math.min(cam.viewH - t.size, Math.max(cam.insetTop + t.size, y));
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(x, y);
      ctx.rotate(t.rot);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = t.kind === 'word' ? 6 : 4.5;
      ctx.strokeStyle = 'rgba(20,14,10,0.9)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    if (this.flashLife > 0 && this.flashT < this.flashLife) {
      const a = this.flashAlpha * (1 - this.flashT / this.flashLife) ** 2;
      ctx.fillStyle = `rgba(${this.flashColor},${a})`;
      ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    }
  }

  /** Gentle animated steam above the coffee (`amount` 0..1). */
  steam(ctx: Ctx, time: number, cx: number, cy: number, amount = 1): void {
    if (amount <= 0) return;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = time * 0.6 + i * 2.1;
      const base = cx - 10 + i * 10;
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.06 * Math.sin(ph * 1.7)) * amount})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(base, cy - 2);
      for (let k = 1; k <= 6; k++) {
        const y = cy - 2 - k * 6;
        const x = base + Math.sin(ph + k * 0.9) * (1.5 + k * 0.7);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
