import { loadJSON, saveJSON } from './storage';

/**
 * Leaderboard abstraction. The game ships with a local provider only (no
 * backend is required for GitHub Pages). An online provider can implement the
 * same interface later (e.g. a serverless function) without touching the game.
 */
export type LeaderboardCategory = 'closestMiss' | 'fewestAttemptsPerCatch' | 'longestFlyStreak';

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
    // keep the best 20 per category
    const byCat = new Map<LeaderboardCategory, ScoreEntry[]>();
    for (const e of this.entries) {
      const list = byCat.get(e.category) ?? [];
      list.push(e);
      byCat.set(e.category, list);
    }
    this.entries = [];
    for (const [cat, list] of byCat) {
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

  topSync(category: LeaderboardCategory, limit: number): ScoreEntry[] {
    return this.entries
      .filter((e) => e.category === category)
      .sort((a, b) => (LOWER_IS_BETTER[category] ? a.value - b.value : b.value - a.value))
      .slice(0, limit);
  }

  clear(): void {
    this.entries = [];
    saveJSON('leaderboard', this.entries);
  }
}
