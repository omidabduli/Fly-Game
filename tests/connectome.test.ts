import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loomingWeightsFromCircuit, validateCircuit } from '../src/neuroscience/connectome/ConnectomeLoader';

const shipped = JSON.parse(readFileSync(new URL('../public/data/escape-circuit.json', import.meta.url), 'utf8'));

describe('connectome circuit files', () => {
  it('the shipped (illustrative) circuit validates and is labelled as not connectome data', () => {
    const g = validateCircuit(shipped);
    expect(g.nodes.length).toBeGreaterThan(4);
    expect(g.provenance).toMatch(/ILLUSTRATIVE/);
    expect(g.stages.map((s) => s.module)).toEqual(['visual', 'looming', 'escape', 'motor']);
  });

  it('rejects malformed files', () => {
    expect(() => validateCircuit({})).toThrow();
    expect(() => validateCircuit({ ...shipped, edges: [{ from: 'nope', to: 'GF' }] })).toThrow();
    expect(() => validateCircuit({ ...shipped, nodes: [{ id: 'x', label: 'x', module: 'liver' }], edges: [] })).toThrow();
  });

  it('derives LC4 / LPLC2 → Giant Fiber weights from synapse counts', () => {
    const g = validateCircuit({
      ...shipped,
      edges: [
        { from: 'LC4', to: 'GF', synapses: 300 },
        { from: 'LPLC2', to: 'GF', synapses: 100 },
      ],
    });
    const w = loomingWeightsFromCircuit(g, 1)!;
    expect(w.lc4).toBeCloseTo(0.75, 6);
    expect(w.lplc2).toBeCloseTo(0.25, 6);
  });
});
