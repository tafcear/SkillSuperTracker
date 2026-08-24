import type { TraceEvent, TraceSession, TraceTurn } from '@skillsupertracker/core';
import { classifyRow, splitRows, type RowCounts } from './jsonl.js';
import type { DshFingerprint } from './fingerprint.js';

const FS_TOOLS_WITH_PATH = new Set(['read', 'write', 'edit', 'read_image']);
const COMMIT_TOOL_SUFFIX = 'git_commit';
const IGNORED_EVENT_TYPES = new Set([
  'user/message', 'assistant/chunk', 'assistant/message', 'step/start', 'step/end',
  'request/header', 'approval/asked', 'approval/decided', 'approval/policy', 'permission/preset',
  'sandbox/mode', 'todo/write', 'goal/change', 'plan/mode', 'feedback/record', 'hook/invoked',
  'hook/result', 'command/run', 'command/done', 'compaction/start', 'compaction/end',
  'compaction/prune', 'compaction/summary', 'llm/retry', 'llm/retry-started',
  'session/end-seed', 'session/title-llm-request', 'agent-preset/selected', 'agent/inbox/spliced',
  'schedule/change', 'subagent/descriptor', 'team/member', 'team/task', 'team/message/queued',
  'team/message/delivered', 'tool/code-dispatch', 'tool/code-dispatch-start',
  'tool-workflow/run-start', 'tool-workflow/run-end', 'tool-workflow/agent-start',
  'tool-workflow/agent-end', 'web/deepseek-search-llm-request',
]);

interface PendingCall {
  name: string;
  callId: string;
  arguments: unknown;
  attributedSkill?: string;
  event: Extract<TraceEvent, { type: 'tool-call' }>;
}

type OpenTurn = TraceTurn & { events: TraceEvent[] };

function toolTarget(name: string, args: unknown): string | undefined {
  if (!FS_TOOLS_WITH_PATH.has(name)) return undefined;
  if (typeof args !== 'object' || args === null) return undefined;
  const filePath = (args as { file_path?: unknown }).file_path;
  return typeof filePath === 'string' ? filePath : undefined;
}

function extractSkillSourceRoot(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const inner = (block as { content?: unknown }).content;
    if (!Array.isArray(inner)) continue;
    for (const item of inner) {
      if (typeof item !== 'object' || item === null) continue;
      const text = (item as { text?: unknown }).text;
      if (typeof text !== 'string') continue;
      const match = /^Base directory for this skill: (.+)$/m.exec(text);
      if (match?.[1] !== undefined) return match[1];
    }
  }
  return undefined;
}

function resultCallId(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const source = (message as { source?: unknown }).source;
  if (typeof source !== 'object' || source === null) return undefined;
  const callId = (source as { callId?: unknown }).callId;
  return typeof callId === 'string' ? callId : undefined;
}

/**
 * DSH session event stream → agent-neutral trajectory (pure over decoded text).
 */
export function parseDshText(text: string, _fingerprint: DshFingerprint): TraceSession {
  const counts: RowCounts = { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] };
  const rows = splitRows(text, counts);
  const headerLine = rows[0];
  if (headerLine === undefined) throw new Error('empty DSH session log');
  const header = JSON.parse(headerLine) as Record<string, unknown>;

  const turns: TraceTurn[] = [];
  const calls = new Map<string, PendingCall>();
  let current: { turn: OpenTurn; currentSkill?: string; pendingSkills: Map<string, Extract<TraceEvent, { type: 'skill-load' }>>; seenArtifacts: Set<string> } | undefined;
  let title: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  const tokenUsage = { input: 0, output: 0 };

  for (const raw of rows.slice(1)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      counts.skippedLines += 1;
      continue;
    }
    if (classifyRow(parsed) === 'chunk-row') {
      counts.skippedChunkRows += 1;
      continue;
    }
    const rec = parsed as { type?: unknown; time?: unknown; data?: unknown };
    if (typeof rec.type !== 'string') {
      counts.skippedLines += 1;
      continue;
    }
    const data = typeof rec.data === 'object' && rec.data !== null ? rec.data as Record<string, unknown> : {};
    const time = typeof rec.time === 'number' ? rec.time : 0;

    switch (rec.type) {
      case 'turn/start': {
        const turn: TraceTurn = {
          index: typeof data.turn === 'number' ? data.turn : turns.length,
          startedAt: time,
          events: [],
        };
        turns.push(turn);
        current = { turn: turn as OpenTurn, pendingSkills: new Map(), seenArtifacts: new Set() };
        break;
      }
      case 'turn/end': {
        if (current !== undefined) {
          current.turn.endedAt = time;
          const reason = data.reason;
          if (typeof reason === 'object' && reason !== null && typeof (reason as { kind?: unknown }).kind === 'string') {
            current.turn.endReason = (reason as { kind: string }).kind;
          }
          current = undefined;
        }
        break;
      }
      case 'tool/call': {
        const name = typeof data.name === 'string' ? data.name : undefined;
        const callId = typeof data.callId === 'string' ? data.callId : undefined;
        if (name === undefined || callId === undefined) {
          counts.skippedLines += 1;
          continue;
        }
        let args: unknown;
        try {
          args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : undefined;
        } catch {
          args = undefined;
        }
        if (name === 'skill') {
          const skillName = typeof args === 'object' && args !== null && typeof (args as { name?: unknown }).name === 'string'
            ? (args as { name: string }).name
            : '<unnamed>';
          if (current !== undefined) {
            current.currentSkill = skillName;
            const event: Extract<TraceEvent, { type: 'skill-load' }> = { type: 'skill-load', time, skill: { name: skillName } };
            current.turn.events.push(event);
            current.pendingSkills.set(callId, event);
          }
        } else if (current !== undefined) {
          const attributedSkill = current.currentSkill;
          const event: Extract<TraceEvent, { type: 'tool-call' }> = {
            type: 'tool-call',
            time,
            tool: { name, ...(toolTarget(name, args) === undefined ? {} : { target: toolTarget(name, args) }) },
            ...(attributedSkill === undefined ? {} : { attributedSkill }),
          };
          current.turn.events.push(event);
          calls.set(callId, { name, callId, arguments: args, attributedSkill, event });
        } else {
          calls.set(callId, { name, callId, arguments: args, event: { type: 'tool-call', time, tool: { name, ...(toolTarget(name, args) === undefined ? {} : { target: toolTarget(name, args) }) } } });
        }
        break;
      }
      case 'tool/result': {
        const callId = resultCallId(data.message);
        const call = callId === undefined ? undefined : calls.get(callId);
        const errored = data.error !== undefined;
        if (call !== undefined) {
          if (errored) call.event.outcome = 'error';
          else call.event.outcome = 'ok';
        }
        if (current === undefined) break;

        if (!errored && callId !== undefined) {
          const pending = current.pendingSkills.get(callId);
          if (pending !== undefined) {
            const sourceRoot = extractSkillSourceRoot(data.message);
            if (sourceRoot !== undefined) pending.skill.sourceRoot = sourceRoot;
          }
        }
        if (errored) break;

        const pushArtifact = (key: string, event: TraceEvent): void => {
          if (current.seenArtifacts.has(key)) return;
          current.seenArtifacts.add(key);
          current.turn.events.push(event);
        };
        const attributedSkill = current.currentSkill;

        const meta = data.meta;
        if (typeof meta === 'object' && meta !== null) {
          const diffs = (meta as { diffs?: unknown }).diffs;
          if (Array.isArray(diffs)) {
            for (const diff of diffs) {
              if (typeof diff !== 'object' || diff === null) continue;
              const path = (diff as { path?: unknown }).path;
              if (typeof path === 'string') {
                pushArtifact(`file:${path}`, { type: 'artifact', time, artifact: { kind: 'file', path }, ...(attributedSkill === undefined ? {} : { attributedSkill }) });
              }
            }
          }
        }

        if (call !== undefined) {
          if (call.name === 'write' || call.name === 'edit') {
            const filePath = toolTarget(call.name, call.arguments);
            if (filePath !== undefined) {
              pushArtifact(`file:${filePath}`, { type: 'artifact', time, artifact: { kind: 'file', path: filePath }, ...(call.attributedSkill === undefined ? {} : { attributedSkill: call.attributedSkill }) });
            }
          }
          if (call.name.endsWith(COMMIT_TOOL_SUFFIX)) {
            const a = typeof call.arguments === 'object' && call.arguments !== null ? call.arguments as Record<string, unknown> : {};
            const message = typeof a.message === 'string' ? a.message : undefined;
            const repoPath = typeof a.repo_path === 'string' ? a.repo_path : undefined;
            pushArtifact(`commit:${message ?? ''}:${repoPath ?? ''}`, {
              type: 'artifact', time,
              artifact: { kind: 'commit', ...(message === undefined ? {} : { message }), ...(repoPath === undefined ? {} : { repoPath }) },
              ...(call.attributedSkill === undefined ? {} : { attributedSkill: call.attributedSkill }),
            });
          }
        }
        break;
      }
      case 'session/title':
        if (typeof data.title === 'string') title = data.title;
        break;
      case 'request/context':
        if (typeof data.provider === 'string') provider = data.provider;
        if (typeof data.model === 'string') model = data.model;
        break;
      case 'assistant/message': {
        const usage = data.usage;
        if (typeof usage === 'object' && usage !== null) {
          const u = usage as { inputTokens?: unknown; outputTokens?: unknown };
          if (typeof u.inputTokens === 'number') tokenUsage.input += u.inputTokens;
          if (typeof u.outputTokens === 'number') tokenUsage.output += u.outputTokens;
        }
        break;
      }
      default:
        if (!IGNORED_EVENT_TYPES.has(rec.type) && !counts.unknownEventTypes.includes(rec.type)) {
          counts.unknownEventTypes.push(rec.type);
        }
        break;
    }
  }

  const lastTurn = turns.at(-1);
  return {
    schemaVersion: 1,
    agent: 'dsh',
    session: {
      ...(typeof header.id === 'string' ? { id: header.id } : {}),
      startedAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
      ...(typeof header.cwd === 'string' ? { cwd: header.cwd } : {}),
      ...(title === undefined ? {} : { title }),
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
      ...(lastTurn?.endedAt === undefined ? {} : { endedAt: lastTurn.endedAt }),
      tokenUsage: {
        ...(tokenUsage.input > 0 ? { input: tokenUsage.input } : {}),
        ...(tokenUsage.output > 0 ? { output: tokenUsage.output } : {}),
      },
    },
    turns,
    stats: { skippedLines: counts.skippedLines, skippedChunkRows: counts.skippedChunkRows, unknownEventTypes: counts.unknownEventTypes },
  };
}
