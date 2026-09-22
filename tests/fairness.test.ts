import { describe, expect, it } from 'vitest';
import { FlyState } from '../src/fly/Fly';
import { Simulation } from '../src/game/Simulation';
import { Rng } from '../src/math/rng';
import { runAttackTrial } from '../src/sim/SyntheticAttacker';

describe('fair physics invariants', () => {
  it('the fly never teleports and never passes through surfaces', () => {
    const sim = new Simulation({ seed: 21 });
    const rng = new Rng(21);
    let px = sim.fly.pos.x;
    let py = sim.fly.pos.y;
    let pz = sim.fly.pos.z;
    let flyId = sim.fly.id;
    let maxStep = 0;
    let minClearance = Infinity;
    sim.onStep((s) => {
      const f = s.fly;
      if (f.id !== flyId) {
        flyId = f.id;
        px = f.pos.x;
        py = f.pos.y;
        pz = f.pos.z;
        return;
      }
      const d = Math.hypot(f.pos.x - px, f.pos.y - py, f.pos.z - pz);
      if (f.state !== FlyState.DEAD) maxStep = Math.max(maxStep, d);
      px = f.pos.x;
      py = f.pos.y;
      pz = f.pos.z;
      if (f.state !== FlyState.DEAD) minClearance = Math.min(minClearance, f.pos.z - (s.scene.heightAt(f.pos.x, f.pos.y) + f.radius));
    });
    for (let i = 0; i < 80; i++) runAttackTrial(sim, rng.pick(['aimed', 'fast', 'random', 'airborne', 'intercept'] as const), rng);
    // <= max escape speed (1.25 m/s -> 1.25 mm per 1 ms step) plus small collision corrections
    expect(maxStep).toBeLessThan(2.5);
    expect(minClearance).toBeGreaterThan(-0.05);
  });

  it('difficulty changes are never applied in the middle of an attack', () => {
    const sim = new Simulation({ seed: 3 });
    const before = { ...sim.modulation };
    sim.swatter.reset(sim.fly.pos.x, sim.fly.pos.y);
    sim.advance(0.3);
    sim.swatter.requestStrike();
    sim.advance(0.08); // mid-strike
    sim.setModulation({ ...before, thresholdScale: 0.5 });
    sim.advance(0.02);
    expect(sim.modulation.thresholdScale).toBe(before.thresholdScale);
    sim.advance(1.5);
    expect(sim.modulation.thresholdScale).toBe(0.5);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const sim = new Simulation({ seed: 99 });
      const rng = new Rng(99);
      const out: string[] = [];
      for (let i = 0; i < 10; i++) {
        const o = runAttackTrial(sim, 'aimed', rng);
        out.push(o.result ? `${o.result.hit}:${o.result.minGapMm.toFixed(3)}` : 'none');
      }
      return out.join(',');
    };
    expect(run()).toBe(run());
  });
});
