import type { Modulation, SimParams } from '../config/params';
import type { Scene, SurfaceObject } from '../environment/Scene';
import type { EscapePlan } from '../fly/EscapePlanner';
import type { Rng } from '../math/rng';
import type { EscapeMode, PendingEscape } from '../neuroscience/types';
import type { SwatterHistory } from '../physics/SwatterHistory';
import type { Swatter } from '../player/Swatter';
import type { AttackResult } from './AttackTracker';

/** Everything a simulation component may read during a fixed step. */
export interface SimContext {
  time: number;
  dt: number;
  scene: Scene;
  swatter: Swatter;
  history: SwatterHistory;
  params: SimParams;
  rng: Rng;
  mod: Modulation;
  emit(e: SimEvent): void;
}

export type SimEvent =
  | { type: 'alert'; t: number }
  | { type: 'threat'; t: number; escape: PendingEscape }
  | { type: 'escapeCommand'; t: number; escape: PendingEscape; plan: EscapePlan }
  | { type: 'takeoff'; t: number; mode: EscapeMode; escape: PendingEscape | null; speed: number }
  | { type: 'evade'; t: number; escape: PendingEscape }
  | { type: 'landed'; t: number; surface: SurfaceObject }
  | { type: 'state'; t: number; from: number; to: number }
  | { type: 'strikeStart'; t: number; strikeId: number }
  | { type: 'swingStart'; t: number; strikeId: number }
  | { type: 'impact'; t: number; strikeId: number; x: number; y: number; z: number; surface: SurfaceObject; speed: number; hit: boolean }
  | { type: 'hit'; t: number; strikeId: number; airborne: boolean }
  | { type: 'attackResolved'; t: number; result: AttackResult }
  | { type: 'flySpawned'; t: number; flyId: number };

export type SimEventType = SimEvent['type'];
