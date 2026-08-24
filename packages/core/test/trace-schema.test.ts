import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { traceJsonSchema, traceSessionSchema, statReportSchema } from '../src/trace-schema.js';

const validSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: {
    id: 'session-abc',
    title: '开工',
    startedAt: 1700000000000,
    endedAt: 1700000001000,
    cwd: 'C:\\redacted',
    provider: 'kimi-coding',
    model: 'k3',
    tokenUsage: { input: 100, output: 50 },
  },
  turns: [
    {
      index: 0,
      startedAt: 1700000000000,
      endedAt: 1700000001000,
      endReason: 'completed',
      events: [
        { type: 'skill-load', time: 1700000000100, skill: { name: 'writing-plans', sourceRoot: 'C:\\redacted\\skills\\writing-plans' } },
        { type: 'tool-call', time: 1700000000200, tool: { name: 'write', target: 'docs\\plan.md' }, outcome: 'ok', attributedSkill: 'writing-plans' },
        { type: 'artifact', time: 1700000000300, artifact: { kind: 'file', path: 'docs\\plan.md' }, attributedSkill: 'writing-plans' },
        { type: 'artifact', time: 1700000000400, artifact: { kind: 'commit', message: 'feat: plan', repoPath: 'C:\\redacted' } },
      ],
    },
  ],
  stats: { skippedLines: 0, skippedChunkRows: 1, unknownEventTypes: ['kimi-tide/panel'] },
};

describe('traceSessionSchema', () => {
  it('accepts a valid trajectory', () => {
    const result = traceSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('rejects a missing event type member', () => {
    const bad = structuredClone(validSession);
    bad.turns[0].events[0] = { type: 'skill-load', time: 1, skill: { name: 'x' }, attributedSkill: 'y' }; // forbidden key on skill-load
    expect(traceSessionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown event types', () => {
    const bad = structuredClone(validSession);
    bad.turns[0].events.push({ type: 'nope', time: 1 });
    expect(traceSessionSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts missing optional fields (anonymized fixtures)', () => {
    const minimal = {
      schemaVersion: 1,
      agent: 'dsh',
      session: { startedAt: 0 },
      turns: [],
      stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
    };
    expect(traceSessionSchema.safeParse(minimal).success).toBe(true);
  });

  it('exports a JSON Schema with the schemaVersion const', () => {
    const jsonSchema = traceJsonSchema();
    expect(jsonSchema).toHaveProperty('$schema');
    expect(JSON.stringify(jsonSchema)).toContain('skill-load');
  });

  it('matches the committed JSON Schema artifact (drift contract D8.5)', () => {
    const committedPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'schema', 'trace-v1.schema.json');
    const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
    expect(traceJsonSchema()).toEqual(committed);
  });

  it('accepts a valid stat report', () => {
    const stat = {
      agent: 'dsh',
      sessions: 2,
      range: { firstAt: 1, lastAt: 9 },
      skills: [{ name: 'writing-plans', calls: 3, sessions: 2, firstAt: 1, lastAt: 9, perDay: [{ day: '2026-08-23', calls: 3 }] }],
    };
    expect(statReportSchema.safeParse(stat).success).toBe(true);
  });
});