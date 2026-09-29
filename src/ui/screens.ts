import { ACHIEVEMENTS } from '../analytics/Achievements';
import type { ScoreEntry } from '../analytics/Leaderboard';
import type { PlayerStats } from '../analytics/StatsManager';
import { damageRank, formatMoney, type ReceiptLine } from '../game/DamageSystem';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId, isDifficultyId } from '../game/DifficultyModes';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(2, '0');
  const sss = String(ss).padStart(2, '0');
  return h ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}

/** One-line description shown under the difficulty chips. */
const DIFF_LINE: Record<DifficultyId, string> = {
  easy: 'A sleepy fly. Slow to react.',
  medium: 'Quick, but it makes mistakes.',
  hard: 'A ninja. It learns from you.',
};

export function difficultyPickerHTML(current: DifficultyId): string {
  return `<div class="chips" role="radiogroup" aria-label="Difficulty">${DIFFICULTY_ORDER.map((id) => {
    const on = id === current;
    return `<button class="chip" role="radio" aria-checked="${on}" aria-pressed="${on}" data-action="difficulty" data-diff="${id}" data-line="${esc(DIFF_LINE[id])}">${DIFFICULTIES[id].label}</button>`;
  }).join('')}</div><p class="diff-line">${esc(DIFF_LINE[current])}</p>`;
}

export function titleHTML(stats: PlayerStats, difficulty: DifficultyId): string {
  const facts =
    stats.attempts > 0
      ? `${stats.attempts} swings · ${stats.catches} catch${stats.catches === 1 ? '' : 'es'}${stats.totalDamage ? ` · ${formatMoney(stats.totalDamage)} damage` : ''}`
      : 'Mouse or touch. No sign-up.';
  return `
  <div class="title-card">
    <p class="eyebrow">Mensa · Bremen · 12:10</p>
    <h1>Catch the <em>fly</em></h1>
    <p class="lede">A fly is loose at lunch and five people are watching. Everything you smash goes on your bill.</p>
    ${difficultyPickerHTML(difficulty)}
    <div class="btn-row">
      <button class="btn primary" data-action="start">Play</button>
      <button class="btn" data-action="howto">How to play</button>
    </div>
    <p class="facts">${facts}</p>
  </div>`;
}

export function howToHTML(touch: boolean): string {
  return `
  <h2>How to play</h2>
  <dl class="how">
    <div><dt>Aim and swat</dt><dd>${touch ? 'Drag to aim, tap to swat.' : 'Move the mouse to aim, click to swat. Arrow keys and Space work too.'}</dd></div>
    <div><dt>Watch the outline</dt><dd>The dashed shape under the swatter is where it lands. The fly sees you coming, so swing fast.</dd></div>
    <div><dt>Mind the bill</dt><dd>Plates, phones, windows and people all cost money. Catch the fly for 0 € to get a clean receipt.</dd></div>
    <div><dt>The regulars</dt><dd>Marisol, Leila, Aro and Nora are having lunch. Lena runs the counter. Nora likes the fly.</dd></div>
  </dl>
  <div class="btn-row"><button class="btn primary" data-action="close">Got it</button></div>`;
}

export interface StatsView {
  stats: PlayerStats;
  unlocked: Record<string, string>;
  bests: { closestMiss: ScoreEntry[]; fewestAttempts: ScoreEntry[]; streak: ScoreEntry[]; lowestDamage: ScoreEntry[] };
  difficulty: number;
  rollingSuccess: number;
  flyName: string;
  mode: DifficultyId;
}

function diffTag(detail: string | undefined): string {
  const id = isDifficultyId(detail) ? detail : 'hard';
  return `<span class="tag">${DIFFICULTIES[id].label}</span>`;
}

export function statsHTML(v: StatsView): string {
  const s = v.stats;
  const fig = (label: string, value: string) => `<div class="fig"><span class="fig-num">${value}</span><span class="eyebrow">${label}</span></div>`;
  const list = ACHIEVEMENTS.map((a) => {
    const got = a.id in v.unlocked;
    return `<li class="${got ? 'got' : ''}"><span>${esc(a.title)}<small>${esc(a.description)}</small></span><span class="status ${got ? 'done' : 'planned'}">${got ? 'Done' : 'Locked'}</span></li>`;
  }).join('');
  const best = (title: string, items: ScoreEntry[], fmt: (e: ScoreEntry) => string) =>
    `<div><h4 class="eyebrow">${title}</h4>${items.length ? `<ol>${items.map((e) => `<li>${fmt(e)}</li>`).join('')}</ol>` : '<p class="muted">None yet</p>'}</div>`;
  return `
  <h2>Statistics</h2>
  <div class="figs">
    ${fig('Swings', String(s.attempts))}
    ${fig('Catches', String(s.catches))}
    ${fig('Closest miss', s.closestMissMm !== null ? `${s.closestMissMm.toFixed(1)} mm` : '–')}
    ${fig('Total damage', formatMoney(s.totalDamage))}
    ${fig('Played', fmtTime(s.playTimeS))}
  </div>
  <h3>Achievements</h3>
  <ul class="rows">${list}</ul>
  <h3>Personal bests</h3>
  <div class="bests">
    ${best('Cleanest catch', v.bests.lowestDamage, (e) => `${formatMoney(e.value)} ${diffTag(e.detail)}`)}
    ${best('Fewest swings', v.bests.fewestAttempts, (e) => `${e.value} ${diffTag(e.detail)}`)}
    ${best('Closest miss', v.bests.closestMiss, (e) => `${e.value.toFixed(1)} mm`)}
  </div>
  <div class="btn-row">
    <button class="btn quiet" data-action="reset-stats">Reset</button>
    <button class="btn primary" data-action="close">Close</button>
  </div>`;
}

export interface CatchView {
  attempts: number;
  flyName: string;
  replay: boolean;
  difficulty: DifficultyId;
  receipt: ReceiptLine[];
  total: number;
  /** previous best (lowest) damage bill on this difficulty, null if this is the first catch */
  previousBest: number | null;
}

export function catchHTML(v: CatchView): string {
  const d = DIFFICULTIES[v.difficulty];
  const rank = damageRank(v.total);
  const lines = v.receipt.length
    ? v.receipt.map((r, i) => `<li style="--i:${i}"><span>${esc(r.label)}</span><span>${formatMoney(r.cost)}</span></li>`).join('')
    : '<li style="--i:0"><span>Alles heil</span><span>0 €</span></li>';
  const record =
    v.previousBest === null || v.total < v.previousBest
      ? `<p class="best-line new">New best on ${d.label}</p>`
      : `<p class="best-line">Best on ${d.label}: ${formatMoney(v.previousBest)}</p>`;
  return `
  <div class="catch">
    <p class="eyebrow">${d.label} · ${esc(v.flyName)}</p>
    <h2>Got <em>it</em></h2>
    <p class="lede">${v.attempts} swing${v.attempts === 1 ? '' : 's'}. Here is the bill.</p>
    <div class="receipt">
      <ul class="receipt-lines">${lines}</ul>
      <div class="receipt-total"><span>Total</span><span id="receipt-total" data-total="${v.total}">0 €</span></div>
      <div class="stamp" id="receipt-stamp">${esc(rank.title)}</div>
    </div>
    ${record}
    <div class="btn-row">
      ${v.replay ? '<button class="btn" data-action="replay">Replay</button>' : ''}
      <button class="btn primary" data-action="new-fly">Next fly</button>
    </div>
  </div>`;
}

export function menuHTML(opts: { muted: boolean; difficulty: DifficultyId; haptics: boolean | null }): string {
  return `
  <h2>Menu</h2>
  <div class="menu">
    <div class="menu-block"><span class="eyebrow">Difficulty</span>${difficultyPickerHTML(opts.difficulty)}<p class="hint">Changing it brings in a new fly.</p></div>
    <button class="row-btn" data-action="howto">How to play</button>
    <button class="row-btn" data-action="stats">Statistics</button>
    <button class="row-btn" data-action="sound">Sound <span class="muted">${opts.muted ? 'off' : 'on'}</span></button>
    ${opts.haptics === null ? '' : `<button class="row-btn" data-action="haptics">Vibration <span class="muted">${opts.haptics ? 'on' : 'off'}</span></button>`}
  </div>
  <div class="btn-row"><button class="btn primary" data-action="close">Resume</button></div>`;
}
