import type { AttackResult } from '../game/AttackTracker';
import type { Simulation } from '../game/Simulation';
import { FlyState } from '../fly/Fly';
import type { Rng } from '../math/rng';
import { clamp } from '../math/vec';
import { SwatterPhase } from '../player/Swatter';

export type AttackType =
  | 'random'
  | 'aimed'
  | 'precise'
  | 'fast'
  | 'slow'
  | 'predictive'
  | 'intercept'
  | 'ambush'
  | 'airborne'
  | 'landing';

export interface AttackSpec {
  label: string;
  description: string;
  /** weight in the "typical player" mix */
  weight: number;
  skilled: boolean;
}

export const ATTACK_TYPES: Record<AttackType, AttackSpec> = {
  random: { label: 'Random', description: 'swat somewhere near the fly (uniform ±45 mm)', weight: 0.14, skilled: false },
  aimed: { label: 'Aimed', description: 'typical aimed swat (σ = 9 mm)', weight: 0.34, skilled: false },
  fast: { label: 'Fast', description: 'snap swat while still moving the swatter over', weight: 0.14, skilled: false },
  slow: { label: 'Slow', description: 'slow creeping approach, long hover, then swat', weight: 0.06, skilled: false },
  precise: { label: 'Precise', description: 'careful creep + centred aim (σ = 3 mm)', weight: 0.1, skilled: true },
  predictive: { label: 'Predictive', description: 'centred swat that sweeps toward the guessed escape side', weight: 0.07, skilled: true },
  intercept: { label: 'Intercept', description: 'sideways sweeping swat timed to cross the fly at impact', weight: 0.06, skilled: true },
  ambush: { label: 'Ambush', description: 'wait for grooming/walking, then precise swat', weight: 0.05, skilled: true },
  airborne: { label: 'Airborne', description: 'swat at a flying fly (led by 150 ms)', weight: 0.02, skilled: false },
  landing: { label: 'Landing', description: 'swat at the landing spot as the fly touches down', weight: 0.02, skilled: true },
};

export interface TrialOutcome {
  type: AttackType;
  result: AttackResult | null;
  steps: number;
}

function gauss2(rng: Rng, sd: number): [number, number] {
  return [rng.normal(0, sd), rng.normal(0, sd)];
}

/**
 * Runs one synthetic attack against a freshly landed fly. The attacker only
 * moves the aim point and presses "strike", the same controls a player has, so
 * any hit comes from the physics and the fly's own limits.
 */
export function runAttackTrial(sim: Simulation, type: AttackType, rng: Rng, maxSetupSeconds = 12): TrialOutcome {
  const startSteps = Math.round(sim.time / sim.dt);
  const sw = sim.swatter;
  sw.active = true;

  // --- a fly lands somewhere, like it would in the game --------------------
  const tmp = sim.fly.brain.landing.choose(
    {
      fromX: rng.range(0, sim.scene.width),
      fromY: rng.range(0, sim.scene.height),
      fear: rng.range(0, 0.6),
      confidence: rng.range(0.3, 0.7),
      annoyance: rng.range(0, 0.4),
      energy: rng.range(0.4, 1),
      curiosity: 0.4,
      boldness: 0.4,
      distanceScale: 1,
      swatterX: rng.range(0, sim.scene.width),
      swatterY: rng.range(0, sim.scene.height),
      excludeRadius: 0,
    },
    rng,
  );
  const fly = sim.spawnFly({ at: tmp });
  const pers = fly.personality;
  pers.alertness = rng.range(0, 0.7);
  pers.fear = rng.range(0, 0.5);
  pers.energy = rng.range(0.45, 1);

  // Swatter starts hovering somewhere around the fly.
  const a0 = rng.range(0, Math.PI * 2);
  const d0 = rng.range(80, 220);
  const sx = clamp(fly.pos.x + Math.cos(a0) * d0, 10, sim.scene.width - 10);
  const sy = clamp(fly.pos.y + Math.sin(a0) * d0, 10, sim.scene.height - 10);
  sw.reset(sx, sy);
  sim.advance(rng.range(0.15, 0.9));

  let result: AttackResult | null = null;
  const off = sim.on((e) => {
    if (e.type === 'attackResolved') result = e.result;
  });
  const done = () => {
    off();
    return { type, result, steps: Math.round(sim.time / sim.dt) - startSteps };
  };
  const waitUntil = (pred: () => boolean, maxS: number): boolean => {
    const n = Math.round(maxS / sim.dt);
    for (let i = 0; i < n; i++) {
      if (pred()) return true;
      sim.step();
    }
    return pred();
  };
  /** Move the aim point toward (x, y) at `speed` mm/s (∞ = jump). */
  const glide = (x: number, y: number, speed: number) => {
    if (!Number.isFinite(speed)) {
      sw.setTarget(x, y);
      return;
    }
    const n = Math.max(1, Math.round(Math.hypot(x - sw.targetX, y - sw.targetY) / (speed * sim.dt)));
    const x0 = sw.targetX;
    const y0 = sw.targetY;
    for (let i = 1; i <= n; i++) {
      sw.setTarget(x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n);
      sim.step();
      if (!fly.onSurface && type !== 'airborne' && type !== 'landing') return;
    }
  };
  const strikeAndWait = (during?: () => void) => {
    sw.requestStrike();
    for (let i = 0; i < 1500 && !result; i++) {
      during?.();
      sim.step();
    }
  };

  switch (type) {
    case 'random': {
      const ang = rng.range(0, Math.PI * 2);
      const rr = 45 * Math.sqrt(rng.next());
      glide(fly.pos.x + Math.cos(ang) * rr, fly.pos.y + Math.sin(ang) * rr, Infinity);
      sim.advance(rng.range(0.2, 0.7));
      strikeAndWait();
      break;
    }
    case 'aimed': {
      const [ex, ey] = gauss2(rng, 9);
      glide(fly.pos.x + ex, fly.pos.y + ey, Infinity);
      sim.advance(rng.range(0.15, 0.7));
      if (!fly.onSurface) break;
      strikeAndWait();
      break;
    }
    case 'fast': {
      const [ex, ey] = gauss2(rng, 12);
      sw.setTarget(fly.pos.x + ex, fly.pos.y + ey);
      sim.advance(rng.range(0.0, 0.08));
      strikeAndWait();
      break;
    }
    case 'slow': {
      const [ex, ey] = gauss2(rng, 8);
      glide(fly.pos.x + ex, fly.pos.y + ey, 60);
      sim.advance(rng.range(0.8, 2.0));
      if (!fly.onSurface) break;
      strikeAndWait();
      break;
    }
    case 'precise': {
      const [ex, ey] = gauss2(rng, 3);
      glide(fly.pos.x + ex, fly.pos.y + ey, 150);
      sim.advance(rng.range(0.3, 0.9));
      if (!fly.onSurface) break;
      const [fx, fy] = gauss2(rng, 2);
      sw.setTarget(fly.pos.x + fx, fly.pos.y + fy);
      strikeAndWait();
      break;
    }
    case 'predictive': {
      const [ex, ey] = gauss2(rng, 4);
      glide(fly.pos.x + ex, fly.pos.y + ey, 200);
      sim.advance(rng.range(0.2, 0.6));
      if (!fly.onSurface) break;
      // Guess the escape side: the fly usually leaves across the head's short axis,
      // toward the side with more free space.
      const left = sim.scene.raycast(fly.pos.x, fly.pos.y, fly.pos.z, -1, 0, 0.4, 80, 0.5);
      const right = sim.scene.raycast(fly.pos.x, fly.pos.y, fly.pos.z, 1, 0, 0.4, 80, 0.5);
      const lScore = left < 0 ? 80 : left;
      const rScore = right < 0 ? 80 : right;
      const dir = lScore === rScore ? rng.sign() : lScore > rScore ? -1 : 1;
      // Late, short lead: ~60 ms before impact, shift the head 25-40 mm toward
      // the side the fly is expected to flee to (too late for a clean re-plan).
      const lead = rng.range(25, 40);
      const leadAt = rng.range(0.07, 0.095);
      const baseX = sw.targetX;
      const baseY = sw.targetY;
      let started = -1;
      strikeAndWait(() => {
        if (sw.phase === SwatterPhase.SWING) {
          if (started < 0) started = sim.time;
          if (sim.time - started > leadAt) sw.setTarget(baseX + dir * lead, baseY);
        }
      });
      break;
    }
    case 'intercept': {
      // Start to one side, sweep across so the head centre passes over the fly at impact.
      const ang = rng.range(0, Math.PI * 2);
      const speed = rng.range(500, 1100);
      const T = 0.2; // ~ prep + swing
      const ox = -Math.cos(ang) * speed * T * 0.55;
      const oy = -Math.sin(ang) * speed * T * 0.55;
      glide(fly.pos.x + ox, fly.pos.y + oy, 400);
      sim.advance(rng.range(0.2, 0.5));
      if (!fly.onSurface) break;
      const bx = fly.pos.x + ox;
      const by = fly.pos.y + oy;
      const t0 = sim.time;
      strikeAndWait(() => {
        const tt = sim.time - t0;
        sw.setTarget(bx + Math.cos(ang) * speed * tt, by + Math.sin(ang) * speed * tt);
      });
      break;
    }
    case 'ambush': {
      const [ex, ey] = gauss2(rng, 5);
      glide(fly.pos.x + ex * 3, fly.pos.y + ey * 3, 120);
      const ok = waitUntil(() => fly.state === FlyState.GROOMING || fly.state === FlyState.WALKING || !fly.onSurface, maxSetupSeconds);
      if (!ok || !fly.onSurface) break;
      const [fx, fy] = gauss2(rng, 4);
      sw.setTarget(fly.pos.x + fx, fly.pos.y + fy);
      sim.advance(0.03);
      if (!fly.onSurface) break;
      strikeAndWait();
      break;
    }
    case 'airborne': {
      // Scare the fly into the air with a quick pass, then swat where it is heading.
      glide(fly.pos.x, fly.pos.y, Infinity);
      sim.advance(0.1);
      sw.requestStrike();
      waitUntil(() => fly.airborne, 0.6);
      waitUntil(() => sw.phase === SwatterPhase.IDLE, 1.2);
      result = null;
      const ok = waitUntil(() => fly.state === FlyState.FLYING && fly.flight.mode === 'cruise', 3);
      if (!ok) break;
      // Human visuomotor tracking: the aim follows where the fly was ~150 ms ago,
      // extrapolated by its velocity at that time.
      const lagSteps = Math.round(0.15 / sim.dt);
      const hist: [number, number, number, number][] = [];
      const trackStep = () => {
        hist.push([fly.pos.x, fly.pos.y, fly.vel.x, fly.vel.y]);
        if (hist.length > lagSteps) hist.shift();
        const [hx, hy, hvx, hvy] = hist[0];
        const lead = 0.15 + 0.15;
        sw.setTarget(hx + hvx * lead, hy + hvy * lead);
      };
      const follow = Math.round(rng.range(0.25, 0.6) / sim.dt);
      for (let i = 0; i < follow; i++) {
        trackStep();
        sim.step();
      }
      if (fly.state !== FlyState.FLYING) break;
      strikeAndWait(() => {
        if (sw.phase === SwatterPhase.PREP) trackStep();
      });
      break;
    }
    case 'landing': {
      glide(fly.pos.x, fly.pos.y, Infinity);
      sim.advance(0.08);
      sw.requestStrike();
      waitUntil(() => fly.airborne, 0.6);
      result = null;
      waitUntil(() => sw.phase === SwatterPhase.IDLE, 1.2);
      // Park the swatter out of the way so the fly comes down, then pounce
      // the moment it commits to landing.
      sw.setTarget(fly.pos.x < sim.scene.width / 2 ? sim.scene.width - 40 : 40, 40);
      const ok = waitUntil(() => fly.state === FlyState.LANDING, 8);
      if (!ok) break;
      const site = fly.flight.site ?? { x: fly.pos.x, y: fly.pos.y };
      const [ex, ey] = gauss2(rng, 6);
      sw.setTarget(site.x + ex, site.y + ey);
      sim.advance(rng.range(0.0, 0.1));
      strikeAndWait();
      break;
    }
  }
  return done();
}
