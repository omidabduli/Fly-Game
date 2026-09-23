import { loadJSON, saveJSON } from './storage';

/**
 * Leaderboard abstraction. The game ships with a local provider only (no
 * backend is required for GitHub Pages). An online provider can implement the
 * same interface later (e.g. a serverless function) without touching the game.
 */
export type LeaderboardCategory = 'closestMiss' | 'fewestAttemptsPerCatch' | 'longestFlyStreak' | 'lowestDamage';

export interface ScoreEntry {
  category: LeaderboardCategory;
  value: number;
  /** ISO date */
  date: string;
  player?: string;
  detail?: string;
}

export interface LeaderboardProvider {
  readonly id: string;
  readonly online: boolean;
  submit(entry: ScoreEntry): Promise<void>;
  top(category: LeaderboardCategory, limit: number): Promise<ScoreEntry[]>;
}

const LOWER_IS_BETTER: Record<LeaderboardCategory, boolean> = {
  closestMiss: true,
  fewestAttemptsPerCatch: true,
  longestFlyStreak: false,
  lowestDamage: true,
};

/** Personal bests stored in this browser. */
export class LocalLeaderboard implements LeaderboardProvider {
  readonly id = 'local';
  readonly online = false;
  private entries: ScoreEntry[];

  constructor() {
    this.entries = loadJSON<ScoreEntry[]>('leaderboard', []);
  }

  async submit(entry: ScoreEntry): Promise<void> {
    this.entries.push(entry);
    // keep the best 20 per category (and per detail, e.g. difficulty)
    const byCat = new Map<string, ScoreEntry[]>();
    for (const e of this.entries) {
      const key = `${e.category}|${e.detail ?? ''}`;
      const list = byCat.get(key) ?? [];
      list.push(e);
      byCat.set(key, list);
    }
    this.entries = [];
    for (const list of byCat.values()) {
      const cat = list[0].category;
      list.sort((a, b) => (LOWER_IS_BETTER[cat] ? a.value - b.value : b.value - a.value));
      this.entries.push(...list.slice(0, 20));
    }
    saveJSON('leaderboard', this.entries);
  }

  async top(category: LeaderboardCategory, limit: number): Promise<ScoreEntry[]> {
    return this.entries
      .filter((e) => e.category === category)
      .sort((a, b) => (LOWER_IS_BETTER[category] ? a.value - b.value : b.value - a.value))
      .slice(0, limit);
  }

  /** `detail` filters by e.g. difficulty (entries saved without one count as 'hard', the original game). */
  topSync(category: LeaderboardCategory, limit: number, detail?: string): ScoreEntry[] {
    return this.entries
      .filter((e) => e.category === category && (detail === undefined || (e.detail ?? 'hard') === detail))
      .sort((a, b) => (LOWER_IS_BETTER[category] ? a.value - b.value : b.value - a.value))
      .slice(0, limit);
  }

  clear(): void {
    this.entries = [];
    saveJSON('leaderboard', this.entries);
  }
}
