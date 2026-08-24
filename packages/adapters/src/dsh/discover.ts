import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogSource } from '../types.js';

const ARTIFACT_NAMES = ['session.jsonl.zstd', 'session.jsonl'] as const;

/**
 * DSH session-root discovery: `<root>/--<projectKey>--/<sessionDir>/(session.jsonl.zstd | session.jsonl)`.
 * Read-only and tolerant: a missing root yields [], unreadable entries are skipped.
 */
export async function findSessionLogs(rootDir: string): Promise<LogSource[]> {
  const sources: LogSource[] = [];
  let projects;
  try {
    projects = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return sources;
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const projectPath = join(rootDir, project.name);
    let sessions;
    try {
      sessions = await readdir(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const sessionDir = join(projectPath, session.name);
      for (const name of ARTIFACT_NAMES) {
        const path = join(sessionDir, name);
        try {
          if ((await stat(path)).isFile()) {
            sources.push({ path, sessionDir, projectKey: project.name });
            break;
          }
        } catch {
          // artifact absent or unreadable — try the next name
        }
      }
    }
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}
