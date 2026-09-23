import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/config/params';
import type { AttackResult } from '../src/game/AttackTracker';
import { DifficultyController, modulationForLevel } from '../src/game/DifficultyController';
import { DIFFICULTIES } from '../src/game/DifficultyModes';
import { runMonteCarlo } from '../src/sim/MonteCarlo';

const D = DEFAULT_PARAMS.difficulty;

function result(over: Partial<AttackResult>): AttackResult {
  return {
    id: 1, strikeId: 1, flyId: 1, serious: true, hit: false, airborneHit: false, category: 'MISS', minGapMm: 40, stationaryGapMm: -10,
    sheltered: false, blockedBy: null, flyStateAtStrike: 0, flyAirborneAtStrike: false, strikeStartTime: 0, swingStartTime: 0, impactTime: 0,
    strikeDurationMs: 200, impactSpeed: 3700, lateralSwingSpeed: 0, impactX: 0, impactY: 0, impactZ: 0, impactSurface: 'desk',
    threatMs: -90, perceivedMs: -75, commandMs: -68, takeoffMs: -58, clearMs: -20, reactionMs: 32, escapeMode: 'long', flyTookOff: true,
    predictionQuality: null, playerReactionMs: null, plan: null,
    ...over,
  };
}

describe('adaptive difficulty controller', () => {
  it('level 0.5 is neutral', () => {
    const m = modulationForLevel(0.5, D);
    for (const k of ['thresholdScale', 'latencyScale', 'takeoffScale', 'predictionNoiseScale', 'randomnessScale', 'landingDistanceScale'] as const) {
      expect(m[k]).toBeCloseTo(1, 6);
    }
  });

  it('a player who keeps hitting makes the fly harder; constant far misses make it gentler', () => {
    const good = new DifficultyController(D);
    for (let i = 0; i < 40; i++) good.record(result({ hit: i % 5 === 0, minGapMm: i % 5 === 0 ? 0 : 4 }));
    expect(good.level).toBeGreaterThan(D.initialLevel);
    const bad = new DifficultyController(D);
    for (let i = 0; i < 40; i++) bad.record(result({ minGapMm: 60 }));
    expect(bad.level).toBeLessThan(D.initialLevel);
  });

  it('changes are small (bounded per attack) and the level stays within bounds', () => {
    const c = new DifficultyController(D);
    let prev = c.level;
    for (let i = 0; i < 500; i++) {
      c.record(result({ hit: true, minGapMm: 0 }));
      expect(Math.abs(c.level - prev)).toBeLessThanOrEqual(D.gain + 1e-9);
      prev = c.level;
    }
    expect(c.level).toBeLessThanOrEqual(D.maxLevel);
    for (let i = 0; i < 2000; i++) c.record(result({ minGapMm: 200 }));
    expect(c.level).toBeGreaterThanOrEqual(D.minLevel);
  });

  it('non-serious swings do not change the difficulty', () => {
    const c = new DifficultyController(D);
    const l = c.level;
    for (let i = 0; i < 50; i++) c.record(result({ serious: false, minGapMm: 150 }));
    expect(c.level).toBe(l);
  });

  it('the full range only nudges parameters (never an invincible or a helpless fly)', () => {
    const lo = modulationForLevel(0, D);
    const hi = modulationForLevel(1, D);
    expect(hi.thresholdScale!).toBeGreaterThan(0.8);
    expect(lo.thresholdScale!).toBeLessThan(1.2);
    expect(hi.takeoffScale! / lo.takeoffScale!).toBeLessThan(1.15);
    expect(lo.latencyScale! / hi.latencyScale!).toBeLessThan(1.25);
  });

  it('tracks the rolling success rate', () => {
    const c = new DifficultyController(D);
    for (let i = 0; i < 100; i++) c.record(result({ hit: i < 2, minGapMm: i < 2 ? 0 : 30 }));
    expect(c.rollingSuccess).toBeCloseTo(0.02, 6);
  });
});

describe('game modes', () => {
  it('easy catches clearly more often than medium, and medium more than hard', () => {
    const rate = (id: keyof typeof DIFFICULTIES) => runMonteCarlo({ attacks: 500, seed: 11, modulation: DIFFICULTIES[id].modulation ?? {} }).hitRate;
    const easy = rate('easy');
    const medium = rate('medium');
    const hard = rate('hard');
    expect(easy).toBeGreaterThan(medium * 1.8);
    expect(medium).toBeGreaterThan(hard * 3);
    expect(hard).toBeLessThan(0.05);
    // even on easy the fly still escapes a good share of swings
    expect(easy).toBeLessThan(0.75);
  }, 30000);

  it('hard is the unmodified, adaptive fly', () => {
    expect(DIFFICULTIES.hard.modulation).toBeNull();
    for (const id of ['easy', 'medium'] as const) {
      const m = DIFFICULTIES[id].modulation!;
      // easier modes only slow the fly down, never speed it up
      expect(m.latencyScale!).toBeGreaterThan(1);
      expect(m.thresholdScale!).toBeGreaterThan(1);
      expect(m.takeoffScale!).toBeLessThan(1);
    }
  });
});
