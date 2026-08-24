import { runAnalyze } from './analyze.js';
import { runStat } from './stat.js';

export interface CliDeps {
  opener?: (target: string) => Promise<void>;
  template?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const USAGE = [
  'skillsupertracker — AI agent skill-trace visualizer',
  'usage:',
  '  skillsupertracker analyze <session-id|dir> [--root <dir>] [--out <file>] [--open]',
  '  skillsupertracker stat [--root <dir>] [--out <file>] [--open]',
  '  skillsupertracker --help',
].join('\n');

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (cmd === 'analyze') return runAnalyze(rest, deps);
  if (cmd === 'stat') return runStat(rest, deps);
  if (cmd === undefined || cmd === '--help' || cmd === '-h') {
    (deps.stdout ?? console.log)(USAGE);
    return 0;
  }
  (deps.stderr ?? console.error)(`unknown command "${cmd}"\n\n${USAGE}`);
  return 2;
}
