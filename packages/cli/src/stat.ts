import type { AnalyzeDeps } from './analyze.js';

// Task 10 replaces this stub with the real implementation.
export async function runStat(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  (deps.stderr ?? console.error)('stat: not implemented yet');
  return 2;
}
