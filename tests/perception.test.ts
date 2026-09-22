import { describe, expect, it } from 'vitest';
import { Rng } from '../src/math/rng';
import { DEG, vec3 } from '../src/math/vec';
import { GiantFiber } from '../src/neuroscience/GiantFiber';
import { LoomingDetector, rectSigmoid } from '../src/neuroscience/LoomingDetector';
import { equivalentHeadRadius, VisualSystem } from '../src/neuroscience/VisualSystem';
import { SwatterHistory } from '../src/physics/SwatterHistory';
import { percept, quietParams } from './helpers';

/** Fill a history with a swatter moving at constant velocity from p0. */
function linearHistory(p0: [number, number, number], v: [number, number, number], t0: number, t1: number, dt = 0.001): SwatterHistory {
  const h = new SwatterHistory(Math.ceil((t1 - t0) / dt) + 10);
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const k = t - t0;
    h.push(t, p0[0] + v[0] * k, p0[1] + v[1] * k, p0[2] + v[2] * k, v[0], v[1], v[2], true);
  }
  return h;
}

describe('time-to-collision (optical tau)', () => {
  it('tau = θ/θ̇ approximates the true time to contact of an approaching swatter', () => {
    const P = quietParams();
    const R = equivalentHeadRadius(34, 40, 12);
    const vis = new VisualSystem(P.perception, R, 3, new Rng(1));
    vis.delayMs = 0;
    const speed = 2000; // mm/s straight down
    const hist = linearHistory([0, 0, 400], [0, 0, -speed], 0, 0.1);
    const fly = vec3(0, 0, 0);
    const pc = vis.sample(0.1, 0.001, hist, fly, vec3(), 1 / 1e9);
    const d = 400 - speed * 0.1 + 1.5; // distance to head centre
    const trueTTC = d / speed;
    expect(pc.valid).toBe(true);
    expect(pc.thetaDot).toBeGreaterThan(0);
    expect(pc.tau).toBeGreaterThan(trueTTC * 0.9);
    expect(pc.tau).toBeLessThan(trueTTC * 1.15);
  });

  it('a receding or stationary swatter has no finite tau', () => {
    const P = quietParams();
    const vis = new VisualSystem(P.perception, 41, 3, new Rng(1));
    const hist = linearHistory([0, 0, 200], [0, 0, 500], 0, 0.1);
    const pc = vis.sample(0.1, 0.001, hist, vec3(), vec3(), 0.001);
    expect(pc.thetaDot).toBeLessThan(0);
    expect(pc.tau).toBe(Infinity);
  });

  it('the fly sees the past: the percept lags by the visual delay', () => {
    const P = quietParams();
    const vis = new VisualSystem(P.perception, 41, 3, new Rng(1));
    vis.delayMs = 20;
    const hist = linearHistory([0, 0, 300], [1000, 0, 0], 0, 0.2);
    const pc = vis.sample(0.2, 0.001, hist, vec3(), vec3(), 1);
    expect(pc.sampleTime).toBeCloseTo(0.18, 3);
    expect(pc.pos.x).toBeCloseTo(180, 0);
  });
});

describe('threat detection (looming vs. sideways motion)', () => {
  it('rectSigmoid is 0 at 0, 1 for large inputs, monotonic', () => {
    expect(rectSigmoid(0, 60, 24)).toBe(0);
    expect(rectSigmoid(-50, 60, 24)).toBe(0);
    expect(rectSigmoid(1000, 60, 24)).toBeGreaterThan(0.99);
    expect(rectSigmoid(80, 60, 24)).toBeGreaterThan(rectSigmoid(40, 60, 24));
  });

  it('a fast looming stimulus makes the escape neuron fire', () => {
    const P = quietParams();
    const loom = new LoomingDetector(P.looming);
    const gf = new GiantFiber(P.looming, 200, new Rng(2));
    let fired = false;
    for (let i = 0; i < 60 && !fired; i++) {
      const l = loom.update(percept({ theta: 35 * DEG, thetaDot: 300 * DEG, lateralRate: 0 }), 0.001);
      fired = gf.update(l, 0.001, { alert: 0.25, escape: 0.6 }, i * 0.001, 0).fired;
    }
    expect(fired).toBe(true);
  });

  it('the same object moving sideways only alerts, it never triggers an escape', () => {
    const P = quietParams();
    const loom = new LoomingDetector(P.looming);
    const gf = new GiantFiber(P.looming, 200, new Rng(3));
    let fired = false;
    let alert = false;
    for (let i = 0; i < 300; i++) {
      // strong translational motion, slight approach component
      const l = loom.update(percept({ theta: 20 * DEG, thetaDot: 30 * DEG, lateralRate: 400 * DEG }), 0.001);
      const o = gf.update(l, 0.001, { alert: 0.25, escape: 0.6 }, i * 0.001, 0);
      fired ||= o.fired;
      alert ||= l.motion * P.looming.motionAlertGain >= 0.25;
    }
    expect(fired).toBe(false);
    expect(alert).toBe(true);
  });

  it('threatLevel stays within 0..1 and rises with looming speed', () => {
    const P = quietParams();
    const levels = [30, 90, 200, 600].map((td) => {
      const loom = new LoomingDetector(P.looming);
      const gf = new GiantFiber(P.looming, 200, new Rng(4));
      let o = gf.output;
      for (let i = 0; i < 80; i++) o = gf.update(loom.update(percept({ theta: 25 * DEG, thetaDot: td * DEG }), 0.001), 0.001, { alert: 0.25, escape: 2 }, i * 0.001, 0);
      return o.threatLevel;
    });
    for (const l of levels) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
    }
    expect(levels[1]).toBeGreaterThan(levels[0]);
    expect(levels[3]).toBeGreaterThan(levels[1]);
  });

  it('the escape neuron fires once per looming event (latch + refractory period)', () => {
    const P = quietParams();
    const loom = new LoomingDetector(P.looming);
    const gf = new GiantFiber(P.looming, 200, new Rng(5));
    let fires = 0;
    for (let i = 0; i < 150; i++) {
      const o = gf.update(loom.update(percept({ theta: 40 * DEG, thetaDot: 500 * DEG }), 0.001), 0.001, { alert: 0.25, escape: 0.6 }, i * 0.001, 0);
      if (o.fired) fires++;
    }
    expect(fires).toBe(1);
  });
});
