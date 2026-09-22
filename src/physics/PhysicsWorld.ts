import type { SimParams } from '../config/params';
import type { Scene } from '../environment/Scene';
import { type Fly, FlyState } from '../fly/Fly';
import type { SimContext } from '../game/context';
import { DEG, clamp, turnToward, wrapAngle } from '../math/vec';
import { type Swatter, slabGap } from '../player/Swatter';

export interface CapsulePose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface SweptResult {
  hit: boolean;
  /** fraction of the step at which contact happened */
  u: number;
  /** minimum body-surface gap to the swatter during the step (mm) */
  minGap: number;
  x: number;
  y: number;
  z: number;
}

const WINGBEAT_HZ = 220;

/**
 * Integrates the fly's body (standing, walking, jumping, flying) with a fixed
 * timestep and enforces the physical rules of the world:
 *  - the fly never passes through a surface or leaves the room,
 *  - it only moves by integrating velocity (no teleporting),
 *  - the swatter kills only through actual contact (swept capsule test).
 */
export class PhysicsWorld {
  constructor(
    private readonly scene: Scene,
    private readonly P: SimParams,
  ) {}

  integrateFly(fly: Fly, ctx: SimContext): void {
    const dt = ctx.dt;
    switch (fly.state) {
      case FlyState.RESTING:
      case FlyState.GROOMING:
      case FlyState.ALERT:
        this.stand(fly, dt);
        break;
      case FlyState.WALKING:
        this.walk(fly, ctx);
        break;
      case FlyState.TAKEOFF:
        this.jump(fly, ctx);
        break;
      case FlyState.FLYING:
      case FlyState.LANDING:
        this.flyAir(fly, ctx);
        break;
      case FlyState.DEAD:
        fly.vel.x = fly.vel.y = fly.vel.z = 0;
        return;
    }
    // Animation clocks (recorded for replays; purely visual).
    if (fly.airborne) fly.wingPhase = (fly.wingPhase + Math.PI * 2 * WINGBEAT_HZ * dt) % (Math.PI * 2);
    if (fly.state === FlyState.GROOMING) fly.groomPhase = (fly.groomPhase + dt * (fly.groomType === 0 ? 7 : 4.5) * Math.PI * 2) % (Math.PI * 2);
  }

  private turnInPlace(fly: Fly, dt: number, rateDegS: number): void {
    if (fly.turnTarget === null) return;
    fly.heading = turnToward(fly.heading, fly.turnTarget, rateDegS * DEG * dt);
    if (Math.abs(wrapAngle(fly.heading - fly.turnTarget)) < 0.01) fly.turnTarget = null;
  }

  private stand(fly: Fly, dt: number): void {
    fly.vel.x = fly.vel.y = fly.vel.z = 0;
    fly.pos.z = fly.ground + fly.radius;
    this.turnInPlace(fly, dt, fly.state === FlyState.ALERT ? 720 : 300);
  }

  private walkable(x: number, y: number, fromGround: number): boolean {
    const s = this.scene;
    if (!s.insideWorld(x, y, 4)) return false;
    if (Math.abs(s.heightAt(x, y) - fromGround) > this.P.walking.stepToleranceMm) return false;
    return s.surfaceAt(x, y).landable;
  }

  private walk(fly: Fly, ctx: SimContext): void {
    const dt = ctx.dt;
    const t = ctx.time;
    fly.vel.x = fly.vel.y = fly.vel.z = 0;
    if (fly.turnTarget !== null) {
      this.turnInPlace(fly, dt, 400);
      return;
    }
    if (t < fly.pauseUntil) return;
    const rng = ctx.rng;
    fly.heading = wrapAngle(fly.heading + rng.normal(0, this.P.walking.turnNoise * Math.sqrt(dt)));
    const ch = Math.cos(fly.heading);
    const sh = Math.sin(fly.heading);
    const look = 2.5 + fly.halfLength;
    if (!this.walkable(fly.pos.x + ch * look, fly.pos.y + sh * look, fly.ground)) {
      // Edge ahead: turn around toward walkable surface and pause briefly.
      let bestH = fly.heading + Math.PI;
      for (let k = 0; k < 12; k++) {
        const h = fly.heading + Math.PI * (0.35 + 1.3 * rng.next()) * rng.sign();
        if (this.walkable(fly.pos.x + Math.cos(h) * look * 1.6, fly.pos.y + Math.sin(h) * look * 1.6, fly.ground)) {
          bestH = h;
          break;
        }
      }
      fly.turnTarget = wrapAngle(bestH);
      fly.pauseUntil = t + rng.range(0.08, 0.35);
      return;
    }
    const sp = fly.walkSpeed;
    fly.vel.x = ch * sp;
    fly.vel.y = sh * sp;
    fly.pos.x += ch * sp * dt;
    fly.pos.y += sh * sp * dt;
    const g = this.scene.heightAt(fly.pos.x, fly.pos.y);
    fly.ground = g;
    fly.surface = this.scene.surfaceAt(fly.pos.x, fly.pos.y);
    fly.pos.z = g + fly.radius;
    fly.legPhase = (fly.legPhase + ((sp * dt) / 1.1) * Math.PI) % (Math.PI * 2);
  }

  private jump(fly: Fly, ctx: SimContext): void {
    const dt = ctx.dt;
    const a = fly.takeoffSpeed / Math.max(1e-4, fly.takeoffDuration);
    // Legs push only for the jump duration (exact impulse regardless of dt).
    const elapsed = ctx.time - fly.takeoffStart;
    const push = Math.max(0, Math.min(dt, fly.takeoffDuration - elapsed));
    fly.vel.x += fly.takeoffDir.x * a * push;
    fly.vel.y += fly.takeoffDir.y * a * push;
    fly.vel.z += fly.takeoffDir.z * a * push;
    this.move(fly, ctx);
    fly.heading = turnToward(fly.heading, Math.atan2(fly.takeoffDir.y, fly.takeoffDir.x), 3000 * DEG * dt);
    fly.roll += fly.rollRate * dt;
  }

  private flyAir(fly: Fly, ctx: SimContext): void {
    const dt = ctx.dt;
    const t = ctx.time;
    const drag = this.P.flight.dragPerS;
    const th = fly.flight.compute(fly, ctx.swatter, t, dt);
    fly.vel.x += (th.x - drag * fly.vel.x) * dt;
    fly.vel.y += (th.y - drag * fly.vel.y) * dt;
    fly.vel.z += (th.z - drag * fly.vel.z) * dt;
    const contact = this.move(fly, ctx);
    // Visual roll: tumble after short-mode escapes decays into banked turns.
    fly.rollRate *= Math.exp(-dt / 0.06);
    const bank = clamp(fly.flight.bank(fly) * 0.8, -1.2, 1.2);
    fly.roll += fly.rollRate * dt + (bank - fly.roll) * Math.min(1, dt * 18);

    const site = fly.flight.site;
    if (fly.state === FlyState.LANDING && site) {
      const dx = site.x - fly.pos.x;
      const dy = site.y - fly.pos.y;
      const dz = site.z + fly.radius - fly.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if ((d < 1.2 || (contact && Math.sqrt(dx * dx + dy * dy) < 6)) && this.scene.surfaceAt(fly.pos.x, fly.pos.y).landable) {
        fly.brain.onTouchdown(ctx);
      }
    } else if (contact && fly.flight.mode === 'approach' && site) {
      const d = Math.hypot(site.x - fly.pos.x, site.y - fly.pos.y);
      if (d < 10 && fly.speed < 260 && this.scene.surfaceAt(fly.pos.x, fly.pos.y).landable) fly.brain.onTouchdown(ctx);
    }
  }

  /** Integrate position with collisions against the heightfield and room bounds. Returns true on ground contact. */
  private move(fly: Fly, ctx: SimContext): boolean {
    const dt = ctx.dt;
    const p = fly.pos;
    const v = fly.vel;
    const r = fly.radius;
    const s = this.scene;
    let nx = p.x + v.x * dt;
    let ny = p.y + v.y * dt;
    let nz = p.z + v.z * dt;
    if (nx < r + 1) {
      nx = r + 1;
      v.x = Math.abs(v.x) * 0.3;
    } else if (nx > s.width - r - 1) {
      nx = s.width - r - 1;
      v.x = -Math.abs(v.x) * 0.3;
    }
    if (ny < r + 1) {
      ny = r + 1;
      v.y = Math.abs(v.y) * 0.3;
    } else if (ny > s.height - r - 1) {
      ny = s.height - r - 1;
      v.y = -Math.abs(v.y) * 0.3;
    }
    const maxZ = this.P.flight.maxAltitudeMm;
    if (nz > maxZ) {
      nz = maxZ;
      v.z = Math.min(v.z, 0);
    }
    let contact = false;
    const hNew = s.heightAt(nx, ny);
    if (nz < hNew + r) {
      const hOld = s.heightAt(p.x, p.y);
      if (hNew > hOld + 0.5 && p.z < hNew + r) {
        // Side collision with a taller plateau: horizontal motion is blocked.
        nx = p.x;
        ny = p.y;
        v.x *= -0.25;
        v.y *= -0.25;
        const h2 = s.heightAt(nx, ny);
        if (nz < h2 + r) {
          nz = h2 + r;
          if (v.z < 0) v.z = 0;
          contact = true;
        }
      } else {
        nz = hNew + r;
        if (v.z < 0) v.z = -v.z * 0.15;
        contact = true;
      }
    }
    p.x = nx;
    p.y = ny;
    p.z = nz;
    fly.ground = s.heightAt(nx, ny);
    return contact;
  }

  /** Gap (mm) between the fly's body capsule and the swatter head slab. */
  capsuleSlabGap(x: number, y: number, z: number, heading: number, hl: number, r: number, sx: number, sy: number, sz: number, sw: Swatter): number {
    const cx = Math.cos(heading) * hl;
    const cy = Math.sin(heading) * hl;
    const g0 = slabGap(x, y, z, sx, sy, sz, sw.hx, sw.hy, sw.r, sw.thickness);
    const g1 = slabGap(x + cx, y + cy, z, sx, sy, sz, sw.hx, sw.hy, sw.r, sw.thickness);
    const g2 = slabGap(x - cx, y - cy, z, sx, sy, sz, sw.hx, sw.hy, sw.r, sw.thickness);
    return Math.min(g0, g1, g2) - r;
  }

  /** Lateral gap between the fly's capsule and the swatter footprint outline (mm). */
  lateralGap(fly: CapsulePose, hl: number, r: number, sw: Swatter): number {
    const cx = Math.cos(fly.heading) * hl;
    const cy = Math.sin(fly.heading) * hl;
    return Math.min(sw.footprintSdf(fly.x, fly.y), sw.footprintSdf(fly.x + cx, fly.y + cy), sw.footprintSdf(fly.x - cx, fly.y - cy)) - r;
  }

  /**
   * Continuous collision test between the moving swatter slab and the moving
   * fly over one step (both linearly interpolated, sub-sampled <= 0.4 mm).
   */
  sweptHit(prevFly: CapsulePose, fly: Fly, prevSw: { x: number; y: number; z: number }, sw: Swatter): SweptResult {
    const dsw = Math.hypot(sw.x - prevSw.x, sw.y - prevSw.y, sw.z - prevSw.z);
    const dfl = Math.hypot(fly.pos.x - prevFly.x, fly.pos.y - prevFly.y, fly.pos.z - prevFly.z);
    const n = clamp(Math.ceil(Math.max(dsw, dfl) / 0.4), 1, 40);
    let minGap = Infinity;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const fx = prevFly.x + (fly.pos.x - prevFly.x) * u;
      const fy = prevFly.y + (fly.pos.y - prevFly.y) * u;
      const fz = prevFly.z + (fly.pos.z - prevFly.z) * u;
      const fh = prevFly.heading + wrapAngle(fly.heading - prevFly.heading) * u;
      const sx = prevSw.x + (sw.x - prevSw.x) * u;
      const sy = prevSw.y + (sw.y - prevSw.y) * u;
      const sz = prevSw.z + (sw.z - prevSw.z) * u;
      const gap = this.capsuleSlabGap(fx, fy, fz, fh, fly.halfLength, fly.radius, sx, sy, sz, sw);
      if (gap < minGap) minGap = gap;
      if (gap <= 0) return { hit: true, u, minGap: 0, x: fx, y: fy, z: fz };
    }
    return { hit: false, u: 1, minGap, x: fly.pos.x, y: fly.pos.y, z: fly.pos.z };
  }

  /**
   * At the moment of impact the flexible mesh bends by up to `flexMm`: a fly
   * under the footprint whose top is above (contact height - flex) is squashed
   * even if a slightly taller rim stopped the rigid frame.
   */
  flexHit(fly: Fly, sw: Swatter): boolean {
    const pose: CapsulePose = { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, heading: fly.heading };
    if (this.lateralGap(pose, fly.halfLength, fly.radius, sw) > 0) return false;
    const zb = Math.max(fly.ground, sw.z - this.P.swatter.flexMm);
    return zb < fly.pos.z + fly.radius;
  }

  /** Non-lethal contact: a hovering / rising swatter pushes the fly away instead of passing through it. */
  pushOutOfSwatter(fly: Fly, sw: Swatter): void {
    if (!fly.alive || !fly.airborne) return;
    const gap = this.capsuleSlabGap(fly.pos.x, fly.pos.y, fly.pos.z, fly.heading, fly.halfLength, fly.radius, sw.x, sw.y, sw.z, sw);
    if (gap > 0.2) return;
    if (fly.pos.z < sw.z + sw.thickness * 0.5 && sw.z - fly.radius - 0.3 > fly.ground + fly.radius) {
      fly.pos.z = sw.z - fly.radius - 0.3;
      fly.vel.z = Math.min(fly.vel.z, -60);
    } else if (fly.pos.z >= sw.z + sw.thickness * 0.5) {
      fly.pos.z = sw.z + sw.thickness + fly.radius + 0.3;
      fly.vel.z = Math.max(fly.vel.z, 60);
    } else {
      const ax = fly.pos.x - sw.x;
      const ay = fly.pos.y - sw.y;
      const al = Math.hypot(ax, ay) || 1;
      fly.vel.x += (ax / al) * 200;
      fly.vel.y += (ay / al) * 200;
    }
  }
}
