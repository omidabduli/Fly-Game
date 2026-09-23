import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/config/params';
import { EscapePlanner, type PlannerInput, solveReachTime } from '../src/fly/EscapePlanner';
import { EscapeModel } from '../src/fly/flightModel';
import { Rng } from '../src/math/rng';
import { vec3 } from '../src/math/vec';
import { percept, testScene } from './helpers';

const scene = testScene();
const P = DEFAULT_PARAMS;

function input(over: Partial<PlannerInput> = {}): PlannerInput {
  const fly = vec3(300, 280, 150.8); // on the open desk
  return {
    pos: fly,
    vel: vec3(),
    onSurface: true,
    capsuleRadius: 0.8,
    capsuleHalfLength: 1.05,
    percept: percept({
      sampleTime: 0,
      pos: vec3(315, 280, 150 + 200),
      vel: vec3(0, 0, -1800),
      acc: vec3(0, 0, -26000),
      dir: vec3(0, 0, 1),
      sizeR: 36.9,
    }),
    tNow: 0.015,
    tGo: 0.035,
    jumpSpeed: 600,
    jumpDuration: 0.0055,
    accel: 36000,
    maxSpeed: 1250,
    drag: 6,
    headHalfW: 30,
    headHalfH: 36,
    headCorner: 11,
    trueRadius: 36.9,
    landingAzimuth: null,
    prevEscapeAzimuth: null,
    handedness: 0,
    randomness: 1,
    predictionNoiseScale: 1,
    horizonOverrideMs: null,
    predictionEnabled: true,
    motorNoiseDeg: 6,
    minElevationDeg: 12,
    maxElevationDeg: 58,
    allowSurprise: true,
    ...over,
  };
}

describe('predicted swatter impact', () => {
  it('solveReachTime handles constant-velocity, accelerating and receding cases', () => {
    expect(solveReachTime(100, -1000, 0)).toBeCloseTo(0.1, 6);
    // 0.5*a*t^2 = 100 with a = -20000 -> t = 0.1
    expect(solveReachTime(100, 0, -20000)).toBeCloseTo(0.1, 6);
    expect(solveReachTime(100, 500, 0)).toBe(Infinity);
    expect(solveReachTime(-5, 0, 0)).toBe(0);
  });

  it('predicts where a sideways-moving swatter will land', () => {
    const planner = new EscapePlanner(scene, P.planner);
    const inp = input({
      predictionNoiseScale: 0,
      percept: percept({ sampleTime: 0, pos: vec3(260, 280, 350), vel: vec3(400, 0, -2000), acc: vec3(0, 0, -20000), sizeR: 36.9 }),
    });
    const plan = planner.plan(inp, new Rng(1));
    const tImp = solveReachTime(350 - (150.8 + 0.8), -2000, -20000);
    // lateral: 200 + 400*t
    expect(plan.predictedImpact.x).toBeCloseTo(260 + 400 * tImp, 0);
    expect(plan.predictedImpact.y).toBeCloseTo(280, 0);
    // futureSwatterPosition at the horizon (clamped to 30-150 ms)
    expect(plan.horizon).toBeGreaterThanOrEqual(0.03);
    expect(plan.horizon).toBeLessThanOrEqual(0.15);
    expect(plan.futureSwatter.x).toBeCloseTo(260 + 400 * plan.horizon, 0);
  });
});

describe('escape-vector selection', () => {
  it('escapes toward the nearest edge of the predicted footprint (away from the danger zone)', () => {
    const planner = new EscapePlanner(scene, P.planner);
    const rng = new Rng(7);
    let sumX = 0;
    for (let i = 0; i < 40; i++) {
      // swatter centre 15 mm to the +x side of the fly -> exit toward -x is shortest
      const plan = planner.plan(input(), rng);
      sumX += plan.dir.x;
    }
    expect(sumX / 40).toBeLessThan(-0.4);
  });

  it('is not deterministic: the same threat produces a spread of escape directions', () => {
    const planner = new EscapePlanner(scene, P.planner);
    const rng = new Rng(9);
    const az: number[] = [];
    // swatter centred on the fly: many directions are about equally good
    for (let i = 0; i < 40; i++) az.push(planner.plan(input({ percept: percept({ sampleTime: 0, pos: vec3(300, 280, 350), vel: vec3(0, 0, -1800), acc: vec3(0, 0, -26000), sizeR: 36.9 }) }), rng).azimuth);
    const mx = az.reduce((s, a) => s + Math.cos(a), 0) / az.length;
    const my = az.reduce((s, a) => s + Math.sin(a), 0) / az.length;
    const resultant = Math.hypot(mx, my);
    expect(resultant).toBeLessThan(0.97); // clearly not a single fixed direction
  });

  it('avoids flying into obstacles (the side of the coffee cup)', () => {
    const planner = new EscapePlanner(scene, P.planner);
    const rng = new Rng(11);
    // fly on the desk just left of the cup body (x 150..200), swatter centred on its left
    const fly = vec3(144, 232, 150.8);
    let intoCup = 0;
    for (let i = 0; i < 30; i++) {
      const plan = planner.plan(
        input({ pos: fly, percept: percept({ sampleTime: 0, pos: vec3(128, 232, 350), vel: vec3(0, 0, -1800), acc: vec3(0, 0, -26000), sizeR: 36.9 }) }),
        rng,
      );
      const hit = scene.raycast(fly.x, fly.y, fly.z, plan.dir.x, plan.dir.y, plan.dir.z, 12, 0.3);
      if (hit >= 0) intoCup++;
    }
    expect(intoCup).toBeLessThanOrEqual(2);
  });

  it('prefers the side given by its handedness when options are equal', () => {
    const planner = new EscapePlanner(scene, { ...P.planner, wNoise: 0, emergencyProbability: 0, blunderProbability: 0 });
    const run = (handedness: number) => {
      const rng = new Rng(5);
      let s = 0;
      for (let i = 0; i < 20; i++) {
        const plan = planner.plan(input({ handedness, motorNoiseDeg: 0, percept: percept({ sampleTime: 0, pos: vec3(300, 280, 350), dir: vec3(0, 1, 0), vel: vec3(0, 0, -1800), acc: vec3(0, 0, -26000), sizeR: 36.9 }) }), rng);
        s += plan.azimuth;
      }
      return s;
    };
    expect(run(1)).not.toBeCloseTo(run(-1), 1);
  });

  it("the planner's forward model matches the fly's take-off physics", () => {
    const m = new EscapeModel();
    m.reset(vec3(0, 0, 0), vec3(), true);
    const k = { onSurface: true, jumpSpeed: 600, jumpDuration: 0.0055, accel: 36000, maxSpeed: 1250, drag: 6 };
    for (let i = 0; i < 6; i++) m.step(1, 0, 0, k, 0.001, true);
    // exact impulse: 600 mm/s after the 5.5 ms push, plus ~0.5 ms of thrust
    expect(m.vx).toBeGreaterThan(600);
    expect(m.vx).toBeLessThan(625);
    for (let i = 0; i < 200; i++) m.step(1, 0, 0, k, 0.001, true);
    expect(m.vx).toBeCloseTo(1250, -1);
  });
});
