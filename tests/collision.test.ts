import { describe, expect, it } from 'vitest';
import { Scene } from '../src/environment/Scene';
import { FlyState } from '../src/fly/Fly';
import { Simulation } from '../src/game/Simulation';
import { ellipse, rect, sdRoundRect, shapeOverlapsRoundRect } from '../src/physics/geometry';
import { slabGap, SwatterPhase } from '../src/player/Swatter';

describe('geometry', () => {
  it('rounded-rect SDF: inside negative, edges zero, corners rounded', () => {
    expect(sdRoundRect(0, 0, 0, 0, 34, 40, 12)).toBeCloseTo(-34, 6);
    expect(sdRoundRect(34, 0, 0, 0, 34, 40, 12)).toBeCloseTo(0, 6);
    expect(sdRoundRect(44, 0, 0, 0, 34, 40, 12)).toBeCloseTo(10, 6);
    // diagonal corner: distance to the rounded corner arc
    const cx = 34 - 12;
    const cy = 40 - 12;
    expect(sdRoundRect(cx + 20 / Math.SQRT2, cy + 20 / Math.SQRT2, 0, 0, 34, 40, 12)).toBeCloseTo(8, 6);
  });

  it('shape vs footprint overlap tests', () => {
    expect(shapeOverlapsRoundRect(rect(0, 0, 10, 10), 24, 5, 15, 15, 3)).toBe(true);
    expect(shapeOverlapsRoundRect(rect(0, 0, 10, 10), 40, 5, 15, 15, 3)).toBe(false);
    expect(shapeOverlapsRoundRect(ellipse(0, 0, 20, 5), 0, 30, 10, 10, 2)).toBe(false);
    expect(shapeOverlapsRoundRect(ellipse(0, 0, 20, 5), 0, 14, 10, 10, 2)).toBe(true);
  });

  it('slab gap is 0 at contact and grows with separation', () => {
    expect(slabGap(0, 0, 10, 0, 0, 10, 34, 40, 12, 3)).toBeLessThanOrEqual(0);
    expect(slabGap(0, 0, 0, 0, 0, 10, 34, 40, 12, 3)).toBeCloseTo(10, 6);
    expect(slabGap(44, 0, 10, 0, 0, 10, 34, 40, 12, 3)).toBeCloseTo(10, 6);
  });
});

describe('heightfield & swatter contact', () => {
  const scene = new Scene();

  it('heights follow the scene layout (max rule)', () => {
    expect(scene.heightAt(240, 280)).toBe(150); // desk
    expect(scene.heightAt(175, 220)).toBe(225); // cup body
    expect(scene.heightAt(60, 60)).toBe(0); // window glass
    expect(scene.heightAt(300, 100)).toBe(110); // monitor
  });

  it('the swatter stops at the tallest surface under its head', () => {
    expect(scene.maxHeightInRoundRect(300, 276, 30, 36, 11).height).toBe(151); // open desk (crumbs)
    // overlapping the cup -> contact on the cup
    const g = scene.maxHeightInRoundRect(170, 230, 30, 36, 11);
    expect(g.height).toBe(225);
    expect(g.object.id).toMatch(/cup/);
  });
});

function simWithFlyOn(x: number, y: number, seed = 1): Simulation {
  const sim = new Simulation({ seed });
  // no spontaneous walking/grooming/take-offs: a motionless target
  const B = sim.params.behavior;
  B.walkRate = B.groomRate = B.turnRate = B.spontaneousTakeoffRate = B.boredomTakeoffRate = B.preemptiveTakeoffRate = 0;
  const s = sim.scene.surfaceAt(x, y);
  sim.spawnFly({ at: { x, y, z: s.top, object: s, score: 1, shelter: 0, distance: 0 } });
  sim.setModulation({ ...sim.modulation, escapeEnabled: false }, true);
  sim.fly.personality.alertness = 0;
  return sim;
}

function strikeAt(sim: Simulation, x: number, y: number): void {
  sim.swatter.reset(x, y);
  sim.advance(0.05);
  sim.swatter.requestStrike();
  for (let i = 0; i < 600 && sim.swatter.phase !== SwatterPhase.HOLD; i++) sim.step();
  sim.advance(0.01);
}

describe('collision detection (swatter vs. fly)', () => {
  it('a motionless fly under the head is hit; one outside it is not', () => {
    const a = simWithFlyOn(300, 280);
    strikeAt(a, 306, 276);
    expect(a.fly.state).toBe(FlyState.DEAD);
    const b = simWithFlyOn(300, 280);
    strikeAt(b, 300 + 30 + 5, 280); // head edge 5 mm away from the fly's centre
    expect(b.fly.state).not.toBe(FlyState.DEAD);
    expect(b.tracker.lastResult?.minGapMm).toBeGreaterThan(2.5);
    expect(b.tracker.lastResult?.minGapMm).toBeLessThan(4.5);
  });

  it('a hit is reported with gap 0 and the fly never moves afterwards', () => {
    const sim = simWithFlyOn(300, 280, 3);
    strikeAt(sim, 300, 280);
    const r = sim.tracker.lastResult!;
    expect(r.hit).toBe(true);
    expect(r.minGapMm).toBe(0);
    const x = sim.fly.pos.x;
    const y = sim.fly.pos.y;
    sim.advance(1);
    expect(sim.fly.pos.x).toBe(x);
    expect(sim.fly.pos.y).toBe(y);
  });

  it('a taller neighbour shelters a fly (the swatter is stopped above it)', () => {
    // fly on the desk just left of the cup; head overlaps the cup
    const sim = simWithFlyOn(143, 250, 4);
    strikeAt(sim, 140, 250);
    expect(sim.fly.state).not.toBe(FlyState.DEAD);
    expect(sim.tracker.lastResult?.sheltered).toBe(true);
  });

  it('small steps do not shelter (the mesh flexes)', () => {
    // fly on the window glass (0), head overlapping the 4 mm frame
    const sim = simWithFlyOn(60, 60, 5);
    strikeAt(sim, 60, 70);
    expect(sim.fly.state).toBe(FlyState.DEAD);
  });

  it('continuous (swept) test catches a fly the head passes through within one step', () => {
    const sim = simWithFlyOn(300, 280, 6);
    // put the fly in the air, 60 mm above the desk, directly under the swatter's path
    sim.fly.placeInAir({ x: 300, y: 280, z: 210 }, { x: 0, y: 0, z: 0 }, sim.time);
    sim.fly.flight.startCruise(sim.time, 0, 10);
    sim.fly.flight.cruiseSpeed = 0;
    sim.fly.flight.altitude = 60;
    sim.fly.flight.nextSaccadeAt = Infinity;
    strikeAt(sim, 300, 280);
    expect(sim.fly.state).toBe(FlyState.DEAD);
    expect(sim.tracker.lastResult?.airborneHit).toBe(true);
  });
});
