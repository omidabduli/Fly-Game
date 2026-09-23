import { DEFAULT_PARAMS, type Modulation, NEUTRAL_MODULATION, type SimParams, cloneParams } from '../config/params';
import { Scene } from '../environment/Scene';
import { Fly, FlyState } from '../fly/Fly';
import type { LandingSite } from '../fly/LandingSystem';
import { type FlyGenome, randomGenome } from '../fly/Personality';
import { Rng } from '../math/rng';
import { vec3 } from '../math/vec';
import { equivalentHeadRadius } from '../neuroscience/VisualSystem';
import { type CapsulePose, PhysicsWorld } from '../physics/PhysicsWorld';
import { SwatterHistory } from '../physics/SwatterHistory';
import { Swatter, SwatterPhase } from '../player/Swatter';
import { AttackTracker } from './AttackTracker';
import type { SimContext, SimEvent } from './context';

export interface SimulationOptions {
  seed?: number;
  params?: SimParams;
  scene?: Scene;
}

export type SpawnMode = 'random' | 'edge' | LandingSite;

/**
 * Headless, deterministic (given a seed) simulation of one room, one swatter
 * and one fly, advanced with a fixed timestep. Contains no rendering or DOM
 * code, so it runs identically in the browser, in a Web Worker, in unit tests
 * and in the Monte-Carlo benchmark.
 */
export class Simulation {
  readonly params: SimParams;
  readonly scene: Scene;
  readonly rng: Rng;
  readonly swatter: Swatter;
  readonly history: SwatterHistory;
  readonly physics: PhysicsWorld;
  readonly tracker: AttackTracker;
  readonly ctx: SimContext;
  readonly headRadius: number;
  readonly dt: number;
  fly!: Fly;
  time = 0;
  flyCount = 0;
  /** smallest fly-swatter gap measured in the last step (mm) */
  lastStepGap = Infinity;
  private readonly listeners = new Set<(e: SimEvent) => void>();
  private pendingMod: Modulation | null = null;
  private readonly stepHooks: ((sim: Simulation) => void)[] = [];

  constructor(opts: SimulationOptions = {}) {
    this.params = opts.params ? cloneParams(opts.params) : cloneParams(DEFAULT_PARAMS);
    this.rng = opts.seed !== undefined ? new Rng(opts.seed) : Rng.fromTime();
    this.scene = opts.scene ?? new Scene();
    this.dt = this.params.sim.dtMs / 1000;
    this.swatter = new Swatter(this.scene, this.params.swatter, this.rng.fork());
    this.history = new SwatterHistory(Math.ceil(this.params.sim.perceptionBufferMs / this.params.sim.dtMs) + 4);
    this.physics = new PhysicsWorld(this.scene, this.params);
    this.tracker = new AttackTracker(this.params, this.physics);
    const sw = this.swatter;
    this.headRadius = equivalentHeadRadius(sw.hx, sw.hy, sw.r);
    this.ctx = {
      time: 0,
      dt: this.dt,
      scene: this.scene,
      swatter: this.swatter,
      history: this.history,
      params: this.params,
      rng: this.rng,
      mod: { ...NEUTRAL_MODULATION },
      emit: (e) => this.emit(e),
    };
    this.spawnFly({ at: 'random' });
  }

  on(fn: (e: SimEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStep(fn: (sim: Simulation) => void): void {
    this.stepHooks.push(fn);
  }

  private emit(e: SimEvent): void {
    switch (e.type) {
      case 'threat':
        this.tracker.onEscapeEvent(e.escape, null);
        break;
      case 'escapeCommand':
        this.tracker.onEscapeEvent(e.escape, e.plan);
        break;
      case 'takeoff':
        if (e.escape) this.tracker.onTakeoffDir(this.fly.takeoffDir.x, this.fly.takeoffDir.y);
        break;
      case 'evade':
        if (this.fly.brain.lastPlan) this.tracker.onTakeoffDir(this.fly.brain.lastPlan.dir.x, this.fly.brain.lastPlan.dir.y);
        break;
    }
    for (const l of this.listeners) l(e);
  }

  get modulation(): Modulation {
    return this.ctx.mod;
  }

  /**
   * Queue new behaviour multipliers. They are applied only when no strike or
   * escape is in progress, so difficulty never changes mid-attack.
   */
  setModulation(m: Modulation, immediate = false): void {
    if (immediate) {
      this.ctx.mod = { ...m };
      this.pendingMod = null;
    } else {
      this.pendingMod = { ...m };
    }
  }

  spawnFly(opts: { genome?: FlyGenome; at?: SpawnMode } = {}): Fly {
    this.flyCount++;
    const genome = opts.genome ?? randomGenome(this.rng, this.flyCount);
    const fly = new Fly(this.flyCount, genome, this.scene, this.params, this.rng, this.headRadius);
    fly.personality.randomize(this.rng);
    fly.spawnTime = this.time;
    fly.heading = this.rng.range(-Math.PI, Math.PI);
    const at = opts.at ?? 'random';
    if (at === 'edge') {
      // A new fly flies in from outside the view (never appears out of nowhere).
      const side = this.rng.int(0, 3);
      const W = this.scene.width;
      const H = this.scene.height;
      const p =
        side === 0 ? vec3(3, this.rng.range(30, 170), 160) : side === 1 ? vec3(W - 3, this.rng.range(30, 170), 160) : vec3(this.rng.range(40, W - 40), 3, 150);
      const target = vec3(W / 2 + this.rng.range(-80, 80), H / 2 + this.rng.range(-40, 40), 150);
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      fly.placeInAir(p, vec3((dx / l) * 350, (dy / l) * 350, 0), this.time);
      fly.flight.startCruise(this.time, Math.atan2(dy, dx), this.rng.range(0.9, 1.8));
    } else {
      const site = at === 'random' ? fly.brain.landing.randomValidSpot(this.rng) : at;
      fly.placeOn(site.x, site.y, site.object, this.time);
      fly.landedTime = this.time - this.rng.range(2, 10);
    }
    this.fly = fly;
    this.tracker.cancel();
    this.emit({ type: 'flySpawned', t: this.time, flyId: fly.id });
    return fly;
  }

  step(): void {
    const dt = this.dt;
    this.time += dt;
    const t = this.time;
    this.ctx.time = t;
    const sw = this.swatter;
    const fly = this.fly;

    if (this.pendingMod && !sw.busy && !this.tracker.inProgress && !fly.brain.motor.pending && fly.state !== FlyState.TAKEOFF) {
      this.ctx.mod = this.pendingMod;
      this.pendingMod = null;
    }

    // 1. Swatter (player-driven physics).
    const prevSw = { x: sw.x, y: sw.y, z: sw.z };
    const ev = sw.update(dt, t);
    if (ev.strikeStart) {
      this.tracker.onStrikeStart(t, sw, fly);
      this.emit({ type: 'strikeStart', t, strikeId: sw.strikeId });
    }
    if (ev.swingStart) {
      this.tracker.onSwingStart(t, sw);
      this.emit({ type: 'swingStart', t, strikeId: sw.strikeId });
    }
    this.history.push(t, sw.x, sw.y, sw.z, sw.vx, sw.vy, sw.vz, sw.active);

    // 2. Fly: brain (perception -> decision) then body physics.
    const prevFly: CapsulePose = { x: fly.pos.x, y: fly.pos.y, z: fly.pos.z, heading: fly.heading };
    fly.brain.update(this.ctx);
    this.physics.integrateFly(fly, this.ctx);

    // 3. Swatter ↔ fly contact.
    let stepGap = Infinity;
    if (fly.alive && (sw.phase === SwatterPhase.SWING || ev.impact)) {
      const res = this.physics.sweptHit(prevFly, fly, prevSw, sw);
      stepGap = res.minGap;
      if (res.hit) this.kill(fly, t, res.x, res.y, res.z);
      else if (ev.impact && this.physics.flexHit(fly, sw)) this.kill(fly, t, fly.pos.x, fly.pos.y, fly.pos.z);
    } else if (fly.alive) {
      this.physics.pushOutOfSwatter(fly, sw);
    } else if (fly.deathTime >= sw.strikeStartTime && (sw.phase === SwatterPhase.SWING || ev.impact)) {
      // Pressed against the face of the swatter that killed it (x/y never change).
      fly.pos.z = Math.max(fly.ground + 0.3, Math.min(fly.pos.z, sw.z - 0.4));
    } else if (!fly.alive && sw.phase === SwatterPhase.RECOVER || (!fly.alive && sw.phase === SwatterPhase.IDLE)) {
      // A fly squashed in mid-air drops onto the surface below once the swatter lifts.
      if (fly.pos.z > fly.ground + 0.3) fly.pos.z = Math.max(fly.ground + 0.3, fly.pos.z - 400 * dt);
    }
    this.lastStepGap = stepGap;

    // 4. Attack measurement.
    this.tracker.update(t, fly, sw, stepGap);
    if (ev.impact) {
      const hit = fly.state === FlyState.DEAD && fly.deathTime >= sw.strikeStartTime;
      this.emit({ type: 'impact', t, strikeId: sw.strikeId, x: sw.impactX, y: sw.impactY, z: sw.impactZ, surface: sw.groundObject, speed: sw.impactSpeed, hit });
      const result = this.tracker.resolve(t, fly, sw, hit);
      if (result) {
        if (!result.hit && fly.alive) {
          fly.personality.onAttackSurvived(result.minGapMm);
          if (result.serious) fly.attacksSurvived++;
        }
        this.emit({ type: 'attackResolved', t, result });
      }
    }
    for (const h of this.stepHooks) h(this);
  }

  private kill(fly: Fly, t: number, x: number, y: number, z: number): void {
    fly.pos.x = x;
    fly.pos.y = y;
    fly.pos.z = z;
    fly.deathPos.x = x;
    fly.deathPos.y = y;
    fly.deathPos.z = z;
    fly.vel.x = fly.vel.y = fly.vel.z = 0;
    fly.ground = this.scene.heightAt(x, y);
    fly.deathTime = t;
    const airborne = fly.heightAboveGround > 4;
    fly.killedAirborne = airborne;
    fly.brain.motor.cancel();
    fly.setState(FlyState.DEAD, this.ctx, t);
    this.emit({ type: 'hit', t, strikeId: this.swatter.strikeId, airborne });
  }

  /**
   * Someone waves the fly off their plate: if it's calmly sitting there (and no
   * swing is in progress) it takes off, just like a spontaneous take-off.
   */
  shoo(): boolean {
    const fly = this.fly;
    const calm = fly.state === FlyState.RESTING || fly.state === FlyState.GROOMING || fly.state === FlyState.WALKING;
    if (!fly.alive || !calm || this.swatter.busy || this.tracker.inProgress || fly.brain.motor.pending) return false;
    fly.brain.voluntaryTakeoff(this.ctx, false);
    return true;
  }

  /** Advance by `seconds` of simulated time. */
  advance(seconds: number): void {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }
}
