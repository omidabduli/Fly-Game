import { describe, expect, it } from 'vitest';
import { POSTER_RECT, Scene } from '../src/environment/Scene';
import { BREAKABLES, DamageSystem, MIN_DAMAGE_SPEED, damageRank, formatMoney } from '../src/game/DamageSystem';
import { shapeContains } from '../src/physics/geometry';

const scene = new Scene();
const byId = (id: string) => scene.byId(id);
const obj = (id: string) => scene.byId(id)!;

describe('damage system', () => {
  it('every breakable object exists in the Mensa', () => {
    for (const d of BREAKABLES) for (const id of d.objects) expect(scene.byId(id), `${d.id}/${id}`).toBeDefined();
  });

  it('each hit breaks a thing one stage further and adds its cost to the bill', () => {
    const dmg = new DamageSystem();
    const e1 = dmg.impact(obj('laptop-lid'), 342, 230, 30, 36, 3800, byId)!;
    expect(e1.id).toBe('laptop');
    expect(e1.owner).toBe('lukas');
    expect(e1.stage).toBe(1);
    expect(e1.final).toBe(false);
    const e2 = dmg.impact(obj('laptop-keys'), 342, 275, 30, 36, 3800, byId)!;
    expect(e2.stage).toBe(2);
    expect(e2.final).toBe(true);
    expect(dmg.total).toBe(e1.cost + e2.cost);
    expect(dmg.receipt.map((r) => r.label)).toEqual([e1.label, e2.label]);
    // fully broken things don't cost anything more
    expect(dmg.impact(obj('laptop-lid'), 342, 230, 30, 36, 3800, byId)).toBeNull();
  });

  it('hitting a person costs Schmerzensgeld', () => {
    const dmg = new DamageSystem();
    const e = dmg.impact(obj('juergen-head'), 88, 110, 30, 36, 3800, byId)!;
    expect(e.id).toBe('juergen');
    expect(e.kind).toBe('person');
    expect(e.label).toMatch(/Schmerzensgeld/);
  });

  it('cents add up exactly', () => {
    const dmg = new DamageSystem();
    dmg.impact(obj('currywurst'), 72, 262, 30, 36, 3800, byId); // 3,20
    dmg.impact(obj('fries'), 97, 267, 30, 36, 3800, byId); // 2,10
    dmg.impact(obj('mate-cap'), 391, 204, 30, 36, 3800, byId); // 2,20
    expect(dmg.total).toBe(7.5);
    expect(formatMoney(dmg.total)).toBe('7,50 €');
    expect(formatMoney(1250)).toBe('1.250 €');
  });

  it('the wall and the table never break; gentle taps break nothing', () => {
    const dmg = new DamageSystem();
    expect(dmg.impact(obj('table'), 240, 305, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.impact(obj('wall'), 360, 200, 30, 36, 3800, byId)).toBeNull();
    expect(dmg.impact(obj('phone'), 537, 265, 30, 36, MIN_DAMAGE_SPEED - 1, byId)).toBeNull();
    expect(dmg.total).toBe(0);
  });

  it('hitting the window frame cracks the glass, and the crack is drawn on the glass', () => {
    const dmg = new DamageSystem();
    const e = dmg.impact(obj('window-mullion-h'), 460, 66, 30, 36, 3800, byId)!;
    expect(e.id).toBe('window');
    expect(shapeContains(obj('window-glass').shape, e.x, e.y)).toBe(true);
  });

  it('the swatter landing on the wall over the poster tears the poster', () => {
    const dmg = new DamageSystem();
    const e = dmg.impact(scene.base, POSTER_RECT.x + 20, POSTER_RECT.y + 20, 30, 36, 3800, byId)!;
    expect(e.id).toBe('poster');
  });

  it('damage marks always sit on the object that was hit', () => {
    const dmg = new DamageSystem();
    // swatter centre off to the side of the cup: the mark is pulled onto the cup
    const e = dmg.impact(obj('cup-body'), 280, 270, 30, 36, 3800, byId)!;
    expect(shapeContains(obj('cup-body').shape, e.x, e.y)).toBe(true);
  });

  it('reset cleans everything up', () => {
    const dmg = new DamageSystem();
    dmg.impact(obj('phone'), 537, 265, 30, 36, 3800, byId);
    const v = dmg.version;
    dmg.reset();
    expect(dmg.total).toBe(0);
    expect(dmg.stage('phone')).toBe(0);
    expect(dmg.receipt).toHaveLength(0);
    expect(dmg.version).toBeGreaterThan(v);
  });

  it('ranks get worse as the bill grows', () => {
    const titles = [0, 10, 100, 500, 2000].map((n) => damageRank(n).title);
    expect(new Set(titles).size).toBe(5);
    expect(titles[0]).toBe('SAUBER');
    expect(titles[4]).toBe('TOTALSCHADEN');
  });

  it('things on the table never shield the fly (they are within the mesh flex of the tabletop)', () => {
    const table = obj('table');
    for (const o of scene.objects) {
      const b = o.bounds;
      if (b.minY < table.bounds.minY - 60 || o === table) continue;
      if (b.maxY <= table.bounds.minY) continue;
      expect(o.top - table.top, o.id).toBeLessThan(5.6);
    }
  });
});
