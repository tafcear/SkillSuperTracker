import { homedir } from 'node:os';
import { join } from 'node:path';
import { dshAdapter } from '@skillsupertracker/adapters';
import { aggregateStats, type TraceSession } from '@skillsupertracker/core';
import type { AnalyzeDeps } from './analyze.js';
import { openPath } from './open.js';
import { renderTraceHtml } from './render.js';

export const STAT_USAGE = [
  'usage: skillsupertracker stat [--root <dir>] [--out <file>] [--open]',
  '  --root <dir>  sessions root (default ~/.dsh/sessions)',
  '  --out <file>  output HTML path (default stat.html in the current directory)',
  '  --open        open the output in the default browser after writing',
].join('\n');

interface StatArgs {
  root?: string;
  out?: string;
  open: boolean;
}

export function parseStatArgs(argv: string[]): StatArgs | undefined {
  const args: StatArgs = { open: false };
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
    } else return undefined;
  }
  return args;
}

export async function runStat(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  const args = parseStatArgs(argv);
  if (args === undefined) {
    (deps.stderr ?? console.error)(STAT_USAGE);
    return 2;
  }
  const root = args.root ?? join(homedir(), '.dsh', 'sessions');
  const sources = await dshAdapter.locate(root);
  const traces: TraceSession[] = [];
  for (const source of sources) {
    try {
      traces.push(await dshAdapter.parse(source));
    } catch (error) {
      (deps.stderr ?? console.error)(`warning: skipping ${source.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const stat = aggregateStats(traces[0]?.agent ?? 'dsh', traces);
  const out = args.out ?? 'stat.html';
  (deps.stdout ?? console.log)(JSON.stringify(stat, null, 2));
  await renderTraceHtml({ kind: 'stat', stat }, { template: deps.template, out });
  if (args.open) await (deps.opener ?? openPath)(out);
  return 0;
}
