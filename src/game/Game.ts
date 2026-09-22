import { AchievementManager } from '../analytics/Achievements';
import { LocalLeaderboard } from '../analytics/Leaderboard';
import { StatsManager } from '../analytics/StatsManager';
import { AudioEngine } from '../audio/AudioEngine';
import { combineModulation } from '../config/params';
import { FLY_STATE_NAMES, FlyState } from '../fly/Fly';
import { clamp } from '../math/vec';
import { type CircuitGraph, loadCircuit } from '../neuroscience/connectome/ConnectomeLoader';
import { InputController, type PointerKind } from '../player/InputController';
import { SwatterPhase } from '../player/Swatter';
import { BrainView } from '../render/BrainView';
import { Camera } from '../render/Camera';
import { DebugOverlay } from '../render/DebugOverlay';
import { Effects } from '../render/Effects';
import { type FlyPose, FlyRenderer } from '../render/FlyRenderer';
import { SceneRenderer } from '../render/SceneRenderer';
import { type SwatterPose, SwatterRenderer } from '../render/SwatterRenderer';
import { isDefaultLab, LAB_DEFAULTS, type LabSettings, labModulation } from '../sim/LabSettings';
import { LabSimClient } from '../sim/LabSimClient';
import { LabPanel } from '../ui/LabPanel';
import { catchHTML, fmtTime, howToHTML, menuHTML, scienceHTML, statsHTML, titleHTML } from '../ui/screens';
import { type ToastTone, UI } from '../ui/UI';
import type { AttackResult } from './AttackTracker';
import { DifficultyController, modulationForLevel } from './DifficultyController';
import { type ReplayClip, ReplaySystem } from './ReplaySystem';
import { Simulation } from './Simulation';
import { loadJSON, saveJSON } from '../analytics/storage';

type Mode = 'title' | 'play' | 'caught' | 'replay';

interface ReplayPlayer {
  clip: ReplayClip;
  t: number;
  t0: number;
  t1: number;
  speed: number;
  playing: boolean;
  returnTo: Mode;
}

/**
 * Browser game shell: owns the canvas, the fixed-timestep loop (1 kHz physics
 * independent of rendering FPS), rendering, audio, UI and persistence around
 * the headless Simulation.
 */
export class Game {
  readonly sim: Simulation;
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private readonly scene: SceneRenderer;
  private readonly flyR = new FlyRenderer();
  private readonly swR = new SwatterRenderer();
  private readonly effects = new Effects();
  private readonly brainView = new BrainView();
  private readonly debug = new DebugOverlay();
  readonly ui: UI;
  private readonly lab: LabPanel;
  readonly audio = new AudioEngine();
  private readonly input: InputController;
  readonly stats = new StatsManager();
  private readonly achievements = new AchievementManager();
  private readonly leaderboard = new LocalLeaderboard();
  readonly difficulty: DifficultyController;
  private readonly replay: ReplaySystem;
  private readonly labSim = new LabSimClient();
  private circuit: CircuitGraph | null = null;

  mode: Mode = 'title';
  private showBrain = false;
  private showDebug = false;
  private labMode = false;
  private labSettings: LabSettings = { ...LAB_DEFAULTS };
  private flySurvival = 0;
  private flyAttempts = 0;
  private flyStreak = 0;
  private aimSX = 0;
  private aimSY = 0;
  private lastFrame = 0;
  private acc = 0;
  private fps = 60;
  private stepsThisFrame = 0;
  private pendingCapture: { result: AttackResult; at: number } | null = null;
  /** smoothed pointer (aim) velocity in world mm/s, shown in the debug overlay */
  private pointerVx = 0;
  private pointerVy = 0;
  private lastAimWX = NaN;
  private lastAimWY = NaN;
  /** brief ring that shows where the fly just landed */
  private ping: { x: number; y: number; t: number } | null = null;
  private player: ReplayPlayer | null = null;
  private catchTimer = 0;
  private rebuildTimer = 0;
  private visible = true;
  private time = 0;
  private hudTimer = 0;
  private playSave = 0;
  private lastRender = 0;
  private frameErrors = 0;
  /** safe-area insets (notch, home indicator) in CSS px */
  private safe = { top: 0, right: 0, bottom: 0, left: 0 };
  private readonly safeProbe: HTMLElement;
  private readonly touchDevice: boolean;
  private readonly reducedMotion: boolean;

  constructor(private readonly root: HTMLElement) {
    this.canvas = root.querySelector<HTMLCanvasElement>('#game')!;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.sim = new Simulation();
    // Phones/tablets: zoom in further so the fly stays comfortably visible (view pans).
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.camera = new Camera(this.sim.scene.width, this.sim.scene.height, coarse ? 2.9 : 2.3);
    this.scene = new SceneRenderer(this.sim.scene);
    this.difficulty = new DifficultyController(this.sim.params.difficulty, loadJSON('difficulty', undefined));
    this.replay = new ReplaySystem(this.sim);
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.effects.reducedMotion = this.reducedMotion;
    this.ui = new UI(root, { action: (a, el) => this.action(a, el) });
    // env(safe-area-inset-*) can only be read through a real element
    this.safeProbe = document.createElement('div');
    this.safeProbe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    root.appendChild(this.safeProbe);
    this.lab = new LabPanel(this.ui.labPanel, (s) => this.onLabChange(s));
    this.ui.setMuted(this.audio.muted);
    this.input = new InputController(this.canvas, {
      aim: (x, y) => this.onAim(x, y),
      strike: (x, y, k) => this.onStrike(x, y, k),
      interact: () => this.audio.unlock(),
    });
    this.input.attach();
    this.sim.on((e) => {
      switch (e.type) {
        case 'strikeStart':
          if (!this.labMode && this.mode === 'play') this.stats.recordSwing();
          break;
        case 'swingStart':
          this.audio.whoosh(this.sim.swatter.speed);
          break;
        case 'impact': {
          const sw = this.sim.swatter;
          this.audio.impact(e.surface.material, e.hit, e.speed);
          this.effects.impact(e.x, e.y, sw.hx, sw.hy, sw.r, clamp(e.speed / 3800, 0.2, 1), e.hit);
          break;
        }
        case 'takeoff':
          this.audio.takeoff(e.mode !== 'voluntary');
          break;
        case 'landed':
          this.audio.land();
          this.ping = { x: this.sim.fly.pos.x, y: this.sim.fly.pos.y, t: 0 };
          break;
        case 'attackResolved':
          this.onAttack(e.result);
          break;
      }
    });
    this.applyModulation(true);
    this.showDebug = new URLSearchParams(location.search).has('debug');
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pagehide', () => this.persist());
    this.ui.replayBar.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'replay-scrub' && this.player) {
        const p = this.player;
        p.playing = false;
        p.t = p.t0 + (Number(t.value) / 1000) * (p.t1 - p.t0);
      }
    });
    loadCircuit(`${import.meta.env.BASE_URL}data/escape-circuit.json`)
      .then((c) => (this.circuit = c))
      .catch(() => (this.circuit = null));
    this.resize();
    this.aimSX = this.camera.viewW * 0.62;
    this.aimSY = this.camera.viewH * 0.55;
    this.sim.swatter.active = false;
    this.sim.swatter.reset(this.camera.toWorldX(this.aimSX), this.camera.toWorldY(this.aimSY));
    this.camera.centerOn(this.sim.fly.pos.x, this.sim.fly.pos.y);
    this.ui.showTitle(titleHTML(this.stats.stats));
  }

  start(): void {
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      try {
        this.frame(now);
      } catch (err) {
        // keep the loop alive, but tell the player if it keeps failing
        if (this.frameErrors++ === 0) console.error(err);
        if (this.frameErrors === 30) this.ui.showError(err instanceof Error ? err.message : String(err));
      }
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  private get paused(): boolean {
    return this.ui.modalName !== null || !this.visible;
  }

  private frame(now: number): void {
    const dtReal = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (dtReal > 0) this.fps += (1 / dtReal - this.fps) * 0.05;
    this.time += dtReal;
    const sim = this.sim;
    this.stepsThisFrame = 0;
    if (this.mode === 'replay') {
      this.updateReplay(dtReal);
    } else if (!this.paused) {
      this.applyKeyboardAim(dtReal);
      const aimWX = this.camera.toWorldX(this.aimSX);
      const aimWY = this.camera.toWorldY(this.aimSY);
      if (dtReal > 0 && Number.isFinite(this.lastAimWX)) {
        const k = Math.min(1, dtReal * 15);
        this.pointerVx += ((aimWX - this.lastAimWX) / dtReal - this.pointerVx) * k;
        this.pointerVy += ((aimWY - this.lastAimWY) / dtReal - this.pointerVy) * k;
      }
      this.lastAimWX = aimWX;
      this.lastAimWY = aimWY;
      if (this.sim.swatter.active) sim.swatter.setTarget(aimWX, aimWY);
      this.acc += dtReal;
      const maxSteps = 120;
      while (this.acc >= sim.dt && this.stepsThisFrame < maxSteps) {
        sim.step();
        this.acc -= sim.dt;
        this.stepsThisFrame++;
      }
      if (this.stepsThisFrame >= maxSteps) this.acc = 0;
      if (this.mode === 'play' && sim.fly.alive) this.flySurvival += dtReal;
      if (this.mode === 'play') {
        this.stats.addPlayTime(dtReal);
        this.playSave += dtReal;
        if (this.playSave > 15) {
          this.playSave = 0;
          this.persist();
        }
      }
      if (this.pendingCapture && sim.time >= this.pendingCapture.at) {
        this.replay.capture(this.pendingCapture.result);
        this.pendingCapture = null;
      }
    }
    this.effects.update(dtReal);
    if (this.ping) {
      this.ping.t += dtReal;
      if (this.ping.t > 0.9) this.ping = null;
    }
    const f = sim.fly;
    const frozen = sim.swatter.phase !== SwatterPhase.IDLE || this.mode === 'replay';
    this.camera.follow(f.pos.x, f.pos.y, dtReal, frozen);
    if (this.showBrain) this.brainView.update(f.brain.activity(), dtReal, this.time);
    this.updateAudio();
    // Nothing moves behind an open menu, so redraw rarely there (saves battery on phones).
    if (!this.paused || this.mode === 'replay' || now - this.lastRender > 250) {
      this.lastRender = now;
      this.render();
    }
    this.hudTimer -= dtReal;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.updateHud();
    }
  }

  private applyKeyboardAim(dt: number): void {
    const d = this.input.keyDirection();
    if (!d) return;
    const speed = 260 * this.camera.scale; // 260 mm/s in CSS px
    this.aimSX = clamp(this.aimSX + d[0] * speed * dt, 0, this.camera.viewW);
    this.aimSY = clamp(this.aimSY + d[1] * speed * dt, 0, this.camera.viewH);
  }

  private updateAudio(): void {
    const f = this.sim.fly;
    const sw = this.sim.swatter;
    const flying = f.alive && f.airborne && this.mode !== 'replay' && !this.paused;
    const d = Math.hypot(f.pos.x - sw.x, f.pos.y - sw.y);
    const near = 1 - Math.min(1, d / 220);
    const height = Math.min(1, f.heightAboveGround / 160);
    this.audio.updateBuzz(flying, f.speed, clamp(0.55 * near + 0.45 * height, 0, 1), this.time);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  resize(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // iOS sends lots of resize events (visualViewport) without a real size change;
    // reallocating the canvas every time would be wasteful
    if (w === this.camera.viewW && h === this.camera.viewH && dpr === this.dpr && this.canvas.width === Math.round(w * dpr)) {
      this.updateInsets();
      return;
    }
    this.dpr = dpr;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const prevScale = this.camera.scale;
    this.camera.resize(w, h);
    this.updateInsets();
    this.camera.centerOn(this.sim.fly.pos.x, this.sim.fly.pos.y);
    this.aimSX = clamp(this.aimSX, 0, w);
    this.aimSY = clamp(this.aimSY, 0, h);
    // phones get a smaller background buffer (iOS canvas memory limit)
    const maxPx = this.touchDevice ? 9e6 : 14e6;
    if (!this.scene.built) this.scene.build(this.camera.scale * this.dpr, maxPx);
    else if (Math.abs(prevScale - this.camera.scale) > 0.01 || this.dpr !== this.lastBuildDpr) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => this.scene.build(this.camera.scale * this.dpr, maxPx), 150);
    }
    this.lastBuildDpr = this.dpr;
  }

  private lastBuildDpr = 1;

  /** Reads the safe-area insets and how much of the screen the HUD covers. */
  private updateInsets(): void {
    const cs = getComputedStyle(this.safeProbe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    this.camera.insetTop = this.ui.hudBottom();
  }

  private flyPose(): FlyPose {
    const f = this.sim.fly;
    return {
      x: f.pos.x,
      y: f.pos.y,
      z: f.pos.z,
      ground: f.ground,
      heading: f.heading,
      state: f.state,
      wingPhase: f.wingPhase,
      wingSpread: f.wingSpread,
      legPhase: f.legPhase,
      groomType: f.groomType,
      groomPhase: f.groomPhase,
      roll: f.roll,
      legExtension: f.legExtension,
      vx: f.vel.x,
      vy: f.vel.y,
      vz: f.vel.z,
      radius: f.radius,
      tint: f.genome.tint,
    };
  }

  private swatterPose(): SwatterPose {
    const sw = this.sim.swatter;
    return { x: sw.x, y: sw.y, z: sw.z, groundH: sw.groundH, phase: sw.phase, vz: sw.vz, hx: sw.hx, hy: sw.hy, r: sw.r };
  }

  private render(): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const dpr = this.dpr;
    const s = cam.scale;
    const [shx, shy] = this.effects.shake();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.scene.draw(ctx, cam, dpr);
    // world transform (mm -> device px)
    ctx.setTransform(dpr * s, 0, 0, dpr * s, (-cam.x0 * s + shx) * dpr, (-cam.y0 * s + shy) * dpr);
    this.effects.steam(ctx, this.time, 175, 180);
    const replayFrame = this.player ? ReplaySystem.frame(this.player.clip, this.player.t) : null;
    const swPose = replayFrame ? replayFrame.swatter : this.swatterPose();
    const flyPose = replayFrame ? replayFrame.fly : this.flyPose();
    const showSwatter = this.sim.swatter.active || !!replayFrame;
    if (replayFrame && this.player) this.drawReplayUnder(ctx, this.player);
    if (showSwatter) this.swR.drawUnder(ctx, swPose);
    if (this.ping && !replayFrame && this.mode === 'play') {
      const u = this.ping.t / 0.9;
      const r = 3 + 16 * (1 - u) * (1 - u);
      ctx.strokeStyle = `rgba(255,236,150,${0.75 * (1 - u)})`;
      ctx.lineWidth = 2.2 / s;
      ctx.beginPath();
      ctx.arc(this.ping.x, this.ping.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.flyR.draw(ctx, flyPose, s * dpr, this.time);
    this.effects.draw(ctx);
    if (showSwatter) this.swR.drawOver(ctx, swPose, cam);
    if (replayFrame && this.player) this.drawReplayOver(ctx, this.player, s);
    if (this.showDebug && !replayFrame) this.debug.drawWorld(ctx, this.sim, s);
    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!replayFrame) this.drawOffscreenIndicator(ctx);
    const safe = this.safe;
    if (this.showBrain && this.mode !== 'replay') {
      const w = Math.min(380, cam.viewW - 20 - safe.left - safe.right);
      const scale = Math.min(1, w / 380);
      // On narrow screens the Lab panel is a bottom sheet, so the Brain View moves up.
      const labSheet = this.lab.visible && cam.viewW <= 760;
      const x = 10 + safe.left;
      const y = labSheet ? Math.max(70, cam.insetTop + 8) : cam.viewH - BrainView.height(scale) - (this.touchDevice ? 14 : 10) - safe.bottom;
      this.brainView.draw(ctx, x, y, 380, this.sim.fly.brain.activity(), this.sim.fly.brain.motor.last, FLY_STATE_NAMES[this.sim.fly.state], scale);
    }
    if (this.showDebug && !replayFrame) {
      this.debug.drawText(ctx, 10 + safe.left, Math.max(70, cam.insetTop + 8), this.sim, {
        fps: this.fps,
        stepsPerFrame: this.stepsThisFrame,
        difficulty: this.difficulty.level,
        rollingSuccess: this.difficulty.rollingSuccess,
        labMode: this.labMode,
        pointerVx: this.pointerVx,
        pointerVy: this.pointerVy,
      });
    }
    if (replayFrame && this.player) this.drawReplayHud(ctx, this.player, replayFrame.threat);
  }

  private drawOffscreenIndicator(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    if (!cam.panning) return;
    const f = this.sim.fly;
    const x = cam.sx(f.pos.x);
    const y = cam.sy(f.pos.y);
    const m = 18;
    const s = this.safe;
    const top = Math.max(60, cam.insetTop);
    if (x >= s.left - 4 && y >= top && x <= cam.viewW - s.right + 4 && y <= cam.viewH - s.bottom + 4) return;
    const cx = clamp(x, m + s.left, cam.viewW - m - s.right);
    const cy = clamp(y, top + 10, cam.viewH - m - s.bottom);
    const a = Math.atan2(y - cy, x - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(20,20,20,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Replay rendering
  // ---------------------------------------------------------------------------

  private drawReplayUnder(ctx: CanvasRenderingContext2D, p: ReplayPlayer): void {
    const clip = p.clip;
    const nowMs = p.t * 1000;
    // swatter trajectory (head centre)
    const swPath = ReplaySystem.path(clip, 'swatter');
    ctx.fillStyle = 'rgba(255,150,40,0.85)';
    for (const [x, y, t] of swPath) {
      if (t > nowMs) break;
      ctx.beginPath();
      ctx.arc(x, y, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    // predicted impact point / predicted footprint from the fly's plan
    if (clip.predicted && clip.result.commandMs !== null && nowMs >= clip.result.commandMs) {
      const pr = clip.predicted;
      ctx.save();
      ctx.setLineDash([2.5, 2]);
      ctx.strokeStyle = 'rgba(255,90,70,0.9)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.roundRect(pr.x - clip.hx, pr.y - clip.hy, 2 * clip.hx, 2 * clip.hy, clip.hr);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,60,60,1)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(pr.x - 5, pr.y);
      ctx.lineTo(pr.x + 5, pr.y);
      ctx.moveTo(pr.x, pr.y - 5);
      ctx.lineTo(pr.x, pr.y + 5);
      ctx.stroke();
    }
    // fly trajectory
    const flyPath = ReplaySystem.path(clip, 'fly', 2);
    ctx.strokeStyle = 'rgba(80,220,255,0.9)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let started = false;
    for (const [x, y, t] of flyPath) {
      if (t > nowMs) break;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawReplayOver(ctx: CanvasRenderingContext2D, p: ReplayPlayer, scale: number): void {
    const nowMs = p.t * 1000;
    const fs = 11 / scale;
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    for (const e of p.clip.events) {
      if (e.ms > nowMs) continue;
      const col =
        e.kind === 'threat' ? '255,200,60' : e.kind === 'perceived' ? '255,160,60' : e.kind === 'command' ? '255,80,220' : e.kind === 'takeoff' ? '80,220,255' : e.kind === 'clear' ? '120,255,140' : '255,70,60';
      ctx.fillStyle = `rgba(${col},0.95)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      const label = `${e.ms > 0 ? '+' : ''}${e.ms.toFixed(0)} ms ${e.label}`;
      const tw = ctx.measureText(label).width;
      const lx = e.x + 3;
      const ly = e.y - 3 - p.clip.events.indexOf(e) * fs * 1.25;
      ctx.fillStyle = 'rgba(10,12,18,0.72)';
      ctx.fillRect(lx - 1.5, ly - fs, tw + 3, fs * 1.3);
      ctx.fillStyle = `rgb(${col})`;
      ctx.fillText(label, lx, ly);
    }
  }

  private drawReplayHud(ctx: CanvasRenderingContext2D, p: ReplayPlayer, threat: number): void {
    const cam = this.camera;
    const ms = p.t * 1000;
    const y = Math.max(90, cam.insetTop + 40);
    ctx.save();
    ctx.font = '800 34px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const label = `${ms > 0.5 ? '+' : ms < -0.5 ? '−' : ''}${Math.abs(ms).toFixed(0)} ms`;
    ctx.fillText(label, cam.viewW / 2 + 2, y + 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cam.viewW / 2, y);
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`threat level ${threat.toFixed(2)} · ${p.clip.result.hit ? 'CAUGHT' : `miss ${p.clip.result.minGapMm.toFixed(1)} mm`}`, cam.viewW / 2, y + 20);
    ctx.restore();
  }

  private updateReplay(dt: number): void {
    const p = this.player;
    if (!p) return;
    if (p.playing) {
      p.t += dt * p.speed;
      if (p.t >= p.t1) {
        p.t = p.t1;
        p.playing = false;
      }
    }
    const u = (p.t - p.t0) / (p.t1 - p.t0);
    this.ui.setReplayState(p.t * 1000, u, p.playing, p.speed);
  }

  private openReplay(): void {
    const clip = this.replay.clip;
    if (!clip) return;
    const [t0, t1] = ReplaySystem.duration(clip);
    this.ui.closeModal();
    this.ui.hideToast();
    this.player = { clip, t: t0, t0, t1, speed: 0.05, playing: true, returnTo: this.mode === 'replay' ? 'play' : this.mode };
    this.mode = 'replay';
    this.ui.showReplayBar(clip.events, t0, t1);
    // Frame the impact in the part of the view above the replay controls.
    const barMm = (this.ui.replayBar.getBoundingClientRect().height || 220) / this.camera.scale;
    this.camera.centerOn(clip.result.impactX, clip.result.impactY + barMm * 0.5);
    this.stats.bump('replaysWatched');
  }

  private closeReplay(): void {
    if (!this.player) return;
    const back = this.player.returnTo;
    this.player = null;
    this.ui.hideReplayBar();
    this.mode = back;
    this.camera.centerOn(this.sim.fly.pos.x, this.sim.fly.pos.y);
    this.lastFrame = performance.now();
    // shown after the replay so the popup doesn't cover the replay controls
    this.checkAchievements(null);
    if (back === 'caught') this.showCatchScreen();
  }

  // ---------------------------------------------------------------------------
  // Input & actions
  // ---------------------------------------------------------------------------

  private onAim(x: number, y: number): void {
    this.aimSX = x;
    this.aimSY = y;
  }

  private onStrike(x: number, y: number, _kind: PointerKind): void {
    if (this.mode !== 'play' || this.paused) return;
    this.aimSX = x;
    this.aimSY = y;
    this.ui.hideToast();
    const sw = this.sim.swatter;
    sw.setTarget(this.camera.toWorldX(x), this.camera.toWorldY(y));
    sw.requestStrike();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key;
    if (k === 'Escape') {
      if (this.mode === 'replay') this.closeReplay();
      else if (this.ui.modalName && this.ui.modalName !== 'catch') this.action('close');
      else if (!this.ui.titleVisible && !this.ui.modalName) this.action('menu');
      return;
    }
    if (this.ui.titleVisible) {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        this.action('start');
      }
      return;
    }
    if (this.ui.modalName) return;
    switch (k.toLowerCase()) {
      case ' ':
      case 'enter':
        e.preventDefault();
        this.audio.unlock();
        if (this.mode === 'replay') this.action('replay-toggle');
        else this.onStrike(this.aimSX, this.aimSY, 'keyboard');
        break;
      case 'b':
        this.action('brain');
        break;
      case 'l':
        this.action('lab');
        break;
      case 'm':
        this.action('sound');
        break;
      case 'r':
        if (this.replay.clip && this.mode !== 'replay') this.openReplay();
        break;
      case 'd':
      case '`':
        this.action('debug');
        break;
      case 'h':
        this.action('howto');
        break;
    }
  }

  action(name: string, el?: HTMLElement): void {
    this.audio.unlock();
    switch (name) {
      case 'start':
        this.startPlay();
        break;
      case 'howto':
        this.ui.openModal('howto', howToHTML(this.touchDevice), true);
        break;
      case 'science':
        this.ui.openModal('science', scienceHTML(this.circuit), true);
        break;
      case 'stats':
        this.openStats();
        break;
      case 'menu':
        this.ui.openModal('menu', menuHTML({ muted: this.audio.muted, brain: this.showBrain, debug: this.showDebug, lab: this.labMode }));
        break;
      case 'close':
        if (this.ui.modalName === 'catch') return;
        this.ui.closeModal();
        this.lastFrame = performance.now();
        break;
      case 'sound':
        this.audio.setMuted(!this.audio.muted);
        this.ui.setMuted(this.audio.muted);
        if (this.ui.modalName === 'menu') this.action('menu');
        break;
      case 'brain':
        this.showBrain = !this.showBrain;
        this.ui.setToggle('brain', this.showBrain);
        if (this.showBrain) {
          this.stats.bump('brainViewOpened');
          this.checkAchievements(null);
        }
        if (this.ui.modalName === 'menu') this.ui.closeModal();
        break;
      case 'debug':
        this.showDebug = !this.showDebug;
        if (this.ui.modalName === 'menu') this.ui.closeModal();
        break;
      case 'lab':
        this.toggleLab();
        break;
      case 'lab-preset':
        if (el?.dataset.preset) this.lab.applyPreset(el.dataset.preset);
        break;
      case 'lab-run':
        void this.runLabSimulation();
        break;
      case 'replay':
        this.openReplay();
        break;
      case 'replay-close':
        this.closeReplay();
        break;
      case 'replay-toggle':
        if (this.player) {
          if (!this.player.playing && this.player.t >= this.player.t1) this.player.t = this.player.t0;
          this.player.playing = !this.player.playing;
        }
        break;
      case 'replay-speed':
        if (this.player && el?.dataset.speed) this.player.speed = Number(el.dataset.speed);
        break;
      case 'new-fly':
        this.newFly();
        break;
      case 'reload':
        location.reload();
        break;
      case 'reset-stats':
        if (confirm('Reset all statistics, achievements and personal bests stored in this browser?')) {
          this.stats.reset();
          this.achievements.reset();
          this.leaderboard.clear();
          this.difficulty.reset();
          saveJSON('difficulty', this.difficulty.state);
          this.applyModulation(false);
          this.openStats();
        }
        break;
    }
  }

  private startPlay(): void {
    this.ui.hideTitle();
    this.ui.closeModal();
    this.ui.showHud(true);
    this.updateInsets();
    this.mode = 'play';
    const sw = this.sim.swatter;
    sw.active = true;
    sw.reset(this.camera.toWorldX(this.aimSX), this.camera.toWorldY(this.aimSY));
    this.lastFrame = performance.now();
    if (this.touchDevice) this.ui.toast('Drag to aim, tap to swat', 'The dashed outline shows where the swatter will land.', 'info', false);
    else this.ui.toast('Move to aim, click to swat', 'The dashed outline shows where the swatter will land.', 'info', false);
  }

  private openStats(): void {
    this.ui.openModal(
      'stats',
      statsHTML({
        stats: this.stats.stats,
        unlocked: this.achievements.unlocked,
        bests: {
          closestMiss: this.leaderboard.topSync('closestMiss', 5),
          fewestAttempts: this.leaderboard.topSync('fewestAttemptsPerCatch', 5),
          streak: this.leaderboard.topSync('longestFlyStreak', 5),
        },
        difficulty: this.difficulty.level,
        rollingSuccess: this.difficulty.rollingSuccess,
        flyName: `#${this.sim.fly.id} ${this.sim.fly.genome.nickname}`,
      }),
      true,
    );
  }

  // ---------------------------------------------------------------------------
  // Attacks, catches, difficulty
  // ---------------------------------------------------------------------------

  private onAttack(r: AttackResult): void {
    if (this.mode !== 'play') return;
    const fly = this.sim.fly;
    if (r.serious) {
      this.flyAttempts++;
      if (!r.hit && !this.labMode) this.flyStreak++;
    }
    if (this.labMode) {
      if (r.serious) {
        const bucket = isDefaultLab(this.labSettings) ? this.lab.player.normal : this.lab.player.modified;
        bucket.attacks++;
        if (!r.hit) bucket.escapes++;
        this.lab.renderResults();
      }
    } else {
      this.stats.recordAttack(r, this.flyStreak, FLY_STATE_NAMES[r.flyStateAtStrike]);
      this.difficulty.record(r);
      saveJSON('difficulty', this.difficulty.state);
      this.applyModulation(false);
      if (r.serious && !r.hit) void this.leaderboard.submit({ category: 'closestMiss', value: r.minGapMm, date: new Date().toISOString() });
      this.checkAchievements(r);
    }
    const close = r.hit || (r.serious && r.minGapMm <= 30);
    if (close) this.pendingCapture = { result: r, at: r.impactTime + 0.13 };
    if (r.hit) {
      this.audio.catchJingle();
      this.mode = 'caught';
      if (!this.labMode) {
        this.stats.recordSurvival(this.flySurvival);
        void this.leaderboard.submit({ category: 'fewestAttemptsPerCatch', value: this.flyAttempts, date: new Date().toISOString() });
        void this.leaderboard.submit({ category: 'longestFlyStreak', value: this.flyStreak, date: new Date().toISOString() });
      }
      clearTimeout(this.catchTimer);
      this.catchTimer = window.setTimeout(() => this.showCatchScreen(), 750);
      return;
    }
    this.toastForResult(r, close);
    void fly;
  }

  private toastForResult(r: AttackResult, replay: boolean): void {
    const gap = r.minGapMm;
    const gapText = gap < 100 ? gap.toFixed(1) : gap.toFixed(0);
    let tone: ToastTone = gap <= 5 ? 'extreme' : gap <= 20 ? 'near' : gap <= 50 ? 'close' : 'miss';
    let sub = '';
    if (r.sheltered && r.blockedBy) {
      tone = 'blocked';
      sub = `The ${r.blockedBy} got in the way of your swing`;
    } else if (r.clearMs !== null) sub = `Fly escaped ${Math.abs(r.clearMs).toFixed(0)} ms before impact`;
    else if (r.takeoffMs !== null) sub = r.flyAirborneAtStrike ? `It swerved ${Math.abs(r.takeoffMs).toFixed(0)} ms before impact` : `Fly launched ${Math.abs(r.takeoffMs).toFixed(0)} ms before impact`;
    else if (r.flyAirborneAtStrike) sub = 'It dodged in mid-air';
    else if (!r.serious) sub = r.threatMs !== null ? 'It saw it coming' : "It didn't even need to move";
    else if (r.threatMs !== null) sub = `Threat detected ${Math.abs(r.threatMs).toFixed(0)} ms before impact`;
    this.ui.toast(`MISS — ${gapText} mm`, sub, tone, replay);
  }

  private showCatchScreen(): void {
    if (this.mode === 'replay') return;
    const f = this.sim.fly;
    const s = this.stats.stats;
    this.ui.hideToast();
    this.ui.openModal(
      'catch',
      catchHTML({
        attempts: Math.max(1, this.flyAttempts),
        lifetimeRate: s.attempts ? s.catches / s.attempts : 1,
        lab: this.labMode,
        survival: this.flySurvival,
        flyName: `Fly #${f.id} "${f.genome.nickname}"`,
        traits: f.genome.traits,
        replay: !!this.replay.clip && this.replay.clip.result.hit,
        airborne: !!this.sim.tracker.lastResult?.airborneHit,
      }),
    );
  }

  private newFly(): void {
    this.ui.closeModal();
    const fly = this.sim.spawnFly({ at: 'edge' });
    this.flySurvival = 0;
    this.flyAttempts = 0;
    this.flyStreak = 0;
    this.pendingCapture = null;
    this.mode = 'play';
    if (!this.labMode) this.stats.bump('flies');
    this.applyModulation(true);
    this.lastFrame = performance.now();
    this.ui.toast(`Fly #${fly.id} "${fly.genome.nickname}" flies in`, fly.genome.traits.join(' · '), 'info', false);
  }

  private checkAchievements(r: AttackResult | null): void {
    if (this.labMode && r) return;
    for (const a of this.achievements.check(this.stats.stats, r)) {
      this.ui.achievement(a);
      this.audio.achievement();
    }
  }

  private applyModulation(immediate: boolean): void {
    const P = this.sim.params.difficulty;
    const mod = this.labMode
      ? combineModulation(modulationForLevel(0.5, P), labModulation(this.labSettings))
      : combineModulation(this.difficulty.modulation());
    this.sim.setModulation(mod, immediate);
  }

  // ---------------------------------------------------------------------------
  // Lab Mode
  // ---------------------------------------------------------------------------

  private toggleLab(): void {
    this.labMode = !this.labMode;
    this.ui.setToggle('lab', this.labMode);
    if (this.ui.modalName === 'menu') this.ui.closeModal();
    if (this.labMode) {
      this.lab.settings = { ...this.labSettings };
      this.lab.open();
      this.stats.bump('labExperiments');
      this.checkAchievements(null);
      if (this.mode === 'title') this.startPlay();
    } else {
      this.lab.close();
    }
    this.applyModulation(false);
    this.updateHud();
  }

  private onLabChange(s: LabSettings): void {
    this.labSettings = { ...s };
    this.applyModulation(false);
  }

  private async runLabSimulation(): Promise<void> {
    if (this.lab.running) return;
    this.lab.running = true;
    this.lab.progress = 0;
    this.lab.renderResults();
    const seed = 1234;
    const P = this.sim.params.difficulty;
    void P;
    try {
      if (!this.lab.normal) {
        this.lab.normal = await this.labSim.run(600, seed, 0.5, {}, (u) => {
          this.lab.progress = u * 0.5;
          this.lab.renderResults();
        });
      }
      this.lab.modified = await this.labSim.run(600, seed, 0.5, labModulation(this.labSettings), (u) => {
        this.lab.progress = 0.5 + u * 0.5;
        this.lab.renderResults();
      });
    } catch {
      /* keep previous results */
    }
    this.lab.running = false;
    this.lab.renderResults();
  }

  // ---------------------------------------------------------------------------

  private updateHud(): void {
    if (this.mode === 'title') return;
    const f = this.sim.fly;
    if (!this.labMode && this.mode === 'play' && f.alive) this.stats.recordSurvival(this.flySurvival);
    const badge = this.labMode ? 'LAB MODE' : `Fly #${f.id} · ${f.genome.nickname}`;
    this.ui.setHud(fmtTime(this.flySurvival), this.flyAttempts, badge);
  }

  private onVisibility(): void {
    this.visible = document.visibilityState === 'visible';
    if (this.visible) {
      this.lastFrame = performance.now();
      this.acc = 0;
      this.audio.resume();
    } else {
      this.audio.suspend();
      this.persist();
    }
  }

  private persist(): void {
    this.stats.save();
    saveJSON('difficulty', this.difficulty.state);
  }

  /** Test hook: fly state name. */
  get flyStateName(): string {
    return FLY_STATE_NAMES[this.sim.fly.state];
  }

  get isDead(): boolean {
    return this.sim.fly.state === FlyState.DEAD;
  }
}
