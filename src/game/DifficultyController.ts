import type { Modulation, SimParams } from '../config/params';
import { clamp, lerp } from '../math/vec';
import type { AttackResult } from './AttackTracker';

export interface DifficultyState {
  level: number;
  hitEwma: number;
  closenessEwma: number;
  attempts: number;
  hits: number;
  nearMisses: number;
  /** rolling window of recent serious attacks (1 = hit) */
  recent: number[];
  avgMissMm: number;
  avgPlayerReactionMs: number;
  avgSwatterSpeed: number;
  avgPredictionQuality: number;
}

export function initialDifficultyState(P: SimParams['difficulty']): DifficultyState {
  return {
    level: P.initialLevel,
    hitEwma: P.targetPlayerSuccess,
    closenessEwma: P.targetCloseness,
    attempts: 0,
    hits: 0,
    nearMisses: 0,
    recent: [],
    avgMissMm: 30,
    avgPlayerReactionMs: 1500,
    avgSwatterSpeed: 3500,
    avgPredictionQuality: 0,
  };
}

/**
 * Maps a difficulty level (0 = easiest, 1 = hardest) to small multipliers on
 * the fly's perception and motor parameters. The full range only changes each
 * parameter by about 10-30%, so the fly is always very good but never
 * unbeatable. Hitboxes and physics are never touched.
 */
export function modulationForLevel(level: number, P: SimParams['difficulty']): Partial<Modulation> {
  const l = clamp(level, 0, 1);
  return {
    thresholdScale: lerp(P.thresholdRange[0], P.thresholdRange[1], l),
    latencyScale: lerp(P.latencyRange[0], P.latencyRange[1], l),
    takeoffScale: lerp(P.takeoffRange[0], P.takeoffRange[1], l),
    predictionNoiseScale: lerp(P.predictionNoiseRange[0], P.predictionNoiseRange[1], l),
    randomnessScale: lerp(P.randomnessRange[0], P.randomnessRange[1], l),
    landingDistanceScale: lerp(P.landingDistanceRange[0], P.landingDistanceRange[1], l),
  };
}

/**
 * Adaptive difficulty. Hits are rare (~1%), so a pure hit-rate controller would
 * react far too slowly; instead the controller also watches how *close* the
 * player's serious attacks get (closeness = (1 - gap/scale)^2, 1 for a hit)
 * and nudges the level by a small step after each serious attack.
 *
 * Changes are applied by the game only between attacks.
 */
export class DifficultyController {
  state: DifficultyState;

  constructor(
    private readonly P: SimParams['difficulty'],
    saved?: Partial<DifficultyState>,
  ) {
    this.state = { ...initialDifficultyState(P), ...(saved ?? {}) };
    this.state.level = clamp(this.state.level, P.minLevel, P.maxLevel);
    if (!Array.isArray(this.state.recent)) this.state.recent = [];
  }

  get level(): number {
    return this.state.level;
  }

  /** Rolling success rate over the last (up to) 200 serious attacks. */
  get rollingSuccess(): number {
    const r = this.state.recent;
    if (!r.length) return 0;
    let s = 0;
    for (const v of r) s += v;
    return s / r.length;
  }

  modulation(): Partial<Modulation> {
    return modulationForLevel(this.state.level, this.P);
  }

  static closeness(result: Pick<AttackResult, 'hit' | 'minGapMm'>, scaleMm: number): number {
    if (result.hit) return 1;
    const c = clamp(1 - result.minGapMm / scaleMm, 0, 1);
    return c * c;
  }

  /** Feed one resolved attack; returns the new level. */
  record(result: AttackResult): number {
    const P = this.P;
    const s = this.state;
    if (!result.serious) return s.level;
    s.attempts++;
    if (result.hit) s.hits++;
    if (!result.hit && result.minGapMm <= 20) s.nearMisses++;
    s.recent.push(result.hit ? 1 : 0);
    if (s.recent.length > 200) s.recent.shift();
    if (!result.hit) s.avgMissMm += (result.minGapMm - s.avgMissMm) * 0.05;
    if (result.playerReactionMs !== null) s.avgPlayerReactionMs += (result.playerReactionMs - s.avgPlayerReactionMs) * 0.1;
    s.avgSwatterSpeed += (result.impactSpeed - s.avgSwatterSpeed) * 0.1;
    if (result.predictionQuality !== null) s.avgPredictionQuality += (result.predictionQuality - s.avgPredictionQuality) * 0.1;

    const c = DifficultyController.closeness(result, P.closenessScaleMm);
    s.closenessEwma += (c - s.closenessEwma) * P.closenessAlpha;
    s.hitEwma += ((result.hit ? 1 : 0) - s.hitEwma) * P.hitAlpha;
    const eClose = (s.closenessEwma - P.targetCloseness) / P.targetCloseness;
    const eHit = (s.hitEwma - P.targetPlayerSuccess) / P.targetPlayerSuccess;
    const e = clamp(P.closenessWeight * clamp(eClose, -1, 1) + (1 - P.closenessWeight) * clamp(eHit, -1, 2), -1, 1);
    s.level = clamp(s.level + P.gain * e, P.minLevel, P.maxLevel);
    return s.level;
  }

  reset(): void {
    this.state = initialDifficultyState(this.P);
  }
}
