import type { SimParams } from '../config/params';
import type { EscapePlan } from '../fly/EscapePlanner';
import { type Fly, FlyState, isAirborneState } from '../fly/Fly';
import type { EscapeMode, PendingEscape } from '../neuroscience/types';
import { ReactionTimer } from '../neuroscience/ReactionTimer';
import type { CapsulePose, PhysicsWorld } from '../physics/PhysicsWorld';
import type { Swatter } from '../player/Swatter';
import { sdRoundRect } from '../physics/geometry';

export type AttackCategory = 'CAUGHT' | 'EXTREMELY_CLOSE' | 'NEAR_MISS' | 'CLOSE' | 'MISS';

export interface AttackResult {
  id: number;
  strikeId: number;
  flyId: number;
  /** would this strike have hit (or nearly hit) a fly that did not move? */
  serious: boolean;
  hit: boolean;
  airborneHit: boolean;
  category: AttackCategory;
  /** closest approach between the fly's body and the swatter head (mm) */
  minGapMm: number;
  /** lateral gap had the fly stayed where it was at strike start (mm) */
  stationaryGapMm: number;
  sheltered: boolean;
  blockedBy: string | null;
  flyStateAtStrike: number;
  flyAirborneAtStrike: boolean;
  strikeStartTime: number;
  swingStartTime: number;
  impactTime: number;
  strikeDurationMs: number;
  impactSpeed: number;
  lateralSwingSpeed: number;
  impactX: number;
  impactY: number;
  impactZ: number;
  impactSurface: string;
  /** ms relative to impact (negative = before) */
  threatMs: number | null;
  perceivedMs: number | null;
  commandMs: number | null;
  takeoffMs: number | null;
  clearMs: number | null;
  reactionMs: number | null;
  escapeMode: EscapeMode | null;
  flyTookOff: boolean;
  /** cos(angle) between the swatter's lateral sweep and the fly's escape (-1..1) */
  predictionQuality: number | null;
  /** time between the fly settling and the player's strike (ms) */
  playerReactionMs: number | null;
  plan: {
    predictedImpactX: number;
    predictedImpactY: number;
    futureX: number;
    futureY: number;
    horizonMs: number;
    clearanceMm: number;
    emergency: boolean;
  } | null;
}

interface Active {
  strikeId: number;
  flyId: number;
  strikeStart: number;
  swingStart: number;
  fly0: CapsulePose;
  fly0Ground: number;
  flyState0: number;
  airborne0: boolean;
  landedTime0: number;
  swingStartX: number;
  swingStartY: number;
  lateralSwingSpeed: number;
  minGap: number;
  inside: boolean;
  lastExit: number | null;
  wasInside: boolean;
  escape: PendingEscape | null;
  plan: EscapePlan | null;
  escapeDirX: number;
  escapeDirY: number;
}

/**
 * Follows each strike from wind-up to impact and measures what really
 * happened: minimum distance between the swatter and the fly, whether the fly
 * cleared the swatter's column, and when the fly's escape pathway fired
 * relative to impact. Nothing here influences the physics.
 */
export class AttackTracker {
  private active: Active | null = null;
  private nextId = 1;
  lastResult: AttackResult | null = null;

  constructor(
    private readonly P: SimParams,
    private readonly physics: PhysicsWorld,
  ) {}

  get inProgress(): boolean {
    return this.active !== null;
  }

  onStrikeStart(t: number, sw: Swatter, fly: Fly): void {
    this.active = {
      strikeId: sw.strikeId,
      flyId: fly.id,
      strikeStart: t,
      swingStart: -1,
      fly0: { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, heading: fly.heading },
      fly0Ground: fly.ground,
      flyState0: fly.state,
      airborne0: isAirborneState(fly.state),
      landedTime0: fly.landedTime,
      swingStartX: sw.x,
      swingStartY: sw.y,
      lateralSwingSpeed: 0,
      minGap: Infinity,
      inside: false,
      lastExit: null,
      wasInside: false,
      escape: null,
      plan: null,
      escapeDirX: 0,
      escapeDirY: 0,
    };
    // An escape already in flight (e.g. pre-emptive) still counts for this attack.
    const last = fly.brain.motor.last;
    if (last && last.firedAt >= t - 0.35) this.active.escape = last;
  }

  onSwingStart(t: number, sw: Swatter): void {
    const a = this.active;
    if (!a) return;
    a.swingStart = t;
    a.swingStartX = sw.x;
    a.swingStartY = sw.y;
    a.lateralSwingSpeed = sw.lateralSpeed;
  }

  onEscapeEvent(escape: PendingEscape, plan: EscapePlan | null): void {
    const a = this.active;
    if (!a) return;
    a.escape = escape;
    if (plan) a.plan = plan;
  }

  onTakeoffDir(dx: number, dy: number): void {
    const a = this.active;
    if (!a) return;
    a.escapeDirX = dx;
    a.escapeDirY = dy;
  }

  /** Per-step bookkeeping while a strike is in progress. */
  update(t: number, fly: Fly, sw: Swatter, stepMinGap: number): void {
    const a = this.active;
    if (!a) return;
    if (a.swingStart >= 0 && stepMinGap < a.minGap) a.minGap = stepMinGap;
    const pose: CapsulePose = { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, heading: fly.heading };
    const inside = this.physics.lateralGap(pose, fly.halfLength, fly.radius, sw) <= 0 && fly.pos.z < sw.z + 5;
    if (inside) a.wasInside = true;
    if (a.inside && !inside) a.lastExit = t;
    a.inside = inside;
  }

  resolve(t: number, fly: Fly, sw: Swatter, hit: boolean): AttackResult | null {
    const a = this.active;
    if (!a) return null;
    this.active = null;
    const P = this.P;
    const r = fly.radius;
    // Stationary-fly counterfactual: where would the swatter have landed relative to it?
    const stationaryGap = sdRoundRect(a.fly0.x, a.fly0.y, sw.impactX, sw.impactY, sw.hx, sw.hy, sw.r) - r;
    const blocked0 = sw.impactZ - P.swatter.flexMm > a.fly0Ground + 2 * r + 0.01;
    const minGap = hit ? 0 : Math.max(0, a.minGap);
    // Serious = a real attempt: it would have hit a motionless fly, or it came
    // really close to the fly (sweeping / leading swats land away from the
    // fly's start position on purpose).
    const serious =
      hit ||
      minGap <= P.attack.seriousAirborneGapMm ||
      (!a.airborne0 && stationaryGap <= P.attack.seriousGapMm && !blocked0);
    const A = P.attack;
    const category: AttackCategory = hit
      ? 'CAUGHT'
      : minGap <= A.extremelyCloseMm
        ? 'EXTREMELY_CLOSE'
        : minGap <= A.nearMissMm
          ? 'NEAR_MISS'
          : minGap <= A.closeMm
            ? 'CLOSE'
            : 'MISS';
    const pose: CapsulePose = { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, heading: fly.heading };
    const underColumn = this.physics.lateralGap(pose, fly.halfLength, r, sw) <= 0;
    const e = a.escape;
    const rel = (x: number) => (x - t) * 1000;
    const executedBeforeImpact = !!e && e.executed && e.goAt <= t + 1e-9;
    // Sheltered: something taller stopped the swatter above a fly that was
    // still under it (not the case when the fly simply escaped).
    const sheltered =
      !hit &&
      ((underColumn && sw.impactZ - P.swatter.flexMm > fly.pos.z + r) || (!executedBeforeImpact && stationaryGap <= 0 && blocked0));
    let predictionQuality: number | null = null;
    const sweepX = sw.impactX - a.swingStartX;
    const sweepY = sw.impactY - a.swingStartY;
    const sweep = Math.hypot(sweepX, sweepY);
    const edl = Math.hypot(a.escapeDirX, a.escapeDirY);
    if (sweep > 8 && edl > 1e-3 && executedBeforeImpact) {
      predictionQuality = (sweepX * a.escapeDirX + sweepY * a.escapeDirY) / (sweep * edl);
    }
    const onSurface0 = a.flyState0 === FlyState.RESTING || a.flyState0 === FlyState.GROOMING || a.flyState0 === FlyState.WALKING || a.flyState0 === FlyState.ALERT;
    const react = onSurface0 && a.strikeStart - a.landedTime0 < 15 ? (a.strikeStart - a.landedTime0) * 1000 : null;
    const result: AttackResult = {
      id: this.nextId++,
      strikeId: a.strikeId,
      flyId: a.flyId,
      serious,
      hit,
      airborneHit: hit && fly.killedAirborne,
      category,
      minGapMm: minGap,
      stationaryGapMm: stationaryGap,
      sheltered,
      blockedBy: sheltered ? sw.impactObject?.label ?? null : null,
      flyStateAtStrike: a.flyState0,
      flyAirborneAtStrike: a.airborne0,
      strikeStartTime: a.strikeStart,
      swingStartTime: a.swingStart,
      impactTime: t,
      strikeDurationMs: (t - a.strikeStart) * 1000,
      impactSpeed: sw.impactSpeed,
      lateralSwingSpeed: a.lateralSwingSpeed,
      impactX: sw.impactX,
      impactY: sw.impactY,
      impactZ: sw.impactZ,
      impactSurface: sw.impactObject?.label ?? 'wall',
      threatMs: e ? rel(e.stimTime) : null,
      perceivedMs: e ? rel(e.firedAt) : null,
      commandMs: e && e.planned ? rel(e.decideAt) : null,
      takeoffMs: executedBeforeImpact ? rel(e!.goAt) : null,
      clearMs: a.wasInside && !a.inside && a.lastExit !== null ? rel(a.lastExit) : null,
      reactionMs: e ? ReactionTimer.reactionMs(e) : null,
      escapeMode: e ? e.mode : null,
      flyTookOff: executedBeforeImpact,
      predictionQuality,
      playerReactionMs: react,
      plan: a.plan
        ? {
            predictedImpactX: a.plan.predictedImpact.x,
            predictedImpactY: a.plan.predictedImpact.y,
            futureX: a.plan.futureSwatter.x,
            futureY: a.plan.futureSwatter.y,
            horizonMs: a.plan.horizon * 1000,
            clearanceMm: a.plan.clearance,
            emergency: a.plan.emergency,
          }
        : null,
    };
    this.lastResult = result;
    return result;
  }

  cancel(): void {
    this.active = null;
  }
}
