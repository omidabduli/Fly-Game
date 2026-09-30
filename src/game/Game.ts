import { AchievementManager } from '../analytics/Achievements';
import { LocalLeaderboard } from '../analytics/Leaderboard';
import { StatsManager } from '../analytics/StatsManager';
import { AudioEngine } from '../audio/AudioEngine';
import { combineModulation } from '../config/params';
import { FLY_STATE_NAMES, FlyState } from '../fly/Fly';
import { clamp } from '../math/vec';
import { InputController, type PointerKind } from '../player/InputController';
import { SwatterPhase } from '../player/Swatter';
import { Camera } from '../render/Camera';
import { Effects } from '../render/Effects';
import { type FlyPose, FlyRenderer } from '../render/FlyRenderer';
import { PeopleRenderer } from '../render/PeopleRenderer';
import { drawBubble, RoomFx } from '../render/RoomFx';
import { makeRetroOverlay } from '../render/RetroFilter';
import { SceneRenderer } from '../render/SceneRenderer';
import { type SwatterPose, SwatterRenderer } from '../render/SwatterRenderer';
import { Haptics } from '../ui/Haptics';
import { catchHTML, howToHTML, menuHTML, statsHTML, titleHTML } from '../ui/screens';
import { UI } from '../ui/UI';
import type { AttackResult } from './AttackTracker';
import { type BreakKind, type DamageEvent, DamageSystem, formatMoney } from './DamageSystem';
import { DifficultyController } from './DifficultyController';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId, isDifficultyId } from './DifficultyModes';
import { PeopleSystem } from './People';
import { type ReplayClip, ReplaySystem } from './ReplaySystem';
import { Simulation } from './Simulation';
import { loadJSON, saveJSON } from '../analytics/storage';

/** Comic-word colour per kind of break. */
const WORD_COLORS: Record<BreakKind, string> = {
  glass: '#bfe8ff',
  screen: '#8fd8ff',
  metal: '#ffe07a',
  leaves: '#9be15d',
  terracotta: '#ff9a5c',
  ceramic: '#ffffff',
  liquid: '#e0a36a',
  food: '#ff7a4a',
  paper: '#fff6dc',
  crumbs: '#f0c080',
  person: '#ffd84a',
};

/** What the fly says after dodging you (it's a Bremen fly). */
const TAUNTS = {
  close: ['HUCH! 😱', 'Meine Flügel!!', 'Das war knapp!', 'Uiii!'],
  near: ['Ätsch!', 'Daneben! 😜', 'Zu langsam!', 'Nö!', 'Knapp vorbei!'],
  far: ['Hier drüben!', 'Gähn…', 'Bzzz 😎', 'Nicht mal knapp!', 'Falsche Stelle!'],
  blocked: ['Sicher! 😎', 'Deckung!', 'Hinterm Glas!'],
  sleepy: ['Hä? 😴', 'Zzz… was?', 'Noch fünf Minuten…'],
  wreck: ['Wer zahlt das? 😂', 'Uups! Ich war’s nicht!', 'Schön kaputt!'],
};

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

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
  readonly ui: UI;
  readonly audio = new AudioEngine();
  private readonly input: InputController;
  readonly stats = new StatsManager();
  private readonly achievements = new AchievementManager();
  private readonly leaderboard = new LocalLeaderboard();
  readonly difficulty: DifficultyController;
  private readonly replay: ReplaySystem;
  /** everything broken while chasing the current fly */
  readonly damage = new DamageSystem();
  private readonly roomFx: RoomFx;
  readonly people: PeopleSystem;
  private readonly peopleR = new PeopleRenderer();
  readonly haptics = new Haptics();
  difficultyId: DifficultyId;
  /** kill cam: slow motion right after the fly is hit */
  private slowmo: { t: number; dur: number } | null = null;
  private taunt: { text: string; t: number; life: number } | null = null;
  private tauntCooldown = 0;
  /** attack that broke something (the fly may gloat about it) */
  private lastBreakAt = -1;

  mode: Mode = 'title';
  private flySurvival = 0;
  private flyAttempts = 0;
  /** every swing at the current fly (the HUD number) */
  private flySwings = 0;
  /** seconds left to point out the fly to a new player */
  private hintT = 0;
  private flyStreak = 0;
  private aimSX = 0;
  private aimSY = 0;
  private lastFrame = 0;
  private acc = 0;
  private fps = 60;
  private stepsThisFrame = 0;
  private pendingCapture: { result: AttackResult; at: number } | null = null;
  /** lowest damage bill on this difficulty before the current catch */
  private catchBest: number | null = null;
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
    this.camera = new Camera(this.sim.scene.width, this.sim.scene.height, coarse ? 2.5 : 1.8);
    this.scene = new SceneRenderer(this.sim.scene, this.damage);
    this.roomFx = new RoomFx(this.sim.scene);
    this.roomFx.onNotice = () => {
      this.audio.phoneBuzz();
      this.haptics.play('light');
    };
    this.roomFx.onSpark = () => this.audio.sputter();
    this.people = new PeopleSystem((id) => this.damage.ofObject(id)?.owner ?? null);
    const savedMode = loadJSON<string>('mode', 'medium');
    this.difficultyId = isDifficultyId(savedMode) ? savedMode : 'medium';
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
          this.idleBuzzIn = 30 + Math.random() * 15;
          this.hintT = 0;
          if (this.mode === 'play') this.flySwings++;
          if (this.mode === 'play') this.stats.recordSwing();
          break;
        case 'swingStart':
          this.audio.whoosh(this.sim.swatter.speed);
          break;
        case 'impact': {
          const sw = this.sim.swatter;
          this.audio.impact(e.surface.material, e.hit, e.speed);
          this.effects.impact(e.x, e.y, sw.hx, sw.hy, sw.r, clamp(e.speed / 3800, 0.2, 1), e.hit);
          if (this.mode !== 'play' && this.mode !== 'caught') break;
          if (!e.hit) this.haptics.play('light');
          this.people.onImpact(e.x, e.y, e.surface.id);
          const personHit = e.surface.material === 'skin' || e.surface.material === 'cloth';
          if (personHit) this.stats.recordPersonHit();
          const broke = this.damage.impact(e.surface, e.x, e.y, sw.hx, sw.hy, e.speed, (id) => this.sim.scene.byId(id));
          if (broke) this.onBreak(broke);
          else if (personHit) {
            // already paid for everything: still hurts
            this.audio.smash('person', false);
            this.effects.burst(e.x, e.y, 'person', 0.6);
          }
          break;
        }
        case 'hit':
          if (this.mode === 'play') this.startKillCam();
          break;
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
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    // the pane can get its real size after first layout (fonts, dvh, window restore on macOS)
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(this.root);
    window.addEventListener('pageshow', () => this.resize());
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
    this.resize();
    this.aimSX = this.camera.viewW * 0.62;
    this.aimSY = this.camera.viewH * 0.55;
    this.sim.swatter.active = false;
    this.sim.swatter.reset(this.camera.toWorldX(this.aimSX), this.camera.toWorldY(this.aimSY));
    this.camera.centerOn(this.sim.fly.pos.x, this.sim.fly.pos.y);
    this.ui.showTitle(titleHTML(this.stats.stats, this.difficultyId));
    this.gateOnLoading();
  }

  /** The Play button waits until the characters' first images are in (at most a few seconds). */
  private gateOnLoading(): void {
    const btn = this.root.querySelector<HTMLButtonElement>('[data-action=start]');
    if (!btn || this.peopleR.loadProgress >= 1) return;
    btn.disabled = true;
    const label = btn.textContent;
    const started = performance.now();
    const tick = window.setInterval(() => {
      const p = this.peopleR.loadProgress;
      const timedOut = performance.now() - started > 8000;
      if (p >= 1 || timedOut) {
        window.clearInterval(tick);
        btn.disabled = false;
        btn.textContent = label;
      } else btn.textContent = `Loading ${Math.round(p * 100)}%`;
    }, 120);
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
    // kill cam: time crawls right after the hit, then eases back to normal
    let timeScale = 1;
    if (this.slowmo) {
      this.slowmo.t += dtReal;
      const u = this.slowmo.t / this.slowmo.dur;
      if (u >= 1) this.slowmo = null;
      else timeScale = 0.1 + 0.9 * u * u * u;
    }
    const dtSim = dtReal * timeScale;
    if (this.mode === 'replay') {
      this.updateReplay(dtReal);
    } else if (!this.paused) {
      this.applyKeyboardAim(dtReal);
      const aimWX = this.camera.toWorldX(this.aimSX);
      const aimWY = this.camera.toWorldY(this.aimSY);
      if (this.sim.swatter.active) sim.swatter.setTarget(aimWX, aimWY);
      this.acc += dtSim;
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
        this.ui.setReplayAvailable(true);
      }
      this.roomFx.update(dtSim, this.damage, this.effects);
      this.updatePeople(dtSim);
      this.tauntCooldown = Math.max(0, this.tauntCooldown - dtReal);
      if (this.hintT > 0) this.hintT = Math.max(0, this.hintT - dtReal);
      if (this.taunt) {
        this.taunt.t += dtReal;
        if (this.taunt.t >= this.taunt.life || !sim.fly.alive) this.taunt = null;
      }
    }
    this.effects.update(this.mode === 'replay' ? dtReal : dtSim);
    if (this.ping) {
      this.ping.t += dtReal;
      if (this.ping.t > 0.9) this.ping = null;
    }
    const f = sim.fly;
    const frozen = sim.swatter.phase !== SwatterPhase.IDLE || this.mode === 'replay';
    this.camera.follow(f.pos.x, f.pos.y, dtReal, frozen);
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

  private peopleTime = 0;

  /** The diners watch the fly and the swatter, and wave the fly off their food. */
  private updatePeople(dt: number): void {
    this.peopleTime += dt;
    const f = this.sim.fly;
    const sw = this.sim.swatter;
    const shoo = this.people.update(dt, {
      time: this.peopleTime,
      fly: {
        x: f.pos.x,
        y: f.pos.y,
        alive: f.alive,
        airborne: f.airborne,
        resting: f.onSurface && (f.state === FlyState.RESTING || f.state === FlyState.GROOMING || f.state === FlyState.WALKING),
        surfaceId: f.onSurface ? (f.surface?.id ?? null) : null,
      },
      swatter: { x: sw.x, y: sw.y, active: sw.active, striking: sw.phase === SwatterPhase.PREP || sw.phase === SwatterPhase.SWING },
    });
    if (shoo && this.sim.shoo()) this.audio.whoosh(900);
  }

  /** Seconds until the fly buzzes by on its own (random, 30-45 s of quiet). */
  private idleBuzzIn = 30 + Math.random() * 15;
  private lastAudioTime = 0;

  private updateAudio(): void {
    const f = this.sim.fly;
    const sw = this.sim.swatter;
    const dt = Math.min(0.2, Math.max(0, this.time - this.lastAudioTime));
    this.lastAudioTime = this.time;
    const flying = f.alive && f.airborne && this.mode !== 'replay' && !this.paused;
    // a quiet game gets an annoying buzz now and then; any swing or break resets the wait
    if (this.mode === 'play' && !this.paused && f.alive) {
      this.idleBuzzIn -= dt;
      if (this.idleBuzzIn <= 0) {
        this.audio.startBuzzBurst(this.time);
        this.idleBuzzIn = 30 + Math.random() * 15;
      }
    }
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
    const maxPx = this.touchDevice ? 9e6 : 10e6;
    if (!this.scene.built) this.scene.build(this.camera.scale * this.dpr, maxPx);
    else if (Math.abs(prevScale - this.camera.scale) > 0.01 || this.dpr !== this.lastBuildDpr) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => this.scene.build(this.camera.scale * this.dpr, maxPx), 150);
    }
    this.lastBuildDpr = this.dpr;
  }

  private lastBuildDpr = 1;
  private retroOverlay: HTMLCanvasElement | null = null;
  private retroKey = '';

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
    const [shx, shy] = this.effects.shakeOffset();
    const world = () => ctx.setTransform(dpr * s, 0, 0, dpr * s, (-cam.x0 * s + shx) * dpr, (-cam.y0 * s + shy) * dpr);
    this.scene.refresh(); // repaints the room only if something broke
    // back of the Mensa, then the people, then the table in front of them
    this.scene.drawBack(ctx, cam, dpr, shx, shy);
    world();
    this.roomFx.draw(ctx);
    for (const x of [30, 72, 112, 152]) this.effects.steam(ctx, this.time, x, 108, 0.6, 0.45);
    this.peopleR.drawBodies(ctx, this.people, this.damage, this.time);
    this.scene.drawFront(ctx, cam, dpr, shx, shy);
    world();
    const f = this.sim.fly;
    this.peopleR.drawArms(ctx, this.people, this.time, { x: f.pos.x, y: f.pos.y, alive: f.alive });
    this.roomFx.drawFront(ctx, this.damage);
    const cup = this.damage.stage('coffee');
    this.effects.steam(ctx, this.time, 247, 224, cup >= 3 ? 0 : cup >= 1 ? 0.45 : 1, 0.55);
    this.effects.drawUnder(ctx);
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
    // film look over the whole picture: soft vignette and faint scanlines
    const overlayKey = `${cam.viewW}x${cam.viewH}@${dpr}`;
    if (overlayKey !== this.retroKey) {
      this.retroKey = overlayKey;
      this.retroOverlay = makeRetroOverlay(cam.viewW, cam.viewH, dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.retroOverlay) ctx.drawImage(this.retroOverlay, 0, 0);
    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!replayFrame) {
      this.drawOffscreenIndicator(ctx);
      if (this.mode !== 'title') this.peopleR.drawBubbles(ctx, this.people, cam, this.reducedMotion);
      this.drawTaunt(ctx);
      this.drawHint(ctx);
      this.roomFx.drawScreen(ctx, cam, this.reducedMotion);
    }
    this.effects.drawScreen(ctx, cam);
    if (replayFrame && this.player) this.drawReplayHud(ctx, this.player);
  }

  /** A pulsing ring around the fly and a short prompt, for new players. */
  private drawHint(ctx: CanvasRenderingContext2D): void {
    if (this.hintT <= 0 || this.mode !== 'play' || this.paused) return;
    const f = this.sim.fly;
    if (!f.alive) return;
    const cam = this.camera;
    const x = cam.sx(f.pos.x);
    const y = cam.sy(f.pos.y);
    if (x < 0 || y < cam.insetTop || x > cam.viewW || y > cam.viewH) return;
    const fade = Math.min(1, this.hintT / 1.5);
    const r = 16 + 4 * Math.sin(this.time * 5);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#c15f3c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(250,249,245,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r + 6 + 3 * Math.sin(this.time * 5 + 1), 0, Math.PI * 2);
    ctx.stroke();
    drawBubble(ctx, x, Math.max(cam.insetTop + 60, y - r - 6), [this.touchDevice ? 'There it is. Tap to swat!' : 'There it is. Click to swat!'], fade, 1, cam.viewW);
    ctx.restore();
  }

  /** The fly's speech bubble, following it around. */
  private drawTaunt(ctx: CanvasRenderingContext2D): void {
    const tn = this.taunt;
    if (!tn) return;
    const cam = this.camera;
    const f = this.sim.fly;
    const x = cam.sx(f.pos.x);
    const y = cam.sy(f.pos.y) - 12;
    const u = tn.t / tn.life;
    const alpha = u < 0.08 ? u / 0.08 : u > 0.8 ? (1 - u) / 0.2 : 1;
    const p = Math.min(1, tn.t / 0.2);
    const pop = this.reducedMotion ? 1 : 0.5 + 0.5 * (1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2);
    drawBubble(ctx, x, Math.max(cam.insetTop + 60, y), [tn.text], alpha, pop, cam.viewW);
  }

  private sayTaunt(text: string): void {
    this.taunt = { text, t: 0, life: 1.7 };
    this.tauntCooldown = 2.5;
    this.audio.taunt();
  }

  /** Something in the room broke under the swatter. */
  private onBreak(ev: DamageEvent): void {
    this.audio.smash(ev.kind, ev.final);
    if (ev.cost >= 20) window.setTimeout(() => this.audio.kaChing(), 240);
    this.effects.burst(ev.x, ev.y, ev.kind, ev.final ? 1.3 : 0.8);
    this.effects.word(ev.x, ev.y, ev.word, WORD_COLORS[ev.kind], ev.final ? 36 : 28);
    this.effects.money(ev.x, ev.y, `−${formatMoney(ev.cost)}`);
    this.effects.shake(ev.final ? 7 : 4, ev.final ? 0.35 : 0.22);
    if (ev.final && ev.cost >= 100) this.effects.flash('255,255,255', 0.35, 0.25);
    this.haptics.play(ev.final ? 'heavy' : 'medium');
    this.lastBreakAt = this.sim.time;
    this.roomFx.onDamage();
    this.people.onBreak(ev.owner, ev.kind === 'person' || ev.id === ev.owner);
    this.people.onDamage(this.damage.total);
    this.stats.recordDamage(ev, this.damage.total);
    this.checkAchievements(null);
    this.ui.bumpDamage();
    this.updateHud();
  }

  /** The fly was hit: slow motion, splat, flash and a zoom punch. */
  private startKillCam(): void {
    const f = this.sim.fly;
    this.slowmo = { t: 0, dur: this.reducedMotion ? 0.3 : 1.15 };
    this.taunt = null;
    this.effects.splat(f.pos.x, f.pos.y);
    this.effects.word(f.pos.x, f.pos.y, 'SPLAT!', '#ffe070', 44);
    this.effects.flash('255,255,255', 0.6, 0.35);
    this.effects.shake(8, 0.4);
    this.audio.splat();
    this.audio.slowmo();
    this.audio.applause();
    this.haptics.play('success');
    this.people.onKill();
    if (!this.reducedMotion) {
      const c = this.canvas;
      c.style.transformOrigin = `${this.camera.sx(f.pos.x).toFixed(0)}px ${this.camera.sy(f.pos.y).toFixed(0)}px`;
      c.classList.remove('punch');
      void c.offsetWidth;
      c.classList.add('punch');
    }
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
    const fs = 14 / scale;
    ctx.font = `500 ${fs}px "Instrument Sans", system-ui, sans-serif`;
    const shown = p.clip.events.filter((e) => e.ms <= nowMs).slice(-3);
    shown.forEach((e, i) => {
      ctx.fillStyle = '#c15f3c';
      ctx.strokeStyle = '#faf9f5';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 2.4 / scale * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const tw = ctx.measureText(e.label).width;
      const lx = e.x + 8 / scale * 2;
      const ly = e.y - (10 + i * 26) / scale;
      ctx.globalAlpha = i === shown.length - 1 ? 1 : 0.65;
      ctx.fillStyle = '#faf9f5';
      ctx.beginPath();
      ctx.roundRect(lx - 8 / scale, ly - fs * 1.05, tw + 16 / scale, fs * 1.7, 8 / scale);
      ctx.fill();
      ctx.fillStyle = '#141413';
      ctx.fillText(e.label, lx, ly);
      ctx.globalAlpha = 1;
    });
  }

  private drawReplayHud(ctx: CanvasRenderingContext2D, p: ReplayPlayer): void {
    const cam = this.camera;
    const y = Math.max(96, cam.insetTop + 50);
    const label = p.clip.result.hit ? 'Caught' : `Missed by ${p.clip.result.minGapMm.toFixed(0)} mm`;
    ctx.save();
    ctx.font = '400 30px Newsreader, Georgia, serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 40;
    ctx.fillStyle = 'rgba(250,249,245,0.94)';
    ctx.beginPath();
    ctx.roundRect(cam.viewW / 2 - w / 2, y - 34, w, 50, 25);
    ctx.fill();
    ctx.fillStyle = '#141413';
    ctx.fillText(label, cam.viewW / 2, y);
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
    // the zoomed camera follows the fly
    const fr = ReplaySystem.frame(p.clip, p.t);
    const barMm = (this.ui.replayBar.getBoundingClientRect().height || 140) / this.camera.scale;
    this.camera.follow(fr.fly.x, fr.fly.y + barMm * 0.5, dt, false);
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
    // Zoom in on the action, above the replay controls.
    this.camera.setZoom(2.1);
    const barMm = (this.ui.replayBar.getBoundingClientRect().height || 140) / this.camera.scale;
    this.camera.centerOn(clip.result.impactX, clip.result.impactY + barMm * 0.5);
    this.stats.bump('replaysWatched');
  }

  private closeReplay(): void {
    if (!this.player) return;
    const back = this.player.returnTo;
    this.player = null;
    this.ui.hideReplayBar();
    this.mode = back;
    this.camera.setZoom(1);
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
      case 'm':
        this.action('sound');
        break;
      case 'r':
        if (this.replay.clip && this.mode !== 'replay') this.openReplay();
        break;
      case 'h':
        this.action('howto');
        break;
    }
  }

  action(name: string, el?: HTMLElement): void {
    this.audio.unlock();
    if (name !== 'difficulty' && name !== 'replay-toggle' && name !== 'replay-speed') this.audio.uiTap();
    switch (name) {
      case 'start':
        this.startPlay();
        break;
      case 'howto':
        this.ui.openModal('howto', howToHTML(this.touchDevice), true);
        break;
      case 'stats':
        this.openStats();
        break;
      case 'menu':
        this.ui.openModal(
          'menu',
          menuHTML({
            muted: this.audio.muted,
            difficulty: this.difficultyId,
            haptics: this.haptics.supported ? this.haptics.enabled : null,
          }),
        );
        break;
      case 'difficulty': {
        const id = el?.dataset.diff;
        if (isDifficultyId(id)) this.setDifficulty(id);
        break;
      }
      case 'haptics':
        this.haptics.setEnabled(!this.haptics.enabled);
        if (this.ui.modalName === 'menu') this.action('menu');
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
    this.haptics.play('light');
    this.peopleR.loadExtras();
    // new players: point out the fly, and suggest landscape on a phone held upright
    const firstTime = this.stats.stats.swings < 3;
    if (firstTime) this.hintT = 12;
    if (this.touchDevice && innerHeight > innerWidth * 1.15) this.ui.toast('Tip: turn your phone sideways', 'You will see the whole room and everyone in it.', 'info', false);
    else if (this.stats.stats.swings < 5) this.ui.toast(this.touchDevice ? 'Drag to aim, tap to swat' : 'Move to aim, click to swat', 'Careful: people, plates and the laptop cost money.', 'info', false);
    this.people.onNewFly();
    this.updateHud();
  }

  /** Switch game mode. Mid-game this brings in a fresh fly (and a repaired room). */
  private setDifficulty(id: DifficultyId): void {
    const changed = id !== this.difficultyId;
    this.difficultyId = id;
    saveJSON('mode', id);
    this.audio.select(DIFFICULTY_ORDER.indexOf(id));
    this.haptics.play('light');
    if (this.ui.titleVisible) {
      this.ui.selectDifficulty(id);
      return;
    }
    if (this.ui.modalName === 'menu') this.ui.closeModal();
    if (changed) this.newFly();
    else this.applyModulation(false);
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
          lowestDamage: this.leaderboard.topSync('lowestDamage', 5),
        },
        difficulty: this.difficulty.level,
        rollingSuccess: this.difficulty.rollingSuccess,
        flyName: `#${this.sim.fly.id} ${this.sim.fly.genome.nickname}`,
        mode: this.difficultyId,
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
      if (!r.hit) this.flyStreak++;
    }
    this.stats.recordAttack(r, this.flyStreak, FLY_STATE_NAMES[r.flyStateAtStrike]);
    // only Hard adapts to the player; Easy and Medium are fixed
    if (!DIFFICULTIES[this.difficultyId].modulation) {
      this.difficulty.record(r);
      saveJSON('difficulty', this.difficulty.state);
      this.applyModulation(false);
    }
    if (r.serious && !r.hit) void this.leaderboard.submit({ category: 'closestMiss', value: r.minGapMm, date: new Date().toISOString() });
    this.checkAchievements(r);
    const close = r.hit || (r.serious && r.minGapMm <= 30);
    if (close) this.pendingCapture = { result: r, at: r.impactTime + 0.13 };
    if (r.hit) {
      this.mode = 'caught';
      this.catchBest = this.leaderboard.topSync('lowestDamage', 1, this.difficultyId)[0]?.value ?? null;
      const date = new Date().toISOString();
      const detail = this.difficultyId;
      this.stats.recordSurvival(this.flySurvival);
      this.stats.recordCatch(this.difficultyId, this.damage.total);
      void this.leaderboard.submit({ category: 'fewestAttemptsPerCatch', value: this.flyAttempts, date, detail });
      void this.leaderboard.submit({ category: 'longestFlyStreak', value: this.flyStreak, date });
      void this.leaderboard.submit({ category: 'lowestDamage', value: this.damage.total, date, detail });
      this.checkAchievements(r);
      clearTimeout(this.catchTimer);
      this.catchTimer = window.setTimeout(() => this.showCatchScreen(), this.slowmo ? 1500 : 800);
      return;
    }
    // no banner for misses; just a little "KNAPP!" when it was really close
    if (r.serious && r.minGapMm <= 5) this.effects.word(fly.pos.x, fly.pos.y, 'KNAPP!', '#ff9a5c', 24);
    this.maybeTaunt(r, fly.alive);
  }

  /** Sometimes the fly gloats after a serious miss. */
  private maybeTaunt(r: AttackResult, alive: boolean): void {
    if (!alive || this.tauntCooldown > 0) return;
    const brokeSomething = this.lastBreakAt >= r.strikeStartTime;
    if (!r.serious && !brokeSomething) return;
    const gap = r.minGapMm;
    let lines: readonly string[];
    if (brokeSomething && Math.random() < 0.6) lines = TAUNTS.wreck;
    else if (r.sheltered) lines = TAUNTS.blocked;
    else if (gap <= 5) lines = TAUNTS.close;
    else if (this.difficultyId === 'easy' && Math.random() < 0.4) lines = TAUNTS.sleepy;
    else if (gap <= 20) lines = TAUNTS.near;
    else lines = TAUNTS.far;
    // not every time, or it gets old
    if (gap > 5 && !brokeSomething && Math.random() < 0.45) return;
    this.sayTaunt(pick(lines));
  }

  private showCatchScreen(): void {
    if (this.mode === 'replay') return;
    const f = this.sim.fly;
    this.ui.hideToast();
    this.canvas.classList.remove('punch');
    this.ui.openModal(
      'catch',
      catchHTML({
        attempts: Math.max(1, this.flySwings),
        flyName: f.genome.nickname,
        replay: !!this.replay.clip && this.replay.clip.result.hit,
        difficulty: this.difficultyId,
        receipt: this.damage.receipt,
        total: this.damage.total,
        previousBest: this.catchBest,
      }),
    );
    this.audio.catchJingle();
    this.ui.animateReceipt(
      this.reducedMotion,
      () => this.audio.tick(),
      () => {
        this.audio.stamp();
        this.haptics.play('medium');
      },
    );
  }

  private newFly(): void {
    clearTimeout(this.catchTimer);
    this.ui.closeModal();
    this.canvas.classList.remove('punch');
    this.slowmo = null;
    this.taunt = null;
    // a fresh fly, and the Mensa is cleaned up
    this.damage.reset();
    this.roomFx.reset();
    this.people.reset();
    this.ui.setReplayAvailable(false);
    this.sim.spawnFly({ at: 'edge' });
    this.flySurvival = 0;
    this.flyAttempts = 0;
    this.flySwings = 0;
    this.flyStreak = 0;
    this.pendingCapture = null;
    this.mode = 'play';
    this.stats.bump('flies');
    this.applyModulation(true);
    this.lastFrame = performance.now();
    this.audio.flyIn();
    this.people.onNewFly();
    this.updateHud();
  }

  private checkAchievements(r: AttackResult | null): void {
    for (const a of this.achievements.check(this.stats.stats, r)) {
      this.ui.achievement(a);
      this.audio.achievement();
    }
  }

  private applyModulation(immediate: boolean): void {
    const fixed = DIFFICULTIES[this.difficultyId].modulation;
    this.sim.setModulation(combineModulation(fixed ?? this.difficulty.modulation()), immediate);
  }

  // ---------------------------------------------------------------------------

  private updateHud(): void {
    if (this.mode === 'title') return;
    const f = this.sim.fly;
    if (this.mode === 'play' && f.alive) this.stats.recordSurvival(this.flySurvival);
    const d = DIFFICULTIES[this.difficultyId];
    this.ui.setHud(
      formatMoney(this.damage.total),
      this.flySwings,
      d.id,
      d.label,
      f.genome.nickname,
    );
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
