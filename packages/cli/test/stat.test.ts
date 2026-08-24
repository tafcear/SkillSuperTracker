import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runStat } from '../src/stat.js';
import { eventLine, headerLine, makeSession, makeTempDir, removeDir, writeStubTemplate } from './helpers.js';

let dir: string;
let opened: string[];

beforeEach(async () => {
  dir = await makeTempDir();
  opened = [];
});

afterEach(async () => {
  await removeDir(dir);
});

function sessionLines(id: string, skill: string, time: number): string[] {
  return [
    headerLine(id, 'C:\\work'),
    eventLine('turn/start', 0, 11, { turn: 0 }),
    eventLine('tool/call', 1, time, { turn: 0, step: 0, callId: 'c1', name: 'skill', arguments: JSON.stringify({ name: skill }) }),
    eventLine('tool/result', 2, time + 1, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] }] } }),
    eventLine('turn/end', 3, time + 2, { turn: 0, reason: { kind: 'completed' } }),
  ];
}

describe('runStat', () => {
  it('aggregates heat across sessions and writes HTML + JSON stdout', async () => {
    await makeSession(dir, '--proj-a--', 's1', sessionLines('s1', 'alpha', 1700000000000));
    await makeSession(dir, '--proj-a--', 's2', sessionLines('s2', 'alpha', 1700086400000));
    await makeSession(dir, '--proj-b--', 's3', sessionLines('s3', 'beta', 1700000001000));
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'stat.html');
    const stdout: string[] = [];
    const code = await runStat(['--root', dir, '--out', out], { template, stdout: (t) => stdout.push(t), stderr: () => {} });
    expect(code).toBe(0);
    const json = JSON.parse(stdout.join('\n'));
    expect(json.skills.find((s: { name: string }) => s.name === 'alpha')).toMatchObject({ calls: 2, sessions: 2 });
    expect(json.skills.find((s: { name: string }) => s.name === 'beta')).toMatchObject({ calls: 1, sessions: 1 });
    expect(json.sessions).toBe(3);
    const html = await readFile(out, 'utf8');
    expect(html).toContain('"kind":"stat"');
    expect(html).toContain('alpha');
    expect(opened).toEqual([]);
  });

  it('skips a corrupt session with a warning instead of failing', async () => {
    await makeSession(dir, '--proj-a--', 'good', sessionLines('good', 'alpha', 1700000000000));
    // a non-header first line makes fingerprinting throw (the lenient parser tolerates bad
    // EVENT lines, so corrupt-ness here must come from the header)
    await makeSession(dir, '--proj-a--', 'bad', ['this is not a session header']);
    const template = await writeStubTemplate(dir);
    const stderr: string[] = [];
    const code = await runStat(['--root', dir, '--out', join(dir, 's.html')], { template, stdout: () => {}, stderr: (t) => stderr.push(t) });
    expect(code).toBe(0);
    expect(stderr.join('\n')).toContain('bad');
  });

  it('supports --open', async () => {
    await makeSession(dir, '--proj-a--', 's1', sessionLines('s1', 'alpha', 1700000000000));
    const template = await writeStubTemplate(dir);
    const code = await runStat(['--root', dir, '--out', join(dir, 's2.html'), '--open'], { template, opener: async (t) => { opened.push(t); }, stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);
    expect(opened).toHaveLength(1);
  });

  it('rejects unknown flags with exit 2', async () => {
    const template = await writeStubTemplate(dir);
    expect(await runStat(['--bogus'], { template, stderr: () => {} })).toBe(2);
  });
});
