import type { TraceSession } from './trace-schema.js';

export type TreeNodeKind = 'session' | 'turn' | 'skill' | 'tool' | 'artifact';

export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  label: string;
  time?: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface TraceTree {
  nodes: TreeNode[];
  edges: { id: string; source: string; target: string }[];
}

/**
 * Display tree over a trajectory: session → turns → (skill | tool | artifact).
 * A tool-call/artifact carrying `attributedSkill` parents onto the LAST
 * skill-load node with that name in the SAME turn (the skill trigger chain);
 * everything else parents onto its turn. Attribution never crosses turns.
 */
export function buildTraceTree(trace: TraceSession): TraceTree {
  const nodes: TreeNode[] = [];
  const edges: { id: string; source: string; target: string }[] = [];
  const sessionNode: TreeNode = {
    id: 'session',
    kind: 'session',
    label: trace.session.title ?? trace.session.id ?? '(session)',
    time: trace.session.startedAt,
    data: {
      agent: trace.agent,
      ...(trace.session.id === undefined ? {} : { id: trace.session.id }),
      ...(trace.session.provider === undefined ? {} : { provider: trace.session.provider }),
      ...(trace.session.model === undefined ? {} : { model: trace.session.model }),
      ...(trace.session.tokenUsage === undefined ? {} : { tokenUsage: trace.session.tokenUsage }),
    },
  };
  nodes.push(sessionNode);

  for (const turn of trace.turns) {
    const turnId = `turn-${turn.index}`;
    nodes.push({
      id: turnId,
      kind: 'turn',
      label: `Turn ${turn.index + 1}`,
      time: turn.startedAt,
      parentId: sessionNode.id,
      data: {
        ...(turn.endedAt === undefined ? {} : { endedAt: turn.endedAt }),
        ...(turn.endReason === undefined ? {} : { endReason: turn.endReason }),
        ...(turn.prompt === undefined ? {} : { prompt: turn.prompt }),
      },
    });
    edges.push({ id: `edge-${sessionNode.id}-${turnId}`, source: sessionNode.id, target: turnId });

    const skillNodes = new Map<string, string>(); // skill name -> node id (last wins, this turn only)
    let counter = 0;
    for (const event of turn.events) {
      const id = `${turnId}-event-${counter++}`;
      let kind: TreeNodeKind;
      let label: string;
      let data: Record<string, unknown>;
      if (event.type === 'skill-load') {
        kind = 'skill';
        label = event.skill.name;
        data = { name: event.skill.name, ...(event.skill.sourceRoot === undefined ? {} : { sourceRoot: event.skill.sourceRoot }) };
        skillNodes.set(event.skill.name, id);
      } else if (event.type === 'tool-call') {
        kind = 'tool';
        label = event.tool.name;
        data = { name: event.tool.name, ...(event.tool.target === undefined ? {} : { target: event.tool.target }), ...(event.outcome === undefined ? {} : { outcome: event.outcome }) };
      } else {
        kind = 'artifact';
        label = event.artifact.kind === 'file' ? event.artifact.path : 'commit';
        data = { ...event.artifact };
      }
      const parentId = event.type !== 'skill-load' && event.attributedSkill !== undefined
        ? (skillNodes.get(event.attributedSkill) ?? turnId)
        : turnId;
      nodes.push({ id, kind, label, time: event.time, parentId, data });
      edges.push({ id: `edge-${parentId}-${id}`, source: parentId, target: id });
    }
  }

  return { nodes, edges };
}
