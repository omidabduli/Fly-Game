import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/config/params';
import { Simulation } from '../src/game/Simulation';
import { Rng } from '../src/math/rng';
import { ReactionTimer } from '../src/neuroscience/ReactionTimer';
import { SwatterPhase } from '../src/player/Swatter';

describe('reaction timer', () => {
  it('delays are random but bounded by the configured ranges', () => {
    const E = DEFAULT_PARAMS.escape;
    const timer = new ReactionTimer(E, new Rng(1));
    const totals = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const p = timer.schedule({ firedAt: 1, visualDelayMs: 15, mode: 'long', thetaDotAtFire: 150, latencyScale: 1, penalty: null, alertReduction: 0, stateAtFire: 0 });
      expect(p.decisionDelayMs).toBeGreaterThanOrEqual(E.escapeDecisionDelayMs.min);
      expect(p.decisionDelayMs).toBeLessThanOrEqual(E.escapeDecisionDelayMs.max);
      expect(p.motorDelayMs).toBeGreaterThanOrEqual(E.motorInitiationDelayLongMs.min);
      expect(p.motorDelayMs).toBeLessThanOrEqual(E.motorInitiationDelayLongMs.max);
      expect(p.goAt).toBeGreaterThan(p.decideAt);
      const total = ReactionTimer.reactionMs(p);
      expect(total).toBeGreaterThan(18);
      expect(total).toBeLessThan(70);
      totals.add(Math.round(total * 10));
    }
    expect(totals.size).toBeGreaterThan(50); // varies every time
  });

  it('short-mode (GF-driven) motor delays are shorter than long-mode ones', () => {
    const timer = new ReactionTimer(DEFAULT_PARAMS.escape, new Rng(2));
    let s = 0;
    let l = 0;
    for (let i = 0; i < 200; i++) {
      s += timer.schedule({ firedAt: 0, visualDelayMs: 15, mode: 'short', thetaDotAtFire: 800, latencyScale: 1, penalty: null, alertReduction: 0, stateAtFire: 0 }).motorDelayMs;
      l += timer.schedule({ firedAt: 0, visualDelayMs: 15, mode: 'long', thetaDotAtFire: 100, latencyScale: 1, penalty: null, alertReduction: 0, stateAtFire: 0 }).motorDelayMs;
    }
    expect(s / 200).toBeLessThan(7); // short-mode < 7 ms (von Reyn et al. 2014)
    expect(l / 200).toBeGreaterThanOrEqual(7);
  });

  it('grooming adds a penalty and the latency scale stretches everything', () => {
    const timer = new ReactionTimer(DEFAULT_PARAMS.escape, new Rng(3));
    const base = { firedAt: 0, visualDelayMs: 15, mode: 'long' as const, thetaDotAtFire: 100, alertReduction: 0, stateAtFire: 0 };
    let plain = 0;
    let groom = 0;
    let slow = 0;
    for (let i = 0; i < 200; i++) {
      plain += ReactionTimer.reactionMs(timer.schedule({ ...base, latencyScale: 1, penalty: null }));
      groom += ReactionTimer.reactionMs(timer.schedule({ ...base, latencyScale: 1, penalty: DEFAULT_PARAMS.escape.groomingPenaltyMs }));
      slow += ReactionTimer.reactionMs(timer.schedule({ ...base, latencyScale: 2, penalty: null }));
    }
    expect(groom).toBeGreaterThan(plain * 1.2);
    expect(slow).toBeGreaterThan(plain * 1.3);
  });

  it('simulation outcome does not depend on how steps are grouped into frames', () => {
    const run = (chunk: number) => {
      const sim = new Simulation({ seed: 77 });
      const fly = sim.fly;
      sim.swatter.reset(fly.pos.x + 5, fly.pos.y + 3);
      let steps = 0;
      const total = 1800;
      let struck = false;
      while (steps < total) {
        for (let i = 0; i < chunk && steps < total; i++, steps++) {
          if (!struck && steps === 600) {
            sim.swatter.requestStrike();
            struck = true;
          }
          sim.step();
        }
      }
      return { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, reaction: sim.tracker.lastResult?.reactionMs ?? null };
    };
    const a = run(16);
    const b = run(33);
    const c = run(7);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('a real strike is detected during the swing and the fly moves before impact', () => {
    const sim = new Simulation({ seed: 5 });
    const f = sim.fly;
    sim.swatter.reset(f.pos.x + 4, f.pos.y - 2);
    sim.advance(0.6);
    sim.swatter.requestStrike();
    for (let i = 0; i < 600 && sim.swatter.phase !== SwatterPhase.HOLD; i++) sim.step();
    const r = sim.tracker.lastResult!;
    expect(r).toBeTruthy();
    if (!r.hit && r.threatMs !== null) {
      expect(r.threatMs).toBeLessThan(0);
      expect(r.reactionMs!).toBeGreaterThan(15);
      expect(r.reactionMs!).toBeLessThan(80);
    }
  });
});
