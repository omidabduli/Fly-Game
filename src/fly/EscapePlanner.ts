import type { SimParams } from '../config/params';
import type { Scene } from '../environment/Scene';
import type { Rng } from '../math/rng';
import { DEG, type Vec3, clamp, vec3 } from '../math/vec';
import type { VisualPercept } from '../neuroscience/types';
import { sdRoundRect } from '../physics/geometry';
import { EscapeModel, type EscapeKinematics } from './flightModel';

export interface PlannerInput {
  pos: Vec3;
  vel: Vec3;
  onSurface: boolean;
  capsuleRadius: number;
  capsuleHalfLength: number;
  percept: VisualPercept;
  /** sim time at which the plan is made */
  tNow: number;
  /** sim time at which movement will start */
  tGo: number;
  jumpSpeed: number;
  jumpDuration: number;
  accel: number;
  maxSpeed: number;
  drag: number;
  headHalfW: number;
  headHalfH: number;
  headCorner: number;
  trueRadius: number;
  landingAzimuth: number | null;
  prevEscapeAzimuth: number | null;
  handedness: number;
  randomness: number;
  predictionNoiseScale: number;
  horizonOverrideMs: number | null;
  predictionEnabled: boolean;
  motorNoiseDeg: number;
  minElevationDeg: number;
  maxElevationDeg: number;
  /** allow emergency/blunder picks (false for closed-loop steering updates) */
  allowSurprise: boolean;
  /** steering updates: also evaluate continuing in this direction */
  currentDir?: Vec3 | null;
}

export interface CandidateScore {
  az: number;
  el: number;
  score: number;
  clearance: number;
}

export interface EscapePlan {
  planTime: number;
  dir: Vec3;
  azimuth: number;
  elevation: number;
  /** prediction horizon used (s) */
  horizon: number;
  /** predicted time until the swatter reaches the fly's level, from planTime (s) */
  impactTime: number;
  /** estimated current swatter position (delay-compensated) */
  swatterNow: Vec3;
  /** futureSwatterPosition at the prediction horizon */
  futureSwatter: Vec3;
  /** predicted impact point (swatter centre when it reaches the fly's level) */
  predictedImpact: Vec3;
  /** predicted clearance of the chosen direction (mm, before motor noise) */
  clearance: number;
  emergency: boolean;
  /** direction of greatest danger (azimuth, rad) */
  threatAzimuth: number;
  components: { threat: number; obstacle: number; landing: number; noise: number; repeat: number; handed: number };
  /** best candidate per azimuth (for the debug fan) */
  fan: CandidateScore[];
  /** debug: predicted fly position & time (from planTime) when the swatter reaches its level */
  predictedFlyAtCross: Vec3;
  predictedCrossTime: number;
  /** predicted clearance if the fly keeps its current escape direction (steering) */
  currentClearance: number | null;
}

/** Smallest tau > 0 with dz0 + vz*tau + 0.5*az*tau^2 <= 0 (Infinity if never). */
export function solveReachTime(dz0: number, vz: number, az: number): number {
  if (dz0 <= 0) return 0;
  if (Math.abs(az) < 1e-6) return vz < -1e-6 ? -dz0 / vz : Infinity;
  const disc = vz * vz - 2 * az * dz0;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const r1 = (-vz - sq) / az;
  const r2 = (-vz + sq) / az;
  let best = Infinity;
  if (r1 > 0) best = r1;
  if (r2 > 0 && r2 < best) best = r2;
  return best;
}

/** "Braking hand" hypothesis: lateral velocity decays with time constant tauD. */
function damped(p: number, v: number, t: number, tauD: number): number {
  return p + v * tauD * (1 - Math.exp(-t / tauD));
}

/** Position of a constant-acceleration projectile where acceleration stops after `accelFor` seconds. */
function extrap(p: number, v: number, a: number, t: number, accelFor: number): number {
  const ta = t < accelFor ? t : accelFor;
  return p + v * t + 0.5 * a * ta * ta + a * ta * Math.max(0, t - accelFor);
}

/**
 * PREDICTIVE ESCAPE PLANNER.
 *
 * 1. Estimate where the swatter will be 30-150 ms ahead (futureSwatterPosition)
 *    from its perceived position, velocity and acceleration, and when it will
 *    reach the fly (projected impact time / point).
 * 2. For each candidate take-off vector (azimuth * elevation), roll the fly's
 *    own take-off kinematics forward and measure the clearance from the
 *    predicted swatter footprint at the moment the swatter reaches the fly's
 *    height.
 * 3. Score: 0.55*threat-avoidance + 0.20*obstacle-avoidance +
 *    0.15*landing-strategy + 0.10*noise (+ small anti-repetition and
 *    handedness terms), pick the best, then add motor noise.
 *
 * The fly is therefore not simply "running away from the cursor": the same
 * threat can produce different escapes depending on free space, obstacles, the
 * previous escape, the fly's handedness and noise.
 */
export class EscapePlanner {
  constructor(
    private readonly scene: Scene,
    private readonly P: SimParams['planner'],
  ) {}

  plan(inp: PlannerInput, rng: Rng): EscapePlan {
    const P = this.P;
    const pc = inp.percept;
    const t0 = pc.sampleTime;

    // --- 1. swatter kinematics estimate ---------------------------------------
    const S = vec3(pc.pos.x, pc.pos.y, pc.pos.z);
    const V = vec3(pc.vel.x, pc.vel.y, pc.vel.z);
    const A = vec3(pc.acc.x, pc.acc.y, pc.acc.z);
    const ns = inp.predictionNoiseScale;
    if (inp.predictionEnabled) {
      V.x += rng.normal(0, 25 * ns);
      V.y += rng.normal(0, 25 * ns);
      A.x += rng.normal(0, 1500 * ns);
      A.y += rng.normal(0, 1500 * ns);
      const aLat = Math.sqrt(A.x * A.x + A.y * A.y);
      if (aLat > 30000) {
        A.x *= 30000 / aLat;
        A.y *= 30000 / aLat;
      }
      A.z = clamp(A.z, -60000, 30000);
    } else {
      // Reactive only: assume the swatter stays where it is laterally.
      V.x = V.y = 0;
      A.x = A.y = 0;
      V.z = Math.min(0, V.z);
      A.z = 0;
    }
    const r = inp.capsuleRadius;
    const flyTop = inp.pos.z + r;
    const tImp = solveReachTime(S.z - flyTop, V.z, A.z);
    const hMin = P.horizonMinMs / 1000;
    const hMax = P.horizonMaxMs / 1000;
    const horizon = inp.horizonOverrideMs !== null
      ? inp.horizonOverrideMs / 1000
      : Number.isFinite(tImp) ? clamp(tImp, hMin, hMax) : hMax;
    const lag = inp.tNow - t0; // delay compensation
    const swatterNow = vec3(extrap(S.x, V.x, A.x, lag, horizon), extrap(S.y, V.y, A.y, lag, horizon), extrap(S.z, V.z, A.z, lag, 10));
    const futureSwatter = vec3(
      extrap(S.x, V.x, A.x, horizon, horizon),
      extrap(S.y, V.y, A.y, horizon, horizon),
      extrap(S.z, V.z, A.z, horizon, 10),
    );
    const tImpact = Number.isFinite(tImp) ? tImp : horizon;
    const predictedImpact = vec3(
      extrap(S.x, V.x, A.x, tImpact, horizon),
      extrap(S.y, V.y, A.y, tImpact, horizon),
      flyTop,
    );

    // --- 2. candidate evaluation ------------------------------------------------
    const sizeScale = pc.sizeR / inp.trueRadius;
    const hx = inp.headHalfW * sizeScale;
    const hy = inp.headHalfH * sizeScale;
    const hr = inp.headCorner * sizeScale;
    const tGoRel = Math.max(0, inp.tGo - t0);
    const tEnd = Math.min((Number.isFinite(tImp) ? tImp : horizon) + 0.04, 0.32);
    const dt = P.simStepMs / 1000;
    const threatAz = Math.atan2(pc.dir.y, pc.dir.x);
    const els = inp.onSurface ? P.elevationsDeg : [-24, 0, 22];
    const N = P.azimuthCount;
    const azOffset = rng.next() * ((Math.PI * 2) / N);
    const groundAtStart = this.scene.heightAt(inp.pos.x, inp.pos.y);
    const wN = P.wNoise * inp.randomness;
    const model = new EscapeModel();
    const kin: EscapeKinematics = {
      onSurface: inp.onSurface,
      jumpSpeed: inp.jumpSpeed,
      jumpDuration: inp.jumpDuration,
      accel: inp.accel,
      maxSpeed: inp.maxSpeed,
      drag: inp.drag,
    };
    // Faster sideways swatter motion = less predictable = keep a wider berth.
    const vLat = Math.sqrt(V.x * V.x + V.y * V.y);
    const marginRate = P.marginGrowthMmPerS + P.lateralUncertainty * vLat;

    let best: { az: number; el: number; score: number; clearance: number; comps: EscapePlan['components'] } | null = null;
    let bestCross = { x: inp.pos.x, y: inp.pos.y, z: inp.pos.z };
    let bestCrossTau = 0;
    const fan: CandidateScore[] = [];
    const all: { az: number; el: number; score: number; clearance: number }[] = [];

    for (let i = 0; i < N; i++) {
      const az = azOffset + (i / N) * Math.PI * 2;
      let fanBest: CandidateScore | null = null;
      for (const elDeg of els) {
        const el = elDeg * DEG;
        const dx = Math.cos(el) * Math.cos(az);
        const dy = Math.cos(el) * Math.sin(az);
        const dz = Math.sin(el);
        model.reset(inp.pos, inp.vel, inp.onSurface);
        let blocked = false;
        let clearance = Infinity;
        let reached = false;
        let crossTau = tEnd;
        let px = model.px;
        let py = model.py;
        let pz = model.pz;
        for (let tau = dt; tau <= tEnd + 1e-9; tau += dt) {
          // Movement starts part-way through a step: split it exactly.
          const moveFrom = Math.max(tau - dt, tGoRel);
          if (!blocked) {
            if (moveFrom > tau - dt && moveFrom < tau) model.step(dx, dy, dz, kin, moveFrom - (tau - dt), false);
            if (tau > tGoRel) model.step(dx, dy, dz, kin, tau - moveFrom, true);
            else model.step(dx, dy, dz, kin, dt, false);
            if (!this.scene.insideWorld(model.px, model.py, 1) || model.pz < this.scene.heightAt(model.px, model.py) + r * 0.6) {
              blocked = true;
            } else {
              px = model.px;
              py = model.py;
              pz = model.pz;
            }
          }
          const sx = extrap(S.x, V.x, A.x, tau, horizon);
          const sy = extrap(S.y, V.y, A.y, tau, horizon);
          const sz = Math.max(groundAtStart, extrap(S.z, V.z, A.z, tau, 10));
          if (sz <= pz + r) {
            // Hedge: the swatter may keep accelerating sideways, or it may be braking.
            const bx = damped(S.x, V.x, tau, P.brakingTauMs / 1000);
            const by = damped(S.y, V.y, tau, P.brakingTauMs / 1000);
            const sd = Math.min(sdRoundRect(px, py, sx, sy, hx, hy, hr), sdRoundRect(px, py, bx, by, hx, hy, hr));
            clearance = sd - r - inp.capsuleHalfLength - (P.marginMm + marginRate * tau);
            reached = true;
            crossTau = tau;
            break;
          }
        }
        if (!reached) {
          const sx = extrap(S.x, V.x, A.x, tEnd, horizon);
          const sy = extrap(S.y, V.y, A.y, tEnd, horizon);
          clearance = sdRoundRect(px, py, sx, sy, hx, hy, hr) - r - inp.capsuleHalfLength;
        }
        const threat = Math.tanh(clearance / P.clearanceScaleMm);
        const hit = this.scene.raycast(inp.pos.x, inp.pos.y, inp.pos.z, dx, dy, dz, P.obstacleLookaheadMm, r * 0.5);
        let obstacle = hit < 0 ? 0 : -(1 - hit / P.obstacleLookaheadMm);
        if (blocked) obstacle = Math.min(obstacle, -0.5);
        const landing = inp.landingAzimuth !== null ? Math.cos(az - inp.landingAzimuth) * Math.cos(el) : 0;
        const noise = rng.range(-1, 1);
        const repeat = inp.prevEscapeAzimuth !== null ? -Math.max(0, Math.cos(az - inp.prevEscapeAzimuth)) : 0;
        const handed = inp.handedness * Math.sin(az - threatAz);
        const score =
          P.wThreat * threat + P.wObstacle * obstacle + P.wLanding * landing + wN * noise + P.wRepeat * repeat + P.wHandedness * handed;
        all.push({ az, el, score, clearance });
        if (!best || score > best.score) {
          bestCross = { x: px, y: py, z: pz };
          bestCrossTau = crossTau;
        }
        if (!fanBest || score > fanBest.score) fanBest = { az, el, score, clearance };
        if (!best || score > best.score) {
          best = { az, el, score, clearance, comps: { threat, obstacle, landing, noise, repeat, handed } };
        }
      }
      if (fanBest) fan.push(fanBest);
    }

    // Steering: how good is simply holding the current course?
    let currentClearance: number | null = null;
    if (inp.currentDir) {
      const d = inp.currentDir;
      model.reset(inp.pos, inp.vel, inp.onSurface);
      let cl = Infinity;
      let reached = false;
      for (let tau = dt; tau <= tEnd + 1e-9; tau += dt) {
        model.step(d.x, d.y, d.z, kin, dt, tau > tGoRel);
        const sx = extrap(S.x, V.x, A.x, tau, horizon);
        const sy = extrap(S.y, V.y, A.y, tau, horizon);
        const sz = Math.max(groundAtStart, extrap(S.z, V.z, A.z, tau, 10));
        if (model.pz < this.scene.heightAt(model.px, model.py) + r * 0.6) {
          cl = -1;
          reached = true;
          break;
        }
        if (sz <= model.pz + r) {
          const bx = damped(S.x, V.x, tau, P.brakingTauMs / 1000);
          const by = damped(S.y, V.y, tau, P.brakingTauMs / 1000);
          const sd = Math.min(sdRoundRect(model.px, model.py, sx, sy, hx, hy, hr), sdRoundRect(model.px, model.py, bx, by, hx, hy, hr));
          cl = sd - r - inp.capsuleHalfLength - (P.marginMm + marginRate * tau);
          reached = true;
          break;
        }
      }
      if (!reached) {
        const sx = extrap(S.x, V.x, A.x, tEnd, horizon);
        const sy = extrap(S.y, V.y, A.y, tEnd, horizon);
        cl = sdRoundRect(model.px, model.py, sx, sy, hx, hy, hr) - r - inp.capsuleHalfLength;
      }
      currentClearance = cl;
    }

    // --- 3. selection, emergencies and motor noise -------------------------------
    let az = best!.az;
    let el = best!.el;
    let emergency = false;
    const viable = all.filter((c) => c.clearance >= P.emergencyMinClearanceMm);
    if (inp.allowSurprise && rng.chance(P.blunderProbability * inp.randomness)) {
      // Very rare genuine blunder: a completely random direction.
      az = rng.range(0, Math.PI * 2);
      el = rng.range(inp.minElevationDeg, inp.maxElevationDeg) * DEG * (inp.onSurface ? 1 : 0.5);
      emergency = true;
    } else if (inp.allowSurprise && viable.length > 1 && rng.chance(P.emergencyProbability * inp.randomness)) {
      // Random emergency vector: unexpected, but still a viable direction.
      const pick = viable[rng.int(0, viable.length)];
      az = pick.az;
      el = pick.el;
      emergency = true;
    } else if (best!.clearance < P.panicClearanceMm) {
      // No predicted escape route: desperate choice among the three best.
      all.sort((a, b) => b.score - a.score);
      const pick = all[rng.int(0, Math.min(3, all.length))];
      az = pick.az;
      el = pick.el;
      emergency = true;
    }
    az += rng.normal(0, inp.motorNoiseDeg * DEG);
    el += rng.normal(0, 3 * DEG);
    if (inp.onSurface) el = clamp(el, inp.minElevationDeg * DEG, inp.maxElevationDeg * DEG);
    else el = clamp(el, -35 * DEG, 50 * DEG);
    const dir = vec3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    return {
      planTime: inp.tNow,
      dir,
      azimuth: az,
      elevation: el,
      horizon,
      impactTime: Number.isFinite(tImp) ? tImp - lag : Infinity,
      swatterNow,
      futureSwatter,
      predictedImpact,
      clearance: best!.clearance,
      emergency,
      threatAzimuth: threatAz,
      components: best!.comps,
      fan,
      predictedFlyAtCross: vec3(bestCross.x, bestCross.y, bestCross.z),
      predictedCrossTime: bestCrossTau - lag,
      currentClearance,
    };
  }
}
