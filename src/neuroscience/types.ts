import type { Vec3 } from '../math/vec';
import type { SwatterHistory } from '../physics/SwatterHistory';

/**
 * Interfaces of the simplified escape pathway:
 *
 *   visual input -> motion/looming detection -> escape decision circuit -> descending motor pathway -> take-off
 *
 * Each stage is a separate module behind a small interface so a
 * connectome-derived implementation (e.g. a rate model built from preprocessed
 * FlyWire data) can replace one stage without touching the others.
 * They are loosely based on the fly's circuitry, not a reconstruction of it.
 */

/** What the fly's visual system reports about the swatter (after delay + noise). */
export interface VisualPercept {
  valid: boolean;
  /** simulation time the percept refers to (now - visual delay) */
  sampleTime: number;
  /** current visual latency (ms) */
  delayMs: number;
  /** perceived distance to the swatter head (mm, noisy) */
  distance: number;
  /** apparent angular size of the head (rad) */
  theta: number;
  /** rate of angular expansion (rad/s); positive = looming */
  thetaDot: number;
  /** optical time-to-contact estimate theta / thetaDot (s); Infinity if not approaching */
  tau: number;
  /** angular speed of sideways (translational) motion (rad/s) */
  lateralRate: number;
  /** unit vector from fly to swatter (the direction of greatest danger) */
  dir: Vec3;
  /** perceived swatter position / velocity / acceleration (mm, mm/s, mm/s^2) */
  pos: Vec3;
  vel: Vec3;
  acc: Vec3;
  /** perceived equivalent radius of the swatter head (mm) */
  sizeR: number;
}

export interface LoomingOutput {
  /** LC4-like angular-velocity channel (0..1) */
  lc4: number;
  /** LPLC2-like angular-size channel for expanding objects (0..1) */
  lplc2: number;
  /** generic visual-motion activity (0..1), alerts but does not trigger escape */
  motion: number;
  /** summed excitatory drive onto the escape neuron */
  drive: number;
}

export interface EscapeThresholds {
  alert: number;
  escape: number;
}

export interface EscapeCircuitOutput {
  /** leaky-integrator "membrane potential" of the GF-like escape neuron (0..~1.1) */
  potential: number;
  /** threatLevel 0-1 (the potential clamped) */
  threatLevel: number;
  /** true on the step the escape threshold is crossed */
  fired: boolean;
  /** medium threat: alert/freeze */
  alert: boolean;
}

export interface NeuralModule {
  readonly name: string;
  reset(): void;
}

/** VISUAL stage: turns the (delayed) world into a percept of the swatter. */
export interface VisualInputModule extends NeuralModule {
  readonly percept: VisualPercept;
  /** current visual latency (ms, before latency scaling) */
  delayMs: number;
  sample(time: number, dt: number, history: SwatterHistory, flyPos: Vec3, flyVel: Vec3, latencyScale: number): VisualPercept;
}

export interface LoomingDetectorModule extends NeuralModule {
  readonly output: LoomingOutput;
  update(p: VisualPercept, dt: number): LoomingOutput;
}

export interface EscapeCircuitModule extends NeuralModule {
  readonly output: EscapeCircuitOutput;
  enabled: boolean;
  update(l: LoomingOutput, dt: number, thresholds: EscapeThresholds, t: number, noise: number): EscapeCircuitOutput;
}

export type EscapeMode = 'short' | 'long' | 'flight' | 'voluntary';

/** A scheduled escape moving through the reaction pipeline. */
export interface PendingEscape {
  id: number;
  /** when the escape neuron crossed threshold (sim time) */
  firedAt: number;
  /** when the *real-world* stimulus crossed threshold (firedAt - visual delay) */
  stimTime: number;
  visualDelayMs: number;
  decisionDelayMs: number;
  penaltyMs: number;
  motorDelayMs: number;
  /** time the escape direction is decided (planner runs) */
  decideAt: number;
  /** time movement begins (legs push / wings change stroke) */
  goAt: number;
  mode: EscapeMode;
  thetaDotAtFire: number;
  planned: boolean;
  executed: boolean;
  /** state the fly was in when the threat fired (for analytics) */
  stateAtFire: number;
}

/** Brain activity snapshot for the Brain View. */
export interface BrainActivity {
  visual: number;
  looming: number;
  escape: number;
  motor: number;
  theta: number;
  thetaDot: number;
  tau: number;
  threatLevel: number;
  alertThreshold: number;
  escapeThreshold: number;
  lc4: number;
  lplc2: number;
}
