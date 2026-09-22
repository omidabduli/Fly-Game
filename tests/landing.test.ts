import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/config/params';
import { Scene } from '../src/environment/Scene';
import { type LandingContext, LandingSystem } from '../src/fly/LandingSystem';
import { Rng } from '../src/math/rng';

const scene = new Scene();
const ls = new LandingSystem(scene, DEFAULT_PARAMS.landing);

function ctx(over: Partial<LandingContext> = {}): LandingContext {
  return {
    fromX: 240,
    fromY: 150,
    fear: 0.2,
    confidence: 0.5,
    annoyance: 0.1,
    energy: 0.8,
    curiosity: 0.4,
    boldness: 0.4,
    distanceScale: 1,
    swatterX: 240,
    swatterY: 150,
    excludeRadius: 0,
    ...over,
  };
}

describe('landing selection', () => {
  it('always picks a valid, landable spot on the visible top of a surface', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 80; i++) {
      const s = ls.choose(ctx({ fromX: rng.range(0, 480), fromY: rng.range(0, 300) }), rng);
      expect(s.object.landable).toBe(true);
      expect(scene.surfaceAt(s.x, s.y)).toBe(s.object);
      expect(scene.heightAt(s.x, s.y)).toBe(s.z);
      expect(scene.insideWorld(s.x, s.y, 5)).toBe(true);
    }
  });

  it('never lands on liquid (coffee)', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) expect(ls.choose(ctx(), rng).object.id).not.toBe('coffee');
  });

  it('attractive surfaces (fruit) are chosen far more often than their area alone suggests', () => {
    const rng = new Rng(3);
    let fruit = 0;
    const n = 300;
    for (let i = 0; i < n; i++) if (ls.choose(ctx({ fromX: 100, fromY: 200, energy: 0.3 }), rng).object.food) fruit++;
    const foodArea = scene.objects.filter((o) => o.food).reduce((a, o) => a + o.area, 0);
    const totalArea = scene.width * scene.height;
    expect(fruit / n).toBeGreaterThan((foodArea / totalArea) * 3);
  });

  it('fearful flies land farther away and further from the swatter', () => {
    const rng = new Rng(4);
    let calmD = 0;
    let scaredD = 0;
    let calmS = 0;
    let scaredS = 0;
    const n = 250;
    for (let i = 0; i < n; i++) {
      const c = ls.choose(ctx({ fear: 0 }), rng);
      const s = ls.choose(ctx({ fear: 1 }), rng);
      calmD += c.distance;
      scaredD += s.distance;
      calmS += Math.hypot(c.x - 240, c.y - 150);
      scaredS += Math.hypot(s.x - 240, s.y - 150);
    }
    expect(scaredD / n).toBeGreaterThan(calmD / n);
    expect(scaredS / n).toBeGreaterThan(calmS / n);
  });

  it('a fly will not land right under a hovering swatter', () => {
    const site = { x: 240, y: 250, z: 150, object: scene.byId('desk')!, score: 1, shelter: 0, distance: 0 };
    expect(ls.siteThreatened(site, 245, 255, 240, 40)).toBe(true);
    expect(ls.siteThreatened(site, 400, 100, 240, 40)).toBe(false);
  });
});
