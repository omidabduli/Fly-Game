/**
 * Small, allocation-light vector helpers.
 * World units: millimetres (mm) and seconds (s). +x right, +y down (screen-like),
 * +z = elevation toward the camera / player (the swatter comes from +z).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function hypot2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function hypot3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function len3(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function copy3(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function set3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function normalize3(v: Vec3): Vec3 {
  const l = len3(v);
  if (l > 1e-12) {
    v.x /= l;
    v.y /= l;
    v.z /= l;
  }
  return v;
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Smallest signed difference b - a in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Rotate `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return wrapAngle(current + Math.sign(d) * maxStep);
}

export function formatMs(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`;
}
