import type { SimParams } from '../config/params';
import type { Scene, SurfaceObject } from '../environment/Scene';
import type { Rng } from '../math/rng';
import { clamp, smoothstep } from '../math/vec';
import { sdRoundRect } from '../physics/geometry';

export const SwatterPhase = {
  IDLE: 0,
  PREP: 1,
  SWING: 2,
  HOLD: 3,
  RECOVER: 4,
} as const;
export type SwatterPhase = (typeof SwatterPhase)[keyof typeof SwatterPhase];
export const SWATTER_PHASE_NAMES = ['IDLE', 'PREP', 'SWING', 'HOLD', 'RECOVER'] as const;

export interface SwatterEvents {
  strikeStart: boolean;
  swingStart: boolean;
  impact: boolean;
  ready: boolean;
}

/**
 * The fly swatter: a physical rigid head with position, velocity and
 * acceleration. Lateral motion follows the player's aim point through a
 * critically-damped "arm" spring with speed/acceleration limits. A strike is
 * PREP (wind-up) -> SWING (accelerating toward the surface) -> impact (HOLD) ->
 * RECOVER. The swatter only kills during SWING / at impact.
 */
export class Swatter {
  x = 240;
  y = 150;
  z = 240;
  vx = 0;
  vy = 0;
  vz = 0;
  ax = 0;
  ay = 0;
  az = 0;
  targetX = 240;
  targetY = 150;
  phase: SwatterPhase = SwatterPhase.IDLE;
  phaseTime = 0;
  groundH = 0;
  groundObject: SurfaceObject;
  strikeId = 0;
  queuedStrike = false;
  /** whether the player currently controls the swatter (hidden on menus) */
  active = true;

  strikeStartTime = -1;
  swingStartTime = -1;
  impactTime = -1;
  impactSpeed = 0;
  impactX = 0;
  impactY = 0;
  impactZ = 0;
  impactObject: SurfaceObject | null = null;
  maxSwingSpeed = 0;

  readonly hx: number;
  readonly hy: number;
  readonly r: number;
  readonly thickness: number;

  private prepStartZ = 0;
  private swingAccel = 0;
  private swingMax = 0;
  private lastGroundX = NaN;
  private lastGroundY = NaN;
  /** tallest surface under the footprint at the aim target (the hand hovers relative to it) */
  private targetGroundH = 0;
  private lastTargetGX = NaN;
  private lastTargetGY = NaN;

  constructor(
    private readonly scene: Scene,
    private readonly P: SimParams['swatter'],
    private readonly rng: Rng,
  ) {
    this.hx = P.headHalfWidthMm;
    this.hy = P.headHalfHeightMm;
    this.r = P.headCornerMm;
    this.thickness = P.thicknessMm;
    this.groundObject = scene.base;
    this.reset(scene.width / 2, scene.height / 2);
  }

  reset(x: number, y: number): void {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.vx = this.vy = this.vz = 0;
    this.ax = this.ay = this.az = 0;
    this.phase = SwatterPhase.IDLE;
    this.phaseTime = 0;
    this.queuedStrike = false;
    this.lastGroundX = NaN;
    this.lastTargetGX = NaN;
    this.updateGround();
    this.z = this.hoverElevation();
  }

  setTarget(x: number, y: number): void {
    const s = this.scene;
    this.targetX = clamp(x, -this.hx * 0.4, s.width + this.hx * 0.4);
    this.targetY = clamp(y, -this.hy * 0.4, s.height + this.hy * 0.4);
  }

  /** Ask for a strike; returns false if one is already in progress. */
  requestStrike(): boolean {
    if (!this.active) return false;
    if (this.phase === SwatterPhase.IDLE) {
      this.queuedStrike = true;
      return true;
    }
    if (this.phase === SwatterPhase.RECOVER && this.phaseTime > (this.P.recoverMs / 1000) * 0.45) {
      this.queuedStrike = true;
      return true;
    }
    return false;
  }

  get isLethal(): boolean {
    return this.phase === SwatterPhase.SWING;
  }

  get busy(): boolean {
    return this.phase !== SwatterPhase.IDLE || this.queuedStrike;
  }

  get speed(): number {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
  }

  get lateralSpeed(): number {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }

  /** Height of the swatter's face above the surface it would hit. */
  get heightAboveGround(): number {
    return this.z - this.groundH;
  }

  private updateGround(): void {
    const dx = this.x - this.lastGroundX;
    const dy = this.y - this.lastGroundY;
    if (dx * dx + dy * dy < 0.04) return; // moved < 0.2 mm: reuse
    const g = this.scene.maxHeightInRoundRect(this.x, this.y, this.hx, this.hy, this.r);
    this.groundH = g.height;
    this.groundObject = g.object;
    this.lastGroundX = this.x;
    this.lastGroundY = this.y;
  }

  private updateTargetGround(): void {
    const dx = this.targetX - this.lastTargetGX;
    const dy = this.targetY - this.lastTargetGY;
    if (dx * dx + dy * dy < 0.25) return;
    this.targetGroundH = this.scene.maxHeightInRoundRect(this.targetX, this.targetY, this.hx, this.hy, this.r).height;
    this.lastTargetGX = this.targetX;
    this.lastTargetGY = this.targetY;
  }

  /** Hover elevation: clearance above whatever the player is aiming at (and never below what is underneath). */
  private hoverElevation(): number {
    this.updateTargetGround();
    return Math.max(this.targetGroundH, this.groundH) + this.P.hoverClearanceMm;
  }

  /** Lateral signed distance from (px, py) to the head outline (negative inside). */
  footprintSdf(px: number, py: number): number {
    return sdRoundRect(px, py, this.x, this.y, this.hx, this.hy, this.r);
  }

  update(dt: number, t: number): SwatterEvents {
    const P = this.P;
    const ev: SwatterEvents = { strikeStart: false, swingStart: false, impact: false, ready: false };
    this.phaseTime += dt;

    // ---- lateral "arm" dynamics -------------------------------------------
    if (this.phase !== SwatterPhase.HOLD) {
      const swinging = this.phase === SwatterPhase.SWING;
      const w = swinging ? P.swingLateralOmega : P.lateralOmega;
      const aMax = swinging ? P.swingMaxLateralAccel : P.maxLateralAccel;
      let ax = w * w * (this.targetX - this.x) - 2 * P.lateralZeta * w * this.vx;
      let ay = w * w * (this.targetY - this.y) - 2 * P.lateralZeta * w * this.vy;
      const a = Math.sqrt(ax * ax + ay * ay);
      if (a > aMax) {
        ax *= aMax / a;
        ay *= aMax / a;
      }
      this.vx += ax * dt;
      this.vy += ay * dt;
      const v = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (v > P.maxLateralSpeed) {
        this.vx *= P.maxLateralSpeed / v;
        this.vy *= P.maxLateralSpeed / v;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ax = ax;
      this.ay = ay;
    } else {
      this.vx = this.vy = this.ax = this.ay = 0;
    }
    this.updateGround();

    // ---- vertical ----------------------------------------------------------
    const prevVz = this.vz;
    const hoverZ = this.hoverElevation();
    switch (this.phase) {
      case SwatterPhase.IDLE: {
        // The hand lifts quickly but lowers gently.
        this.vz = clamp((hoverZ - this.z) * P.hoverFollowGain, -P.hoverFollowMaxSpeed, P.hoverRiseMaxSpeed);
        this.z += this.vz * dt;
        if (this.queuedStrike) this.beginStrike(t, ev);
        break;
      }
      case SwatterPhase.PREP: {
        const T = P.prepMs / 1000;
        const u = Math.min(1, this.phaseTime / T);
        const zNew = this.prepStartZ + P.windUpMm * smoothstep(0, 1, u);
        this.vz = (zNew - this.z) / dt;
        this.z = zNew;
        if (this.phaseTime >= T) {
          this.phase = SwatterPhase.SWING;
          this.phaseTime = 0;
          this.swingStartTime = t;
          this.vz = 0;
          ev.swingStart = true;
        }
        break;
      }
      case SwatterPhase.SWING: {
        this.vz = Math.max(this.vz - this.swingAccel * dt, -this.swingMax);
        this.z += this.vz * dt;
        this.maxSwingSpeed = Math.max(this.maxSwingSpeed, this.speed);
        if (this.z <= this.groundH) {
          this.impactSpeed = this.speed;
          this.z = this.groundH;
          this.impactX = this.x;
          this.impactY = this.y;
          this.impactZ = this.groundH;
          this.impactObject = this.groundObject;
          this.impactTime = t;
          this.vz = 0;
          this.phase = SwatterPhase.HOLD;
          this.phaseTime = 0;
          ev.impact = true;
        }
        break;
      }
      case SwatterPhase.HOLD: {
        this.z = this.groundH;
        this.vz = 0;
        if (this.phaseTime >= P.holdMs / 1000) {
          this.phase = SwatterPhase.RECOVER;
          this.phaseTime = 0;
        }
        break;
      }
      case SwatterPhase.RECOVER: {
        this.vz = clamp((hoverZ - this.z) * P.hoverFollowGain * 1.6, -P.hoverFollowMaxSpeed * 1.6, P.hoverFollowMaxSpeed * 2);
        this.z += this.vz * dt;
        if (this.phaseTime >= P.recoverMs / 1000) {
          this.phase = SwatterPhase.IDLE;
          this.phaseTime = 0;
          ev.ready = true;
          if (this.queuedStrike) this.beginStrike(t, ev);
        }
        break;
      }
    }
    this.az = (this.vz - prevVz) / dt;
    return ev;
  }

  private beginStrike(t: number, ev: SwatterEvents): void {
    this.queuedStrike = false;
    this.phase = SwatterPhase.PREP;
    this.phaseTime = 0;
    this.prepStartZ = this.z;
    this.strikeId++;
    this.strikeStartTime = t;
    this.swingStartTime = -1;
    this.maxSwingSpeed = 0;
    const k = 1 + this.rng.normal(0, this.P.swingVariability);
    this.swingAccel = this.P.swingAccel * clamp(k, 0.85, 1.15);
    this.swingMax = this.P.swingMaxSpeed * clamp(k, 0.85, 1.15);
    ev.strikeStart = true;
  }

  /** For testing / synthetic attacks: scale the next swing's speed. */
  overrideSwing(accelScale: number, speedScale: number): void {
    this.swingAccel *= accelScale;
    this.swingMax *= speedScale;
  }
}

/**
 * 3-D signed gap between a point and the swatter head slab
 * (footprint * [z, z + thickness]); negative inside.
 */
export function slabGap(
  px: number, py: number, pz: number,
  sx: number, sy: number, sz: number,
  hx: number, hy: number, r: number, thickness: number,
): number {
  const dxy = sdRoundRect(px, py, sx, sy, hx, hy, r);
  let dz: number;
  if (pz < sz) dz = sz - pz;
  else if (pz > sz + thickness) dz = pz - (sz + thickness);
  else dz = -Math.min(pz - sz, sz + thickness - pz);
  if (dxy <= 0 && dz <= 0) return Math.max(dxy, dz);
  const ox = dxy > 0 ? dxy : 0;
  const oz = dz > 0 ? dz : 0;
  return Math.sqrt(ox * ox + oz * oz);
}
