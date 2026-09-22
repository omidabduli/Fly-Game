import type { BrainActivity, PendingEscape } from '../neuroscience/types';

type Ctx = CanvasRenderingContext2D;

interface Spike {
  seg: number;
  u: number;
}

const NODES = [
  { key: 'visual', title: 'VISUAL', sub: 'photoreceptors · T4/T5', color: [120, 190, 255] },
  { key: 'looming', title: 'LOOMING', sub: 'LC4 · LPLC2', color: [190, 140, 255] },
  { key: 'escape', title: 'ESCAPE', sub: 'Giant Fiber', color: [255, 160, 80] },
  { key: 'motor', title: 'MOTOR', sub: 'DN → TTMn jump', color: [255, 90, 90] },
] as const;

/**
 * Brain View: a live, simplified picture of the escape pathway
 * VISUAL -> LOOMING -> ESCAPE -> MOTOR. Node brightness is module activity;
 * dots travelling along the arrows are "spikes" emitted in proportion to the
 * upstream activity. These are conceptual modules, not individual neurons.
 */
export class BrainView {
  private spikes: Spike[] = [];
  private trace: number[] = [];
  private traceAt = 0;
  private emitAcc = [0, 0, 0];

  update(a: BrainActivity, dt: number, time: number): void {
    const act = [a.visual, a.looming, a.escape, a.motor];
    for (let s = 0; s < 3; s++) {
      this.emitAcc[s] += dt * (2 + 45 * act[s] * act[s]);
      while (this.emitAcc[s] >= 1) {
        this.emitAcc[s] -= 1;
        if (act[s] > 0.08) this.spikes.push({ seg: s, u: 0 });
      }
    }
    for (const sp of this.spikes) sp.u += dt * 3.2;
    this.spikes = this.spikes.filter((s) => s.u < 1);
    if (this.spikes.length > 80) this.spikes.splice(0, this.spikes.length - 80);
    if (time - this.traceAt > 1 / 60) {
      this.traceAt = time;
      this.trace.push(a.threatLevel);
      if (this.trace.length > 110) this.trace.shift();
    }
  }

  draw(ctx: Ctx, x: number, y: number, w: number, a: BrainActivity, last: PendingEscape | null, stateName: string, scale: number): void {
    const h = 176;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // panel
    ctx.fillStyle = 'rgba(12,16,24,0.78)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('BRAIN VIEW · escape pathway (simplified model)', 12, 17);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'right';
    ctx.fillText(stateName, w - 12, 17);
    ctx.textAlign = 'left';
    // nodes
    const act = [a.visual, a.looming, a.escape, a.motor];
    const nw = (w - 24 - 3 * 16) / 4;
    const ny = 28;
    const nh = 46;
    const cx: number[] = [];
    for (let i = 0; i < 4; i++) {
      const nx = 12 + i * (nw + 16);
      cx.push(nx);
      const [r, g, b] = NODES[i].color;
      const v = Math.min(1, act[i]);
      // glow: two soft outlines instead of shadowBlur (slow in Safari)
      if (v > 0.05) {
        for (const [grow, a] of [
          [6, 0.12],
          [3, 0.25],
        ]) {
          ctx.fillStyle = `rgba(${r},${g},${b},${a * v})`;
          ctx.beginPath();
          ctx.roundRect(nx - grow, ny - grow, nw + 2 * grow, nh + 2 * grow, 8 + grow);
          ctx.fill();
        }
      }
      ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + 0.6 * v})`;
      ctx.beginPath();
      ctx.roundRect(nx, ny, nw, nh, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(nx, ny, nw, nh, 8);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 10.5px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(NODES[i].title, nx + 7, ny + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(NODES[i].sub, nx + 7, ny + 29, nw - 10);
      // activity bar
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(nx + 7, ny + 36, nw - 14, 4);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(nx + 7, ny + 36, (nw - 14) * v, 4);
      // arrow
      if (i < 3) {
        const ax = nx + nw + 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(ax, ny + nh / 2);
        ctx.lineTo(ax + 12, ny + nh / 2);
        ctx.lineTo(ax + 8, ny + nh / 2 - 3);
        ctx.moveTo(ax + 12, ny + nh / 2);
        ctx.lineTo(ax + 8, ny + nh / 2 + 3);
        ctx.stroke();
      }
    }
    // spikes
    for (const sp of this.spikes) {
      const x0 = cx[sp.seg] + nw * 0.5;
      const x1 = cx[sp.seg + 1] + nw * 0.5;
      const px = x0 + (x1 - x0) * sp.u;
      const [r, g, b] = NODES[sp.seg].color;
      ctx.fillStyle = `rgba(${r},${g},${b},${1 - sp.u * 0.5})`;
      ctx.beginPath();
      ctx.arc(px, ny + nh / 2 + Math.sin(sp.u * Math.PI) * -14, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // GF potential trace
    const tx = 12;
    const ty = 84;
    const tw = w * 0.52;
    const th = 46;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(tx, ty, tw, th);
    const yOf = (v: number) => ty + th - Math.min(1.05, v) * th;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,200,80,0.6)';
    ctx.beginPath();
    ctx.moveTo(tx, yOf(a.alertThreshold));
    ctx.lineTo(tx + tw, yOf(a.alertThreshold));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,90,0.8)';
    ctx.beginPath();
    ctx.moveTo(tx, yOf(a.escapeThreshold));
    ctx.lineTo(tx + tw, yOf(a.escapeThreshold));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.trace.forEach((v, i) => {
      const px = tx + (i / 109) * tw;
      if (i === 0) ctx.moveTo(px, yOf(v));
      else ctx.lineTo(px, yOf(v));
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('threat level (GF potential)', tx + 3, ty + 10);
    ctx.fillStyle = 'rgba(255,120,120,0.9)';
    ctx.fillText('escape', tx + tw - 34, yOf(a.escapeThreshold) - 3);
    // readouts
    const rx = tx + tw + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
    ctx.fillText(`θ   ${deg(a.theta)}°`, rx, ty + 10);
    ctx.fillText(`θ̇   ${deg(Math.max(0, a.thetaDot)).padStart(5)}°/s`, rx, ty + 23);
    ctx.fillText(`τ   ${Number.isFinite(a.tau) && a.tau < 5 ? (a.tau * 1000).toFixed(0) + ' ms' : '-'}`, rx, ty + 36);
    ctx.fillText(`LC4 ${a.lc4.toFixed(2)}  LPLC2 ${a.lplc2.toFixed(2)}`, rx, ty + 49);
    // last escape timing
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '9.5px ui-sans-serif, system-ui, sans-serif';
    if (last) {
      const total = last.visualDelayMs + last.decisionDelayMs + last.penaltyMs + last.motorDelayMs;
      const pen = last.penaltyMs > 0.5 ? ` + busy ${last.penaltyMs.toFixed(0)}` : '';
      ctx.fillText(
        `last escape: visual ${last.visualDelayMs.toFixed(0)} + decision ${last.decisionDelayMs.toFixed(0)}${pen} + motor ${last.motorDelayMs.toFixed(0)} = ${total.toFixed(0)} ms (${last.mode} mode)`,
        12,
        h - 26,
        w - 24,
      );
    } else {
      ctx.fillText('no escape yet, try swatting', 12, h - 26);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Inspired by fly looming-escape circuits; not a full brain simulation.', 12, h - 11, w - 24);
    ctx.restore();
  }

  static height(scale: number): number {
    return 176 * scale;
  }
}
