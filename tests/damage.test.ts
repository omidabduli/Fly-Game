import { describe, expect, it } from 'vitest';
import { POSTER_RECT, Scene } from '../src/environment/Scene';
import { BREAKABLES, DamageSystem, MIN_DAMAGE_SPEED, damageRank } from '../src/game/DamageSystem';
import { shapeContains } from '../src/physics/geometry';

const scene = new Scene();
const byId = (id: string) => scene.byId(id);
const obj = (id: string) => scene.byId(id)!;

describe('damage system', () => {
  it('every breakable object exists in the room', () => {
    for (const d of BREAKABLES) for (const id of d.objects) expect(scene.byId(id), `${d.id}/${id}`).toBeDefined();
  });

  it('each hit breaks a thing one stage further and adds its cost to the bill', () => {
    const dmg = new DamageSystem();
    const e1 = dmg.impact(obj('monitor-screen'), 300, 95, 30, 36, 3800, byId)!;
    expect(e1.id).toBe('monitor');
    expect(e1.stage).toBe(1);
    expect(e1.final).toBe(false);
    const e2 = dmg.impact(obj('monitor-bezel'), 300, 95, 30, 36, 3800, byId)!;
    expect(e2.stage).toBe(2);
    expect(e2.final).toBe(true);
    expect(dmg.total).toBe(e1.cost + e2.cost);
    expect(dmg.receipt.map((r) => r.label)).toEqual([e1.label, e2.label]);
    // fully broken things don't cost anything more
    expect(dmg.impact(obj('monitor-screen'), 300, 95, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.total).toBe(e1.cost + e2.cost);
  });

  it('walls, the desk and the monitor stand never break; gentle taps break nothing', () => {
    const dmg = new DamageSystem();
    expect(dmg.impact(obj('desk'), 240, 270, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.impact(obj('wall'), 240, 150, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.impact(obj('monitor-base'), 298, 200, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.impact(obj('phone'), 242, 260, 30, 36, MIN_DAMAGE_SPEED - 1, byId)).toBeNull();
    expect(dmg.total).toBe(0);
  });

  it('hitting the window frame cracks the glass, and the crack is drawn on the glass', () => {
    const dmg = new DamageSystem();
    const e = dmg.impact(obj('window-mullion-h'), 100, 85, 30, 36, 3800, byId)!;
    expect(e.id).toBe('window');
    expect(shapeContains(obj('window-glass').shape, e.x, e.y)).toBe(true);
  });

  it('the swatter landing on the wall over the framed print damages the print', () => {
    const dmg = new DamageSystem();
    const e = dmg.impact(scene.base, POSTER_RECT.x + 10, 5, 30, 36, 3800, byId)!;
    expect(e.id).toBe('poster');
    expect(dmg.impact(scene.base, 60, 170, 30, 36, 3800, byId)).toBeNull();
  });

  it('damage marks always sit on the object that was hit', () => {
    const dmg = new DamageSystem();
    // swatter centre off to the side of the cup: the mark is pulled onto the cup
    const e = dmg.impact(obj('cup-body'), 140, 250, 30, 36, 3800, byId)!;
    expect(shapeContains(obj('cup-body').shape, e.x, e.y)).toBe(true);
  });

  it('reset repairs everything', () => {
    const dmg = new DamageSystem();
    dmg.impact(obj('phone'), 242, 260, 30, 36, 3800, byId);
    const v = dmg.version;
    dmg.reset();
    expect(dmg.total).toBe(0);
    expect(dmg.stage('phone')).toBe(0);
    expect(dmg.receipt).toHaveLength(0);
    expect(dmg.version).toBeGreaterThan(v);
  });

  it('ranks get worse as the bill grows', () => {
    const titles = [0, 20, 200, 800, 2000].map((n) => damageRank(n).title);
    expect(new Set(titles).size).toBe(5);
    expect(titles[0]).toBe('SURGICAL');
  });
});
