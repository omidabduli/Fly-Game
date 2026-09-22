import type { SimParams } from '../config/params';
import type { Scene } from '../environment/Scene';
import type { SimContext } from '../game/context';
import type { Dist, Rng } from '../math/rng';
import { DEG, RAD, type Vec3, vec3 } from '../math/vec';
import { ReactionTimer } from '../neuroscience/ReactionTimer';
import type {
  BrainActivity,
  EscapeCircuitModule,
  EscapeMode,
  EscapeThresholds,
  LoomingDetectorModule,
  PendingEscape,
  VisualInputModule,
  VisualPercept,
} from '../neuroscience/types';
import { type EscapePlan, EscapePlanner } from './EscapePlanner';
import { type Fly, FlyState } from './Fly';
import { type LandingSite, LandingSystem } from './LandingSystem';
import { ThreatDetector } from './ThreatDetector';

/**
 * The fly's brain: runs the escape pathway every simulation step
 *
 *   VISUAL (delayed, noisy percept) -> LOOMING (LC4/LPLC2-like channels)
 *   -> ESCAPE (Giant-Fiber-like integrator, threatLevel 0-1)
 *   -> MOTOR (reaction delays -> predictive planner -> take-off)
 *
 * and a small behavioural state machine for everything else (resting,
 * walking, grooming, alert freezing, voluntary flights, landing).
 */
export class FlyBrain {
  /** VISUAL -> LOOMING -> ESCAPE (replaceable modules) */
  readonly threat: ThreatDetector;
  /** MOTOR: descending pathway timing */
  readonly motor: ReactionTimer;
  readonly planner: EscapePlanner;
  readonly landing: LandingSystem;
  readonly thresholds: EscapeThresholds = { alert: 0.25, escape: 0.6 };
  lastPlan: EscapePlan | null = null;
  /** landing site chosen as part of the last escape plan */
  escapeSite: LandingSite | null = null;
  motorActivity = 0;
  alertHoldUntil = 0;
  legsBusyUntil = 0;
  private lastAlertEmit = -Infinity;
  /** jump direction to use when a take-off completes */
  private readonly pendingFlightDir = vec3();
  private pendingFlightEscape = false;
  /** closed-loop steering during escape flight */
  private nextSteerAt = 0;
  private steerAt = -1;
  private readonly steerDir = vec3();
  private steerUntil = 0;

  constructor(
    private readonly fly: Fly,
    private readonly scene: Scene,
    private readonly P: SimParams,
    private readonly rng: Rng,
    private readonly headRadius: number,
  ) {
    this.threat = ThreatDetector.create(P, headRadius, rng);
    this.motor = new ReactionTimer(P.escape, rng);
    this.planner = new EscapePlanner(scene, P.planner);
    this.landing = new LandingSystem(scene, P.landing);
    this.threat.visual.reset();
  }

  get visual(): VisualInputModule {
    return this.threat.visual;
  }

  get looming(): LoomingDetectorModule {
    return this.threat.looming;
  }

  get escape(): EscapeCircuitModule {
    return this.threat.escape;
  }

  get percept(): VisualPercept {
    return this.threat.visual.percept;
  }

  activity(): BrainActivity {
    const pc = this.visual.percept;
    const lo = this.looming.output;
    const es = this.escape.output;
    return {
      visual: lo.motion,
      looming: Math.min(1, lo.drive),
      escape: es.threatLevel,
      motor: this.motorActivity,
      theta: pc.valid ? pc.theta : 0,
      thetaDot: pc.valid ? pc.thetaDot : 0,
      tau: pc.valid ? pc.tau : Infinity,
      threatLevel: es.threatLevel,
      alertThreshold: this.thresholds.alert,
      escapeThreshold: this.thresholds.escape,
      lc4: lo.lc4,
      lplc2: lo.lplc2,
    };
  }

  /** Combined take-off vigour: genome * difficulty/lab * tiredness. */
  takeoffScale(ctx: SimContext): number {
    return ctx.mod.takeoffScale * this.fly.genome.takeoffScale * (0.88 + 0.12 * this.fly.personality.energy);
  }

  private latencyScale(ctx: SimContext): number {
    return ctx.mod.latencyScale * this.fly.genome.latencyScale * (1 - 0.08 * this.fly.personality.alertness);
  }

  private computeThresholds(ctx: SimContext): void {
    const E = this.P.escape;
    const fly = this.fly;
    let s = ctx.mod.thresholdScale * fly.genome.thresholdScale;
    s *= 1 - E.alertnessThresholdDrop * fly.personality.alertness;
    if (fly.state === FlyState.ALERT) s *= 1 - E.alertPrimingDrop;
    if (fly.state === FlyState.GROOMING) s *= 1.06; // [MODEL] a grooming fly is slightly distracted
    this.thresholds.escape = E.escapeThreshold * s;
    this.thresholds.alert = E.alertThreshold * s;
  }

  update(ctx: SimContext): void {
    const fly = this.fly;
    const t = ctx.time;
    const dt = ctx.dt;
    if (fly.state === FlyState.DEAD) {
      this.motorActivity = Math.max(0, this.motorActivity - dt / 0.25);
      return;
    }

    // 1-3. VISUAL (the fly sees the past) -> LOOMING -> ESCAPE CIRCUIT
    this.computeThresholds(ctx);
    const threat = this.threat.update(t, dt, ctx.history, fly.pos, fly.vel, ctx.mod.latencyScale * fly.genome.latencyScale, this.thresholds, ctx.mod.escapeEnabled);
    const pc = threat.percept;
    const alerted = threat.alerted;
    // 4. MOTOR
    if (threat.fired && !this.motor.pending && fly.state !== FlyState.TAKEOFF) this.fire(ctx, pc);
    this.runMotor(ctx, pc);
    this.motorActivity = Math.max(0, this.motorActivity - dt / 0.3);

    fly.personality.update(dt, fly.airborne, !!fly.surface?.food && fly.onSurface);

    // 5. BEHAVIOUR
    switch (fly.state) {
      case FlyState.RESTING:
      case FlyState.GROOMING:
      case FlyState.WALKING:
        if (alerted) this.enterAlert(ctx);
        else this.spontaneous(ctx);
        break;
      case FlyState.ALERT:
        this.updateAlert(ctx, pc, alerted);
        break;
      case FlyState.TAKEOFF:
        if (t - fly.takeoffStart >= fly.takeoffDuration) this.finishTakeoff(ctx);
        break;
      case FlyState.FLYING:
        this.updateFlight(ctx);
        break;
      case FlyState.LANDING:
        this.updateLanding(ctx);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Escape pathway
  // ---------------------------------------------------------------------------

  private fire(ctx: SimContext, pc: VisualPercept): void {
    const fly = this.fly;
    const P = this.P;
    const t = ctx.time;
    const tdDeg = Math.max(0, pc.thetaDot) * RAD;
    const mode: EscapeMode = fly.airborne ? 'flight' : tdDeg > P.escape.shortModeThetaDotDegS ? 'short' : 'long';
    let penalty: Dist | null = null;
    if (fly.state === FlyState.GROOMING) penalty = P.escape.groomingPenaltyMs;
    else if (fly.state === FlyState.WALKING) penalty = P.escape.walkingPenaltyMs;
    else if (fly.state === FlyState.LANDING) penalty = P.escape.landingPenaltyMs;
    else if (fly.state === FlyState.ALERT && this.legsBusyUntil > t) {
      const ms = (this.legsBusyUntil - t) * 1000;
      penalty = { mean: ms, sd: 0.5, min: ms * 0.8, max: ms * 1.2 };
    }
    const pend = this.motor.schedule({
      firedAt: t,
      visualDelayMs: pc.delayMs,
      mode,
      thetaDotAtFire: tdDeg,
      latencyScale: this.latencyScale(ctx),
      penalty,
      alertReduction: fly.state === FlyState.ALERT ? P.escape.alertLatencyReduction : 0,
      stateAtFire: fly.state,
    });
    if (fly.onSurface && fly.state !== FlyState.ALERT) {
      fly.setState(FlyState.ALERT, ctx, t);
      fly.walkSpeed = 0;
    }
    this.alertHoldUntil = t + 0.6;
    ctx.emit({ type: 'threat', t, escape: pend });
  }

  private runMotor(ctx: SimContext, pc: VisualPercept): void {
    const pend = this.motor.pending;
    if (!pend) return;
    const fly = this.fly;
    const t = ctx.time;
    if (!pend.planned && t >= pend.decideAt) {
      const plan = this.makePlan(ctx, pc, pend);
      this.lastPlan = plan;
      pend.planned = true;
      if (fly.onSurface) fly.turnTarget = plan.azimuth; // postural adjustment toward the escape
      ctx.emit({ type: 'escapeCommand', t, escape: pend, plan });
    }
    if (pend.planned && !pend.executed && t >= pend.goAt) {
      pend.executed = true;
      this.motor.pending = null;
      const plan = this.lastPlan!;
      this.motorActivity = 1;
      fly.lastEscapeAzimuth = plan.azimuth;
      fly.personality.onEscape();
      if (fly.onSurface) {
        this.beginTakeoff(ctx, plan.dir, pend.mode === 'short' ? 'short' : 'long', pend);
      } else if (fly.state === FlyState.TAKEOFF) {
        // Mid-jump: steer the flight that follows.
        this.pendingFlightDir.x = plan.dir.x;
        this.pendingFlightDir.y = plan.dir.y;
        this.pendingFlightDir.z = plan.dir.z;
        this.pendingFlightEscape = true;
        ctx.emit({ type: 'evade', t, escape: pend });
      } else if (fly.airborne) {
        const sc = this.takeoffScale(ctx);
        fly.flight.startEscape(plan.dir, t, this.rng.sample(this.P.flight.escapeBurstMs), this.P.flight.escapeMaxSpeed * sc, this.P.flight.escapeAccel * sc);
        this.extendEscape(plan);
        if (fly.state === FlyState.LANDING) fly.setState(FlyState.FLYING, ctx, t);
        fly.legExtension = 0;
        ctx.emit({ type: 'evade', t, escape: pend });
      }
    }
  }

  private makePlan(ctx: SimContext, pc: VisualPercept, pend: Pick<PendingEscape, 'mode' | 'goAt'>, steering = false, currentDir: Vec3 | null = null): EscapePlan {
    const fly = this.fly;
    const P = this.P;
    const mod = ctx.mod;
    const sw = ctx.swatter;
    const sc = this.takeoffScale(ctx);
    const short = pend.mode === 'short';
    const pers = fly.personality;
    // Landing strategy: where would I like to end up, given the predicted strike?
    if (!steering || !this.escapeSite) this.escapeSite = this.landing.choose(
      {
        fromX: fly.pos.x,
        fromY: fly.pos.y,
        fear: Math.min(1, pers.fear + 0.3),
        confidence: pers.confidence,
        annoyance: pers.annoyance,
        energy: pers.energy,
        curiosity: fly.genome.curiosity,
        boldness: fly.genome.boldness,
        distanceScale: mod.landingDistanceScale,
        swatterX: pc.valid ? pc.pos.x : sw.x,
        swatterY: pc.valid ? pc.pos.y : sw.y,
        excludeRadius: 60,
      },
      this.rng,
    );
    const landingAz = Math.atan2(this.escapeSite.y - fly.pos.y, this.escapeSite.x - fly.pos.x);
    const motorNoise = short ? P.takeoff.shortModeDirectionNoiseDeg : pend.mode === 'flight' ? 8 : P.takeoff.longModeDirectionNoiseDeg;
    return this.planner.plan(
      {
        pos: fly.pos,
        vel: fly.vel,
        onSurface: fly.onSurface,
        capsuleRadius: fly.radius,
        capsuleHalfLength: fly.halfLength,
        percept: pc,
        tNow: ctx.time,
        tGo: pend.goAt,
        jumpSpeed: (short ? P.takeoff.jumpSpeedShort : P.takeoff.jumpSpeedLong) * sc,
        jumpDuration: (short ? P.takeoff.jumpDurationShortMs : P.takeoff.jumpDurationLongMs) / 1000,
        accel: P.flight.escapeAccel * sc,
        maxSpeed: P.flight.escapeMaxSpeed * sc,
        drag: P.flight.dragPerS,
        headHalfW: sw.hx,
        headHalfH: sw.hy,
        headCorner: sw.r,
        trueRadius: this.headRadius,
        landingAzimuth: landingAz,
        prevEscapeAzimuth: fly.lastEscapeAzimuth,
        handedness: fly.genome.handedness,
        randomness: mod.randomnessScale,
        predictionNoiseScale: mod.predictionNoiseScale,
        horizonOverrideMs: mod.predictionHorizonMs,
        predictionEnabled: mod.predictionEnabled,
        motorNoiseDeg: motorNoise * mod.randomnessScale,
        minElevationDeg: P.takeoff.minElevationDeg,
        maxElevationDeg: P.takeoff.maxElevationDeg,
        allowSurprise: !steering,
        currentDir,
      },
      this.rng,
    );
  }

  /** Keep an escape burst going until the predicted impact has passed. */
  private extendEscape(plan: EscapePlan): void {
    const f = this.fly.flight;
    if (Number.isFinite(plan.impactTime)) {
      const until = plan.planTime + Math.max(0, plan.impactTime) + 0.05;
      if (until > f.escapeUntil) f.escapeUntil = until;
    }
    this.nextSteerAt = plan.planTime + this.P.planner.steerIntervalMs / 1000;
  }

  /**
   * Closed-loop evasive steering: while the swatter keeps looming during an
   * escape burst, re-plan every few tens of ms (still subject to the visual
   * delay and a flight-motor delay).
   */
  private steer(ctx: SimContext): void {
    const fly = this.fly;
    const f = fly.flight;
    const t = ctx.time;
    if (this.steerAt >= 0 && t >= this.steerAt) {
      if (f.mode === 'escape') f.redirect(this.steerDir, this.steerUntil);
      this.steerAt = -1;
    }
    if (f.mode !== 'escape' || t < this.nextSteerAt || this.steerAt >= 0) return;
    const pc = this.visual.percept;
    if (!pc.valid || pc.thetaDot <= 0 || this.escape.output.threatLevel < this.thresholds.alert) return;
    const delay = (this.rng.sample(this.P.escape.motorInitiationDelayFlightMs) * this.latencyScale(ctx)) / 1000;
    const plan = this.makePlan(ctx, pc, { mode: 'flight', goAt: t + delay }, true, f.escapeDir);
    this.nextSteerAt = t + this.P.planner.steerIntervalMs / 1000;
    // Committed steering: only change course if the current one is predicted
    // to fail or a clearly better one exists.
    const cur = plan.currentClearance;
    if (cur !== null && cur >= 0 && plan.clearance - cur < this.P.planner.steerHysteresisMm) return;
    this.lastPlan = plan;
    this.steerDir.x = plan.dir.x;
    this.steerDir.y = plan.dir.y;
    this.steerDir.z = plan.dir.z;
    this.steerUntil = Number.isFinite(plan.impactTime) ? t + Math.max(0, plan.impactTime) + 0.05 : f.escapeUntil;
    this.steerAt = t + delay;
    this.nextSteerAt = t + this.P.planner.steerIntervalMs / 1000;
  }

  beginTakeoff(ctx: SimContext, dir: Vec3, mode: EscapeMode, pend: PendingEscape | null): void {
    const fly = this.fly;
    const T = this.P.takeoff;
    const t = ctx.time;
    const sc = this.takeoffScale(ctx);
    let speed: number;
    let dur: number;
    if (mode === 'short') {
      speed = T.jumpSpeedShort * sc;
      dur = T.jumpDurationShortMs;
    } else if (mode === 'long') {
      speed = T.jumpSpeedLong * sc;
      dur = T.jumpDurationLongMs;
    } else {
      speed = T.voluntaryJumpSpeed * this.rng.range(0.9, 1.1);
      dur = T.voluntaryJumpDurationMs;
    }
    fly.takeoffDir.x = dir.x;
    fly.takeoffDir.y = dir.y;
    fly.takeoffDir.z = dir.z;
    fly.takeoffSpeed = speed;
    fly.takeoffDuration = dur / 1000;
    fly.takeoffStart = t;
    fly.takeoffMode = mode;
    fly.surface = null;
    fly.turnTarget = null;
    fly.walkSpeed = 0;
    fly.legExtension = 0;
    // Escape (GF-driven) take-offs keep the wings down; voluntary ones raise them first.
    fly.wingSpread = mode === 'short' ? 0.15 : 1;
    fly.rollRate = mode === 'short' ? this.rng.sign() * T.shortModeTumbleDegS * DEG * this.rng.range(0.5, 1) : 0;
    this.pendingFlightEscape = false;
    fly.setState(FlyState.TAKEOFF, ctx, t);
    ctx.emit({ type: 'takeoff', t, mode, escape: pend, speed });
  }

  private finishTakeoff(ctx: SimContext): void {
    const fly = this.fly;
    const P = this.P;
    const t = ctx.time;
    const sc = this.takeoffScale(ctx);
    fly.setState(FlyState.FLYING, ctx, t);
    if (this.pendingFlightEscape) {
      fly.flight.startEscape(this.pendingFlightDir, t, this.rng.sample(P.flight.escapeBurstMs), P.flight.escapeMaxSpeed * sc, P.flight.escapeAccel * sc);
      this.pendingFlightEscape = false;
    } else if (fly.takeoffMode === 'voluntary') {
      fly.flight.startCruise(t, Math.atan2(fly.takeoffDir.y, fly.takeoffDir.x), this.rng.range(0.3, 0.9));
    } else {
      fly.flight.startEscape(fly.takeoffDir, t, this.rng.sample(P.flight.escapeBurstMs), P.flight.escapeMaxSpeed * sc, P.flight.escapeAccel * sc);
    }
    if (fly.flight.mode === 'escape' && this.lastPlan) this.extendEscape(this.lastPlan);
  }

  // ---------------------------------------------------------------------------
  // Behaviour
  // ---------------------------------------------------------------------------

  private enterAlert(ctx: SimContext): void {
    const fly = this.fly;
    const t = ctx.time;
    if (fly.state === FlyState.GROOMING) {
      this.legsBusyUntil = t + (this.rng.sample(this.P.escape.groomingPenaltyMs) * this.latencyScale(ctx)) / 1000;
    }
    fly.setState(FlyState.ALERT, ctx, t);
    fly.walkSpeed = 0;
    this.alertHoldUntil = t + this.P.behavior.alertHoldMs / 1000;
    fly.personality.onAlert();
    if (t - this.lastAlertEmit > 0.5) {
      this.lastAlertEmit = t;
      ctx.emit({ type: 'alert', t });
    }
  }

  private updateAlert(ctx: SimContext, pc: VisualPercept, alerted: boolean): void {
    const fly = this.fly;
    const t = ctx.time;
    const pers = fly.personality;
    if (alerted) this.alertHoldUntil = Math.max(this.alertHoldUntil, t + this.P.behavior.alertHoldMs / 1000);
    fly.wingSpread += (0.3 - fly.wingSpread) * Math.min(1, ctx.dt * 20);
    if (!this.motor.pending && pc.valid && pc.lateralRate + Math.max(0, pc.thetaDot) > 0.3) {
      // Postural adjustment: turn the body away from the threat.
      fly.turnTarget = Math.atan2(-pc.dir.y, -pc.dir.x) + fly.genome.handedness * 0.35;
    }
    // Anxious flies sometimes leave before the next attack.
    const sw = ctx.swatter;
    const lateral = Math.hypot(sw.x - fly.pos.x, sw.y - fly.pos.y);
    const above = sw.z - fly.pos.z;
    if (!this.motor.pending && sw.active && lateral < 130 && above < 330 && pers.alertness > 0.5) {
      const rate = this.P.behavior.preemptiveTakeoffRate * (pers.alertness - 0.5) * 2 * (1 - 0.5 * fly.genome.boldness) * (0.5 + pers.fear);
      if (this.rng.chance(rate * ctx.dt)) {
        this.voluntaryTakeoff(ctx, true);
        return;
      }
    }
    if (t > this.alertHoldUntil && !this.motor.pending) {
      fly.setState(FlyState.RESTING, ctx, t);
    }
  }

  private spontaneous(ctx: SimContext): void {
    const fly = this.fly;
    const t = ctx.time;
    const dt = ctx.dt;
    const B = this.P.behavior;
    const pers = fly.personality;
    const g = fly.genome;
    if (fly.state !== FlyState.ALERT) fly.wingSpread += (0 - fly.wingSpread) * Math.min(1, dt * 10);
    if (t < fly.settleUntil) return;
    switch (fly.state) {
      case FlyState.RESTING: {
        const fear = pers.fear;
        const rWalk = B.walkRate * g.walkScale * (1 - 0.5 * fear);
        const rGroom = B.groomRate * g.groomingScale * (1 - 0.6 * fear) * (0.6 + 0.8 * pers.confidence);
        const rTurn = B.turnRate;
        const bored = t - fly.landedTime > B.boredomAfterS;
        let rTake = B.spontaneousTakeoffRate + pers.annoyance * 0.06 + (bored ? B.boredomTakeoffRate : 0);
        if (fly.surface?.food && pers.energy < 0.9) rTake *= 0.4;
        if (pers.energy < 0.2) rTake *= 0.3;
        const u = this.rng.next();
        if (u < rWalk * dt) this.startWalking(ctx);
        else if (u < (rWalk + rGroom) * dt) this.startGrooming(ctx);
        else if (u < (rWalk + rGroom + rTurn) * dt) fly.turnTarget = fly.heading + this.rng.normal(0, 50 * DEG);
        else if (u < (rWalk + rGroom + rTurn + rTake) * dt) this.voluntaryTakeoff(ctx, false);
        break;
      }
      case FlyState.GROOMING:
        if (t >= fly.activityUntil) fly.setState(FlyState.RESTING, ctx, t);
        break;
      case FlyState.WALKING:
        if (t >= fly.activityUntil) {
          fly.walkSpeed = 0;
          fly.setState(FlyState.RESTING, ctx, t);
        }
        break;
    }
  }

  private startWalking(ctx: SimContext): void {
    const fly = this.fly;
    fly.walkSpeed = this.rng.sample(this.P.walking.speedMmS);
    fly.activityUntil = ctx.time + this.rng.sample(this.P.walking.boutS);
    fly.setState(FlyState.WALKING, ctx, ctx.time);
  }

  private startGrooming(ctx: SimContext): void {
    const fly = this.fly;
    fly.groomType = this.rng.chance(0.55) ? 0 : 1;
    fly.activityUntil = ctx.time + this.rng.sample(this.P.behavior.groomBoutS);
    fly.setState(FlyState.GROOMING, ctx, ctx.time);
  }

  chooseSite(ctx: SimContext, excludeRadius = 25): LandingSite {
    const fly = this.fly;
    const pers = fly.personality;
    const sw = ctx.swatter;
    return this.landing.choose(
      {
        fromX: fly.pos.x,
        fromY: fly.pos.y,
        fear: pers.fear,
        confidence: pers.confidence,
        annoyance: pers.annoyance,
        energy: pers.energy,
        curiosity: fly.genome.curiosity,
        boldness: fly.genome.boldness,
        distanceScale: ctx.mod.landingDistanceScale,
        swatterX: sw.active ? sw.x : -1e4,
        swatterY: sw.active ? sw.y : -1e4,
        excludeRadius,
      },
      this.rng,
    );
  }

  /** Calm (non-escape) take-off toward a chosen destination. */
  voluntaryTakeoff(ctx: SimContext, preemptive: boolean): void {
    const fly = this.fly;
    const site = this.chooseSite(ctx, 30);
    fly.plannedSite = site;
    let az = Math.atan2(site.y - fly.pos.y, site.x - fly.pos.x);
    if (preemptive) {
      const sw = ctx.swatter;
      const away = Math.atan2(fly.pos.y - sw.y, fly.pos.x - sw.x);
      az = Math.atan2(Math.sin(az) + 1.5 * Math.sin(away), Math.cos(az) + 1.5 * Math.cos(away));
    }
    const el = this.rng.range(45, 65) * DEG;
    const dir = vec3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    this.beginTakeoff(ctx, dir, 'voluntary', null);
  }

  private cruiseTime(): number {
    const pers = this.fly.personality;
    let s = this.rng.sample(this.P.landing.cruiseBeforeLandingS) * (1 + 1.5 * pers.fear);
    if (pers.energy < 0.3) s *= 0.5;
    return s;
  }

  private updateFlight(ctx: SimContext): void {
    const fly = this.fly;
    const f = fly.flight;
    const t = ctx.time;
    fly.wingSpread = 1;
    switch (f.mode) {
      case 'escape':
        this.steer(ctx);
        if (t >= f.escapeUntil) f.startCruise(t, fly.heading, this.cruiseTime());
        break;
      case 'cruise':
        if (t >= f.landAfter) {
          const site = fly.plannedSite ?? (this.escapeSite && !this.siteUnsafe(ctx, this.escapeSite) ? this.escapeSite : this.chooseSite(ctx, 20));
          fly.plannedSite = null;
          this.escapeSite = null;
          f.startApproach(site, t);
        }
        break;
      case 'approach': {
        const s = f.site!;
        if (this.siteUnsafe(ctx, s) || t - f.approachStart > 3.5) {
          f.startApproach(this.chooseSite(ctx, 20), t);
          break;
        }
        const dx = s.x - fly.pos.x;
        const dy = s.y - fly.pos.y;
        const dz = s.z + fly.radius - fly.pos.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < this.P.landing.landingStartDistanceMm) {
          f.startLanding();
          fly.setState(FlyState.LANDING, ctx, t);
        }
        break;
      }
      case 'land':
        fly.setState(FlyState.LANDING, ctx, t);
        break;
    }
  }

  private updateLanding(ctx: SimContext): void {
    const fly = this.fly;
    const f = fly.flight;
    fly.legExtension = Math.min(1, fly.legExtension + ctx.dt * 12);
    if (f.site && this.siteUnsafe(ctx, f.site)) {
      fly.legExtension = 0;
      fly.setState(FlyState.FLYING, ctx, ctx.time);
      f.startApproach(this.chooseSite(ctx, 30), ctx.time);
    }
  }

  private siteUnsafe(ctx: SimContext, s: LandingSite): boolean {
    const sw = ctx.swatter;
    if (!sw.active) return false;
    return this.landing.siteThreatened(s, sw.x, sw.y, sw.z - s.z, sw.hy);
  }

  /** Called by physics when the fly has touched down. */
  onTouchdown(ctx: SimContext): void {
    const fly = this.fly;
    const t = ctx.time;
    const surf = this.scene.surfaceAt(fly.pos.x, fly.pos.y);
    fly.vel.x = fly.vel.y = fly.vel.z = 0;
    fly.surface = surf;
    fly.ground = surf.top;
    fly.pos.z = surf.top + fly.radius;
    fly.landedTime = t;
    fly.settleUntil = t + this.P.landing.settleMs / 1000;
    fly.wingSpread = 0;
    fly.legExtension = 0;
    fly.roll = 0;
    fly.rollRate = 0;
    fly.flight.site = null;
    fly.setState(FlyState.RESTING, ctx, t);
    ctx.emit({ type: 'landed', t, surface: surf });
  }

  /** Reset transient neural state (new fly / new benchmark trial). */
  reset(): void {
    this.threat.reset();
    this.motor.reset();
    this.lastPlan = null;
    this.escapeSite = null;
    this.motorActivity = 0;
    this.alertHoldUntil = 0;
    this.legsBusyUntil = 0;
    this.pendingFlightEscape = false;
    this.steerAt = -1;
    this.nextSteerAt = 0;
  }
}
