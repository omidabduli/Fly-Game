import { describe, expect, it } from 'vitest';
import { DamageSystem } from '../src/game/DamageSystem';
import { PEOPLE, PeopleSystem, type PeopleWorld } from '../src/game/People';

const damage = new DamageSystem();
const ownerOf = (id: string) => damage.ofObject(id)?.owner ?? null;

function world(time: number, surfaceId: string | null, x = 72, y = 262): PeopleWorld {
  return {
    time,
    fly: { x, y, alive: true, airborne: surfaceId === null, resting: surfaceId !== null, surfaceId },
    swatter: { x: 500, y: 40, active: true, striking: false },
  };
}

/** Run the people for `secs`; returns who shooed the fly (if anyone). */
function run(people: PeopleSystem, secs: number, surfaceId: string | null, t0 = 0): string | null {
  let shoo: string | null = null;
  for (let t = 0; t < secs; t += 1 / 60) shoo = people.update(1 / 60, world(t0 + t, surfaceId)) ?? shoo;
  return shoo;
}

describe('people in the Mensa', () => {
  it('everyone has something to say in every situation', () => {
    for (const p of Object.values(PEOPLE)) for (const [kind, lines] of Object.entries(p.lines)) expect(lines.length, `${p.id}.${kind}`).toBeGreaterThan(0);
  });

  it('Jürgen shoos the fly off his Currywurst after a few seconds', () => {
    const people = new PeopleSystem(ownerOf);
    expect(run(people, 1, 'currywurst')).toBeNull();
    expect(run(people, 5, 'currywurst', 1)).toBe('juergen');
  });

  it('Mia never shoos the fly away', () => {
    const people = new PeopleSystem(ownerOf);
    expect(run(people, 10, 'salad')).toBeNull();
  });

  it('a hit on the head hurts, a swing nearby scares', () => {
    const people = new PeopleSystem(ownerOf);
    people.onImpact(88, 110, 'juergen-head');
    const j = people.get('juergen');
    expect(j.mood).toBe('hurt');
    expect(j.hurtT).toBeGreaterThan(0);
    expect(j.bubble).not.toBeNull();
    people.onImpact(250, 150, 'wall');
    expect(people.get('schmidt').flinch).toBeGreaterThan(0);
  });

  it('when the fly is caught everyone cheers, except Mia', () => {
    const people = new PeopleSystem(ownerOf);
    people.onKill();
    expect(people.get('juergen').mood).toBe('happy');
    expect(people.get('juergen').clapT).toBeGreaterThan(0);
    expect(people.get('mia').mood).toBe('sad');
  });

  it('has real conversations: several people, taking turns, and nobody talks over the next speaker', () => {
    const people = new PeopleSystem(ownerOf);
    const speakers = new Set<string>();
    let lines = 0;
    let overlapFrames = 0;
    let frames = 0;
    let last = '';
    for (let t = 0; t < 200; t += 1 / 30) {
      people.update(1 / 30, world(t, 'table', 300, 300));
      const talking = people.people.filter((p) => p.bubble && p.bubble.t < p.bubble.life - 0.2);
      for (const p of talking) {
        speakers.add(p.def.id);
        const key = `${p.def.id}:${p.bubble!.text}`;
        if (key !== last && p.bubble!.t < 0.1) lines++;
        if (p.bubble!.t < 0.1) last = key;
      }
      frames++;
      if (talking.length > 1) overlapFrames++;
    }
    expect(speakers.size).toBeGreaterThanOrEqual(4);
    expect(lines).toBeGreaterThan(12);
    // two people may briefly overlap at the hand-over, but it is the exception
    expect(overlapFrames / frames).toBeLessThan(0.15);
  });
});
