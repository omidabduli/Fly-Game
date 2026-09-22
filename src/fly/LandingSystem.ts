import type { SimParams } from '../config/params';
import type { Scene, SurfaceObject } from '../environment/Scene';
import type { Rng } from '../math/rng';
import { clamp01, lerp } from '../math/vec';
import { randomPointInShape } from '../physics/geometry';

export interface LandingSite {
  x: number;
  y: number;
  /** elevation of the surface top (mm) */
  z: number;
  object: SurfaceObject;
  score: number;
  shelter: number;
  distance: number;
}

export interface LandingContext {
  fromX: number;
  fromY: number;
  fear: number;
  confidence: number;
  annoyance: number;
  energy: number;
  curiosity: number;
  boldness: number;
  /** difficulty/lab multiplier on preferred landing distance */
  distanceScale: number;
  /** where the swatter currently is (to avoid it, unless the fly is bold) */
  swatterX: number;
  swatterY: number;
  /** skip sites within this radius of (fromX, fromY) */
  excludeRadius: number;
}

/**
 * Chooses where to land. Each surface has a base attractiveness (fruit, sugar
 * on the cup rim, bright window, warm lamp shade ...). Candidate points are
 * scored by attractiveness * preferred distance * safety * shelter and one is
 * sampled with a softmax, so the fly sometimes lands right next to the player,
 * sometimes far away, and when it's scared it likes sheltered spots where
 * something taller blocks the swatter.
 */
export class LandingSystem {
  private readonly weights: number[];
  private readonly landable: SurfaceObject[];

  constructor(
    private readonly scene: Scene,
    private readonly P: SimParams['landing'],
  ) {
    this.landable = scene.objects.filter((o) => o.landable);
    this.weights = this.landable.map((o) => o.attract * Math.sqrt(o.area) + 2);
  }

  /** Is (x, y) a valid spot to stand on? */
  validSpot(x: number, y: number, object: SurfaceObject, inset: number): boolean {
    if (!this.scene.insideWorld(x, y, 6)) return false;
    const top = this.scene.surfaceAt(x, y);
    if (top !== object || !top.landable) return false;
    // Keep away from the rim of the visible top (including covering objects).
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const h = this.scene.heightAt(x + Math.cos(a) * inset, y + Math.sin(a) * inset);
      if (Math.abs(h - object.top) > 0.5) return false;
      const s = this.scene.surfaceAt(x + Math.cos(a) * inset, y + Math.sin(a) * inset);
      if (!s.landable) return false;
    }
    return true;
  }

  randomValidSpot(rng: Rng): LandingSite {
    for (let i = 0; i < 400; i++) {
      const o = this.landable[rng.weightedIndex(this.weights)];
      const p = randomPointInShape(o.shape, () => rng.next(), this.P.edgeInsetMm);
      if (p && this.validSpot(p.x, p.y, o, this.P.edgeInsetMm)) {
        return { x: p.x, y: p.y, z: o.top, object: o, score: 1, shelter: this.scene.shelterAt(p.x, p.y), distance: 0 };
      }
    }
    const desk = this.scene.byId('desk') ?? this.scene.base;
    return { x: 240, y: 250, z: desk.top, object: desk, score: 1, shelter: 0, distance: 0 };
  }

  choose(c: LandingContext, rng: Rng): LandingSite {
    const P = this.P;
    // Preferred travel distance for this decision: near / mid / far.
    const pr = P.rangeProbabilities;
    const fear = c.fear;
    const w = [pr[0] * (1 - 0.6 * fear) * (0.7 + 0.6 * c.curiosity), pr[1], pr[2] * (1 + 1.2 * fear)];
    const band = rng.weightedIndex(w);
    const range = band === 0 ? P.nearRangeMm : band === 1 ? P.midRangeMm : P.farRangeMm;
    const dPref = rng.range(range[0], range[1]) * c.distanceScale;
    const safeR = (P.safetyRadiusMm + P.safetyFearRadiusMm * fear) * c.distanceScale;
    // How much the fly cares about the swatter's position.
    const caution = clamp01(0.35 + 0.8 * fear - 0.5 * c.boldness - 0.3 * c.annoyance);

    const sites: LandingSite[] = [];
    const scores: number[] = [];
    let tries = 0;
    while (sites.length < P.candidateCount && tries < P.candidateCount * 6) {
      tries++;
      const o = this.landable[rng.weightedIndex(this.weights)];
      const p = randomPointInShape(o.shape, () => rng.next(), P.edgeInsetMm);
      if (!p || !this.validSpot(p.x, p.y, o, P.edgeInsetMm)) continue;
      const dx = p.x - c.fromX;
      const dy = p.y - c.fromY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < c.excludeRadius) continue;
      const shelter = this.scene.shelterAt(p.x, p.y);
      const distScore = Math.exp(-(((d - dPref) / (0.45 * dPref + 30)) ** 2));
      const sx = p.x - c.swatterX;
      const sy = p.y - c.swatterY;
      const ds = Math.sqrt(sx * sx + sy * sy);
      const safety = 1 - Math.exp(-((ds / safeR) ** 2));
      const safetyTerm = lerp(1, safety, caution);
      const shelterTerm = 1 + P.shelterWeight * shelter * (0.3 + fear);
      let attract = o.attract;
      if (o.food) attract *= c.energy < 0.5 ? 1.6 : 1.15;
      if (o.bright) attract *= 1.1;
      const score = Math.max(1e-6, attract * (0.15 + distScore) * safetyTerm * shelterTerm);
      sites.push({ x: p.x, y: p.y, z: o.top, object: o, score, shelter, distance: d });
      scores.push(score);
    }
    if (!sites.length) return this.randomValidSpot(rng);
    const invT = 1 / Math.max(0.02, P.temperature);
    const maxS = Math.max(...scores);
    const weights = scores.map((s) => Math.pow(s / maxS, invT));
    return sites[rng.weightedIndex(weights)];
  }

  /** Is a chosen site still acceptable? A fly won't land right under a hovering swatter. */
  siteThreatened(site: LandingSite, swatterX: number, swatterY: number, swatterHeightAbove: number, headHalf: number): boolean {
    const dx = site.x - swatterX;
    const dy = site.y - swatterY;
    return Math.sqrt(dx * dx + dy * dy) < headHalf + 28 && swatterHeightAbove < 420;
  }
}
