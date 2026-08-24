import { describe, expect, it } from 'vitest';
import { buildTraceTree } from '../src/tree.js';
import type { TraceSession } from '../src/trace-schema.js';

const trace: TraceSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: { id: 'session-1', title: 't', startedAt: 0 },
  turns: [
    {
      index: 0,
      startedAt: 1,
      events: [
        { type: 'skill-load', time: 2, skill: { name: 'alpha' } },
        { type: 'tool-call', time: 3, tool: { name: 'write' }, attributedSkill: 'alpha' },
        { type: 'artifact', time: 4, artifact: { kind: 'file', path: 'a.md' }, attributedSkill: 'alpha' },
        { type: 'tool-call', time: 5, tool: { name: 'pwsh' } },
        { type: 'skill-load', time: 6, skill: { name: 'beta' } },
        { type: 'artifact', time: 7, artifact: { kind: 'file', path: 'b.md' }, attributedSkill: 'beta' },
      ],
    },
    {
      index: 1,
      startedAt: 10,
      events: [
        { type: 'tool-call', time: 11, tool: { name: 'read' }, attributedSkill: 'alpha' },
      ],
    },
  ],
  stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
};

describe('buildTraceTree', () => {
  const tree = buildTraceTree(trace);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));

  it('has a session root and one node per turn', () => {
    expect(byId.get('session')?.kind).toBe('session');
    expect(byId.get('turn-0')?.kind).toBe('turn');
    expect(byId.get('turn-1')?.kind).toBe('turn');
  });

  it('links edges from session to turns', () => {
    const turnEdges = tree.edges.filter((e) => e.source === 'session');
    expect(turnEdges.map((e) => e.target).sort()).toEqual(['turn-0', 'turn-1']);
  });

  it('attaches attributed events to the last matching skill node within the same turn', () => {
    const alphaNode = tree.nodes.find((n) => n.kind === 'skill' && n.label === 'alpha');
    const alphaChildren = tree.edges.filter((e) => e.source === alphaNode?.id);
    expect(alphaChildren).toHaveLength(2); // the two alpha-attributed events of turn 0
  });

  it('does not let turn 1 attribution leak back into turn 0', () => {
    const readNode = tree.nodes.find((n) => n.kind === 'tool' && n.label === 'read');
    const parentEdge = tree.edges.find((e) => e.target === readNode?.id);
    expect(parentEdge?.source).toBe('turn-1'); // alpha existed in turn 0 only
  });

  it('parents unattributed events onto the turn', () => {
    const pwshNode = tree.nodes.find((n) => n.kind === 'tool' && n.label === 'pwsh');
    const parentEdge = tree.edges.find((e) => e.target === pwshNode?.id);
    expect(parentEdge?.source).toBe('turn-0');
  });
});
