import { describe, expect, it } from 'vitest';
import { classifyRow, splitRows, type RowCounts } from '../src/dsh/jsonl.js';

function counts(): RowCounts {
  return { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] };
}

describe('splitRows', () => {
  it('splits newline-terminated rows', () => {
    const rows = splitRows('a\nb\n', counts());
    expect(rows).toEqual(['a', 'b']);
  });

  it('drops and counts a torn trailing fragment', () => {
    const c = counts();
    const rows = splitRows('a\nb\npartial', c);
    expect(rows).toEqual(['a', 'b']);
    expect(c.skippedLines).toBe(1);
  });

  it('handles a single line without trailing newline as torn', () => {
    const c = counts();
    expect(splitRows('only', c)).toEqual([]);
    expect(c.skippedLines).toBe(1);
  });
});

describe('classifyRow', () => {
  it('classifies packed chunk storage rows', () => {
    for (const type of ['text-chunks', 'reasoning-chunks', 'tool-call-chunks']) {
      expect(classifyRow({ type, seq0: 0, time0: 1, data: {} })).toBe('chunk-row');
    }
  });

  it('classifies header and event rows', () => {
    expect(classifyRow({ type: 'session', version: 0 })).toBe('event');
    expect(classifyRow({ type: 'tool/call', seq: 1 })).toBe('event');
    expect(classifyRow(null)).toBe('event');
    expect(classifyRow(42)).toBe('event');
  });
});
