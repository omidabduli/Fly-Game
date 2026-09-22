import type { SimParams } from '../config/params';
import type { Rng } from '../math/rng';
import { clamp, clamp01 } from '../math/vec';

/**
 * Per-fly heritable variation. Every new fly gets slightly different behaviour
 * parameters so the player can't memorise a single fly.
 */
export interface FlyGenome {
  id: number;
  nickname: string;
  traits: string[];
  latencyScale: number;
  thresholdScale: number;
  takeoffScale: number;
  /** -1..1: bias to escape to the left (-) or right (+) of the threat */
  handedness: number;
  groomingScale: number;
  walkScale: number;
  /** 0..1: likes landing near the player */
  curiosity: number;
  /** 0..1: tolerates the swatter nearby */
  boldness: number;
  /** body tint variation for rendering (-1..1) */
  tint: number;
}

const NICKNAMES = [
  'Zippy', 'Twitch', 'Houdini', 'Bolt', 'Pip', 'Nimbus', 'Dart', 'Ghost', 'Flick', 'Echo',
  'Blink', 'Comet', 'Wisp', 'Jinx', 'Moxie', 'Quark', 'Rascal', 'Scout', 'Tango', 'Vesper',
];

export function randomGenome(rng: Rng, id: number): FlyGenome {
  const g: FlyGenome = {
    id,
    nickname: NICKNAMES[(id - 1 + rng.int(0, NICKNAMES.length)) % NICKNAMES.length],
    traits: [],
    latencyScale: clamp(rng.normal(1, 0.04), 0.9, 1.1),
    thresholdScale: clamp(rng.normal(1, 0.04), 0.9, 1.1),
    takeoffScale: clamp(rng.normal(1, 0.025), 0.94, 1.06),
    handedness: clamp(rng.normal(0, 0.45), -1, 1),
    groomingScale: clamp(rng.normal(1, 0.3), 0.5, 1.7),
    walkScale: clamp(rng.normal(1, 0.3), 0.5, 1.7),
    curiosity: clamp01(rng.normal(0.4, 0.2)),
    boldness: clamp01(rng.normal(0.4, 0.2)),
    tint: clamp(rng.normal(0, 0.5), -1, 1),
  };
  const t: string[] = [];
  if (g.latencyScale < 0.97) t.push('quick');
  if (g.latencyScale > 1.04) t.push('dreamy');
  if (g.thresholdScale < 0.96) t.push('jumpy');
  if (g.thresholdScale > 1.04) t.push('unflappable');
  if (g.groomingScale > 1.3) t.push('fastidious');
  if (g.walkScale > 1.3) t.push('restless');
  if (g.curiosity > 0.65) t.push('curious');
  if (g.boldness > 0.65) t.push('bold');
  if (g.boldness < 0.15) t.push('shy');
  if (Math.abs(g.handedness) > 0.55) t.push(g.handedness > 0 ? 'right-leaning' : 'left-leaning');
  if (!t.length) t.push('ordinary');
  g.traits = t.slice(0, 3);
  return g;
}

/** A neutral genome (benchmarks / tests). */
export function neutralGenome(id = 0): FlyGenome {
  return {
    id,
    nickname: 'Standard',
    traits: ['standard'],
    latencyScale: 1,
    thresholdScale: 1,
    takeoffScale: 1,
    handedness: 0,
    groomingScale: 1,
    walkScale: 1,
    curiosity: 0.4,
    boldness: 0.4,
    tint: 0,
  };
}

/**
 * Short-term mood, so the fly reacts to what just happened to it.
 * All values are 0..1.
 */
export class Personality {
  fear = 0.1;
  energy = 0.85;
  alertness = 0.15;
  annoyance = 0.05;
  confidence = 0.5;

  constructor(private readonly P: SimParams['behavior']) {}

  randomize(rng: Rng): void {
    this.fear = clamp01(rng.range(0, 0.25));
    this.energy = clamp01(rng.range(0.6, 1));
    this.alertness = clamp01(rng.range(0.05, 0.35));
    this.annoyance = clamp01(rng.range(0, 0.2));
    this.confidence = clamp01(rng.range(0.35, 0.65));
  }

  update(dt: number, flying: boolean, onFood: boolean): void {
    const P = this.P;
    this.alertness -= (this.alertness * dt) / P.alertnessDecayS;
    this.fear -= (this.fear * dt) / P.fearDecayS;
    this.annoyance -= (this.annoyance * dt) / P.annoyanceDecayS;
    this.confidence += ((0.5 - this.confidence) * dt) / P.confidenceRelaxS;
    if (flying) this.energy -= P.energyFlightCostPerS * dt;
    else this.energy += (onFood ? P.energyFoodGainPerS : P.energyRestGainPerS) * dt;
    this.clampAll();
  }

  onAlert(): void {
    this.alertness += 0.04;
    this.clampAll();
  }

  onEscape(): void {
    this.alertness += 0.1;
    this.fear += 0.15;
    this.annoyance += 0.08;
    this.energy -= this.P.energyEscapeCost;
    this.clampAll();
  }

  /** After an attack resolves: closer calls leave a bigger impression. */
  onAttackSurvived(gapMm: number): void {
    const closeness = clamp01(1 - gapMm / 40);
    this.alertness += 0.06 + 0.12 * closeness;
    this.fear += 0.1 + 0.3 * closeness;
    this.annoyance += 0.06;
    this.confidence += closeness > 0.6 ? -0.08 : 0.04;
    this.clampAll();
  }

  private clampAll(): void {
    this.fear = clamp01(this.fear);
    this.energy = clamp01(this.energy);
    this.alertness = clamp01(this.alertness);
    this.annoyance = clamp01(this.annoyance);
    this.confidence = clamp01(this.confidence);
  }
}
