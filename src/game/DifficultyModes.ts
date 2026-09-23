import type { Modulation } from '../config/params';

export type DifficultyId = 'easy' | 'medium' | 'hard';

export interface DifficultyMode {
  id: DifficultyId;
  label: string;
  icon: string;
  /** what kind of fly you're up against */
  flyName: string;
  blurb: string;
  /** rough odds for a well-aimed swing, shown on the title screen */
  odds: string;
  /**
   * Fixed multipliers on the fly's reflexes. `null` means the fly is the fully
   * tuned one and the adaptive difficulty controller keeps it near a ~1% hit rate.
   */
  modulation: Partial<Modulation> | null;
}

/**
 * The three game modes. The numbers were calibrated with the Monte-Carlo
 * attackers (`runMonteCarlo`): a typical mix of aimed swings catches roughly
 * 40% (easy), 12% (medium) and 1-2% (hard) of the time. Real players on a
 * phone aim less precisely, so they will see lower rates.
 */
export const DIFFICULTIES: Record<DifficultyId, DifficultyMode> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    icon: '🐌',
    flyName: 'Sleepy fly',
    blurb: 'Slow reflexes, lands close by',
    odds: 'good swings often land',
    modulation: {
      latencyScale: 1.42,
      thresholdScale: 1.3,
      takeoffScale: 0.85,
      predictionNoiseScale: 1.6,
      randomnessScale: 1.4,
      landingDistanceScale: 0.7,
    },
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    icon: '🪰',
    flyName: 'Alert fly',
    blurb: 'Quick, but makes mistakes',
    odds: 'about 1 in 10 good swings',
    modulation: {
      latencyScale: 1.22,
      thresholdScale: 1.18,
      takeoffScale: 0.9,
      predictionNoiseScale: 1.4,
      randomnessScale: 1.25,
      landingDistanceScale: 0.85,
    },
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    icon: '🥷',
    flyName: 'Ninja fly',
    blurb: 'Full escape reflex, learns from you',
    odds: 'escapes ~99% of swings',
    modulation: null,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'medium', 'hard'];

export function isDifficultyId(x: unknown): x is DifficultyId {
  return x === 'easy' || x === 'medium' || x === 'hard';
}
