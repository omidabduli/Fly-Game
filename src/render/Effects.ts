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
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
}

/** Short-lived world-space effects: impact rings, dust, camera shake, cup steam. */
export class Effects {
  private rings: Ring[] = [];
  private parts: Particle[] = [];
  shakeT = 0;
  shakeAmp = 0;
  reducedMotion = false;

  impact(x: number, y: number, hx: number, hy: number, r: number, strength: number, hit: boolean): void {
    this.rings.push({ x, y, hx, hy, r, t: 0, life: 0.35, color: hit ? '255,80,60' : '255,255,255' });
    const n = hit ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const edge = Math.random() < 0.5;
      const px = x + Math.cos(a) * hx * (edge ? 1 : Math.random());
      const py = y + Math.sin(a) * hy * (edge ? 1 : Math.random());
      const sp = 40 + Math.random() * 90 * strength;
      this.parts.push({
        x: px,
        y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t: 0,
        life: 0.3 + Math.random() * 0.3,
        size: 0.6 + Math.random() * 1.2,
        color: hit ? '120,20,10' : '240,235,225',
      });
    }
    if (!this.reducedMotion) {
      this.shakeT = 0.14;
      this.shakeAmp = 1.2 + 2.2 * strength;
    }
  }

  update(dt: number): void {
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 6);
      p.vy *= Math.exp(-dt * 6);
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    this.shakeT = Math.max(0, this.shakeT - dt);
  }

  /** Screen-space shake offset in CSS px. */
  shake(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeT / 0.14;
    return [(Math.random() - 0.5) * 2 * this.shakeAmp * k, (Math.random() - 0.5) * 2 * this.shakeAmp * k];
  }

  /** World-space draw (context has the world transform). */
  draw(ctx: Ctx): void {
    for (const r of this.rings) {
      const u = r.t / r.life;
      const g = 1 + u * 0.35;
      ctx.strokeStyle = `rgba(${r.color},${0.55 * (1 - u)})`;
      ctx.lineWidth = 1.2 * (1 - u) + 0.2;
      ctx.beginPath();
      ctx.roundRect(r.x - r.hx * g, r.y - r.hy * g, 2 * r.hx * g, 2 * r.hy * g, r.r * g);
      ctx.stroke();
    }
    for (const p of this.parts) {
      const u = p.t / p.life;
      ctx.fillStyle = `rgba(${p.color},${0.6 * (1 - u)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - u * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Gentle animated steam above the coffee. */
  steam(ctx: Ctx, time: number, cx: number, cy: number): void {
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = time * 0.6 + i * 2.1;
      const base = cx - 10 + i * 10;
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.06 * Math.sin(ph * 1.7)})`;
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
