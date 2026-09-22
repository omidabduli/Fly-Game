import type { SimParams } from '../config/params';
import { RAD, sigmoid, smoothstep } from '../math/vec';
import type { LoomingDetectorModule, LoomingOutput, VisualPercept } from './types';

/** Rectified sigmoid: 0 at x = 0, 1 for large x, half-activation near `half`. */
export function rectSigmoid(x: number, half: number, slope: number): number {
  if (x <= 0) return 0;
  const s0 = sigmoid(-half / slope);
  const v = (sigmoid((x - half) / slope) - s0) / (1 - s0);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * MOTION / LOOMING DETECTION stage.
 *
 * Two looming channels loosely modelled on the visual projection neurons that
 * feed the Giant Fiber in Drosophila:
 *  - LC4-like:   tuned to the angular EXPANSION VELOCITY thetaDot
 *  - LPLC2-like: tuned to the angular SIZE theta, but only for expanding objects
 * (von Reyn et al. 2017; Ache et al. 2019; Klapoetke et al. 2017).
 * A third, generic motion channel responds to sideways motion. It can make the
 * fly alert but can't trigger an escape on its own, because something that
 * only moves sideways is much less of a threat than something that looms.
 */
export class LoomingDetector implements LoomingDetectorModule {
  readonly name = 'looming';
  readonly output: LoomingOutput = { lc4: 0, lplc2: 0, motion: 0, drive: 0 };

  constructor(private readonly P: SimParams['looming']) {}

  reset(): void {
    this.output.lc4 = this.output.lplc2 = this.output.motion = this.output.drive = 0;
  }

  update(p: VisualPercept, dt: number): LoomingOutput {
    const P = this.P;
    const o = this.output;
    if (!p.valid) {
      const k = Math.exp(-dt / 0.02);
      o.lc4 *= k;
      o.lplc2 *= k;
      o.motion *= k;
      o.drive = P.lc4Weight * o.lc4 + P.lplc2Weight * o.lplc2;
      return o;
    }
    const thetaDotDeg = Math.max(0, p.thetaDot) * RAD;
    const thetaDeg = p.theta * RAD;
    const lateralDeg = p.lateralRate * RAD;
    // Radial-motion opponency: sideways image motion weakens the looming response,
    // so a swatter merely sweeping past is far less alarming than one diving in.
    o.lc4 = rectSigmoid(thetaDotDeg - P.lc4TranslationSuppression * lateralDeg, P.lc4HalfDegS, P.lc4SlopeDegS);
    const gate = smoothstep(P.lplc2GateLowDegS, P.lplc2GateHighDegS, thetaDotDeg - P.lplc2TranslationSuppression * lateralDeg);
    o.lplc2 = rectSigmoid(thetaDeg, P.lplc2HalfDeg, P.lplc2SlopeDeg) * gate;
    o.motion = rectSigmoid(lateralDeg + 0.5 * Math.abs(p.thetaDot) * RAD, P.motionAlertHalfDegS, P.motionAlertSlopeDegS);
    o.drive = P.lc4Weight * o.lc4 + P.lplc2Weight * o.lplc2;
    return o;
  }
}
