import type { SimParams } from '../config/params';
import type { Rng } from '../math/rng';
import type { Vec3 } from '../math/vec';
import { GiantFiber } from '../neuroscience/GiantFiber';
import { LoomingDetector } from '../neuroscience/LoomingDetector';
import type {
  EscapeCircuitModule,
  EscapeCircuitOutput,
  EscapeThresholds,
  LoomingDetectorModule,
  LoomingOutput,
  VisualInputModule,
  VisualPercept,
} from '../neuroscience/types';
import { VisualSystem } from '../neuroscience/VisualSystem';
import type { SwatterHistory } from '../physics/SwatterHistory';

export interface ThreatAssessment {
  percept: VisualPercept;
  looming: LoomingOutput;
  circuit: EscapeCircuitOutput;
  /** 0-1: potential of the escape neuron (the fly's threatLevel) */
  threatLevel: number;
  /** medium threat (or strong generic motion): freeze / get ready */
  alerted: boolean;
  /** high threat: the escape neuron fired this step */
  fired: boolean;
}

/**
 * Threat detection = the first three stages of the escape pathway:
 *
 *   VISUAL (VisualInputModule) -> LOOMING (LoomingDetectorModule) -> ESCAPE (EscapeCircuitModule)
 *
 * Each stage is injected, so a connectome-derived implementation of any one
 * of them (e.g. a rate model built from preprocessed FlyWire data) can be
 * dropped in without touching the rest of the fly.
 */
export class ThreatDetector {
  constructor(
    readonly visual: VisualInputModule,
    readonly looming: LoomingDetectorModule,
    readonly escape: EscapeCircuitModule,
    private readonly P: SimParams['looming'],
  ) {}

  /** The default, hand-built modules. */
  static create(P: SimParams, headRadius: number, rng: Rng): ThreatDetector {
    return new ThreatDetector(
      new VisualSystem(P.perception, headRadius, P.swatter.thicknessMm, rng),
      new LoomingDetector(P.looming),
      new GiantFiber(P.looming, P.escape.refractoryMs, rng),
      P.looming,
    );
  }

  update(
    time: number,
    dt: number,
    history: SwatterHistory,
    flyPos: Vec3,
    flyVel: Vec3,
    latencyScale: number,
    thresholds: EscapeThresholds,
    escapeEnabled: boolean,
  ): ThreatAssessment {
    const percept = this.visual.sample(time, dt, history, flyPos, flyVel, latencyScale);
    const looming = this.looming.update(percept, dt);
    this.escape.enabled = escapeEnabled;
    const circuit = this.escape.update(looming, dt, thresholds, time, this.P.neuralNoise);
    // Sideways motion can alert (never fire): the alert signal is the larger of
    // the escape neuron's potential and the scaled generic-motion channel.
    const alertSignal = Math.max(circuit.potential, looming.motion * this.P.motionAlertGain);
    return {
      percept,
      looming,
      circuit,
      threatLevel: circuit.threatLevel,
      alerted: alertSignal >= thresholds.alert,
      fired: circuit.fired,
    };
  }

  reset(): void {
    this.visual.reset();
    this.looming.reset();
    this.escape.reset();
  }
}
