/// <reference lib="webworker" />
import type { Modulation } from '../config/params';
import { runMonteCarlo } from '../sim/MonteCarlo';

/**
 * Runs Monte-Carlo attack simulations off the main thread so rendering never
 * stalls (used by Lab Mode).
 */
export interface MCRequest {
  id: number;
  attacks: number;
  seed: number;
  level: number;
  modulation: Partial<Modulation>;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<MCRequest>) => {
  const { id, attacks, seed, level, modulation } = e.data;
  try {
    const summary = runMonteCarlo({
      attacks,
      seed,
      level,
      modulation,
      onProgress: (done, total) => ctx.postMessage({ id, type: 'progress', done, total }),
    });
    ctx.postMessage({ id, type: 'result', summary });
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: String(err) });
  }
};
