/**
 * Compact circuit description format. Used by the Brain View now, and meant for
 * connectome-based replacements of the escape pathway modules later.
 *
 * Large connectome exports (FlyWire / Codex CSVs, hundreds of MB) must be
 * preprocessed OFFLINE into this format (see scripts/preprocess-connectome.ts)
 * so GitHub Pages only ships a few kilobytes.
 */
export type CircuitModule = 'visual' | 'looming' | 'escape' | 'motor';

export interface CircuitNode {
  id: string;
  label: string;
  module: CircuitModule;
  /** cell type name in the source dataset (e.g. "LC4", "LPLC2", "DNp01") */
  cellType?: string;
  /** number of neurons of this type (if known) */
  count?: number;
}

export interface CircuitEdge {
  from: string;
  to: string;
  /** total synapses between the two node groups (if connectome-derived) */
  synapses?: number;
  /** relative weight 0..1 used by models */
  weight?: number;
  /** +1 excitatory, -1 inhibitory */
  sign?: 1 | -1;
  /** predicted neurotransmitter, if known */
  nt?: string;
}

export interface CircuitGraph {
  schema: 'fly-escape-lab/circuit@1';
  source: string;
  provenance: string;
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  /** derived: nodes grouped by pipeline stage */
  stages: { module: CircuitModule; nodes: CircuitNode[] }[];
}

const MODULES: CircuitModule[] = ['visual', 'looming', 'escape', 'motor'];

/** Validate an untrusted JSON object and return a typed graph (throws on error). */
export function validateCircuit(json: unknown): CircuitGraph {
  if (!json || typeof json !== 'object') throw new Error('circuit: not an object');
  const j = json as Record<string, unknown>;
  if (j.schema !== 'fly-escape-lab/circuit@1') throw new Error('circuit: unknown schema');
  if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) throw new Error('circuit: nodes/edges missing');
  const nodes: CircuitNode[] = j.nodes.map((n: unknown, i: number) => {
    const o = n as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.label !== 'string') throw new Error(`circuit: node ${i} invalid`);
    if (!MODULES.includes(o.module as CircuitModule)) throw new Error(`circuit: node ${o.id} has invalid module`);
    return {
      id: o.id,
      label: o.label,
      module: o.module as CircuitModule,
      cellType: typeof o.cellType === 'string' ? o.cellType : undefined,
      count: typeof o.count === 'number' ? o.count : undefined,
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: CircuitEdge[] = j.edges.map((e: unknown, i: number) => {
    const o = e as Record<string, unknown>;
    if (typeof o.from !== 'string' || typeof o.to !== 'string' || !ids.has(o.from) || !ids.has(o.to)) throw new Error(`circuit: edge ${i} invalid`);
    return {
      from: o.from,
      to: o.to,
      synapses: typeof o.synapses === 'number' ? o.synapses : undefined,
      weight: typeof o.weight === 'number' ? o.weight : undefined,
      sign: o.sign === -1 ? -1 : 1,
      nt: typeof o.nt === 'string' ? o.nt : undefined,
    };
  });
  return {
    schema: 'fly-escape-lab/circuit@1',
    source: typeof j.source === 'string' ? j.source : 'unknown',
    provenance: typeof j.provenance === 'string' ? j.provenance : 'unknown provenance',
    nodes,
    edges,
    stages: MODULES.map((m) => ({ module: m, nodes: nodes.filter((n) => n.module === m) })),
  };
}

export async function loadCircuit(url: string): Promise<CircuitGraph> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`circuit: HTTP ${res.status}`);
  return validateCircuit(await res.json());
}

/**
 * Relative LC4 / LPLC2 -> escape-neuron weights derived from synapse counts
 * (normalised so they sum to `total`). This is the hook a connectome-derived
 * LoomingDetector/GiantFiber would use instead of the hand-tuned weights.
 */
export function loomingWeightsFromCircuit(g: CircuitGraph, total = 1.25): { lc4: number; lplc2: number } | null {
  const byType = (t: string) => g.nodes.find((n) => (n.cellType ?? n.id).toUpperCase() === t);
  const lc4 = byType('LC4');
  const lplc2 = byType('LPLC2');
  const gf = g.nodes.find((n) => n.module === 'escape');
  if (!lc4 || !lplc2 || !gf) return null;
  const syn = (from: string) => {
    const e = g.edges.find((x) => x.from === from && x.to === gf.id);
    return e ? (e.synapses ?? (e.weight ?? 0) * 1000) : 0;
  };
  const a = syn(lc4.id);
  const b = syn(lplc2.id);
  if (a + b <= 0) return null;
  return { lc4: (total * a) / (a + b), lplc2: (total * b) / (a + b) };
}
