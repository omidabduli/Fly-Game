import { cloneParams, DEFAULT_PARAMS, type SimParams } from '../src/config/params';
import { Scene, type SurfaceDef, WORLD_H, WORLD_W } from '../src/environment/Scene';
import { rect } from '../src/physics/geometry';
import { vec3 } from '../src/math/vec';
import type { VisualPercept } from '../src/neuroscience/types';

export function quietParams(): SimParams {
  const p = cloneParams(DEFAULT_PARAMS);
  p.perception.angularNoise = 0;
  p.perception.velocityNoise = 0;
  p.perception.accelNoise = 0;
  p.perception.distanceNoise = 0;
  p.perception.sizeNoise = 0;
  p.perception.visualDelayDriftMs = 0;
  p.looming.neuralNoise = 0;
  return p;
}

export function percept(over: Partial<VisualPercept> = {}): VisualPercept {
  return {
    valid: true,
    sampleTime: 0,
    delayMs: 15,
    distance: 200,
    theta: 0.2,
    thetaDot: 0,
    tau: Infinity,
    lateralRate: 0,
    dir: vec3(0, 0, 1),
    pos: vec3(0, 0, 200),
    vel: vec3(),
    acc: vec3(),
    sizeR: 41,
    ...over,
  };
}

/**
 * A plain test room for physics tests (independent of the game's decorated
 * Mensa): a desk (top 150) with one tall cup on it, a monitor and a window
 * whose frame is only 4 mm proud of the glass.
 */
export function testScene(): Scene {
  const frame = (id: string, x: number, y: number, w: number, h: number): SurfaceDef => ({ id, label: 'window frame', material: 'paint', shape: rect(x, y, w, h), top: 4, landable: true, attract: 0.3 });
  return new Scene([
    { id: 'wall', label: 'wall', material: 'wall', shape: rect(0, 0, WORLD_W, WORLD_H), top: 0, landable: true, attract: 0.3 },
    { id: 'window-glass', label: 'window', material: 'glass', shape: rect(34, 30, 132, 110), top: 0, landable: true, attract: 0.6 },
    frame('frame-top', 24, 20, 152, 10),
    frame('frame-bottom', 24, 140, 152, 10),
    frame('frame-left', 24, 20, 10, 130),
    frame('frame-right', 166, 20, 10, 130),
    frame('mullion-h', 34, 82, 132, 6),
    { id: 'monitor', label: 'monitor', material: 'screen', shape: rect(204, 34, 188, 128, 4), top: 110, landable: true, attract: 0.4 },
    { id: 'desk', label: 'desk', material: 'wood', shape: rect(0, 190, WORLD_W, WORLD_H - 190), top: 150, landable: true, attract: 0.4 },
    { id: 'cup-body', label: 'coffee cup', material: 'ceramic', shape: rect(150, 182, 50, 62, 5), top: 225, landable: true, attract: 0.45 },
  ]);
}
