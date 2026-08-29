import type { TraceSession } from '@skillsupertracker/core';

/** One session artifact found by an adapter's discovery pass. */
export interface LogSource {
  /** Absolute path of the artifact file (e.g. session.jsonl.zstd). */
  path: string;
  /** Absolute path of the session directory containing the artifact. */
  sessionDir: string;
  /** The project-directory key the session belongs to (DSH: `--<projectKey>--`). */
  projectKey: string;
}

/**
 * The multi-agent adapter contract (spec D2): discovery locates artifacts,
 * `parse` turns one artifact into an agent-neutral trajectory. Claude Code and
 * friends arrive as additional implementations (P1+), never as core changes.
 */
export interface TraceAdapter {
  readonly id: string;
  locate(rootDir: string, opts?: { signal?: AbortSignal }): Promise<LogSource[]>;
  parse(source: string | LogSource, opts?: { signal?: AbortSignal; /** 读取技能目录下 SKILL.md 的分类/概述/作用（供查看器展示） */ readSkillMeta?: boolean }): Promise<TraceSession>;
}
