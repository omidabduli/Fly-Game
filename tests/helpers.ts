import { cloneParams, DEFAULT_PARAMS, type SimParams } from '../src/config/params';
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
