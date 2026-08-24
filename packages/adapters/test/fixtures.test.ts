import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dshAdapter } from '../src/dsh/parse.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures', 'golden', 'sample-1');
// test dir = packages/adapters/test → three levels up is the repo root

describe('golden sample regression (spec D8.1)', () => {
  it('parses the anonymized real session to the recorded expected facts', async () => {
    const trace = await dshAdapter.parse(join(fixtureDir, 'session.jsonl.zstd'));
    const expected = JSON.parse(await readFile(join(fixtureDir, 'expected.json'), 'utf8')) as {
      agent: string;
      schemaVersion: number;
      turnCount: number;
      skillLoads: Array<{ name: string }>;
      toolCallCount: number;
      artifactCount: number;
      stats: { skippedLines: number; skippedChunkRows: number; unknownEventTypes: string[] };
    };
    expect(trace.agent).toBe(expected.agent);
    expect(trace.schemaVersion).toBe(expected.schemaVersion);
    expect(trace.turns).toHaveLength(expected.turnCount);
    const skillLoads = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'skill-load'));
    expect(skillLoads.map((e) => e.skill.name)).toEqual(expected.skillLoads.map((s) => s.name));
    const toolCalls = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'tool-call'));
    expect(toolCalls).toHaveLength(expected.toolCallCount);
    const artifacts = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'artifact'));
    expect(artifacts).toHaveLength(expected.artifactCount);
    expect(trace.stats).toEqual(expected.stats);
  });

  it('contains no raw-machine identifiers (anonymization guard)', async () => {
    const raw = await readFile(join(fixtureDir, 'session.jsonl.zstd'));
    const text = raw.toString('latin1'); // binary scan for leakage, not a decode
    expect(text).not.toContain('BaiduSyncdisk');
    expect(text).not.toContain('tafce');
    const trace = await dshAdapter.parse(join(fixtureDir, 'session.jsonl.zstd'));
    expect(trace.session.id).toBe('session-fixture-0001');
    expect(trace.session.cwd).toBeUndefined();
  });
});
