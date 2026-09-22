import { FLY_STATE_NAMES } from '../fly/Fly';
import { solveReachTime } from '../fly/EscapePlanner';
import type { Simulation } from '../game/Simulation';
import { RAD } from '../math/vec';
import { SWATTER_PHASE_NAMES } from '../player/Swatter';
import { shapePath } from './SceneRenderer';

type Ctx = CanvasRenderingContext2D;

export interface DebugInfo {
  fps: number;
  stepsPerFrame: number;
  difficulty: number;
  rollingSuccess: number;
  labMode: boolean;
  /** pointer (aim) velocity, world mm/s. The fly never sees this, only the swatter it drives */
  pointerVx: number;
  pointerVy: number;
}

/**
 * Developer / science overlay (toggle with the D or ` key, or ?debug in the
 * URL). Shows what the fly believes: its looming percept, the predicted
 * swatter trajectory and impact point, the candidate escape fan, the chosen
 * escape vector and the reaction pipeline timers.
 */
export class DebugOverlay {
  showHeightfield = true;

  drawWorld(ctx: Ctx, sim: Simulation, pxPerMm: number): void {
    const f = sim.fly;
    const b = f.brain;
    const sw = sim.swatter;
    const lw = 1 / pxPerMm;
    if (this.showHeightfield) {
      ctx.lineWidth = lw;
      ctx.font = `${10 / pxPerMm}px ui-monospace, monospace`;
      for (const o of sim.scene.objects) {
        if (o.index === 0) continue;
        shapePath(ctx, o.shape);
        ctx.strokeStyle = o.landable ? 'rgba(0,255,200,0.35)' : 'rgba(255,60,60,0.5)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,255,200,0.6)';
        ctx.fillText(`${o.top}`, o.bounds.minX + 1, o.bounds.minY + 10 / pxPerMm);
      }
    }
    // swatter contact footprint + ground under it
    ctx.strokeStyle = sw.isLethal ? 'rgba(255,40,40,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5 * lw;
    ctx.beginPath();
    ctx.roundRect(sw.x - sw.hx, sw.y - sw.hy, 2 * sw.hx, 2 * sw.hy, sw.r);
    ctx.stroke();
    // perceived swatter trajectory (what the fly believes)
    const pc = b.percept;
    if (pc.valid) {
      ctx.fillStyle = 'rgba(255,170,0,0.9)';
      for (let ms = 0; ms <= 150; ms += 10) {
        const t = ms / 1000;
        const x = pc.pos.x + pc.vel.x * t + 0.5 * pc.acc.x * t * t;
        const y = pc.pos.y + pc.vel.y * t + 0.5 * pc.acc.y * t * t;
        ctx.beginPath();
        ctx.arc(x, y, 2.2 * lw * (1 + ms / 150), 0, Math.PI * 2);
        ctx.fill();
      }
      // line of sight
      ctx.strokeStyle = `rgba(255,170,0,${0.2 + 0.6 * b.escape.output.threatLevel})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(f.pos.x, f.pos.y);
      ctx.lineTo(pc.pos.x, pc.pos.y);
      ctx.stroke();
    }
    // last escape plan
    const plan = b.lastPlan;
    if (plan && sim.time - plan.planTime < 1.2) {
      ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.strokeStyle = 'rgba(255,140,0,0.85)';
      ctx.lineWidth = 1.2 * lw;
      ctx.beginPath();
      ctx.roundRect(plan.futureSwatter.x - sw.hx, plan.futureSwatter.y - sw.hy, 2 * sw.hx, 2 * sw.hy, sw.r);
      ctx.stroke();
      ctx.setLineDash([]);
      // predicted impact crosshair
      const pi = plan.predictedImpact;
      ctx.strokeStyle = 'rgba(255,50,50,0.95)';
      ctx.beginPath();
      ctx.moveTo(pi.x - 4, pi.y);
      ctx.lineTo(pi.x + 4, pi.y);
      ctx.moveTo(pi.x, pi.y - 4);
      ctx.lineTo(pi.x, pi.y + 4);
      ctx.stroke();
      // candidate fan (length ∝ clearance)
      for (const c of plan.fan) {
        const len = Math.max(1, Math.min(40, c.clearance + 10));
        ctx.strokeStyle = c.clearance >= 0 ? 'rgba(80,255,120,0.55)' : 'rgba(255,60,60,0.55)';
        ctx.beginPath();
        ctx.moveTo(f.pos.x, f.pos.y);
        ctx.lineTo(f.pos.x + Math.cos(c.az) * len * 0.6, f.pos.y + Math.sin(c.az) * len * 0.6);
        ctx.stroke();
      }
      // chosen escape vector
      ctx.strokeStyle = '#ff3df2';
      ctx.lineWidth = 2 * lw;
      ctx.beginPath();
      ctx.moveTo(f.pos.x, f.pos.y);
      ctx.lineTo(f.pos.x + plan.dir.x * 30, f.pos.y + plan.dir.y * 30);
      ctx.stroke();
    }
    // velocity
    const sp = Math.hypot(f.vel.x, f.vel.y);
    if (sp > 1) {
      ctx.strokeStyle = '#3cff6b';
      ctx.lineWidth = 1.5 * lw;
      ctx.beginPath();
      ctx.moveTo(f.pos.x, f.pos.y);
      ctx.lineTo(f.pos.x + f.vel.x * 0.03, f.pos.y + f.vel.y * 0.03);
      ctx.stroke();
    }
    // landing target
    const site = f.flight.site ?? b.escapeSite;
    if (site && f.airborne) {
      ctx.strokeStyle = 'rgba(120,200,255,0.9)';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(site.x, site.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawText(ctx: Ctx, x: number, y: number, sim: Simulation, info: DebugInfo): void {
    const f = sim.fly;
    const b = f.brain;
    const sw = sim.swatter;
    const pc = b.percept;
    const es = b.escape.output;
    const trueTTC = solveReachTime(sw.z - (f.pos.z + f.radius), sw.vz, sw.phase === 2 ? sw.az : 0);
    const pend = b.motor.pending ?? b.motor.last;
    const plan = b.lastPlan;
    const m = sim.modulation;
    const pers = f.personality;
    const t = sim.time;
    const lines = [
      `FPS ${info.fps.toFixed(0)} · physics ${(1 / sim.dt).toFixed(0)} Hz · ${info.stepsPerFrame} steps/frame${info.labMode ? ' · LAB' : ''}`,
      `fly #${f.id} ${f.genome.nickname} [${f.genome.traits.join(', ')}]`,
      `  pos (${f.pos.x.toFixed(1)}, ${f.pos.y.toFixed(1)}, ${f.pos.z.toFixed(1)}) mm  |v| ${f.speed.toFixed(0)} mm/s`,
      `  state ${FLY_STATE_NAMES[f.state]}  flight ${f.airborne ? f.flight.mode : '-'}  on ${f.surface?.label ?? 'air'}`,
      `swatter (${sw.x.toFixed(0)}, ${sw.y.toFixed(0)}, ${sw.z.toFixed(0)})  v (${sw.vx.toFixed(0)}, ${sw.vy.toFixed(0)}, ${sw.vz.toFixed(0)}) mm/s  ${SWATTER_PHASE_NAMES[sw.phase]}`,
      `pointer v (${info.pointerVx.toFixed(0)}, ${info.pointerVy.toFixed(0)}) mm/s  |${Math.hypot(info.pointerVx, info.pointerVy).toFixed(0)}|`,
      `threat ${es.threatLevel.toFixed(2)}  (alert ${b.thresholds.alert.toFixed(2)} · escape ${b.thresholds.escape.toFixed(2)})`,
      `  θ ${(pc.theta * RAD).toFixed(1)}°  θ̇ ${(pc.thetaDot * RAD).toFixed(0)}°/s  τ ${Number.isFinite(pc.tau) ? (pc.tau * 1000).toFixed(0) + ' ms' : '-'}  delay ${pc.delayMs.toFixed(1)} ms`,
      `  true time-to-impact ${Number.isFinite(trueTTC) && trueTTC < 3 ? (trueTTC * 1000).toFixed(0) + ' ms' : '-'}`,
      plan
        ? `plan: horizon ${(plan.horizon * 1000).toFixed(0)} ms  impact ${Number.isFinite(plan.impactTime) ? (plan.impactTime * 1000).toFixed(0) + ' ms' : '-'} @ (${plan.predictedImpact.x.toFixed(0)}, ${plan.predictedImpact.y.toFixed(0)})`
        : 'plan: -',
      plan
        ? `  escape az ${((plan.azimuth * RAD + 360) % 360).toFixed(0)}° el ${(plan.elevation * RAD).toFixed(0)}°  clearance ${plan.clearance.toFixed(1)} mm${plan.emergency ? '  EMERGENCY' : ''}`
        : '',
      pend
        ? `reaction: fired ${((pend.firedAt - t) * 1000).toFixed(0)} ms · decide ${((pend.decideAt - t) * 1000).toFixed(0)} · go ${((pend.goAt - t) * 1000).toFixed(0)} ms (${pend.mode})`
        : 'reaction: idle',
      `difficulty ${info.difficulty.toFixed(2)} · rolling success ${(info.rollingSuccess * 100).toFixed(2)}%`,
      `  mod thr×${m.thresholdScale.toFixed(2)} lat×${m.latencyScale.toFixed(2)} take-off×${m.takeoffScale.toFixed(2)} rnd×${m.randomnessScale.toFixed(2)}`,
      `mind: fear ${pers.fear.toFixed(2)} energy ${pers.energy.toFixed(2)} alert ${pers.alertness.toFixed(2)} annoy ${pers.annoyance.toFixed(2)} conf ${pers.confidence.toFixed(2)}`,
    ];
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, lines.length * 14 + 10, 8);
    ctx.fill();
    ctx.fillStyle = '#d7ffe0';
    lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 17 + i * 14));
    ctx.restore();
  }
}
