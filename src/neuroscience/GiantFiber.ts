import type { SimParams } from '../config/params';
import type { Rng } from '../math/rng';
import type { EscapeCircuitModule, EscapeCircuitOutput, EscapeThresholds, LoomingOutput } from './types';

/**
 * Escape decision stage: a leaky integrator modelled on the Giant Fiber.
 *
 * The LC4-like and LPLC2-like drives are summed linearly (as reported for the
 * Drosophila Giant Fiber, von Reyn et al. 2017) and low-pass filtered. When the
 * "membrane potential" crosses the escape threshold the neuron fires once and
 * then needs the drive to fall (and a refractory period) before it can fire
 * again. The potential, clamped to 0..1, is the fly's `threatLevel`.
 */
export class GiantFiber implements EscapeCircuitModule {
  readonly name = 'escape';
  enabled = true;
  readonly output: EscapeCircuitOutput = { potential: 0, threatLevel: 0, fired: false, alert: false };
  private latched = false;
  private refractoryUntil = -Infinity;

  constructor(
    private readonly P: SimParams['looming'],
    private readonly refractoryMs: number,
    private readonly rng: Rng,
  ) {}

  reset(): void {
    this.output.potential = 0;
    this.output.threatLevel = 0;
    this.output.fired = false;
    this.output.alert = false;
    this.latched = false;
    this.refractoryUntil = -Infinity;
  }

  update(l: LoomingOutput, dt: number, thr: EscapeThresholds, t: number, noise: number): EscapeCircuitOutput {
    const o = this.output;
    const drive = l.drive + this.rng.normal(0, noise);
    const tau = this.P.gfTauMs / 1000;
    o.potential += (drive - o.potential) * Math.min(1, dt / tau);
    if (o.potential < 0) o.potential = 0;
    o.threatLevel = o.potential > 1 ? 1 : o.potential;
    o.alert = o.potential >= thr.alert;
    o.fired = false;
    if (this.latched && o.potential < thr.escape * 0.5) this.latched = false;
    if (this.enabled && !this.latched && t >= this.refractoryUntil && o.potential >= thr.escape) {
      o.fired = true;
      this.latched = true;
      this.refractoryUntil = t + this.refractoryMs / 1000;
    }
    return o;
  }
}
