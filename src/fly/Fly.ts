import type { SimParams } from '../config/params';
import type { Scene, SurfaceObject } from '../environment/Scene';
import type { SimContext } from '../game/context';
import type { Rng } from '../math/rng';
import { type Vec3, vec3 } from '../math/vec';
import type { EscapeMode } from '../neuroscience/types';
import { FlightController } from './FlightController';
import { FlyBrain } from './FlyBrain';
import type { LandingSite } from './LandingSystem';
import { type FlyGenome, Personality } from './Personality';

export const FlyState = {
  RESTING: 0,
  GROOMING: 1,
  WALKING: 2,
  ALERT: 3,
  TAKEOFF: 4,
  FLYING: 5,
  LANDING: 6,
  DEAD: 7,
} as const;
export type FlyState = (typeof FlyState)[keyof typeof FlyState];
export const FLY_STATE_NAMES = ['RESTING', 'GROOMING', 'WALKING', 'ALERT', 'TAKEOFF', 'FLYING', 'LANDING', 'DEAD'] as const;

export function isSurfaceState(s: FlyState): boolean {
  return s === FlyState.RESTING || s === FlyState.GROOMING || s === FlyState.WALKING || s === FlyState.ALERT;
}

export function isAirborneState(s: FlyState): boolean {
  return s === FlyState.TAKEOFF || s === FlyState.FLYING || s === FlyState.LANDING;
}

/**
 * The fly's body: physical state (position, velocity, heading), behavioural
 * state machine and animation variables. Decisions live in FlyBrain, flight
 * control in FlightController, integration/collisions in PhysicsWorld.
 */
export class Fly {
  readonly pos = vec3();
  readonly vel = vec3();
  heading = 0;
  state: FlyState = FlyState.RESTING;
  stateSince = 0;
  surface: SurfaceObject | null = null;
  /** elevation of the heightfield under the fly */
  ground = 0;
  readonly radius: number;
  readonly halfLength: number;

  // animation
  wingPhase = 0;
  /** 0 folded ... 1 raised (pre-take-off) */
  wingSpread = 0;
  legPhase = 0;
  groomType: 0 | 1 = 0;
  groomPhase = 0;
  roll = 0;
  rollRate = 0;
  /** 0 tucked ... 1 extended (landing) */
  legExtension = 0;
  turnTarget: number | null = null;

  // activity bookkeeping
  activityUntil = 0;
  walkSpeed = 0;
  pauseUntil = 0;
  settleUntil = 0;

  // take-off
  readonly takeoffDir = vec3(0, 0, 1);
  takeoffSpeed = 0;
  takeoffDuration = 0;
  takeoffStart = 0;
  takeoffMode: EscapeMode = 'long';
  /** landing site chosen at voluntary take-off */
  plannedSite: LandingSite | null = null;

  // life
  spawnTime = 0;
  landedTime = 0;
  deathTime = -1;
  /** was it swatted in mid-air (>= 4 mm above a surface) */
  killedAirborne = false;
  attacksSurvived = 0;
  lastEscapeAzimuth: number | null = null;
  /** position at which the swatter killed it (never changes afterwards) */
  readonly deathPos = vec3();

  readonly personality: Personality;
  readonly flight: FlightController;
  readonly brain: FlyBrain;

  constructor(
    readonly id: number,
    readonly genome: FlyGenome,
    scene: Scene,
    params: SimParams,
    rng: Rng,
    headRadius: number,
  ) {
    this.radius = params.fly.capsuleRadiusMm;
    this.halfLength = params.fly.capsuleHalfLengthMm;
    this.personality = new Personality(params.behavior);
    this.flight = new FlightController(scene, params.flight, params.landing, rng);
    this.brain = new FlyBrain(this, scene, params, rng, headRadius);
  }

  get onSurface(): boolean {
    return isSurfaceState(this.state);
  }

  get airborne(): boolean {
    return isAirborneState(this.state);
  }

  get alive(): boolean {
    return this.state !== FlyState.DEAD;
  }

  get speed(): number {
    const v = this.vel;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /** Height of the body above the surface directly under it. */
  get heightAboveGround(): number {
    return this.pos.z - this.radius - this.ground;
  }

  setState(s: FlyState, ctx: SimContext | null, t: number): void {
    if (s === this.state) return;
    const from = this.state;
    this.state = s;
    this.stateSince = t;
    ctx?.emit({ type: 'state', t, from, to: s });
  }

  /** Put the fly on a surface point (used for spawning; never during play). */
  placeOn(x: number, y: number, surface: SurfaceObject, t: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = surface.top + this.radius;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.surface = surface;
    this.ground = surface.top;
    this.state = FlyState.RESTING;
    this.stateSince = t;
    this.landedTime = t;
    this.wingSpread = 0;
    this.legExtension = 0;
    this.roll = 0;
    this.rollRate = 0;
  }

  /** Start flying from an arbitrary point (spawning a new fly entering the room). */
  placeInAir(pos: Vec3, vel: Vec3, t: number): void {
    this.pos.x = pos.x;
    this.pos.y = pos.y;
    this.pos.z = pos.z;
    this.vel.x = vel.x;
    this.vel.y = vel.y;
    this.vel.z = vel.z;
    this.heading = Math.atan2(vel.y, vel.x);
    this.surface = null;
    this.state = FlyState.FLYING;
    this.stateSince = t;
  }
}
