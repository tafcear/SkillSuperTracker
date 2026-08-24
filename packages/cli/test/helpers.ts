import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';

export function compress(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } });
}

export function headerLine(id: string, cwd: string): string {
  return JSON.stringify({ type: 'session', version: 0, id, createdAt: 1700000000000, cwd, delegationDepth: 0, agentPreset: 'cordis' });
}

export function eventLine(type: string, seq: number, time: number, data: Record<string, unknown>): string {
  return JSON.stringify({ type, seq, time, data });
}

/** Build `<root>/--<project>--/<sessionDir>/session.jsonl.zstd` with the given lines. */
export async function makeSession(root: string, project: string, sessionDir: string, lines: string[]): Promise<string> {
  const dir = join(root, project, sessionDir);
  await mkdir(dir, { recursive: true });
  const text = lines.join('\n') + '\n';
  await writeFile(join(dir, 'session.jsonl.zstd'), compress(text));
  return dir;
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'sst-cli-'));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export const STUB_TEMPLATE = '<!doctype html><html><body><script id="trace-data" type="application/json">__TRACE_DATA__</script></body></html>';

export async function writeStubTemplate(dir: string): Promise<string> {
  const path = join(dir, 'stub-template.html');
  await writeFile(path, STUB_TEMPLATE, 'utf8');
  return path;
}

export const SKILL_SESSION_LINES = [
  headerLine('session-aaa', 'C:\\work'),
  eventLine('turn/start', 0, 11, { turn: 0 }),
  eventLine('tool/call', 1, 20, { turn: 0, step: 0, callId: 'c1', name: 'skill', arguments: '{"name":"writing-plans"}' }),
  eventLine('tool/result', 2, 21, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'Base directory for this skill: C:\\skills\\writing-plans' }] }] } }),
  eventLine('turn/end', 3, 30, { turn: 0, reason: { kind: 'completed' } }),
];
