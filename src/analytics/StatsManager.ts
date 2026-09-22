import type { AttackResult } from '../game/AttackTracker';
import { loadJSON, saveJSON } from './storage';

export interface PlayerStats {
  version: 1;
  /** every strike, serious or not */
  swings: number;
  /** serious attacks (would have hit a motionless fly, or came close) */
  attempts: number;
  catches: number;
  escapes: number;
  nearMisses: number;
  extremelyClose: number;
  closestMissMm: number | null;
  missSumMm: number;
  missCount: number;
  fastestStrikeMs: number | null;
  fastestImpactSpeed: number;
  reactionSumMs: number;
  reactionCount: number;
  bestReactionMs: number | null;
  /** most consecutive serious attacks survived by a single fly */
  longestStreak: number;
  longestSurvivalS: number;
  airborneCatches: number;
  groomingCatches: number;
  landingCatches: number;
  flies: number;
  playTimeS: number;
  labExperiments: number;
  replaysWatched: number;
  brainViewOpened: number;
  firstPlayed: string | null;
  lastPlayed: string | null;
}

export function emptyStats(): PlayerStats {
  return {
    version: 1,
    swings: 0,
    attempts: 0,
    catches: 0,
    escapes: 0,
    nearMisses: 0,
    extremelyClose: 0,
    closestMissMm: null,
    missSumMm: 0,
    missCount: 0,
    fastestStrikeMs: null,
    fastestImpactSpeed: 0,
    reactionSumMs: 0,
    reactionCount: 0,
    bestReactionMs: null,
    longestStreak: 0,
    longestSurvivalS: 0,
    airborneCatches: 0,
    groomingCatches: 0,
    landingCatches: 0,
    flies: 1,
    playTimeS: 0,
    labExperiments: 0,
    replaysWatched: 0,
    brainViewOpened: 0,
    firstPlayed: null,
    lastPlayed: null,
  };
}

/** Persistent, local-only player statistics. */
export class StatsManager {
  stats: PlayerStats;
  private dirty = false;

  constructor(private readonly key = 'stats') {
    const saved = loadJSON<Partial<PlayerStats> | null>(key, null);
    this.stats = { ...emptyStats(), ...(saved ?? {}) };
    if (!this.stats.firstPlayed) this.stats.firstPlayed = new Date().toISOString();
  }

  get escapeRate(): number {
    const s = this.stats;
    return s.attempts ? s.escapes / s.attempts : 1;
  }

  get successRate(): number {
    const s = this.stats;
    return s.attempts ? s.catches / s.attempts : 0;
  }

  get averageMissMm(): number | null {
    const s = this.stats;
    return s.missCount ? s.missSumMm / s.missCount : null;
  }

  get averageReactionMs(): number | null {
    const s = this.stats;
    return s.reactionCount ? s.reactionSumMs / s.reactionCount : null;
  }

  recordSwing(): void {
    this.stats.swings++;
    this.touch();
  }

  /** Record a resolved attack; `flyStreak` = serious attacks survived so far by this fly. */
  recordAttack(r: AttackResult, flyStreak: number, flyStateAtStrike: string): void {
    const s = this.stats;
    if (!r.serious) return;
    s.attempts++;
    if (r.hit) {
      s.catches++;
      if (r.airborneHit) s.airborneCatches++;
      if (flyStateAtStrike === 'GROOMING') s.groomingCatches++;
      if (flyStateAtStrike === 'LANDING') s.landingCatches++;
    } else {
      s.escapes++;
      s.missSumMm += r.minGapMm;
      s.missCount++;
      if (r.minGapMm <= 20) s.nearMisses++;
      if (r.minGapMm <= 5) s.extremelyClose++;
      if (s.closestMissMm === null || r.minGapMm < s.closestMissMm) s.closestMissMm = r.minGapMm;
      s.longestStreak = Math.max(s.longestStreak, flyStreak);
    }
    if (s.fastestStrikeMs === null || r.strikeDurationMs < s.fastestStrikeMs) s.fastestStrikeMs = r.strikeDurationMs;
    s.fastestImpactSpeed = Math.max(s.fastestImpactSpeed, r.impactSpeed);
    if (r.playerReactionMs !== null && r.playerReactionMs > 80) {
      s.reactionSumMs += r.playerReactionMs;
      s.reactionCount++;
      if (s.bestReactionMs === null || r.playerReactionMs < s.bestReactionMs) s.bestReactionMs = r.playerReactionMs;
    }
    this.touch();
  }

  /** Called continuously while a fly is alive (saved with the periodic persist). */
  recordSurvival(seconds: number): void {
    if (seconds > this.stats.longestSurvivalS) {
      this.stats.longestSurvivalS = seconds;
      this.dirty = true;
    }
  }

  bump(field: 'labExperiments' | 'replaysWatched' | 'brainViewOpened' | 'flies'): void {
    this.stats[field]++;
    this.touch();
  }

  addPlayTime(seconds: number): void {
    this.stats.playTimeS += seconds;
    this.dirty = true;
  }

  private touch(): void {
    this.stats.lastPlayed = new Date().toISOString();
    this.dirty = true;
    this.save();
  }

  save(): void {
    if (!this.dirty) return;
    saveJSON(this.key, this.stats);
    this.dirty = false;
  }

  reset(): void {
    this.stats = emptyStats();
    this.stats.firstPlayed = new Date().toISOString();
    this.dirty = true;
    this.save();
  }
}
