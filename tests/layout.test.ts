import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEATS, Scene, WORLD_H, WORLD_W } from '../src/environment/Scene';
import { BREAKABLES } from '../src/game/DamageSystem';
import { PEOPLE } from '../src/game/People';
import { CAST } from '../src/render/PeopleRenderer';
import { POSES } from '../src/render/SpriteCharacter';

const STARTERS = ['neutral', 'talking', 'happy', 'angry', 'blink'];

describe('the room', () => {
  const diners = SEATS.filter((s) => !s.staff).sort((a, b) => a.x - b.x);

  it('has room for every diner: inside the world and not on top of each other', () => {
    for (const s of SEATS) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(WORLD_W);
    }
    for (let i = 1; i < diners.length; i++) expect(diners[i].x - diners[i - 1].x).toBeGreaterThanOrEqual(120);
  });

  it('keeps every surface inside the world', () => {
    const scene = new Scene();
    for (const o of scene.objects) {
      expect(o.bounds.maxX, o.id).toBeLessThanOrEqual(WORLD_W + 60);
      expect(o.bounds.maxY, o.id).toBeLessThanOrEqual(WORLD_H + 60);
    }
  });

  it('gives every person a name, lines and a damage entry', () => {
    for (const s of SEATS) {
      expect(PEOPLE[s.id], s.id).toBeDefined();
      expect(PEOPLE[s.id].name.length).toBeGreaterThan(0);
      expect(BREAKABLES.some((b) => b.id === s.id), s.id).toBe(true);
    }
  });
});

describe('the character images', () => {
  it('exist for every seated character (a missing file would fall back to the old cartoon)', () => {
    for (const [id, c] of Object.entries(CAST)) {
      expect(c, id).toBeDefined();
      for (const pose of STARTERS) expect(existsSync(`public/characters/${c!.sprite}/${c!.sprite}_${pose}.webp`), `${c!.sprite}_${pose}`).toBe(true);
    }
  });

  it('only use pose names the game knows (a typo in a file name would be ignored silently)', () => {
    for (const c of Object.values(CAST)) {
      const dir = `public/characters/${c!.sprite}`;
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.webp'))) {
        const pose = f.replace(`${c!.sprite}_`, '').replace('.webp', '');
        expect((POSES as readonly string[]).includes(pose), f).toBe(true);
      }
    }
  });
});
