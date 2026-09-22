import type { Vec3 } from '../math/vec';

/**
 * Shared point-mass flight model used by BOTH the physics integration and the
 * escape planner's forward simulation, so the fly's predictions of its own
 * motion match what physics will actually do.
 *
 *   thrust = clamp(k*(v_target - v) + drag*v, |thrust| <= aMax)
 *   dv/dt  = thrust - drag*v
 */
export const VELOCITY_GAIN = 60; // 1/s

export function thrustToward(
  vx: number, vy: number, vz: number,
  tx: number, ty: number, tz: number,
  drag: number, aMax: number,
  out: Vec3,
): Vec3 {
  let ax = VELOCITY_GAIN * (tx - vx) + drag * vx;
  let ay = VELOCITY_GAIN * (ty - vy) + drag * vy;
  let az = VELOCITY_GAIN * (tz - vz) + drag * vz;
  const l = Math.sqrt(ax * ax + ay * ay + az * az);
  if (l > aMax) {
    ax *= aMax / l;
    ay *= aMax / l;
    az *= aMax / l;
  }
  out.x = ax;
  out.y = ay;
  out.z = az;
  return out;
}

/** Kinematic parameters of an escape, shared by the planner and tests. */
export interface EscapeKinematics {
  onSurface: boolean;
  jumpSpeed: number;
  /** seconds */
  jumpDuration: number;
  accel: number;
  maxSpeed: number;
  drag: number;
}

/**
 * Mutable state of the planner's forward model of its own escape. Stepping it
 * reproduces PhysicsWorld: an exact leg-extension impulse followed by
 * thrust-limited flight toward dir*maxSpeed with linear drag.
 */
export class EscapeModel {
  px = 0;
  py = 0;
  pz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** time since movement started (s); < 0 = not moving yet */
  since = -1;
  private readonly thr = { x: 0, y: 0, z: 0 };

  reset(pos: Vec3, vel: Vec3, onSurface: boolean): void {
    this.px = pos.x;
    this.py = pos.y;
    this.pz = pos.z;
    this.vx = onSurface ? 0 : vel.x;
    this.vy = onSurface ? 0 : vel.y;
    this.vz = onSurface ? 0 : vel.z;
    this.since = -1;
  }

  /** Advance by dt. `moving` = the motor command has been executed. */
  step(dx: number, dy: number, dz: number, k: EscapeKinematics, dt: number, moving: boolean): void {
    if (!moving) {
      if (!k.onSurface) {
        this.px += this.vx * dt;
        this.py += this.vy * dt;
        this.pz += this.vz * dt;
      }
      return;
    }
    if (this.since < 0) this.since = 0;
    let t = dt;
    if (k.onSurface && this.since < k.jumpDuration) {
      // Exact constant-acceleration leg push for the remaining jump time.
      const tj = Math.min(t, k.jumpDuration - this.since);
      const a = k.jumpSpeed / k.jumpDuration;
      this.px += this.vx * tj + 0.5 * dx * a * tj * tj;
      this.py += this.vy * tj + 0.5 * dy * a * tj * tj;
      this.pz += this.vz * tj + 0.5 * dz * a * tj * tj;
      this.vx += dx * a * tj;
      this.vy += dy * a * tj;
      this.vz += dz * a * tj;
      this.since += tj;
      t -= tj;
      if (t <= 1e-9) return;
    }
    thrustToward(this.vx, this.vy, this.vz, dx * k.maxSpeed, dy * k.maxSpeed, dz * k.maxSpeed, k.drag, k.accel, this.thr);
    this.vx += (this.thr.x - k.drag * this.vx) * t;
    this.vy += (this.thr.y - k.drag * this.vy) * t;
    this.vz += (this.thr.z - k.drag * this.vz) * t;
    this.px += this.vx * t;
    this.py += this.vy * t;
    this.pz += this.vz * t;
    this.since += t;
  }
}
