import { type Modulation, NEUTRAL_MODULATION, type SimParams, combineModulation } from '../config/params';
import type { AttackResult } from '../game/AttackTracker';
import { modulationForLevel } from '../game/DifficultyController';
import { Simulation } from '../game/Simulation';
import { Rng } from '../math/rng';
import { ATTACK_TYPES, type AttackType, type TrialOutcome, runAttackTrial } from './SyntheticAttacker';

export interface TypeStats {
  type: AttackType;
  trials: number;
  serious: number;
  hits: number;
  escapes: number;
  escapeRate: number;
  nearMisses: number;
  nearMissRate: number;
  meanGapMm: number;
  meanReactionMs: number;
  tookOffRate: number;
}

export interface MonteCarloSummary {
  trials: number;
  serious: number;
  hits: number;
  escapeRate: number;
  hitRate: number;
  nearMissRate: number;
  extremelyCloseRate: number;
  meanReactionMs: number;
  reactionP10: number;
  reactionP90: number;
  meanGapMm: number;
  shortModeFraction: number;
  byType: Record<string, TypeStats>;
  simSeconds: number;
  wallSeconds: number;
  steps: number;
}

export interface MonteCarloOptions {
  attacks: number;
  seed: number;
  params?: SimParams;
  /** difficulty level 0..1 (0.5 = neutral) */
  level?: number;
  /** extra modulation (Lab Mode) */
  modulation?: Partial<Modulation>;
  /** restrict to one attack type; default = weighted typical mix */
  only?: AttackType;
  /** stratified: equal counts per type instead of the weighted mix */
  stratified?: boolean;
  onProgress?: (done: number, total: number) => void;
  /** called after every trial; may return a new modulation to apply (adaptive runs) */
  onTrial?: (r: AttackResult | null, sim: Simulation) => Partial<Modulation> | void;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Run many synthetic attacks and summarise how often the fly escapes. */
export function runMonteCarlo(o: MonteCarloOptions): MonteCarloSummary {
  const rng = new Rng(o.seed);
  const sim = new Simulation({ seed: o.seed ^ 0x5bd1e995, params: o.params });
  const P = sim.params;
  const baseMod = (extra: Partial<Modulation>) =>
    combineModulation(NEUTRAL_MODULATION, modulationForLevel(o.level ?? 0.5, P.difficulty), o.modulation ?? {}, extra);
  sim.setModulation(baseMod({}), true);
  const types = Object.keys(ATTACK_TYPES) as AttackType[];
  const weights = types.map((t) => ATTACK_TYPES[t].weight);
  const outcomes: TrialOutcome[] = [];
  const t0 = now();
  const simT0 = sim.time;
  for (let i = 0; i < o.attacks; i++) {
    const type = o.only ?? (o.stratified ? types[i % types.length] : types[rng.weightedIndex(weights)]);
    const oc = runAttackTrial(sim, type, rng);
    outcomes.push(oc);
    if (o.onTrial) {
      const m = o.onTrial(oc.result, sim);
      if (m) sim.setModulation(combineModulation(NEUTRAL_MODULATION, o.modulation ?? {}, m), true);
    }
    if (o.onProgress && i % 50 === 0) o.onProgress(i, o.attacks);
  }
  return summarize(outcomes, sim.time - simT0, (now() - t0) / 1000);
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}

function percentile(a: number[], p: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export function summarize(outcomes: TrialOutcome[], simSeconds: number, wallSeconds: number): MonteCarloSummary {
  const groups = new Map<string, TrialOutcome[]>();
  for (const oc of outcomes) {
    const g = groups.get(oc.type) ?? [];
    g.push(oc);
    groups.set(oc.type, g);
  }
  const stats = (list: TrialOutcome[]) => {
    const serious = list.filter((o) => o.result?.serious).map((o) => o.result!);
    const misses = serious.filter((r) => !r.hit);
    const reactions = serious.filter((r) => r.reactionMs !== null && r.threatMs !== null).map((r) => r.reactionMs!);
    return {
      serious,
      misses,
      reactions,
      hits: serious.length - misses.length,
      near: misses.filter((r) => r.minGapMm <= 20).length,
      extreme: misses.filter((r) => r.minGapMm <= 5).length,
      tookOff: serious.filter((r) => r.flyTookOff).length,
      gaps: misses.map((r) => r.minGapMm),
    };
  };
  const byType: Record<string, TypeStats> = {};
  for (const [type, list] of groups) {
    const s = stats(list);
    byType[type] = {
      type: type as AttackType,
      trials: list.length,
      serious: s.serious.length,
      hits: s.hits,
      escapes: s.misses.length,
      escapeRate: s.serious.length ? s.misses.length / s.serious.length : NaN,
      nearMisses: s.near,
      nearMissRate: s.serious.length ? s.near / s.serious.length : NaN,
      meanGapMm: mean(s.gaps),
      meanReactionMs: mean(s.reactions),
      tookOffRate: s.serious.length ? s.tookOff / s.serious.length : NaN,
    };
  }
  const all = stats(outcomes);
  const modes = all.serious.filter((r) => r.escapeMode === 'short' || r.escapeMode === 'long');
  return {
    trials: outcomes.length,
    serious: all.serious.length,
    hits: all.hits,
    escapeRate: all.serious.length ? all.misses.length / all.serious.length : NaN,
    hitRate: all.serious.length ? all.hits / all.serious.length : NaN,
    nearMissRate: all.serious.length ? all.near / all.serious.length : NaN,
    extremelyCloseRate: all.serious.length ? all.extreme / all.serious.length : NaN,
    meanReactionMs: mean(all.reactions),
    reactionP10: percentile(all.reactions, 0.1),
    reactionP90: percentile(all.reactions, 0.9),
    meanGapMm: mean(all.gaps),
    shortModeFraction: modes.length ? modes.filter((r) => r.escapeMode === 'short').length / modes.length : NaN,
    byType,
    simSeconds,
    wallSeconds,
    steps: outcomes.reduce((s, o) => s + o.steps, 0),
  };
}
