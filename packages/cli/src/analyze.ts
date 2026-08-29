import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { dshAdapter } from '@skillsupertracker/adapters';
import { openPath } from './open.js';
import { renderTraceHtml } from './render.js';

export interface AnalyzeDeps {
  opener?: (target: string) => Promise<void>;
  template?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const ANALYZE_USAGE = [
  'usage: skillsupertracker analyze <session-id|dir>... [--root <dir>] [--recent <n>] [--out <file>] [--open]',
  '  <session-id|dir>  one or more DSH session ids (searched under --root) or paths to session dirs / artifact files',
  '  --root <dir>      sessions root (default ~/.dsh/sessions)',
  '  --recent <n>      embed the n most recent sessions under --root instead of naming ids (default 10)',
  '  --out <file>      output HTML path (default analyze-<id>.html / analyze-multi.html)',
  '  --open            open the output in the default browser after writing',
].join('\n');

interface AnalyzeArgs {
  targets: string[];
  root?: string;
  out?: string;
  open: boolean;
  recent?: number;
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs | undefined {
  const args: AnalyzeArgs = { targets: [], open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') args.open = true;
    else if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.root = v;
    } else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.out = v;
    } else if (a === '--recent') {
      const v = argv[++i];
      const n = v === undefined ? Number.NaN : Number(v);
      if (!Number.isInteger(n) || n <= 0) return undefined;
      args.recent = n;
    } else if (a.startsWith('-')) return undefined;
    else args.targets.push(a);
  }
  return args.targets.length === 0 && args.recent === undefined ? undefined : args;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function artifactOfSessionDir(dir: string): Promise<string | undefined> {
  for (const name of ['session.jsonl.zstd', 'session.jsonl']) {
    const p = join(dir, name);
    if (await isFile(p)) return p;
  }
  return undefined;
}

async function resolveTarget(target: string, rootOverride?: string): Promise<string | undefined> {
  const direct = resolve(target);
  if (await isFile(direct)) return direct;
  const directArtifact = await artifactOfSessionDir(direct);
  if (directArtifact !== undefined) return directArtifact;
  const root = rootOverride ?? join(homedir(), '.dsh', 'sessions');
  const sources = await dshAdapter.locate(root);
  return sources.find((s) => basename(s.sessionDir) === target)?.path;
}

/** --recent：按工件 mtime 取 root 下最近 n 个会话 */
async function recentTargets(n: number, rootOverride?: string): Promise<string[]> {
  const root = rootOverride ?? join(homedir(), '.dsh', 'sessions');
  const sources = await dshAdapter.locate(root);
  const withTime = await Promise.all(sources.map(async (s) => {
    let mtime = 0;
    try {
      mtime = (await stat(s.path)).mtimeMs;
    } catch {
      mtime = 0;
    }
    return { path: s.path, mtime };
  }));
  return withTime
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n)
    .map((s) => s.path);
}

function slugFor(id: string | undefined, fallback: string): string {
  const raw = id ?? fallback;
  return raw.replaceAll(/[^A-Za-z0-9._-]/g, '-');
}

export async function runAnalyze(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  const args = parseAnalyzeArgs(argv);
  if (args === undefined) {
    (deps.stderr ?? console.error)(ANALYZE_USAGE);
    return 2;
  }
  const errors = deps.stderr ?? console.error;
  const artifacts: string[] = [];
  if (args.recent !== undefined) {
    artifacts.push(...(await recentTargets(args.recent, args.root)));
    if (artifacts.length === 0) {
      errors(`no DSH sessions found under root`);
      return 1;
    }
  } else {
    for (const target of args.targets) {
      const artifact = await resolveTarget(target, args.root);
      if (artifact === undefined) errors(`no DSH session found for "${target}", skipping`);
      else artifacts.push(artifact);
    }
  }
  const traces = [];
  for (const artifact of artifacts) {
    try {
      traces.push(await dshAdapter.parse(artifact));
    } catch (err) {
      errors(`failed to parse ${basename(artifact)}: ${err instanceof Error ? err.message : String(err)}, skipping`);
    }
  }
  if (traces.length === 0) {
    errors('no session parsed successfully');
    return 1;
  }
  const out = args.out ?? (traces.length === 1
    ? `analyze-${slugFor(traces[0].session.id, basename(dirname(artifacts[0])))}.html`
    : 'analyze-multi.html');
  await renderTraceHtml({ kind: 'analyze', traces }, { template: deps.template, out });
  (deps.stdout ?? console.log)(`wrote ${out} (${traces.length} session${traces.length === 1 ? '' : 's'})`);
  if (args.open) await (deps.opener ?? openPath)(out);
  return 0;
}
