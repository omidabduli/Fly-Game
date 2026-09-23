import { ACHIEVEMENTS } from '../analytics/Achievements';
import type { ScoreEntry } from '../analytics/Leaderboard';
import type { PlayerStats } from '../analytics/StatsManager';
import { PARAM_NOTES } from '../config/params';
import { REFERENCES } from '../config/references';
import { damageRank, formatMoney, type ReceiptLine } from '../game/DamageSystem';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId, isDifficultyId } from '../game/DifficultyModes';
import type { CircuitGraph } from '../neuroscience/connectome/ConnectomeLoader';

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

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Cartoon fly used on the title screen (wings flap with CSS). */
const FLY_SVG = `<svg viewBox="0 0 64 48" aria-hidden="true">
  <g class="wing wing-l"><ellipse cx="24" cy="16" rx="15" ry="8" transform="rotate(-25 24 16)"/></g>
  <g class="wing wing-r"><ellipse cx="40" cy="16" rx="15" ry="8" transform="rotate(25 40 16)"/></g>
  <ellipse cx="32" cy="30" rx="10" ry="12" fill="#b58a52"/>
  <path d="M24 27h16M23 32h18M25 37h14" stroke="#5a3a1c" stroke-width="2" stroke-linecap="round"/>
  <circle cx="32" cy="17" r="8" fill="#8a5c34"/>
  <circle cx="27" cy="15" r="5" fill="#c3242e"/><circle cx="37" cy="15" r="5" fill="#c3242e"/>
  <circle cx="25.5" cy="13.5" r="1.6" fill="#fff" opacity=".8"/><circle cx="35.5" cy="13.5" r="1.6" fill="#fff" opacity=".8"/>
</svg>`;

export function difficultyPickerHTML(current: DifficultyId, compact = false): string {
  return `<div class="diff-picker${compact ? ' compact' : ''}" role="radiogroup" aria-label="Difficulty">${DIFFICULTY_ORDER.map((id) => {
    const d = DIFFICULTIES[id];
    const on = id === current;
    return `<button class="diff-card diff-${id}${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-action="difficulty" data-diff="${id}">
      <span class="diff-icon">${d.icon}</span>
      <span class="diff-name">${d.label.toUpperCase()}</span>
      ${compact ? '' : `<span class="diff-fly">${esc(d.flyName)}</span><span class="diff-blurb">${esc(d.blurb)}</span>`}
    </button>`;
  }).join('')}</div>`;
}

export function titleHTML(stats: PlayerStats, difficulty: DifficultyId): string {
  const record =
    stats.attempts > 0
      ? `<p class="record">Your record: <b>${stats.attempts}</b> attempts · <b>${stats.catches}</b> catch${stats.catches === 1 ? '' : 'es'}${stats.totalDamage ? ` · <b>${formatMoney(stats.totalDamage)}</b> of damage` : ''}</p>`
      : '<p class="record">A fruit fly is somewhere in this room.</p>';
  return `
  <div class="title-card">
    <div class="title-fly" aria-hidden="true"><div class="title-fly-path">${FLY_SVG}</div></div>
    <div class="kicker">FLY ESCAPE LAB</div>
    <h1 class="title-h1"><span>CATCH</span> <span>THE</span> <span>FLY</span></h1>
    <p class="subtitle">Can you beat 200 million years of evolution?</p>
    ${record}
    ${difficultyPickerHTML(difficulty)}
    <div class="btn-row">
      <button class="btn primary big" data-action="start">START</button>
      <button class="btn secondary" data-action="howto">HOW IT WORKS</button>
    </div>
    <p class="fineprint warn">⚠️ Things in this room break, and you pay for the damage.</p>
  </div>`;
}

export function howToHTML(touch: boolean): string {
  return `
  <h2>How it works</h2>
  <div class="howto-grid">
    <section>
      <h3>Controls</h3>
      ${
        touch
          ? '<p><b>Drag</b> to move the swatter and <b>tap</b> to swat. It hits wherever you tap.</p>'
          : '<p><b>Move the mouse</b> to aim and <b>click</b> to swat. Arrow keys or <kbd>WASD</kbd> plus <kbd>Space</kbd> work too.</p>'
      }
      <p>The dashed outline under the swatter shows where it will land. Every swing has a short wind-up before it comes down, and the fly can see that too.</p>
      ${touch ? '' : '<p class="muted">Keys: <kbd>B</kbd> brain view, <kbd>L</kbd> lab mode, <kbd>M</kbd> mute, <kbd>R</kbd> replay, <kbd>D</kbd> debug, <kbd>Esc</kbd> menu</p>'}
    </section>
    <section>
      <h3>The fly</h3>
      <p>It sees the swatter with a small delay and notices when it starts getting bigger (<b>looming</b>). Then it guesses where your swing will be 30-150 ms later and jumps in a planned direction, usually 20-70 ms after deciding it's in danger.</p>
      <p>Between attacks it walks around, cleans itself, flies and lands on things. After a few attacks it gets jumpier and more careful about where it lands.</p>
    </section>
    <section>
      <h3>How to catch it</h3>
      <ul>
        <li>Flies that are grooming or landing react a bit slower.</li>
        <li>A sideways sweep is harder for it to read than a straight swing.</li>
        <li>Tall things (cup, monitor, window sill) can block the swatter. Watch the outline.</li>
        <li>Tired flies jump weaker. Moving in fast makes it alert.</li>
      </ul>
      <p class="muted">On Hard you'll miss about 99 times out of 100. Close calls are measured in millimetres, and the slow-motion replay shows what happened.</p>
    </section>
    <section>
      <h3>Difficulty</h3>
      <ul>
        ${DIFFICULTY_ORDER.map((id) => `<li>${DIFFICULTIES[id].icon} <b>${DIFFICULTIES[id].label}</b>: ${esc(DIFFICULTIES[id].flyName.toLowerCase())}. ${esc(DIFFICULTIES[id].blurb)}.</li>`).join('')}
      </ul>
      <p class="muted">Same fly brain in every mode. Easier modes just slow down its reflexes and make it land closer.</p>
    </section>
    <section>
      <h3>The damage bill</h3>
      <p>The swatter breaks whatever it lands on: the window, the monitor, the phone, the lamp, the plant, the mug… Every crack goes on your bill.</p>
      <p class="muted">When you finally get the fly, you see what it cost you. Catch it with a $0 bill for a <b>surgical</b> kill. The room is repaired for every new fly.</p>
    </section>
  </div>
  <div class="btn-row"><button class="btn secondary" data-action="science">Science &amp; About</button><button class="btn primary" data-action="close">Got it</button></div>`;
}

/** "von Reyn CR, Breads P, ..." -> "von Reyn" */
function firstAuthor(authors: string): string {
  const parts = authors.split(',')[0].trim().split(/\s+/);
  if (parts.length > 1 && /^[A-Z]{1,3}$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

function refLinks(keys: string[]): string {
  return keys
    .map((k) => {
      const r = REFERENCES[k];
      return r ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(firstAuthor(r.authors))} ${r.year}</a>` : '';
    })
    .filter(Boolean)
    .join(', ');
}

export function scienceHTML(circuit: CircuitGraph | null): string {
  const rows = PARAM_NOTES.map(
    (n) => `<tr>
      <td>${esc(n.label)}</td>
      <td>${esc(n.value)}</td>
      <td><span class="badge ${n.category}">${n.category === 'measured' ? 'measured' : n.category === 'model' ? 'model assumption' : 'gameplay tuning'}</span></td>
      <td>${esc(n.note)}${n.refs.length ? ` <span class="refs">(${refLinks(n.refs)})</span>` : ''}</td>
    </tr>`,
  ).join('');
  const refs = Object.values(REFERENCES)
    .map((r) => `<li>${esc(r.authors)} (${r.year}). ${esc(r.title)}. <i>${esc(r.venue)}</i>. <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace('https://', ''))}</a></li>`)
    .join('');
  const circuitBlock = circuit
    ? `<p class="muted">Circuit file: <code>${esc(circuit.source)}</code>. ${esc(circuit.provenance)}</p>
       <ol class="circuit">${circuit.stages
         .map((s) => `<li><b>${esc(s.module.toUpperCase())}</b>: ${s.nodes.map((n) => esc(n.label)).join(' · ')}</li>`)
         .join('')}</ol>`
    : '<p class="muted">Circuit description not loaded.</p>';
  return `
  <h2>Science &amp; About</h2>
  <div class="science">
    <p class="lead">The fly in this game is based on how fruit flies (<i>Drosophila melanogaster</i>) escape from looming objects, and on published connectome research. <b>It is not a full biological simulation.</b> It's a small hand-built model of the escape pathway plus flight physics tuned for the game.</p>

    <h3>How the fly decides to escape</h3>
    <ol>
      <li><b>Vision.</b> The fly sees the swatter with a delay (about 15 ms, which is an assumption) and some noise. From that it gets the swatter's angular size θ, how fast it grows (θ̇, the looming rate) and a rough time-to-contact τ = θ/θ̇.</li>
      <li><b>Looming detection.</b> Two channels loosely modelled on neurons that feed the Giant Fiber: one like <b>LC4</b>, which responds to how fast an object expands, and one like <b>LPLC2</b>, which responds to its size while it expands (${refLinks(['vonReyn2017', 'ache2019', 'klapoetke2017'])}). Sideways motion only makes the fly alert. Only looming can trigger an escape.</li>
      <li><b>Escape decision.</b> A leaky integrator standing in for the Giant Fiber adds up both channels linearly (as reported by ${refLinks(['vonReyn2017'])}). Its value is the fly's <code>threatLevel</code> from 0 to 1. Medium means alert, high means escape.</li>
      <li><b>Motor pathway.</b> Once the threshold is crossed there's a random decision delay and a motor delay before the legs push off, usually 20-70 ms in total. Very fast looms cause quick but wobbly <i>short-mode</i> take-offs, slower ones cause stable <i>long-mode</i> take-offs (${refLinks(['vonReyn2014', 'cardDickinson2008jeb'])}).</li>
      <li><b>Prediction.</b> The fly estimates where the swatter will be 30-150 ms later, tries out possible take-off directions with its own flight model and scores them: 0.55 threat avoidance + 0.20 obstacle avoidance + 0.15 landing options + 0.10 noise. Real flies do plan their jumps away from looming objects (${refLinks(['cardDickinson2008cb'])}), but this particular algorithm is just an engineering model. In the air it dodges with banked turns (${refLinks(['muijres2014'])}).</li>
    </ol>

    <h3>Measured, assumed or tuned</h3>
    <div class="table-wrap"><table class="params">
      <thead><tr><th>Parameter</th><th>Value</th><th>Type</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <h3>About the "99%"</h3>
    <p>On <b>Hard</b>, the game tries to keep your success rate around <b>1% of serious attacks</b> with an adaptive difficulty system, and the fly was tuned with simulated attacks to escape roughly 98-99.5% of the time. <b>That number is a design goal, not something measured in real flies.</b> Easy and Medium use the same fly with slower reflexes. The numbers in Lab Mode are results from this model.</p>

    <h3>Fair physics</h3>
    <p>The fly never teleports, never goes through surfaces and doesn't move after it's hit. Difficulty only changes between attacks. Hits are checked with a continuous (swept) collision test between the swatter head and the fly's body, 1000 times per second.</p>

    <h3>Connectome</h3>
    <p>The FlyWire project mapped the whole adult fruit fly brain: about 139,000 neurons and 54.5 million synapses (${refLinks(['dorkenwald2024', 'schlegel2024'])}). Each stage of the escape pathway in this game is a separate module, so one could be replaced by a model built from that data (for example the LC4/LPLC2 → Giant Fiber → descending neuron part). The raw data is huge, so it has to be preprocessed offline (<code>npm run connectome:preprocess</code>) into a small JSON file first.</p>
    ${circuitBlock}

    <h3>References</h3>
    <ol class="refs-list">${refs}</ol>
  </div>
  <div class="btn-row"><button class="btn primary" data-action="close">Close</button></div>`;
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
  return `<span class="diff-tag diff-${id}">${DIFFICULTIES[id].icon} ${DIFFICULTIES[id].label}</span>`;
}

export function statsHTML(v: StatsView): string {
  const s = v.stats;
  const rate = s.attempts ? s.escapes / s.attempts : 1;
  const card = (label: string, value: string, hint = '') => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${hint ? `<div class="stat-hint">${hint}</div>` : ''}</div>`;
  const avgMiss = s.missCount ? `${(s.missSumMm / s.missCount).toFixed(1)} mm` : '–';
  const avgReact = s.reactionCount ? `${(s.reactionSumMs / s.reactionCount).toFixed(0)} ms` : '–';
  const achievements = ACHIEVEMENTS.map((a) => {
    const got = a.id in v.unlocked;
    return `<div class="ach ${got ? 'got' : ''}" title="${esc(a.description)}"><span class="ach-icon">${got ? a.icon : '🔒'}</span><span><b>${esc(a.title)}</b><br><small>${esc(a.description)}</small></span></div>`;
  }).join('');
  const best = (list: ScoreEntry[], fmt: (e: ScoreEntry) => string) =>
    list.length ? `<ol>${list.map((e) => `<li>${fmt(e)} <small class="muted">${new Date(e.date).toLocaleDateString()}</small></li>`).join('')}</ol>` : '<p class="muted">none yet</p>';
  return `
  <h2>Statistics</h2>
  <div class="stats-grid">
    ${card('ATTEMPTS', String(s.attempts), `${s.swings} swing${s.swings === 1 ? '' : 's'} total`)}
    ${card('FLY ESCAPES', String(s.escapes))}
    ${card('CATCHES', String(s.catches))}
    ${card('ESCAPE RATE', fmtPct(rate))}
    ${card('NEAR MISSES', String(s.nearMisses), '&lt; 20 mm')}
    ${card('CLOSEST MISS', s.closestMissMm !== null ? `${s.closestMissMm.toFixed(1)} mm` : '–')}
    ${card('AVERAGE MISS', avgMiss)}
    ${card('FASTEST STRIKE', s.fastestImpactSpeed ? `${(s.fastestImpactSpeed / 1000).toFixed(2)} m/s` : '–', s.fastestStrikeMs !== null ? `${s.fastestStrikeMs.toFixed(0)} ms from click to impact` : 'swatter speed at impact')}
    ${card('YOUR REACTION', avgReact, s.bestReactionMs !== null ? `best ${s.bestReactionMs.toFixed(0)} ms after landing` : 'time from landing to swat')}
    ${card('LONGEST FLY STREAK', String(s.longestStreak), 'attacks survived by one fly')}
    ${card('LONGEST SURVIVAL', fmtTime(s.longestSurvivalS))}
    ${card('FLIES MET', String(s.flies), fmtTime(s.playTimeS) + ' played')}
    ${card('CATCHES BY MODE', `${s.easyCatches} · ${s.mediumCatches} · ${s.hardCatches}`, '🐌 easy · 🪰 medium · 🥷 hard')}
    ${card('TOTAL DAMAGE', formatMoney(s.totalDamage), `${s.itemsBroken} thing${s.itemsBroken === 1 ? '' : 's'} broken`)}
    ${card('WORST ROUND', formatMoney(s.maxRoundDamage), 'most damage for one fly')}
    ${card('CLEAN KILLS', String(s.cleanKills), 'catches with a $0 bill')}
  </div>
  <p class="muted small">Mode: ${DIFFICULTIES[v.mode].icon} ${DIFFICULTIES[v.mode].label}${v.mode === 'hard' ? ` · adaptive level ${v.difficulty.toFixed(2)} (0 = gentler, 1 = sharper)` : ''} · recent success rate ${fmtPct(v.rollingSuccess, 2)} · current fly: ${esc(v.flyName)}</p>
  <h3>Achievements</h3>
  <div class="ach-grid">${achievements}</div>
  <h3>Personal bests <small class="muted">(stored in this browser)</small></h3>
  <div class="bests">
    <div><h4>Cleanest catches</h4>${best(v.bests.lowestDamage, (e) => `${formatMoney(e.value)} ${diffTag(e.detail)}`)}</div>
    <div><h4>Fewest attempts per catch</h4>${best(v.bests.fewestAttempts, (e) => `${e.value} ${diffTag(e.detail)}`)}</div>
    <div><h4>Closest misses</h4>${best(v.bests.closestMiss, (e) => `${e.value.toFixed(2)} mm`)}</div>
    <div><h4>Longest fly streaks</h4>${best(v.bests.streak, (e) => `${e.value}`)}</div>
  </div>
  <div class="btn-row">
    <button class="btn ghost danger" data-action="reset-stats">Reset statistics</button>
    <button class="btn primary" data-action="close">Close</button>
  </div>`;
}

export interface CatchView {
  attempts: number;
  lab: boolean;
  flyName: string;
  traits: string[];
  replay: boolean;
  airborne: boolean;
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
    : '<li class="none" style="--i:0"><span>Nothing broken ✨</span><span>$0</span></li>';
  const record = v.lab
    ? '<p class="muted">Lab catch. This fly\'s nervous system was modified, so it doesn\'t count toward your statistics.</p>'
    : v.previousBest === null || v.total < v.previousBest
      ? `<p class="best-line new">🏅 New personal best on ${d.label}!</p>`
      : `<p class="best-line">Your cleanest catch on ${d.label}: <b>${formatMoney(v.previousBest)}</b></p>`;
  return `
  <div class="catch">
    <div class="kicker catch-kicker"><span class="diff-tag diff-${d.id}">${d.icon} ${d.label}</span> ${v.airborne ? '<b>MID-AIR!</b> ' : ''}${esc(v.flyName)}</div>
    <h1 class="catch-title">GOT IT!</h1>
    <p class="catch-line">in <b>${v.attempts}</b> attempt${v.attempts === 1 ? '' : 's'}${v.traits.length ? ` · <span class="muted">${esc(v.traits.join(', '))}</span>` : ''}</p>
    <div class="receipt" style="--n:${Math.max(1, v.receipt.length)}">
      <div class="receipt-head"><span>DAMAGE BILL</span><span>🧾</span></div>
      <ul class="receipt-lines">${lines}</ul>
      <div class="receipt-total"><span>TOTAL DAMAGE</span><span id="receipt-total" class="${v.total <= 0 ? 'zero' : ''}" data-total="${Math.round(v.total)}">$0</span></div>
      <div class="stamp rank-${rank.title.toLowerCase().replace(/\s+/g, '-')}" id="receipt-stamp">${esc(rank.title)}</div>
    </div>
    <p class="rank-line">${esc(rank.line)}</p>
    ${record}
    <div class="btn-row">
      ${v.replay ? '<button class="btn secondary" data-action="replay">REPLAY</button>' : ''}
      <button class="btn primary big" data-action="new-fly">NEW FLY</button>
    </div>
  </div>`;
}

export function menuHTML(opts: { muted: boolean; brain: boolean; debug: boolean; lab: boolean; difficulty: DifficultyId; haptics: boolean | null }): string {
  return `
  <h2>Menu</h2>
  <div class="menu-list">
    <div class="menu-diff">
      <span class="menu-label">Difficulty <small class="muted">(changing it brings in a new fly)</small></span>
      ${difficultyPickerHTML(opts.difficulty, true)}
    </div>
    <button class="btn primary" data-action="close">Resume</button>
    <button class="btn secondary" data-action="howto">How it works</button>
    <button class="btn secondary" data-action="science">Science &amp; About</button>
    <button class="btn secondary" data-action="stats">Statistics &amp; achievements</button>
    <button class="btn secondary" data-action="lab">${opts.lab ? 'Leave Lab Mode' : 'Lab Mode'}</button>
    <button class="btn secondary" data-action="brain">${opts.brain ? 'Hide' : 'Show'} Brain View</button>
    <button class="btn secondary" data-action="sound">${opts.muted ? 'Unmute' : 'Mute'} sound</button>
    ${opts.haptics === null ? '' : `<button class="btn secondary" data-action="haptics">Vibration: ${opts.haptics ? 'on' : 'off'}</button>`}
    <button class="btn secondary" data-action="debug">${opts.debug ? 'Hide' : 'Show'} debug overlay</button>
  </div>`;
}
