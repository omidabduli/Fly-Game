import type { AchievementDef } from '../analytics/Achievements';
import { formatMoney } from '../game/DamageSystem';
import type { ReplayEvent } from '../game/ReplaySystem';
import { ICONS } from './icons';
import { esc } from './screens';

export interface UIHandlers {
  action(name: string, el?: HTMLElement): void;
}

export type ToastTone = 'hit' | 'extreme' | 'near' | 'close' | 'miss' | 'info' | 'blocked';

/**
 * DOM layer over the canvas: HUD, toasts, modal screens, replay controls and
 * the Lab panel. Buttons carry `data-action` attributes routed to the game.
 */
export class UI {
  readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly hudDamage: HTMLElement;
  private readonly hudAttempts: HTMLElement;
  private readonly hudDiff: HTMLElement;
  private readonly hudFly: HTMLElement;
  private receiptTimer = 0;
  private readonly toastEl: HTMLElement;
  private readonly achEl: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly modalCard: HTMLElement;
  private readonly titleLayer: HTMLElement;
  readonly replayBar: HTMLElement;
  private toastTimer = 0;
  private achTimer = 0;
  private lastHud = '';
  modalName: string | null = null;

  constructor(root: HTMLElement, private readonly h: UIHandlers) {
    this.root = root;
    root.insertAdjacentHTML(
      'beforeend',
      `
      <header class="hud" id="hud" hidden>
        <div class="hud-fig"><span class="eyebrow">Damage</span><span class="hud-num" id="hud-damage">0 €</span></div>
        <div class="hud-mid"><span class="tag" id="hud-diff"></span><span class="eyebrow" id="hud-fly"></span></div>
        <div class="hud-fig right"><span class="eyebrow">Swings</span><span class="hud-num" id="hud-attempts">0</span></div>
        <nav class="hud-buttons" aria-label="Game controls">
          <button class="icon-btn replay-btn" data-action="replay" id="btn-replay" aria-label="Replay the last close call" hidden>${ICONS.replay}</button>
          <button class="icon-btn" data-action="sound" id="btn-sound" aria-label="Mute sound">${ICONS.soundOn}</button>
          <button class="icon-btn" data-action="menu" aria-label="Menu">${ICONS.menu}</button>
        </nav>
      </header>
      <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
      <div class="ach-toast" id="ach-toast" role="status" aria-live="polite" hidden></div>
      <div class="title-layer" id="title-layer"></div>
      <div class="modal" id="modal" hidden>
        <div class="modal-card" role="dialog" aria-modal="true" id="modal-card"></div>
      </div>
      <div class="replay-bar" id="replay-bar" hidden></div>
      `,
    );
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    this.hud = $('hud');
    this.hudDamage = $('hud-damage');
    this.hudAttempts = $('hud-attempts');
    this.hudDiff = $('hud-diff');
    this.hudFly = $('hud-fly');
    this.toastEl = $('toast');
    this.achEl = $('ach-toast');
    this.modal = $('modal');
    this.modalCard = $('modal-card');
    this.titleLayer = $('title-layer');
    this.replayBar = $('replay-bar');
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (el && root.contains(el)) {
        e.preventDefault();
        this.h.action(el.dataset.action!, el);
      }
    });
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.h.action('close');
    });
  }

  showHud(show: boolean): void {
    this.hud.hidden = !show;
  }

  /** Bottom edge of the HUD in CSS px (0 while it's hidden). */
  hudBottom(): number {
    return this.hud.hidden ? 0 : this.hud.getBoundingClientRect().bottom;
  }

  showError(message: string): void {
    if (this.root.querySelector('.error-banner')) return;
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="error-banner" role="alert"><span><b>Something went wrong.</b> ${esc(message)}</span><button class="btn pill" data-action="reload">Reload</button></div>`,
    );
  }

  /** `mode` is the difficulty id, shown as a small tag. */
  setHud(damage: string, attempts: number, mode: string, modeLabel: string, fly: string): void {
    const key = `${damage}|${attempts}|${mode}|${modeLabel}|${fly}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hudDamage.textContent = damage;
    this.hudAttempts.textContent = String(attempts);
    this.hudDiff.textContent = modeLabel;
    this.hudFly.textContent = fly;
  }

  /** Show the replay button once there's a close call to watch (it pulses when a new one arrives). */
  setReplayAvailable(on: boolean): void {
    const b = this.root.querySelector<HTMLElement>('#btn-replay');
    if (!b) return;
    b.hidden = !on;
    b.classList.remove('pulse');
    if (on) {
      void b.offsetWidth;
      b.classList.add('pulse');
    }
  }

  /** Little "the bill went up" animation on the HUD damage counter. */
  bumpDamage(): void {
    const el = this.hudDamage;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /**
   * Catch screen: count the damage total up, then slam the rank stamp on the
   * receipt. `tick` runs for every counter step, `stamp` when the stamp lands.
   */
  animateReceipt(reducedMotion: boolean, tick: () => void, stamp: () => void): void {
    clearTimeout(this.receiptTimer);
    const totalEl = this.modalCard.querySelector<HTMLElement>('#receipt-total');
    const stampEl = this.modalCard.querySelector<HTMLElement>('#receipt-stamp');
    const receipt = this.modalCard.querySelector<HTMLElement>('.receipt');
    if (!totalEl || !stampEl || !receipt) return;
    const total = Number(totalEl.dataset.total) || 0;
    const lines = Math.min(12, receipt.querySelectorAll('.receipt-lines li').length);
    const fmt = (n: number) => formatMoney(Math.round(n * 100) / 100);
    if (reducedMotion) {
      totalEl.textContent = fmt(total);
      stampEl.classList.add('show');
      return;
    }
    // wait for the receipt lines to slide in, then count up
    const start = 350 + lines * 90;
    const steps = total > 0 ? Math.min(24, Math.max(6, Math.round(Math.sqrt(total) * 1.4))) : 0;
    let i = 0;
    const step = () => {
      if (!this.modalCard.contains(totalEl)) return;
      i++;
      const u = steps ? i / steps : 1;
      totalEl.textContent = fmt(total * (1 - (1 - u) ** 2));
      if (steps) tick();
      if (i < steps) this.receiptTimer = window.setTimeout(step, 45);
      else
        this.receiptTimer = window.setTimeout(() => {
          if (!this.modalCard.contains(stampEl)) return;
          totalEl.classList.add('done');
          stampEl.classList.add('show');
          stamp();
        }, 220);
    };
    this.receiptTimer = window.setTimeout(step, start);
  }

  setMuted(muted: boolean): void {
    const b = this.root.querySelector<HTMLElement>('#btn-sound');
    if (!b) return;
    b.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  showTitle(html: string): void {
    // no auto-focus here: Enter/Space already start the game, and a focus ring
    // on page load looks broken on phones
    this.titleLayer.innerHTML = html;
    this.titleLayer.hidden = false;
  }

  /** Highlight the chosen chip in any visible difficulty picker. */
  selectDifficulty(id: string): void {
    this.root.querySelectorAll<HTMLElement>('.chip[data-diff]').forEach((b) => {
      const on = b.dataset.diff === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-pressed', String(on));
      if (on) this.root.querySelectorAll<HTMLElement>('.diff-line').forEach((l) => (l.textContent = b.dataset.line ?? ''));
    });
  }

  hideTitle(): void {
    this.titleLayer.hidden = true;
    this.titleLayer.innerHTML = '';
  }

  get titleVisible(): boolean {
    return !this.titleLayer.hidden;
  }

  openModal(name: string, html: string, wide = false): void {
    this.modalName = name;
    this.modalCard.innerHTML = `<button class="icon-btn modal-close" data-action="close" aria-label="Close">${ICONS.close}</button>${html}`;
    this.modalCard.classList.toggle('wide', wide);
    this.modalCard.classList.toggle('catch-card', name === 'catch');
    this.modal.hidden = false;
    this.modalCard.scrollTop = 0;
    this.modalCard.querySelector<HTMLElement>('.btn.primary')?.focus({ preventScroll: true });
  }

  closeModal(): void {
    clearTimeout(this.receiptTimer);
    this.modal.hidden = true;
    this.modalCard.innerHTML = '';
    this.modalName = null;
  }

  toast(headline: string, sub: string, tone: ToastTone, replay: boolean): void {
    const tag = tone === 'extreme' ? 'Extremely close' : tone === 'near' ? 'Near miss' : tone === 'close' ? 'Close' : tone === 'blocked' ? 'Blocked' : tone === 'miss' ? 'Miss' : '';
    this.toastEl.className = `toast tone-${tone}`;
    this.toastEl.innerHTML = `
      ${tag ? `<span class="eyebrow">${tag}</span>` : ''}
      <strong>${esc(headline)}</strong>
      ${sub ? `<span class="toast-sub">${esc(sub)}</span>` : ''}
      ${replay ? `<button class="btn small" data-action="replay">Replay</button>` : ''}`;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.hideToast(), replay ? 5200 : 2800);
  }

  hideToast(): void {
    this.toastEl.classList.remove('show');
    this.toastEl.hidden = true;
  }

  achievement(a: AchievementDef): void {
    this.achEl.innerHTML = `<span class="eyebrow">Achievement</span><strong>${esc(a.title)}</strong>`;
    this.achEl.hidden = false;
    this.achEl.classList.remove('show');
    void this.achEl.offsetWidth;
    this.achEl.classList.add('show');
    clearTimeout(this.achTimer);
    this.achTimer = window.setTimeout(() => {
      this.achEl.hidden = true;
    }, 3600);
  }

  // --- replay bar -------------------------------------------------------------
  showReplayBar(_events: ReplayEvent[], _t0: number, _t1: number): void {
    this.replayBar.innerHTML = `
      <div class="replay-top">
        <span class="eyebrow">Slow-motion replay</span>
        <span class="replay-time" id="replay-time">−500 ms</span>
        <button class="icon-btn" data-action="replay-close" aria-label="Close replay">${ICONS.close}</button>
      </div>
      <input type="range" id="replay-scrub" min="0" max="1000" value="0" aria-label="Replay position">
      <div class="replay-controls">
        <button class="icon-btn" data-action="replay-toggle" id="replay-play" aria-label="Pause">${ICONS.pause}</button>
        <div class="chips" role="group" aria-label="Playback speed">
          <button class="chip" data-action="replay-speed" data-speed="0.05">1/20×</button>
          <button class="chip" data-action="replay-speed" data-speed="0.1">1/10×</button>
          <button class="chip" data-action="replay-speed" data-speed="0.25">1/4×</button>
        </div>
      </div>`;
    this.replayBar.hidden = false;
  }

  setReplayState(ms: number, u: number, playing: boolean, speed: number): void {
    const t = this.replayBar.querySelector<HTMLElement>('#replay-time');
    if (t) t.textContent = `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(ms).toFixed(0)} ms`;
    const s = this.replayBar.querySelector<HTMLInputElement>('#replay-scrub');
    if (s && document.activeElement !== s) s.value = String(Math.round(u * 1000));
    const p = this.replayBar.querySelector<HTMLElement>('#replay-play');
    if (p && p.dataset.playing !== String(playing)) {
      p.dataset.playing = String(playing);
      p.innerHTML = playing ? ICONS.pause : ICONS.play;
      p.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    this.replayBar.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  }

  hideReplayBar(): void {
    this.replayBar.hidden = true;
    this.replayBar.innerHTML = '';
  }
}
