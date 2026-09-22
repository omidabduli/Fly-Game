import type { AttackResult } from '../game/AttackTracker';
import type { PlayerStats } from './StatsManager';
import { loadJSON, saveJSON } from './storage';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** checked after stats are updated */
  test: (s: PlayerStats, last: AttackResult | null) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-catch', title: 'First Catch', description: 'Swat a fly. Against all odds.', icon: '🏆', test: (s) => s.catches >= 1 },
  { id: 'misses-100', title: '100 Misses', description: 'Let a fly escape 100 serious attacks.', icon: '💯', test: (s) => s.escapes >= 100 },
  { id: 'near-1mm', title: '1 mm Near Miss', description: 'Miss by one millimetre or less.', icon: '📏', test: (_s, r) => !!r && !r.hit && r.serious && r.minGapMm <= 1 },
  { id: 'survived-500', title: 'Fly Survived 500 Attacks', description: 'Your flies have survived 500 serious attacks.', icon: '🪰', test: (s) => s.escapes >= 500 },
  { id: 'impossible-catch', title: 'Impossible Catch', description: 'Swat a fly in mid-air.', icon: '🌪️', test: (s) => s.airborneCatches >= 1 },
  { id: 'grooming-ambush', title: 'Grooming Ambush', description: 'Catch a fly while it is cleaning itself.', icon: '🧼', test: (s) => s.groomingCatches >= 1 },
  { id: 'touchdown', title: 'Touchdown', description: 'Catch a fly the moment it lands.', icon: '🛬', test: (s) => s.landingCatches >= 1 },
  { id: 'near-10', title: 'So Close', description: 'Collect 10 near misses (under 20 mm).', icon: '🎯', test: (s) => s.nearMisses >= 10 },
  { id: 'hair-breadth', title: "Hair's Breadth", description: 'Five misses under 5 mm.', icon: '🪶', test: (s) => s.extremelyClose >= 5 },
  { id: 'persistent', title: 'Persistent', description: 'Take 1,000 swings.', icon: '🔁', test: (s) => s.swings >= 1000 },
  { id: 'lab-rat', title: 'Lab Rat', description: 'Run an experiment in Lab Mode.', icon: '🧪', test: (s) => s.labExperiments >= 1 },
  { id: 'slow-mo', title: 'Slow-Mo Scientist', description: 'Watch a slow-motion replay.', icon: '🎞️', test: (s) => s.replaysWatched >= 1 },
  { id: 'neuro-nerd', title: 'Neuro Nerd', description: 'Open the Brain View.', icon: '🧠', test: (s) => s.brainViewOpened >= 1 },
  { id: 'streak-100', title: 'Unswattable', description: 'A single fly survives 100 serious attacks in a row.', icon: '🛡️', test: (s) => s.longestStreak >= 100 },
];

/** Locally stored achievements (structured so an online sync could be added). */
export class AchievementManager {
  unlocked: Record<string, string>;

  constructor() {
    this.unlocked = loadJSON<Record<string, string>>('achievements', {});
  }

  has(id: string): boolean {
    return id in this.unlocked;
  }

  /** Returns newly unlocked achievements. */
  check(stats: PlayerStats, last: AttackResult | null): AchievementDef[] {
    const fresh: AchievementDef[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.has(a.id)) continue;
      if (a.test(stats, last)) {
        this.unlocked[a.id] = new Date().toISOString();
        fresh.push(a);
      }
    }
    if (fresh.length) saveJSON('achievements', this.unlocked);
    return fresh;
  }

  reset(): void {
    this.unlocked = {};
    saveJSON('achievements', this.unlocked);
  }
}
