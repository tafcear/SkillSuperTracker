import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dshAdapter } from '../src/dsh/parse.js';

function compressFrame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } });
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sst-parse-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function line(type: string, seq: number, time: number, data: Record<string, unknown>): string {
  return JSON.stringify({ type, seq, time, data });
}

const HEADER = { type: 'session', version: 0, id: 'session-fixture-1', createdAt: 1700000000000, cwd: 'C:\\work', delegationDepth: 0, agentPreset: 'cordis' };

const LOG_TEXT = [
  JSON.stringify(HEADER),
  line('request/context', 1, 10, { provider: 'kimi-coding', model: 'k3', contextWindow: 1048576 }),
  line('turn/start', 2, 11, { turn: 0 }),
  line('session/title', 3, 12, { title: 'fixture session' }),
  line('tool/call', 4, 20, { turn: 0, step: 0, callId: 'call-skill', name: 'skill', arguments: '{"name":"writing-plans"}' }),
  line('tool/result', 5, 21, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'call-skill' }, content: [{ type: 'tool-result', toolCallId: 'call-skill', content: [{ type: 'text', text: 'Base directory for this skill: C:\\skills\\writing-plans\n...' }] }] } }),
  line('tool/call', 6, 22, { turn: 0, step: 0, callId: 'call-write', name: 'write', arguments: '{"file_path":"C:\\\\work\\\\docs\\\\plan.md","content":"x"}' }),
  line('tool/result', 7, 23, { turn: 0, step: 0, message: { role: 'tool', id: 'm2', source: { kind: 'tool', callId: 'call-write' }, content: [{ type: 'tool-result', toolCallId: 'call-write', content: [{ type: 'text', text: 'ok' }] }] }, meta: { diffs: [{ path: 'C:\\work\\docs\\plan.md', oldText: null, newText: 'x' }] } }),
  line('tool/call', 8, 24, { turn: 0, step: 0, callId: 'call-boom', name: 'pwsh', arguments: '{"command":"exit 1"}' }),
  line('tool/result', 9, 25, { turn: 0, step: 0, message: { role: 'tool', id: 'm3', source: { kind: 'tool', callId: 'call-boom' }, content: [{ type: 'tool-result', toolCallId: 'call-boom', content: [{ type: 'text', text: 'boom' }] }] }, error: { name: 'ToolError', code: 'E_TOOL' } }),
  line('tool/call', 10, 26, { turn: 0, step: 0, callId: 'call-commit', name: 'mcp__git__git_commit', arguments: '{"repo_path":"C:\\\\work","message":"feat: plan"}' }),
  line('tool/result', 11, 27, { turn: 0, step: 0, message: { role: 'tool', id: 'm4', source: { kind: 'tool', callId: 'call-commit' }, content: [{ type: 'tool-result', toolCallId: 'call-commit', content: [{ type: 'text', text: 'ok' }] }] } }),
  line('assistant/message', 12, 28, { turn: 0, step: 0, message: { role: 'assistant', id: 'm5', source: { kind: 'model', provider: 'kimi-coding', model: 'k3' }, content: [] }, usage: { inputTokens: 100, outputTokens: 25 } }),
  'this line is not json',
  JSON.stringify({ type: 'text-chunks', seq0: 13, time0: 29, data: { turn: 0, step: 0, index: 0, dt: [], texts: ['a'] } }),
  line('turn/end', 15, 30, { turn: 0, reason: { kind: 'completed' } }),
].join('\n') + '\n';

describe('dshAdapter.parse', () => {
  it('maps a full synthetic log into the trajectory', async () => {
    const path = join(dir, 'session.jsonl.zstd');
    await writeFile(path, Buffer.concat([compressFrame(LOG_TEXT.slice(0, 600)), compressFrame(LOG_TEXT.slice(600))]));
    // ^ two frames; a JSONL line spans the frame boundary (lenient read joins them)
    const trace = await dshAdapter.parse(path);

    expect(trace.schemaVersion).toBe(1);
    expect(trace.agent).toBe('dsh');
    expect(trace.session.id).toBe('session-fixture-1');
    expect(trace.session.title).toBe('fixture session');
    expect(trace.session.provider).toBe('kimi-coding');
    expect(trace.session.model).toBe('k3');
    expect(trace.session.tokenUsage).toEqual({ input: 100, output: 25 });
    expect(trace.turns).toHaveLength(1);
    const turn = trace.turns[0];
    expect(turn.index).toBe(0);
    expect(turn.endReason).toBe('completed');

    const kinds = turn.events.map((e) => e.type);
    expect(kinds).toEqual(['skill-load', 'tool-call', 'artifact', 'tool-call', 'tool-call', 'artifact']);
    // write 工具调用 + meta.diffs 产物（去重后 1 个 file artifact）、pwsh 工具调用（结果 error 无产物）、git_commit 工具调用 + commit artifact

    const skillLoad = turn.events.find((e) => e.type === 'skill-load');
    expect(skillLoad).toMatchObject({ skill: { name: 'writing-plans', sourceRoot: 'C:\\skills\\writing-plans' } });

    const writeCall = turn.events.find((e) => e.type === 'tool-call' && e.tool.name === 'write');
    expect(writeCall).toMatchObject({ tool: { name: 'write', target: 'C:\\work\\docs\\plan.md' }, outcome: 'ok', attributedSkill: 'writing-plans' });

    const boomCall = turn.events.find((e) => e.type === 'tool-call' && e.tool.name === 'pwsh');
    expect(boomCall).toMatchObject({ outcome: 'error', attributedSkill: 'writing-plans' });

    const fileArtifacts = turn.events.filter((e) => e.type === 'artifact' && e.artifact.kind === 'file');
    expect(fileArtifacts).toHaveLength(1); // meta.diffs + write-call path deduped to one artifact? see note below
    const commitArtifacts = turn.events.filter((e) => e.type === 'artifact' && e.artifact.kind === 'commit');
    expect(commitArtifacts).toHaveLength(1);
    expect(commitArtifacts[0]).toMatchObject({ artifact: { kind: 'commit', message: 'feat: plan', repoPath: 'C:\\work' } });

    expect(trace.stats).toEqual({ skippedLines: 1, skippedChunkRows: 1, unknownEventTypes: [] });
  });

  it('rejects an unsupported format version', async () => {
    const path = join(dir, 'bad.jsonl.zstd'); // the .jsonl.zstd suffix selects the zstd decode path
    const bad = JSON.stringify({ type: 'session', version: 99, id: 's', createdAt: 0, delegationDepth: 0 }) + '\n';
    await writeFile(path, compressFrame(bad), 'utf8');
    await expect(dshAdapter.parse(path)).rejects.toThrow(/version 99/);
  });

  it('reads plaintext session.jsonl too', async () => {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, LOG_TEXT.slice(0, 700) + '\n', 'utf8');
    const trace = await dshAdapter.parse(path);
    expect(trace.session.id).toBe('session-fixture-1');
  });
});
