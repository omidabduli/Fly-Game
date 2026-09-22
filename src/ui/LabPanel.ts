import type { MonteCarloSummary } from '../sim/MonteCarlo';
import { LAB_DEFAULTS, LAB_PRESETS, type LabSettings } from '../sim/LabSettings';
import { ICONS } from './icons';

export interface LabPlayerStats {
  attacks: number;
  escapes: number;
}

/**
 * Lab Mode side panel: sliders for the fly's escape parameters, presets, and a
 * NORMAL vs MODIFIED comparison computed by Monte-Carlo simulation.
 */
export class LabPanel {
  settings: LabSettings = { ...LAB_DEFAULTS };
  normal: MonteCarloSummary | null = null;
  modified: MonteCarloSummary | null = null;
  running = false;
  progress = 0;
  player: { normal: LabPlayerStats; modified: LabPlayerStats } = { normal: { attacks: 0, escapes: 0 }, modified: { attacks: 0, escapes: 0 } };

  constructor(
    private readonly el: HTMLElement,
    private readonly onChange: (s: LabSettings) => void,
  ) {
    el.addEventListener('input', (e) => this.onInput(e));
    el.addEventListener('change', (e) => this.onInput(e));
  }

  open(): void {
    this.render();
    this.el.hidden = false;
  }

  close(): void {
    this.el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  applyPreset(id: string): void {
    const p = LAB_PRESETS.find((x) => x.id === id);
    if (!p) return;
    this.settings = { ...LAB_DEFAULTS, ...p.settings };
    this.modified = null;
    this.render();
    this.onChange(this.settings);
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.lab as keyof LabSettings | undefined;
    if (!k) return;
    const s = this.settings;
    switch (k) {
      case 'escapeEnabled':
      case 'predictionEnabled':
        s[k] = t.checked;
        break;
      case 'horizonMs': {
        const v = Number(t.value);
        s.horizonMs = v < 30 ? null : v;
        break;
      }
      default:
        (s[k] as number) = Number(t.value);
    }
    this.modified = null;
    this.updateLabels();
    this.renderResults();
    this.onChange(s);
  }

  private fmtScale(v: number): string {
    return `×${v.toFixed(2)}`;
  }

  private updateLabels(): void {
    const s = this.settings;
    const set = (k: string, v: string) => {
      const o = this.el.querySelector<HTMLElement>(`[data-out="${k}"]`);
      if (o) o.textContent = v;
    };
    set('reactionScale', this.fmtScale(s.reactionScale));
    set('sensitivity', this.fmtScale(s.sensitivity));
    set('accelScale', this.fmtScale(s.accelScale));
    set('horizonMs', s.horizonMs === null ? 'auto (30–150 ms)' : `${s.horizonMs} ms`);
    set('randomness', this.fmtScale(s.randomness));
  }

  render(): void {
    const s = this.settings;
    const slider = (k: string, label: string, min: number, max: number, step: number, value: number, hint: string) => `
      <label class="lab-row">
        <span class="lab-label">${label} <output data-out="${k}"></output></span>
        <input type="range" data-lab="${k}" min="${min}" max="${max}" step="${step}" value="${value}">
        <small class="muted">${hint}</small>
      </label>`;
    this.el.innerHTML = `
      <div class="lab-head">
        <div><div class="kicker lab">LAB MODE</div><h2>Escape-circuit experiments</h2></div>
        <button class="icon-btn" data-action="lab" aria-label="Leave Lab Mode">${ICONS.close}</button>
      </div>
      <p class="muted small">Change the fly's nervous system, then attack it. Lab attacks don't count toward your statistics or achievements.</p>
      <div class="lab-presets">${LAB_PRESETS.map((p) => `<button class="chip" data-action="lab-preset" data-preset="${p.id}">${p.label}</button>`).join('')}</div>
      ${slider('reactionScale', 'Reaction delay', 0.5, 3, 0.05, s.reactionScale, 'all visual, decision and motor delays')}
      ${slider('sensitivity', 'Visual sensitivity', 0.25, 2, 0.05, s.sensitivity, 'looming detection thresholds')}
      ${slider('accelScale', 'Escape acceleration', 0.25, 2, 0.05, s.accelScale, 'jump speed and flight acceleration')}
      ${slider('horizonMs', 'Prediction horizon', 0, 150, 5, s.horizonMs ?? 0, 'how far ahead it predicts the swatter (0 = automatic)')}
      ${slider('randomness', 'Randomness', 0, 3, 0.05, s.randomness, 'direction noise and planner unpredictability')}
      <label class="lab-check"><input type="checkbox" data-lab="escapeEnabled" ${s.escapeEnabled ? 'checked' : ''}> Escape circuit enabled</label>
      <label class="lab-check"><input type="checkbox" data-lab="predictionEnabled" ${s.predictionEnabled ? 'checked' : ''}> Predictive planning (off = react to the current swatter position only)</label>
      <div class="lab-results" id="lab-results"></div>
      <div class="btn-row"><button class="btn secondary" data-action="lab">Leave Lab Mode</button></div>`;
    this.updateLabels();
    this.renderResults();
  }

  renderResults(): void {
    const box = this.el.querySelector<HTMLElement>('#lab-results');
    if (!box) return;
    const cell = (m: MonteCarloSummary | null, f: (m: MonteCarloSummary) => string) => (m ? f(m) : this.running ? '...' : '–');
    const react = (m: MonteCarloSummary) => (Number.isFinite(m.meanReactionMs) ? `${m.meanReactionMs.toFixed(0)} ms` : 'no escapes');
    const esc = (m: MonteCarloSummary) => `${(m.escapeRate * 100).toFixed(1)}%`;
    const pl = (p: LabPlayerStats) => (p.attacks ? `${p.escapes}/${p.attacks} (${((p.escapes / p.attacks) * 100).toFixed(0)}%)` : '–');
    box.innerHTML = `
      <h3>Simulation <small class="muted">synthetic attacks</small></h3>
      <table class="lab-table">
        <thead><tr><th></th><th>NORMAL</th><th>MODIFIED</th></tr></thead>
        <tbody>
          <tr><td>Reaction</td><td>${cell(this.normal, react)}</td><td>${cell(this.modified, react)}</td></tr>
          <tr><td>Escape success</td><td>${cell(this.normal, esc)}</td><td>${cell(this.modified, esc)}</td></tr>
          <tr><td>Serious attacks</td><td>${cell(this.normal, (m) => String(m.serious))}</td><td>${cell(this.modified, (m) => String(m.serious))}</td></tr>
          <tr><td>Your lab attacks escaped</td><td>${pl(this.player.normal)}</td><td>${pl(this.player.modified)}</td></tr>
        </tbody>
      </table>
      ${this.running ? `<div class="progress"><div style="width:${(this.progress * 100).toFixed(0)}%"></div></div>` : ''}
      <button class="btn primary" data-action="lab-run" ${this.running ? 'disabled' : ''}>${this.running ? 'Simulating...' : 'Run simulation (600 attacks each)'}</button>
      <p class="muted small">These are <b>simulation results</b> from the game's simplified model, not measurements from real flies.</p>`;
  }
}
