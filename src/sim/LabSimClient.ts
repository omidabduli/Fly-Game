import type { Modulation } from '../config/params';
import { type MonteCarloSummary, runMonteCarlo } from './MonteCarlo';

/** Runs Lab Mode simulations in a Web Worker (falls back to the main thread). */
export class LabSimClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (s: MonteCarloSummary) => void; reject: (e: Error) => void; progress?: (u: number) => void }>();

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('../workers/montecarlo.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const m = e.data as { id: number; type: string; summary?: MonteCarloSummary; done?: number; total?: number; message?: string };
        const p = this.pending.get(m.id);
        if (!p) return;
        if (m.type === 'progress') p.progress?.((m.done ?? 0) / Math.max(1, m.total ?? 1));
        else if (m.type === 'result' && m.summary) {
          this.pending.delete(m.id);
          p.resolve(m.summary);
        } else if (m.type === 'error') {
          this.pending.delete(m.id);
          p.reject(new Error(m.message));
        }
      };
      this.worker.onerror = () => {
        for (const p of this.pending.values()) p.reject(new Error('worker failed'));
        this.pending.clear();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  run(attacks: number, seed: number, level: number, modulation: Partial<Modulation>, progress?: (u: number) => void): Promise<MonteCarloSummary> {
    const w = this.ensureWorker();
    if (!w) {
      // Main-thread fallback (smaller batch keeps the page responsive).
      return new Promise((resolve) => setTimeout(() => resolve(runMonteCarlo({ attacks: Math.min(attacks, 200), seed, level, modulation })), 30));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      w.postMessage({ id, attacks, seed, level, modulation });
    });
  }
}
