import { readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAnalyze } from '../src/analyze.js';
import { makeSession, makeTempDir, removeDir, SKILL_SESSION_LINES, writeStubTemplate } from './helpers.js';

let dir: string;
let opened: string[];

beforeEach(async () => {
  dir = await makeTempDir();
  opened = [];
});

afterEach(async () => {
  await removeDir(dir);
});

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const deps = (template: string) => ({
  template,
  opener: async (target: string) => { opened.push(target); },
  stdout: () => {},
  stderr: () => {},
});

describe('runAnalyze', () => {
  it('parses a session dir and writes an HTML file with embedded trajectory', async () => {
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out.html');
    const code = await runAnalyze([sessionDir, '--out', out], deps(template));
    expect(code).toBe(0);
    const html = await readFile(out, 'utf8');
    expect(html).toContain('"kind":"analyze"');
    expect(html).toContain('writing-plans');
    expect(html).toContain('session-aaa');
    expect(opened).toEqual([]); // no --open
  });

  it('resolves a session by id under a custom --root', async () => {
    await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out2.html');
    const code = await runAnalyze(['session-aaa', '--root', dir, '--out', out], deps(template));
    expect(code).toBe(0);
    expect(await readFile(out, 'utf8')).toContain('writing-plans');
  });

  it('defaults the output name to analyze-<slug>.html and honors --open', async () => {
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const code = await runAnalyze([sessionDir, '--open'], { ...deps(template), opener: async (t) => { opened.push(t); } });
    expect(code).toBe(0);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/analyze-session-aaa\.html$/);
    // the default output path resolves against process.cwd(); verify it exists, then clean up
    const defaultOut = resolve(opened[0]);
    expect(await isFile(defaultOut)).toBe(true);
    await rm(defaultOut, { force: true });
  });

  it('escapes </script> sequences in the embedded JSON', async () => {
    const evil = [...SKILL_SESSION_LINES];
    evil[0] = JSON.stringify({ type: 'session', version: 0, id: 'session-aaa', createdAt: 1700000000000, cwd: 'C:\\</script><script>alert(1)</script>', delegationDepth: 0, agentPreset: 'cordis' });
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', evil);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out3.html');
    await runAnalyze([sessionDir, '--out', out], deps(template));
    const html = await readFile(out, 'utf8');
    expect(html).not.toContain('</script><script>');
  });

  it('fails with exit 1 for an unknown target', async () => {
    const template = await writeStubTemplate(dir);
    const code = await runAnalyze(['no-such-session', '--root', dir, '--out', join(dir, 'x.html')], deps(template));
    expect(code).toBe(1);
  });

  it('rejects unknown flags with exit 2', async () => {
    const template = await writeStubTemplate(dir);
    expect(await runAnalyze(['--bogus'], deps(template))).toBe(2);
    expect(await runAnalyze([], deps(template))).toBe(2);
  });
});
