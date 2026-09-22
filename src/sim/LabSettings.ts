import type { Modulation } from '../config/params';

/** Lab Mode knobs (all multipliers on the fly's normal parameters). */
export interface LabSettings {
  /** multiplier for all reaction delays (visual, decision, motor) */
  reactionScale: number;
  /** visual sensitivity: thresholds are divided by this */
  sensitivity: number;
  /** multiplier for take-off speed and escape acceleration */
  accelScale: number;
  /** fixed prediction horizon (ms) or null = automatic 30-150 ms */
  horizonMs: number | null;
  /** multiplier for direction noise and planner randomness */
  randomness: number;
  escapeEnabled: boolean;
  predictionEnabled: boolean;
}

export const LAB_DEFAULTS: LabSettings = {
  reactionScale: 1,
  sensitivity: 1,
  accelScale: 1,
  horizonMs: null,
  randomness: 1,
  escapeEnabled: true,
  predictionEnabled: true,
};

export const LAB_PRESETS: { id: string; label: string; settings: Partial<LabSettings> }[] = [
  { id: 'normal', label: 'Normal', settings: {} },
  { id: 'slow', label: 'Reaction speed ×0.5', settings: { reactionScale: 2 } },
  { id: 'noescape', label: 'Disable escape circuit', settings: { escapeEnabled: false } },
  { id: 'reactive', label: 'Reactive only (no prediction)', settings: { predictionEnabled: false } },
  { id: 'numb', label: 'Dim vision (sensitivity ×0.4)', settings: { sensitivity: 0.4 } },
  { id: 'weak', label: 'Weak legs (acceleration ×0.5)', settings: { accelScale: 0.5 } },
  { id: 'chaos', label: 'Chaotic (randomness ×3)', settings: { randomness: 3 } },
];

export function labModulation(s: LabSettings): Partial<Modulation> {
  return {
    latencyScale: s.reactionScale,
    thresholdScale: 1 / Math.max(0.05, s.sensitivity),
    takeoffScale: s.accelScale,
    randomnessScale: s.randomness,
    predictionHorizonMs: s.horizonMs,
    escapeEnabled: s.escapeEnabled,
    predictionEnabled: s.predictionEnabled,
  };
}

export function isDefaultLab(s: LabSettings): boolean {
  return (
    s.reactionScale === 1 &&
    s.sensitivity === 1 &&
    s.accelScale === 1 &&
    s.horizonMs === null &&
    s.randomness === 1 &&
    s.escapeEnabled &&
    s.predictionEnabled
  );
}
