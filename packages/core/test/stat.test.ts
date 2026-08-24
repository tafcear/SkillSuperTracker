import { describe, expect, it } from 'vitest';
import { aggregateStats } from '../src/stat.js';
import type { TraceSession } from '../src/trace-schema.js';

function session(id: string, days: Array<[string, string]>): TraceSession {
  // days: [skillName, ISO time][]
  return {
    schemaVersion: 1,
    agent: 'dsh',
    session: { id, startedAt: 0 },
    turns: [{
      index: 0,
      events: days.map(([name, iso]) => ({
        type: 'skill-load' as const,
        time: new Date(iso).getTime(),
        skill: { name },
      })),
    }],
    stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
  };
}

describe('aggregateStats', () => {
  it('aggregates per-skill calls, sessions, and per-day buckets', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['alpha', '2026-08-23T10:00:00Z'], ['beta', '2026-08-23T11:00:00Z']]),
      session('s2', [['alpha', '2026-08-23T12:00:00Z'], ['alpha', '2026-08-24T12:00:00Z']]),
    ]);
    const alpha = stat.skills.find((s) => s.name === 'alpha');
    expect(alpha?.calls).toBe(3);
    expect(alpha?.sessions).toBe(2);
    expect(alpha?.perDay).toEqual([
      { day: '2026-08-23', calls: 2 },
      { day: '2026-08-24', calls: 1 },
    ]);
    const beta = stat.skills.find((s) => s.name === 'beta');
    expect(beta?.calls).toBe(1);
    expect(beta?.sessions).toBe(1);
    expect(stat.sessions).toBe(2);
  });

  it('sorts skills by call count descending', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['rare', '2026-08-23T10:00:00Z'], ['hot', '2026-08-23T11:00:00Z'], ['hot', '2026-08-23T12:00:00Z']]),
    ]);
    expect(stat.skills.map((s) => s.name)).toEqual(['hot', 'rare']);
  });

  it('reports the covered time range', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['alpha', '2026-08-20T10:00:00Z']]),
      session('s2', [['beta', '2026-08-25T10:00:00Z']]),
    ]);
    expect(stat.range.firstAt).toBe(new Date('2026-08-20T10:00:00Z').getTime());
    expect(stat.range.lastAt).toBe(new Date('2026-08-25T10:00:00Z').getTime());
  });
});
