import type { SimParams } from '../config/params';
import type { Scene } from '../environment/Scene';
import type { Rng } from '../math/rng';
import { DEG, type Vec3, angleDiff, clamp, turnToward, vec3 } from '../math/vec';
import { type Swatter, SwatterPhase } from '../player/Swatter';
import { thrustToward } from './flightModel';
import type { LandingSite } from './LandingSystem';

export type FlightMode = 'escape' | 'cruise' | 'approach' | 'land';

export interface FlyBodyState {
  pos: Vec3;
  vel: Vec3;
  heading: number;
  readonly radius: number;
}

/**
 * Flight control: turns high-level intentions (escape burst, saccadic
 * exploration, approach to a landing site, final landing) into a thrust
 * vector, respecting acceleration and turn-rate limits. Obstacles (the
 * heightfield steps), world bounds and the swatter are avoided with look-ahead
 * rules. Physics integration happens in PhysicsWorld.
 */
export class FlightController {
  mode: FlightMode = 'cruise';
  readonly escapeDir = vec3(1, 0, 0);
  escapeUntil = 0;
  escapeSpeed = 1000;
  escapeAccel = 20000;
  cruiseSpeed = 330;
  altitude = 50;
  headingTarget = 0;
  nextSaccadeAt = 0;
  landAfter = 0;
  approachStart = 0;
  site: LandingSite | null = null;
  readonly thrust = vec3();
  readonly targetVel = vec3();
  /** accel cap used this step (for the debug view) */
  aMax = 0;

  constructor(
    private readonly scene: Scene,
    private readonly P: SimParams['flight'],
    private readonly L: SimParams['landing'],
    private readonly rng: Rng,
  ) {}

  startEscape(dir: Vec3, t: number, burstMs: number, speed: number, accel: number): void {
    this.mode = 'escape';
    this.escapeDir.x = dir.x;
    this.escapeDir.y = dir.y;
    this.escapeDir.z = dir.z;
    this.escapeUntil = t + burstMs / 1000;
    this.escapeSpeed = speed;
    this.escapeAccel = accel;
    this.site = null;
  }

  /** Closed-loop steering update during an escape burst. */
  redirect(dir: Vec3, until: number): void {
    this.escapeDir.x = dir.x;
    this.escapeDir.y = dir.y;
    this.escapeDir.z = dir.z;
    if (until > this.escapeUntil) this.escapeUntil = until;
  }

  startCruise(t: number, heading: number, cruiseSeconds: number): void {
    this.mode = 'cruise';
    this.headingTarget = heading;
    this.cruiseSpeed = this.rng.sample(this.P.cruiseSpeed);
    this.altitude = this.rng.sample(this.P.cruiseAltitudeMm);
    this.nextSaccadeAt = t + this.rng.sample(this.P.saccadeIntervalMs) / 1000;
    this.landAfter = t + cruiseSeconds;
    this.site = null;
  }

  startApproach(site: LandingSite, t: number): void {
    this.mode = 'approach';
    this.site = site;
    this.approachStart = t;
    this.cruiseSpeed = Math.max(this.cruiseSpeed, 260);
  }

  startLanding(): void {
    this.mode = 'land';
  }

  /** Compute this step's thrust (mm/s^2) into `this.thrust`. */
  compute(fly: FlyBodyState, sw: Swatter, t: number, dt: number): Vec3 {
    const P = this.P;
    const p = fly.pos;
    const v = fly.vel;
    const r = fly.radius;
    const ground = this.scene.heightAt(p.x, p.y);
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let aMax = P.cruiseAccel;
    let turnMax = P.maxTurnCruiseDegS * DEG;
    let limitLateral = true;

    switch (this.mode) {
      case 'escape': {
        tx = this.escapeDir.x * this.escapeSpeed;
        ty = this.escapeDir.y * this.escapeSpeed;
        tz = this.escapeDir.z * this.escapeSpeed;
        aMax = this.escapeAccel;
        turnMax = P.maxTurnEscapeDegS * DEG;
        limitLateral = false;
        break;
      }
      case 'cruise': {
        if (t >= this.nextSaccadeAt) this.saccade(fly, sw, t);
        tx = Math.cos(this.headingTarget) * this.cruiseSpeed;
        ty = Math.sin(this.headingTarget) * this.cruiseSpeed;
        tz = clamp((ground + this.altitude - p.z) * 4, -220, 220);
        break;
      }
      case 'approach': {
        const s = this.site!;
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dxy = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const hsp = Math.min(this.cruiseSpeed, this.L.approachGain * dxy + 35);
        tx = (dx / dxy) * hsp;
        ty = (dy / dxy) * hsp;
        const touchZ = s.z + r;
        const zTarget = dxy > 40 ? s.z + this.L.approachAltitudeMm : touchZ + dxy * 0.6;
        tz = clamp((zTarget - p.z) * 5, -240, 240);
        break;
      }
      case 'land': {
        const s = this.site!;
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dz = s.z + r - p.z;
        const k = this.L.approachGain * 1.5;
        tx = dx * k;
        ty = dy * k;
        tz = dz * k;
        const l = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const cap = 150;
        if (l > cap) {
          tx *= cap / l;
          ty *= cap / l;
          tz *= cap / l;
        }
        break;
      }
    }

    // --- safety layers ---------------------------------------------------------
    if (this.mode !== 'land') {
      // Look ahead along the horizontal velocity for taller surfaces. While
      // escaping, only obstacles ahead matter: climbing toward a descending
      // swatter would be suicidal.
      const sp = Math.sqrt(v.x * v.x + v.y * v.y);
      let need = this.mode === 'escape' ? ground + r + 1 : ground + P.clearanceMm;
      if (sp > 15) {
        const ux = v.x / sp;
        const uy = v.y / sp;
        // Escaping: only imminent collisions (~30 ms ahead) matter.
        const look = this.mode === 'escape' ? sp * 0.03 + 4 : sp * P.lookaheadS + 8;
        for (let s = 3; s <= look; s += 3) {
          const hh = this.scene.heightAt(p.x + ux * s, p.y + uy * s) + P.clearanceMm;
          if (hh > need) need = hh;
        }
      }
      if (p.z < need) {
        tz = Math.max(tz, (need - p.z) * 10 + 60);
        if (need - p.z > 12 && this.mode !== 'escape') {
          tx *= 0.35;
          ty *= 0.35;
        }
      }
    }
    // World bounds (soft).
    const m = P.boundaryMarginMm;
    if (p.x < m) tx += (m - p.x) * 12;
    if (p.x > this.scene.width - m) tx -= (p.x - (this.scene.width - m)) * 12;
    if (p.y < m) ty += (m - p.y) * 12;
    if (p.y > this.scene.height - m) ty -= (p.y - (this.scene.height - m)) * 12;
    if (p.z > P.maxAltitudeMm) tz = Math.min(tz, -150);
    // Stay out from under a low, hovering swatter. Swings are handled only by
    // the escape circuit (so disabling it in Lab Mode really disables escapes).
    if (this.mode !== 'escape' && (sw.phase === SwatterPhase.IDLE || sw.phase === SwatterPhase.RECOVER)) {
      const sd = sw.footprintSdf(p.x, p.y);
      const above = sw.z - p.z;
      if (sd < P.swatterAvoidMarginMm && above < 90 && above > -10) {
        const ax = p.x - sw.x;
        const ay = p.y - sw.y;
        const al = Math.sqrt(ax * ax + ay * ay) || 1;
        const push = (P.swatterAvoidMarginMm - sd) * 10;
        tx += (ax / al) * push;
        ty += (ay / al) * push;
        tz = Math.min(tz, -120);
      }
    }

    // --- heading & thrust --------------------------------------------------------
    const tsp = Math.sqrt(tx * tx + ty * ty);
    if (tsp > 25) fly.heading = turnToward(fly.heading, Math.atan2(ty, tx), turnMax * dt);
    thrustToward(v.x, v.y, v.z, tx, ty, tz, P.dragPerS, aMax, this.thrust);
    if (limitLateral) {
      // Thrust mostly along the body axis: sideways/vertical force is limited.
      const ch = Math.cos(fly.heading);
      const shh = Math.sin(fly.heading);
      let fwd = this.thrust.x * ch + this.thrust.y * shh;
      let lat = -this.thrust.x * shh + this.thrust.y * ch;
      const latMax = P.lateralThrustFraction * aMax;
      if (lat > latMax) lat = latMax;
      if (lat < -latMax) lat = -latMax;
      if (fwd < -0.6 * aMax) fwd = -0.6 * aMax;
      this.thrust.x = fwd * ch - lat * shh;
      this.thrust.y = fwd * shh + lat * ch;
      this.thrust.z = clamp(this.thrust.z, -P.verticalThrustFraction * aMax, P.verticalThrustFraction * aMax);
    }
    this.targetVel.x = tx;
    this.targetVel.y = ty;
    this.targetVel.z = tz;
    this.aMax = aMax;
    return this.thrust;
  }

  /** Saccade-like turn: pick a new heading favouring open space, away from the swatter. */
  private saccade(fly: FlyBodyState, sw: Swatter, t: number): void {
    const P = this.P;
    const rng = this.rng;
    let bestH = fly.heading;
    let bestScore = -Infinity;
    for (let i = 0; i < 7; i++) {
      const ang = rng.sample(P.saccadeAngleDeg) * DEG * rng.sign();
      const h = fly.heading + (i === 0 ? rng.normal(0, 0.2) : ang);
      const cx = fly.pos.x + Math.cos(h) * 70;
      const cy = fly.pos.y + Math.sin(h) * 70;
      let score = rng.next() * 0.6;
      // Prefer staying well inside the room.
      const edge = Math.min(cx, cy, this.scene.width - cx, this.scene.height - cy);
      score += clamp(edge / 60, -2, 1);
      // Mildly avoid the swatter.
      const ds = Math.hypot(cx - sw.x, cy - sw.y);
      score += clamp(ds / 150, 0, 1) * 0.5;
      // Avoid flying straight into tall surfaces at the current height.
      const hit = this.scene.raycast(fly.pos.x, fly.pos.y, fly.pos.z, Math.cos(h), Math.sin(h), 0, 60, 3);
      if (hit >= 0) score -= 1 - hit / 60;
      if (score > bestScore) {
        bestScore = score;
        bestH = h;
      }
    }
    this.headingTarget = bestH;
    this.altitude = rng.sample(P.cruiseAltitudeMm);
    this.cruiseSpeed = rng.sample(P.cruiseSpeed);
    this.nextSaccadeAt = t + rng.sample(P.saccadeIntervalMs) / 1000;
  }

  /** Signed heading error (for animation of banked turns). */
  bank(fly: FlyBodyState): number {
    return angleDiff(fly.heading, this.headingTarget);
  }
}
