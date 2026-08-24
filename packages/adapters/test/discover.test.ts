import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSessionLogs } from '../src/dsh/discover.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sst-discover-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeSession(project: string, session: string, fileName = 'session.jsonl.zstd'): Promise<void> {
  const dir = join(root, project, session);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), 'placeholder', 'utf8');
}

describe('findSessionLogs', () => {
  it('finds session.jsonl.zstd under project -> session dirs', async () => {
    await makeSession('--proj-a--', 'session-1');
    await makeSession('--proj-b--', 'session-2');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ projectKey: '--proj-a--', sessionDir: join(root, '--proj-a--', 'session-1') });
    expect(sources[0].path).toBe(join(root, '--proj-a--', 'session-1', 'session.jsonl.zstd'));
  });

  it('falls back to uncompressed session.jsonl', async () => {
    await makeSession('--proj-a--', 'session-1', 'session.jsonl');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(1);
    expect(sources[0].path.endsWith('session.jsonl')).toBe(true);
  });

  it('prefers the zstd artifact when both exist', async () => {
    const dir = join(root, '--proj-a--', 'session-1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session.jsonl'), 'plain', 'utf8');
    await writeFile(join(dir, 'session.jsonl.zstd'), 'zstd', 'utf8');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(1);
    expect(sources[0].path.endsWith('.zstd')).toBe(true);
  });

  it('ignores session dirs without an artifact and non-directory noise', async () => {
    await mkdir(join(root, '--proj-a--', 'empty-session'), { recursive: true });
    await writeFile(join(root, '--proj-a--', 'session-1'), 'not-a-dir', 'utf8');
    await writeFile(join(root, 'stray.txt'), 'noise', 'utf8');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(0);
  });

  it('returns [] for a missing root', async () => {
    expect(await findSessionLogs(join(root, 'nope'))).toEqual([]);
  });

  it('sorts results by path', async () => {
    await makeSession('--proj-b--', 'session-2');
    await makeSession('--proj-a--', 'session-1');
    const sources = await findSessionLogs(root);
    expect(sources.map((s) => s.path)).toEqual([...sources.map((s) => s.path)].sort());
    expect(sources[0].path).toContain('--proj-a--');
  });
});
