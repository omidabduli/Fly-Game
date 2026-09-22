import type { SimParams } from '../config/params';
import type { Dist, Rng } from '../math/rng';
import type { EscapeMode, PendingEscape } from './types';

export interface ScheduleOptions {
  /** sim time the escape neuron crossed threshold */
  firedAt: number;
  /** visual latency at that moment (ms, already scaled) */
  visualDelayMs: number;
  mode: EscapeMode;
  thetaDotAtFire: number;
  /** combined latency multiplier (genome * difficulty * lab * personality) */
  latencyScale: number;
  /** extra delay caused by the fly's current activity (grooming, landing ...) */
  penalty: Dist | null;
  /** fraction removed from the decision delay when already alert */
  alertReduction: number;
  stateAtFire: number;
}

/**
 * DESCENDING MOTOR PATHWAY timing.
 *
 * After the escape neuron fires, the escape is committed but not instant:
 *   escapeDecisionDelay -> the jump direction is chosen (planner runs)
 *   motorInitiationDelay -> legs start pushing (or wing stroke changes in flight)
 * Every delay is drawn from a truncated normal, so reaction time varies from
 * escape to escape and is never tied to the rendering frame rate.
 */
export class ReactionTimer {
  readonly name = 'motor';
  pending: PendingEscape | null = null;
  last: PendingEscape | null = null;
  private nextId = 1;

  constructor(
    private readonly P: SimParams['escape'],
    private readonly rng: Rng,
  ) {}

  reset(): void {
    this.pending = null;
    this.last = null;
  }

  schedule(o: ScheduleOptions): PendingEscape {
    const P = this.P;
    let decision = this.rng.sample(P.escapeDecisionDelayMs) * o.latencyScale;
    decision *= 1 - o.alertReduction;
    const motorDist = o.mode === 'short' ? P.motorInitiationDelayShortMs : o.mode === 'flight' ? P.motorInitiationDelayFlightMs : P.motorInitiationDelayLongMs;
    const motor = this.rng.sample(motorDist) * o.latencyScale;
    const penalty = o.penalty ? this.rng.sample(o.penalty) * o.latencyScale : 0;
    const p: PendingEscape = {
      id: this.nextId++,
      firedAt: o.firedAt,
      stimTime: o.firedAt - o.visualDelayMs / 1000,
      visualDelayMs: o.visualDelayMs,
      decisionDelayMs: decision,
      penaltyMs: penalty,
      motorDelayMs: motor,
      decideAt: o.firedAt + (decision + penalty) / 1000,
      goAt: o.firedAt + (decision + penalty + motor) / 1000,
      mode: o.mode,
      thetaDotAtFire: o.thetaDotAtFire,
      planned: false,
      executed: false,
      stateAtFire: o.stateAtFire,
    };
    this.pending = p;
    this.last = p;
    return p;
  }

  /** Total reaction time of an escape: real stimulus threshold -> movement (ms). */
  static reactionMs(p: PendingEscape): number {
    return p.visualDelayMs + p.decisionDelayMs + p.penaltyMs + p.motorDelayMs;
  }

  cancel(): void {
    this.pending = null;
  }
}
