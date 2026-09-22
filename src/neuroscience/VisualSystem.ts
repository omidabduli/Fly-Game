import type { SimParams } from '../config/params';
import type { Rng } from '../math/rng';
import { type Vec3, vec3 } from '../math/vec';
import { type SwatterHistory, type SwatterSample, emptySample } from '../physics/SwatterHistory';
import type { VisualInputModule, VisualPercept } from './types';

/**
 * VISUAL INPUT stage (retina + optic lobe, heavily simplified).
 *
 * The fly never sees the present: it samples the swatter's history with a
 * latency that drifts slightly over time. From the delayed image it derives
 * the apparent angular size theta, its expansion rate thetaDot (looming), an optical
 * time-to-contact tau = theta/thetaDot, sideways motion, and rough kinematic estimates of
 * the swatter (finite differences over a short baseline + noise).
 */
export class VisualSystem implements VisualInputModule {
  readonly name = 'visual';
  delayMs: number;
  readonly percept: VisualPercept;
  private readonly s0: SwatterSample = emptySample();
  private readonly s1: SwatterSample = emptySample();
  private readonly s2: SwatterSample = emptySample();

  constructor(
    private readonly P: SimParams['perception'],
    /** equivalent disc radius of the swatter head (mm) */
    private readonly headRadius: number,
    private readonly headThickness: number,
    private readonly rng: Rng,
  ) {
    this.delayMs = P.visualProcessingDelayMs.mean;
    this.percept = {
      valid: false,
      sampleTime: 0,
      delayMs: this.delayMs,
      distance: Infinity,
      theta: 0,
      thetaDot: 0,
      tau: Infinity,
      lateralRate: 0,
      dir: vec3(0, 0, 1),
      pos: vec3(),
      vel: vec3(),
      acc: vec3(),
      sizeR: headRadius,
    };
  }

  reset(): void {
    this.delayMs = this.rng.sample(this.P.visualProcessingDelayMs);
    this.percept.valid = false;
  }

  /**
   * @param latencyScale combined latency multiplier (genome * difficulty * lab)
   */
  sample(time: number, dt: number, history: SwatterHistory, flyPos: Vec3, flyVel: Vec3, latencyScale: number): VisualPercept {
    const P = this.P;
    const out = this.percept;
    // Slow, bounded random drift of the latency, so the reaction time is never fixed.
    const d = P.visualProcessingDelayMs;
    this.delayMs += this.rng.normal(0, P.visualDelayDriftMs * Math.sqrt(dt / 0.1)) + (d.mean - this.delayMs) * dt * 0.5;
    this.delayMs = Math.min(d.max, Math.max(d.min, this.delayMs));
    const delay = (this.delayMs * latencyScale) / 1000;
    out.delayMs = this.delayMs * latencyScale;
    const ts = time - delay;
    out.sampleTime = ts;
    const s = this.s0;
    if (!history.sampleAt(ts, s) || !s.visible) {
      out.valid = false;
      out.thetaDot = 0;
      out.tau = Infinity;
      out.lateralRate = 0;
      return out;
    }
    out.valid = true;

    // Geometry relative to the fly's current position (proprioception is instant).
    const R = this.headRadius;
    const rx = s.x - flyPos.x;
    const ry = s.y - flyPos.y;
    const rz = s.z + this.headThickness * 0.5 - flyPos.z;
    const dist = Math.max(0.5, Math.sqrt(rx * rx + ry * ry + rz * rz));
    const ux = rx / dist;
    const uy = ry / dist;
    const uz = rz / dist;
    const vrx = s.vx - flyVel.x;
    const vry = s.vy - flyVel.y;
    const vrz = s.vz - flyVel.z;
    const ddot = vrx * ux + vry * uy + vrz * uz; // negative = approaching
    let theta = 2 * Math.atan(R / dist);
    let thetaDot = ((-2 * R) / (dist * dist + R * R)) * ddot;
    // Translational component: relative velocity perpendicular to the line of sight.
    const px = vrx - ddot * ux;
    const py = vry - ddot * uy;
    const pz = vrz - ddot * uz;
    const lateralRate = Math.sqrt(px * px + py * py + pz * pz) / dist;

    // Sensory noise.
    theta *= 1 + this.rng.normal(0, P.angularNoise);
    thetaDot = thetaDot * (1 + this.rng.normal(0, P.angularNoise)) + this.rng.normal(0, 0.05);
    out.theta = Math.max(0, theta);
    out.thetaDot = thetaDot;
    out.tau = thetaDot > 0.02 ? out.theta / thetaDot : Infinity;
    out.lateralRate = lateralRate * (1 + this.rng.normal(0, P.angularNoise));
    out.dir.x = ux;
    out.dir.y = uy;
    out.dir.z = uz;

    // Distance is known less precisely than direction.
    const dPerceived = dist * (1 + this.rng.normal(0, P.distanceNoise));
    out.distance = dPerceived;
    out.pos.x = flyPos.x + ux * dPerceived;
    out.pos.y = flyPos.y + uy * dPerceived;
    out.pos.z = flyPos.z + uz * dPerceived - this.headThickness * 0.5;
    out.sizeR = R * (1 + this.rng.normal(0, P.sizeNoise));

    // Kinematic estimates by finite differences of delayed percepts.
    const b = P.kinematicsBaselineMs / 1000;
    const ok1 = history.sampleAt(ts - b, this.s1);
    const ok2 = ok1 && history.sampleAt(ts - 2 * b, this.s2);
    if (ok2) {
      const vx = (s.x - this.s1.x) / b;
      const vy = (s.y - this.s1.y) / b;
      const vz = (s.z - this.s1.z) / b;
      const v1x = (this.s1.x - this.s2.x) / b;
      const v1y = (this.s1.y - this.s2.y) / b;
      const v1z = (this.s1.z - this.s2.z) / b;
      // Per-axis noise: an error proportional to each component's own magnitude
      // (a fast vertical swing must not corrupt the sideways estimate).
      const axx = (vx - v1x) / b;
      const ayy = (vy - v1y) / b;
      const azz = (vz - v1z) / b;
      // A backward difference estimates velocity half a baseline in the past;
      // correct it with the acceleration estimate so the estimate is unbiased.
      const vcx = vx + axx * b * 0.5;
      const vcy = vy + ayy * b * 0.5;
      const vcz = vz + azz * b * 0.5;
      const vn = P.velocityNoise;
      out.vel.x = vcx + this.rng.normal(0, vn * Math.abs(vcx) + 12);
      out.vel.y = vcy + this.rng.normal(0, vn * Math.abs(vcy) + 12);
      out.vel.z = vcz + this.rng.normal(0, vn * Math.abs(vcz) + 12);
      const an = P.accelNoise;
      out.acc.x = axx + this.rng.normal(0, an * Math.abs(axx) + 400);
      out.acc.y = ayy + this.rng.normal(0, an * Math.abs(ayy) + 400);
      out.acc.z = azz + this.rng.normal(0, an * Math.abs(azz) + 400);
    } else {
      out.vel.x = s.vx;
      out.vel.y = s.vy;
      out.vel.z = s.vz;
      out.acc.x = out.acc.y = out.acc.z = 0;
    }
    return out;
  }
}

/** Equivalent-area disc radius of a rounded-rect swatter head. */
export function equivalentHeadRadius(hx: number, hy: number, r: number): number {
  const area = 4 * hx * hy - (4 - Math.PI) * r * r;
  return Math.sqrt(area / Math.PI);
}
