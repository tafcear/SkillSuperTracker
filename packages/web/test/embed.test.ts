import { describe, expect, it } from 'vitest';
import { parseEmbeddedData } from '../src/app.js';

const trace = {
  schemaVersion: 1,
  agent: 'dsh',
  session: { id: 's1', title: 't', startedAt: 0 },
  turns: [],
  stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
};

const stat = {
  agent: 'dsh',
  sessions: 1,
  range: {},
  skills: [],
};

describe('parseEmbeddedData', () => {
  it('accepts the legacy single-trace payload and normalizes to an array', () => {
    const r = parseEmbeddedData({ kind: 'analyze', trace });
    expect(r.kind).toBe('analyze');
    expect(r.kind === 'analyze' && r.traces).toHaveLength(1);
  });

  it('accepts a multi-trace payload', () => {
    const r = parseEmbeddedData({ kind: 'analyze', traces: [trace, trace] });
    expect(r.kind).toBe('analyze');
    expect(r.kind === 'analyze' && r.traces).toHaveLength(2);
  });

  it('rejects a traces field that is not an array', () => {
    expect(() => parseEmbeddedData({ kind: 'analyze', traces: trace })).toThrow(/array/);
  });

  it('rejects an analyze payload without trace(s)', () => {
    expect(() => parseEmbeddedData({ kind: 'analyze' })).toThrow(/missing trace/);
  });

  it('still parses stat payloads', () => {
    const r = parseEmbeddedData({ kind: 'stat', stat });
    expect(r.kind).toBe('stat');
  });

  it('rejects unknown kinds', () => {
    expect(() => parseEmbeddedData({ kind: 'nope' })).toThrow(/unrecognized/);
  });
});
