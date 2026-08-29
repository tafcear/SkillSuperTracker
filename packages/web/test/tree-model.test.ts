// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import { buildTraceTree, type TraceSession } from '@skillsupertracker/core/pure';
import { toCytoscapeElements, chainElements, turnEventElements, eventCountFor } from '../src/tree-view.js';

const trace: TraceSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: { id: 's1', title: 't', startedAt: 0 },
  turns: [{
    index: 0,
    startedAt: 1,
    events: [
      { type: 'skill-load', time: 2, skill: { name: 'alpha' } },
      { type: 'tool-call', time: 3, tool: { name: 'write' }, attributedSkill: 'alpha' },
    ],
  }],
  stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
};

describe('toCytoscapeElements (render smoke)', () => {
  it('builds a valid headless graph', () => {
    const elements = toCytoscapeElements(buildTraceTree(trace));
    const cy = cytoscape({ headless: true, elements });
    expect(cy.nodes().length).toBe(4); // session, turn-0, skill, tool
    expect(cy.edges().length).toBe(3);
    cy.destroy();
  });

  it('chains turns temporally instead of fanning every turn off the session', () => {
    const twoTurns: TraceSession = {
      ...trace,
      turns: [
        trace.turns[0],
        { index: 1, startedAt: 10, events: [] },
        { index: 2, startedAt: 20, events: [] },
      ],
    };
    const elements = toCytoscapeElements(buildTraceTree(twoTurns));
    const edges = elements.filter((el) => 'source' in (el.data as object)) as Array<{ data: { id: string; source: string; target: string; chain?: string } }>;
    const chainEdges = edges.filter((e) => e.data.chain !== undefined);
    expect(chainEdges.map((e) => e.data.id)).toEqual([
      'edge-chain-session-turn-0',
      'edge-chain-turn-0-turn-1',
      'edge-chain-turn-1-turn-2',
    ]);
    // 星型边已被移除：session 直连的只有 turn-0
    expect(edges.filter((e) => e.data.source === 'session')).toHaveLength(1);
  });

  it('collapsed chain view shows session + turns only, with count and marker on turn cards', () => {
    const tree = buildTraceTree(trace);
    const els = chainElements(tree, new Set());
    const ids = els.map((el) => el.data?.id);
    expect(ids).toEqual(['session', 'turn-0', 'edge-chain-session-turn-0']);
    const turn = els.find((el) => el.data?.id === 'turn-0')!;
    expect(String(turn.data?.label)).toContain('▸');
    expect(String(turn.data?.label)).toContain('2 事件');
  });

  it('expanded turn marker flips and event elements stay scoped to that turn', () => {
    const tree = buildTraceTree(trace);
    const expanded = chainElements(tree, new Set(['turn-0']));
    const turn = expanded.find((el) => el.data?.id === 'turn-0')!;
    expect(String(turn.data?.label)).toContain('▾');

    expect(eventCountFor(tree, 'turn-0')).toBe(2);
    const ev = turnEventElements(tree, 'turn-0');
    const evIds = ev.map((el) => el.data?.id);
    expect(evIds).toContain('turn-0-event-0');
    expect(evIds).toContain('turn-0-event-1');
    expect(evIds).toContain('edge-turn-0-turn-0-event-0');
    expect(evIds).toContain('edge-turn-0-event-0-turn-0-event-1');
    const scope = new Set(['turn-0', 'turn-0-event-0', 'turn-0-event-1']);
    expect(ev.every((el) => scope.has(String(el.data?.source ?? el.data?.id)) && scope.has(String(el.data?.target ?? el.data?.id)))).toBe(true);
  });

  it('runs the elk layered layout headless', async () => {
    const elements = toCytoscapeElements(buildTraceTree(trace));
    const cy = cytoscape({ headless: true, elements });
    cy.layout({ name: 'elk', elk: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' } }).run();
    // elk.layout is asynchronous (GWT scheduler chunks via setTimeout) and run()
    // returns the layout handle, not a promise — poll until positions are applied.
    await new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const poll = (): void => {
        if (cy.nodes().some((n) => n.position().x !== 0 || n.position().y !== 0)) return resolve();
        if (Date.now() - startedAt > 2000) return resolve();
        setTimeout(poll, 10);
      };
      poll();
    });
    expect(cy.nodes().some((n) => n.position().x !== 0 || n.position().y !== 0)).toBe(true);
    cy.destroy();
  }, 10000);
});