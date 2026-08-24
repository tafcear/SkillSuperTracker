// @vitest-environment node
import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import { buildTraceTree, type TraceSession } from '@skillsupertracker/core';
import { toCytoscapeElements } from '../src/tree-view.js';

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