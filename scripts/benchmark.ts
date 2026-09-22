/**
 * Monte-Carlo benchmark: runs thousands of synthetic swatter attacks against
 * the fly and reports escape statistics and simulation performance.
 *
 *   npm run benchmark                 # 10,000 attacks (typical mix) + extras
 *   npm run benchmark -- --attacks 20000 --seed 7
 *   npm run benchmark -- --quick      # 2,000 attacks, skip the extras
 *
 * Synthetic attackers only steer the aim point and press "strike", exactly
 * like a player. No hit is ever forced: every catch emerges from physics.
 */
import { writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS } from '../src/config/params';
import { DifficultyController } from '../src/game/DifficultyController';
import { type MonteCarloSummary, runMonteCarlo } from '../src/sim/MonteCarlo';
import { ATTACK_TYPES, type AttackType } from '../src/sim/SyntheticAttacker';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const quick = args.includes('--quick');
const attacks = arg('attacks', quick ? 2000 : 10000);
const seed = arg('seed', 20260921);

const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '-');
const num = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

function header(title: string): void {
  console.log(`\n${title}\n${'─'.repeat(title.length)}`);
}

function typeTable(s: MonteCarloSummary): void {
  console.log(`${pad('attack type', 13)}${padL('trials', 8)}${padL('serious', 9)}${padL('hits', 6)}${padL('escape', 9)}${padL('near<20', 9)}${padL('gap', 8)}${padL('react', 8)}   description`);
  const order = Object.keys(ATTACK_TYPES) as AttackType[];
  for (const t of order) {
    const r = s.byType[t];
    if (!r) continue;
    console.log(
      `${pad(ATTACK_TYPES[t].label + (ATTACK_TYPES[t].skilled ? '*' : ''), 13)}${padL(String(r.trials), 8)}${padL(String(r.serious), 9)}${padL(String(r.hits), 6)}${padL(pct(r.escapeRate, 1), 9)}${padL(pct(r.nearMissRate, 0), 9)}${padL(num(r.meanGapMm), 8)}${padL(num(r.meanReactionMs, 0), 8)}   ${ATTACK_TYPES[t].description}`,
    );
  }
  console.log('* skilled strategy');
}

console.log(`Fly Escape Lab benchmark (seed ${seed})`);

// 1. Headline: typical attack mix ------------------------------------------------
header(`1. Typical attack mix: ${attacks.toLocaleString()} synthetic attacks at neutral difficulty`);
const main = runMonteCarlo({ attacks, seed, onProgress: (d, n) => { if (process.stdout.isTTY) process.stdout.write(`\r   running… ${Math.round((d / n) * 100)}%`); } });
process.stdout.write('\r' + ' '.repeat(30) + '\r');
const stepUs = (main.wallSeconds / main.steps) * 1e6;
console.log(`Serious attacks          ${main.serious.toLocaleString()} of ${main.trials.toLocaleString()} swings`);
console.log(`Fly escape rate          ${pct(main.escapeRate)}`);
console.log(`Actual hit rate          ${pct(main.hitRate)}  (${main.hits} catches)`);
console.log(`Near-miss rate (<20 mm)  ${pct(main.nearMissRate, 1)}   extremely close (<5 mm) ${pct(main.extremelyCloseRate, 1)}`);
console.log(`Mean miss distance       ${num(main.meanGapMm)} mm`);
console.log(`Mean reaction time       ${num(main.meanReactionMs)} ms  (p10 ${num(main.reactionP10)} · p90 ${num(main.reactionP90)} ms)`);
console.log(`Short-mode take-offs     ${pct(main.shortModeFraction, 1)}`);
console.log(`Simulation performance   ${main.steps.toLocaleString()} physics steps (1 kHz) in ${num(main.wallSeconds, 2)} s`);
console.log(`                         ${num(stepUs, 2)} µs/step · ${num(main.simSeconds / main.wallSeconds, 0)}× real time · ≈${Math.round(1 / (stepUs * 1e-6 * 17)).toLocaleString()} equivalent FPS at 17 steps/frame`);
header('   by attack type');
typeTable(main);

const extras: Record<string, unknown> = {};
if (!quick) {
  // 2. Stratified: every strategy equally often ------------------------------------
  const n2 = Math.max(2000, Math.round(attacks * 0.5));
  header(`2. Every strategy equally often: ${n2.toLocaleString()} attacks`);
  const strat = runMonteCarlo({ attacks: n2, seed: seed + 1, stratified: true });
  console.log(`Escape rate ${pct(strat.escapeRate)} · hit rate ${pct(strat.hitRate)} · near misses ${pct(strat.nearMissRate, 1)}`);
  typeTable(strat);
  extras.stratified = strat;

  // 3. Difficulty range --------------------------------------------------------------
  const n3 = Math.max(1500, Math.round(attacks * 0.3));
  header(`3. Difficulty range: ${n3.toLocaleString()} attacks per level (typical mix)`);
  const levels: Record<string, MonteCarloSummary> = {};
  for (const level of [0, 0.5, 1]) {
    const s = runMonteCarlo({ attacks: n3, seed: seed + 10 + level * 10, level });
    levels[level] = s;
    console.log(`level ${level.toFixed(1)}   escape ${pct(s.escapeRate)}   hit ${pct(s.hitRate)}   reaction ${num(s.meanReactionMs)} ms`);
  }
  extras.levels = levels;

  // 4. Adaptive controller convergence ------------------------------------------------
  const n4 = Math.max(2000, Math.round(attacks * 0.4));
  header(`4. Adaptive difficulty vs. a skilled synthetic player: ${n4.toLocaleString()} attacks in a row`);
  const dc = new DifficultyController(DEFAULT_PARAMS.difficulty);
  let seriousLate = 0;
  let hitsLate = 0;
  let k = 0;
  const skilled = runMonteCarlo({
    attacks: n4,
    seed: seed + 99,
    stratified: false,
    onTrial: (r) => {
      k++;
      if (!r) return;
      dc.record(r);
      if (k > n4 / 2 && r.serious) {
        seriousLate++;
        if (r.hit) hitsLate++;
      }
      return dc.modulation();
    },
  });
  console.log(`final difficulty level   ${dc.level.toFixed(2)}`);
  console.log(`success (2nd half)       ${pct(seriousLate ? hitsLate / seriousLate : 0)}  (${hitsLate}/${seriousLate}), target ${pct(DEFAULT_PARAMS.difficulty.targetPlayerSuccess, 1)}`);
  console.log(`overall                  escape ${pct(skilled.escapeRate)} · hit ${pct(skilled.hitRate)}`);
  extras.adaptive = { level: dc.level, lateSuccess: seriousLate ? hitsLate / seriousLate : 0, summary: skilled };
}

writeFileSync('benchmark-results.json', JSON.stringify({ seed, attacks, main, ...extras }, null, 2));
console.log('\nFull results written to benchmark-results.json');
console.log('Note: these are results from the game model, not biological measurements.');
