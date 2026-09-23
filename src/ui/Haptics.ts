import { loadJSON, saveJSON } from '../analytics/storage';

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success';

/** Tick gaps (ms) per pattern: each tick is one short system haptic. */
const TICKS: Record<HapticPattern, number[]> = {
  light: [0],
  medium: [0, 60],
  heavy: [0, 55, 110],
  success: [0, 90, 180, 330],
};

const VIBRATE_MS: Record<HapticPattern, number | number[]> = {
  light: 12,
  medium: 25,
  heavy: [30, 30, 45],
  success: [20, 60, 20, 60, 60],
};

/**
 * Haptic feedback. Android browsers have `navigator.vibrate`. iPhone Safari
 * doesn't, but since iOS 18 toggling a native `<input type="checkbox" switch>`
 * plays the system haptic tick, so on iOS a hidden switch is clicked instead.
 * Anywhere else this silently does nothing.
 */
export class Haptics {
  enabled: boolean;
  private label: HTMLLabelElement | null = null;
  private readonly canVibrate: boolean;

  constructor() {
    this.enabled = loadJSON<boolean>('haptics', true);
    this.canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    const ios = typeof navigator !== 'undefined' && (/iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if (!this.canVibrate && ios && typeof document !== 'undefined') {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      this.label = label;
    }
  }

  get supported(): boolean {
    return this.canVibrate || this.label !== null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    saveJSON('haptics', on);
    if (on) this.play('medium');
  }

  play(p: HapticPattern): void {
    if (!this.enabled) return;
    if (this.canVibrate) {
      try {
        navigator.vibrate(VIBRATE_MS[p]);
      } catch {
        /* ignore */
      }
      return;
    }
    const label = this.label;
    if (!label) return;
    const tick = () => {
      label.click();
      // never keep focus: the game ignores key presses aimed at inputs
      const input = label.firstElementChild as HTMLElement | null;
      if (input && document.activeElement === input) input.blur();
    };
    for (const ms of TICKS[p]) {
      if (ms === 0) tick();
      else window.setTimeout(tick, ms);
    }
  }
}
