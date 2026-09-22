/**
 * OFFLINE connectome preprocessing -> compact circuit JSON for the game.
 *
 * GitHub Pages is static, so large connectome exports (hundreds of MB) must be
 * reduced before deployment. This script streams a FlyWire/Codex-style
 * connection table, keeps only the cell types you care about, aggregates
 * synapse counts between cell-type groups and writes a few-KB JSON in the
 * `fly-escape-lab/circuit@1` schema (see src/neuroscience/connectome).
 *
 * Usage
 *   npm run connectome:preprocess                                  # demo on SYNTHETIC sample data
 *   npm run connectome:preprocess -- \
 *     --connections connections.csv.gz \          # pre_root_id,post_root_id,neuropil,syn_count,nt_type
 *     --types consolidated_cell_types.csv.gz \    # root_id,primary_type[,additional_type(s)]
 *     --out public/data/escape-circuit.json \
 *     [--min-synapses 5] [--source "FlyWire Codex v783"]
 *
 * Column names are matched case-insensitively; .gz files are decompressed on
 * the fly. Download data from the FlyWire Codex (https://codex.flywire.ai)
 * under its terms of use and cite Dorkenwald et al. 2024 / Schlegel et al. 2024.
 * Note: the adult brain connectome does not contain the ventral nerve cord, so
 * motor neurons such as TTMn come from VNC datasets (e.g. MANC/BANC).
 */
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import type { CircuitEdge, CircuitModule, CircuitNode } from '../src/neuroscience/connectome/ConnectomeLoader';
import { validateCircuit } from '../src/neuroscience/connectome/ConnectomeLoader';

/** Which cell types to keep and which pipeline stage they belong to. */
const CELL_TYPES: Record<string, { module: CircuitModule; label: string }> = {
  'R1-6': { module: 'visual', label: 'R1–R6 photoreceptors' },
  T4: { module: 'visual', label: 'T4 direction-selective cells' },
  T5: { module: 'visual', label: 'T5 direction-selective cells' },
  LC4: { module: 'looming', label: 'LC4 (looming velocity)' },
  LPLC2: { module: 'looming', label: 'LPLC2 (looming size)' },
  DNp01: { module: 'escape', label: 'Giant Fiber (DNp01)' },
  DNp02: { module: 'escape', label: 'DNp02 (parallel escape DN)' },
  DNp11: { module: 'escape', label: 'DNp11 (parallel escape DN)' },
  TTMn: { module: 'motor', label: 'TTM motor neuron (jump)' },
  PSI: { module: 'motor', label: 'PSI interneuron' },
};

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const here = new URL('.', import.meta.url).pathname;
const demo = !opt('connections');
const connPath = opt('connections', `${here}sample-data/SYNTHETIC-connections.csv`)!;
const typesPath = opt('types', `${here}sample-data/SYNTHETIC-cell-types.csv`)!;
const outPath = opt('out', demo ? `${here}sample-data/SYNTHETIC-circuit.json` : 'escape-circuit.json')!;
const minSyn = Number(opt('min-synapses', '5'));
const source = opt('source', demo ? 'SYNTHETIC sample data (scripts/sample-data)' : connPath)!;

function lines(path: string) {
  if (!existsSync(path)) throw new Error(`file not found: ${path}`);
  const raw = createReadStream(path);
  const stream = path.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
  return createInterface({ input: stream, crlfDelay: Infinity });
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function readTypes(path: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cols: string[] | null = null;
  for await (const line of lines(path)) {
    if (!line || line.startsWith('#')) continue;
    const f = splitCsv(line);
    if (!cols) {
      cols = f.map((c) => c.toLowerCase());
      continue;
    }
    const id = f[cols.indexOf('root_id')];
    const primary = f[cols.indexOf('primary_type')] ?? '';
    const extra = cols.indexOf('additional_type(s)') >= 0 ? f[cols.indexOf('additional_type(s)')] : cols.indexOf('additional_types') >= 0 ? f[cols.indexOf('additional_types')] : '';
    const candidates = [primary, ...(extra ?? '').split(/[;,]/)].map((s) => s.trim()).filter(Boolean);
    const hit = candidates.find((t) => t in CELL_TYPES);
    if (id && hit) map.set(id, hit);
  }
  return map;
}

async function main(): Promise<void> {
  console.log(`${demo ? '[demo] ' : ''}reading cell types from ${typesPath}`);
  const types = await readTypes(typesPath);
  const counts = new Map<string, number>();
  for (const t of types.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
  console.log(`  kept ${types.size} neurons of ${counts.size} selected types`);

  console.log(`reading connections from ${connPath}`);
  const agg = new Map<string, { syn: number; nt: Map<string, number> }>();
  let cols: string[] | null = null;
  let rows = 0;
  for await (const line of lines(connPath)) {
    if (!line || line.startsWith('#')) continue;
    const f = splitCsv(line);
    if (!cols) {
      cols = f.map((c) => c.toLowerCase());
      continue;
    }
    rows++;
    const pre = types.get(f[cols.indexOf('pre_root_id')]);
    const post = types.get(f[cols.indexOf('post_root_id')]);
    if (!pre || !post || pre === post) continue;
    const syn = Number(f[cols.indexOf('syn_count')]) || 0;
    const nt = cols.indexOf('nt_type') >= 0 ? f[cols.indexOf('nt_type')] : '';
    const key = `${pre}→${post}`;
    const a = agg.get(key) ?? { syn: 0, nt: new Map() };
    a.syn += syn;
    if (nt) a.nt.set(nt, (a.nt.get(nt) ?? 0) + syn);
    agg.set(key, a);
  }
  console.log(`  scanned ${rows.toLocaleString()} connection rows`);

  const nodes: CircuitNode[] = [...counts.entries()].map(([t, n]) => ({ id: t, label: CELL_TYPES[t].label, module: CELL_TYPES[t].module, cellType: t, count: n }));
  const maxSyn = Math.max(1, ...[...agg.values()].map((a) => a.syn));
  const edges: CircuitEdge[] = [...agg.entries()]
    .filter(([, a]) => a.syn >= minSyn)
    .map(([k, a]) => {
      const [from, to] = k.split('→');
      const nt = [...a.nt.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      const inhibitory = nt ? /gaba|glut/i.test(nt) : false; // coarse sign guess; review per cell type
      return { from, to, synapses: a.syn, weight: Number((a.syn / maxSyn).toFixed(4)), sign: inhibitory ? -1 : 1, nt };
    });
  const json = {
    schema: 'fly-escape-lab/circuit@1' as const,
    source,
    provenance: demo
      ? 'SYNTHETIC demo output from made-up sample data. NOT real connectome data.'
      : `Preprocessed from ${source} on ${new Date().toISOString().slice(0, 10)} (edges with ≥ ${minSyn} synapses). Cite the dataset authors.`,
    nodes,
    edges,
  };
  validateCircuit(json); // fail loudly if the output is malformed
  writeFileSync(outPath, JSON.stringify(json, null, 2));
  const bytes = Buffer.byteLength(JSON.stringify(json));
  console.log(`wrote ${outPath}: ${nodes.length} nodes, ${edges.length} edges, ${(bytes / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
