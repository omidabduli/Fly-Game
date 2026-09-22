import type { AchievementDef } from '../analytics/Achievements';
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
  private readonly hudTime: HTMLElement;
  private readonly hudAttempts: HTMLElement;
  private readonly hudBadge: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly achEl: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly modalCard: HTMLElement;
  private readonly titleLayer: HTMLElement;
  readonly replayBar: HTMLElement;
  readonly labPanel: HTMLElement;
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
        <div class="hud-stat"><span class="hud-label">Fly survival</span><span class="hud-value" id="hud-time">00:00</span></div>
        <div class="hud-badge" id="hud-badge"></div>
        <div class="hud-stat right"><span class="hud-label">Attempts</span><span class="hud-value" id="hud-attempts">0</span></div>
        <nav class="hud-buttons" aria-label="Game controls">
          <button class="icon-btn" data-action="sound" id="btn-sound" aria-label="Mute sound">${ICONS.soundOn}</button>
          <button class="icon-btn" data-action="brain" id="btn-brain" aria-label="Toggle Brain View" aria-pressed="false">${ICONS.brain}</button>
          <button class="icon-btn" data-action="lab" id="btn-lab" aria-label="Toggle Lab Mode" aria-pressed="false">${ICONS.flask}</button>
          <button class="icon-btn" data-action="stats" aria-label="Statistics and achievements">${ICONS.chart}</button>
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
      <aside class="lab-panel" id="lab-panel" hidden aria-label="Lab Mode"></aside>
      `,
    );
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    this.hud = $('hud');
    this.hudTime = $('hud-time');
    this.hudAttempts = $('hud-attempts');
    this.hudBadge = $('hud-badge');
    this.toastEl = $('toast');
    this.achEl = $('ach-toast');
    this.modal = $('modal');
    this.modalCard = $('modal-card');
    this.titleLayer = $('title-layer');
    this.replayBar = $('replay-bar');
    this.labPanel = $('lab-panel');
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

  setHud(survival: string, attempts: number, badge: string): void {
    const key = `${survival}|${attempts}|${badge}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.hudTime.textContent = survival;
    this.hudAttempts.textContent = String(attempts);
    this.hudBadge.textContent = badge;
    this.hudBadge.classList.toggle('lab', badge.startsWith('LAB'));
  }

  setToggle(id: 'brain' | 'lab', on: boolean): void {
    const b = this.root.querySelector<HTMLElement>(`#btn-${id}`);
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
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
    this.modal.hidden = true;
    this.modalCard.innerHTML = '';
    this.modalName = null;
  }

  toast(headline: string, sub: string, tone: ToastTone, replay: boolean): void {
    const tag =
      tone === 'extreme' ? 'EXTREMELY CLOSE' : tone === 'near' ? 'NEAR MISS' : tone === 'close' ? 'CLOSE' : tone === 'blocked' ? 'BLOCKED' : tone === 'miss' ? 'MISS' : '';
    this.toastEl.className = `toast tone-${tone}`;
    this.toastEl.innerHTML = `
      ${tag ? `<div class="toast-tag">${tag}</div>` : ''}
      <div class="toast-head">${esc(headline)}</div>
      ${sub ? `<div class="toast-sub">${esc(sub)}</div>` : ''}
      ${replay ? `<button class="btn pill" data-action="replay">${ICONS.replay}<span>REPLAY</span></button>` : ''}`;
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
    this.achEl.innerHTML = `<span class="ach-icon">${a.icon}</span><span><small>Achievement unlocked</small><br><b>${esc(a.title)}</b></span>`;
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
  showReplayBar(events: ReplayEvent[], t0: number, t1: number): void {
    const span = t1 - t0;
    const ticks = events
      .map((e) => {
        const u = ((e.ms / 1000 - t0) / span) * 100;
        return `<span class="rtick k-${e.kind}" style="left:${u.toFixed(2)}%" title="${esc(e.label)}"></span>`;
      })
      .join('');
    const legend = events
      .map((e) => `<li class="k-${e.kind}"><b>${e.ms > 0 ? '+' : ''}${e.ms.toFixed(0)} ms</b> ${esc(e.label)}</li>`)
      .join('');
    this.replayBar.innerHTML = `
      <div class="replay-top">
        <span class="replay-title">SLOW-MOTION REPLAY</span>
        <span class="replay-time" id="replay-time">−500 ms</span>
        <button class="icon-btn" data-action="replay-close" aria-label="Close replay">${ICONS.close}</button>
      </div>
      <div class="replay-track">
        <input type="range" id="replay-scrub" min="0" max="1000" value="0" aria-label="Replay position">
        <div class="replay-ticks">${ticks}</div>
      </div>
      <div class="replay-controls">
        <button class="icon-btn" data-action="replay-toggle" id="replay-play" aria-label="Pause">${ICONS.pause}</button>
        <div class="seg" role="group" aria-label="Playback speed">
          <button class="seg-btn" data-action="replay-speed" data-speed="0.02">1/50×</button>
          <button class="seg-btn on" data-action="replay-speed" data-speed="0.05">1/20×</button>
          <button class="seg-btn" data-action="replay-speed" data-speed="0.1">1/10×</button>
          <button class="seg-btn" data-action="replay-speed" data-speed="0.25">1/4×</button>
        </div>
      </div>
      <ol class="replay-legend">${legend}</ol>`;
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
    this.replayBar.querySelectorAll<HTMLElement>('.seg-btn').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === speed));
  }

  hideReplayBar(): void {
    this.replayBar.hidden = true;
    this.replayBar.innerHTML = '';
  }
}
