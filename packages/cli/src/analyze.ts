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
  'usage: skillsupertracker analyze <session-id|dir> [--root <dir>] [--out <file>] [--open]',
  '  <session-id|dir>  DSH session id (searched under --root) or a path to a session directory / artifact file',
  '  --root <dir>      sessions root (default ~/.dsh/sessions)',
  '  --out <file>      output HTML path (default analyze-<id>.html in the current directory)',
  '  --open            open the output in the default browser after writing',
].join('\n');

interface AnalyzeArgs {
  target?: string;
  root?: string;
  out?: string;
  open: boolean;
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs | undefined {
  const args: AnalyzeArgs = { open: false };
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
    } else if (a.startsWith('-')) return undefined;
    else if (args.target === undefined) args.target = a;
    else return undefined;
  }
  return args.target === undefined ? undefined : args;
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

function slugFor(id: string | undefined, fallback: string): string {
  const raw = id ?? fallback;
  return raw.replaceAll(/[^A-Za-z0-9._-]/g, '-');
}

export async function runAnalyze(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  const args = parseAnalyzeArgs(argv);
  if (args === undefined || args.target === undefined) {
    (deps.stderr ?? console.error)(ANALYZE_USAGE);
    return 2;
  }
  const artifact = await resolveTarget(args.target, args.root);
  if (artifact === undefined) {
    (deps.stderr ?? console.error)(`no DSH session found for "${args.target}"`);
    return 1;
  }
  const trace = await dshAdapter.parse(artifact);
  const out = args.out ?? `analyze-${slugFor(trace.session.id, basename(dirname(artifact)))}.html`;
  await renderTraceHtml({ kind: 'analyze', trace }, { template: deps.template, out });
  (deps.stdout ?? console.log)(`wrote ${out}`);
  if (args.open) await (deps.opener ?? openPath)(out);
  return 0;
}
