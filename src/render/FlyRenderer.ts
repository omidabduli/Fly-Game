import { FlyState } from '../fly/Fly';
import { LIGHT_DX, LIGHT_DY } from './SceneRenderer';

type Ctx = CanvasRenderingContext2D;

/** Everything needed to draw a fly (live, or reconstructed from a replay). */
export interface FlyPose {
  x: number;
  y: number;
  z: number;
  ground: number;
  heading: number;
  state: number;
  wingPhase: number;
  wingSpread: number;
  legPhase: number;
  groomType: number;
  groomPhase: number;
  roll: number;
  legExtension: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  tint: number;
}

// Leg anchor (on thorax) and resting foot positions in body mm (x forward).
const LEGS: [number, number, number, number][] = [
  [0.62, 0.22, 1.3, 0.72],
  [0.42, 0.28, 0.35, 0.98],
  [0.22, 0.22, -0.62, 0.8],
];

export class FlyRenderer {
  /** Draw in world-mm coordinates (the context already has the world transform). */
  draw(ctx: Ctx, p: FlyPose, pxPerMm: number, time: number): void {
    const h = Math.max(0, p.z - p.radius - p.ground);
    const dead = p.state === FlyState.DEAD;
    // --- shadow on the surface below ---
    const sx = p.x + h * LIGHT_DX;
    const sy = p.y + h * LIGHT_DY;
    const blur = 1 + h / 40;
    const sa = (dead ? 0.35 : 0.4) * Math.exp(-h / 90);
    if (sa > 0.01) {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 1.6 * blur);
      g.addColorStop(0, `rgba(20,10,0,${sa})`);
      g.addColorStop(1, 'rgba(20,10,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6 * blur, 0, Math.PI * 2);
      ctx.fill();
    }
    const s = 1 + h / 450;
    const speed = Math.hypot(p.vx, p.vy);
    // --- motion trail (fast flight shows up as a streak, not a jump) ---
    if (!dead && speed > 180) {
      const tl = Math.min(0.03, 14 / speed);
      const tx = p.x - p.vx * tl;
      const ty = p.y - p.vy * tl;
      const g = ctx.createLinearGradient(tx, ty, p.x, p.y);
      g.addColorStop(0, 'rgba(60,40,25,0)');
      g.addColorStop(1, `rgba(60,40,25,${Math.min(0.45, speed / 2500)})`);
      ctx.strokeStyle = g;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3 * s;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    // visibility halo (helps on dark surfaces)
    const halo = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 2.6 * s);
    halo.addColorStop(0, 'rgba(255,250,235,0.22)');
    halo.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(p.heading);
    const bank = Math.cos(Math.max(-1.35, Math.min(1.35, p.roll)));
    ctx.scale(s, s * (0.35 + 0.65 * Math.abs(bank)));
    const lw = Math.max(0.1, 0.75 / pxPerMm);
    if (dead) {
      this.drawDead(ctx, lw);
      ctx.restore();
      return;
    }
    const flying = p.state === FlyState.FLYING || p.state === FlyState.TAKEOFF || p.state === FlyState.LANDING;
    // legs
    if (!flying || p.legExtension > 0.1 || p.state === FlyState.TAKEOFF) this.drawLegs(ctx, p, lw, flying);
    // wing blur sits behind the body in flight
    if (flying) this.drawWingBlur(ctx, p, time);
    // abdomen with bands
    const tintR = 176 + p.tint * 18;
    ctx.fillStyle = `rgb(${tintR | 0},${(128 + p.tint * 10) | 0},70)`;
    ctx.beginPath();
    ctx.ellipse(-0.55, 0, 0.82, 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(55,30,15,0.75)';
    for (const bx of [-0.25, -0.6, -0.95]) {
      ctx.beginPath();
      ctx.ellipse(bx, 0, 0.1, 0.46 - Math.abs(bx + 0.55) * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // thorax
    ctx.fillStyle = `rgb(${(150 + p.tint * 15) | 0},${(104 + p.tint * 8) | 0},58)`;
    ctx.beginPath();
    ctx.ellipse(0.45, 0, 0.55, 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.25)';
    ctx.beginPath();
    ctx.ellipse(0.5, -0.12, 0.3, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    // head + red compound eyes
    ctx.fillStyle = '#8a5c34';
    ctx.beginPath();
    ctx.arc(1.05, 0, 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b3202a';
    ctx.beginPath();
    ctx.ellipse(1.1, -0.24, 0.24, 0.2, 0.3, 0, Math.PI * 2);
    ctx.ellipse(1.1, 0.24, 0.24, 0.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,190,0.5)';
    ctx.beginPath();
    ctx.arc(1.16, -0.29, 0.06, 0, Math.PI * 2);
    ctx.arc(1.16, 0.19, 0.06, 0, Math.PI * 2);
    ctx.fill();
    // at rest the translucent wings lie folded over the abdomen
    if (!flying) this.drawFoldedWings(ctx, p);
    ctx.restore();
  }

  private drawLegs(ctx: Ctx, p: FlyPose, lw: number, flying: boolean): void {
    ctx.strokeStyle = 'rgba(45,28,15,0.85)';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    const walking = p.state === FlyState.WALKING;
    const grooming = p.state === FlyState.GROOMING;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const [ax, ay, fx0, fy0] = LEGS[i];
        let fx = fx0;
        let fy = fy0 * side;
        if (walking) {
          // tripod gait: legs (L1, R2, L3) vs (R1, L2, R3) alternate
          const group = (i % 2 === 0) === (side < 0) ? 0 : Math.PI;
          fx += 0.28 * Math.sin(p.legPhase + group);
        } else if (grooming && p.groomType === 0 && i === 0) {
          // front legs rub the head
          fx = 1.05 + 0.12 * Math.sin(p.groomPhase * 2);
          fy = side * (0.12 + 0.08 * Math.sin(p.groomPhase + (side > 0 ? 0 : Math.PI)));
        } else if (grooming && p.groomType === 1 && i === 2) {
          // hind legs sweep the wings/abdomen
          fx = -0.7 - 0.45 * (0.5 + 0.5 * Math.sin(p.groomPhase + (side > 0 ? 0 : Math.PI)));
          fy = side * 0.35;
        } else if (flying) {
          const e = p.legExtension;
          fx = ax + (fx0 - ax) * (0.4 + 0.6 * e) - 0.3 * (1 - e);
          fy = side * (Math.abs(ay) + (fy0 - ay) * (0.3 + 0.7 * e));
        }
        const kx = (ax + fx) / 2 + 0.05;
        const ky = side * (Math.abs(ay) + Math.abs(fy)) * 0.62;
        ctx.beginPath();
        ctx.moveTo(ax, ay * side);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.stroke();
      }
    }
  }

  private drawFoldedWings(ctx: Ctx, p: FlyPose): void {
    const spread = p.wingSpread;
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(0.3, 0.12 * side);
      ctx.rotate(side * (0.12 + spread * 0.5));
      ctx.fillStyle = 'rgba(222,232,244,0.42)';
      ctx.strokeStyle = 'rgba(70,80,95,0.5)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.ellipse(-0.95, 0.05 * side, 1.1, 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(80,90,100,0.3)';
      ctx.beginPath();
      ctx.moveTo(-0.1, 0);
      ctx.lineTo(-1.8, 0.08 * side);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawWingBlur(ctx: Ctx, p: FlyPose, time: number): void {
    const flick = 0.75 + 0.25 * Math.sin(p.wingPhase * 3 + time * 50);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(0.4, 0.18 * side);
      ctx.fillStyle = `rgba(215,228,242,${0.28 * flick})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const a0 = side * 0.35;
      const a1 = side * 2.1;
      ctx.arc(0, 0, 2.3, Math.min(a0, a1), Math.max(a0, a1));
      ctx.closePath();
      ctx.fill();
      // leading-edge streak at the current stroke position
      const a = side * (0.5 + 1.4 * (0.5 + 0.5 * Math.sin(p.wingPhase)));
      ctx.strokeStyle = 'rgba(120,130,145,0.35)';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 2.2, Math.sin(a) * 2.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawDead(ctx: Ctx, lw: number): void {
    ctx.fillStyle = 'rgba(90,20,15,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.2, 1.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,222,235,0.45)';
    ctx.beginPath();
    ctx.ellipse(-0.3, -0.95, 1.2, 0.45, -0.9, 0, Math.PI * 2);
    ctx.ellipse(-0.2, 1.0, 1.2, 0.45, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b3a20';
    ctx.beginPath();
    ctx.ellipse(-0.2, 0, 1.3, 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9b2a22';
    ctx.beginPath();
    ctx.ellipse(1.0, 0, 0.45, 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,25,15,0.8)';
    ctx.lineWidth = lw;
    for (const [x, y] of [[1.2, 1.1], [0.2, 1.3], [-0.9, 1.0], [1.2, -1.1], [0.3, -1.35], [-0.8, -1.1]]) {
      ctx.beginPath();
      ctx.moveTo(0.2, 0);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
}
