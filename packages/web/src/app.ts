import { buildTraceTree, traceSessionSchema, statReportSchema, type StatReport, type TraceSession } from '@skillsupertracker/core/pure';
import { renderDetail } from './detail.js';
import { renderHeat } from './heat-view.js';
import { mountTree } from './tree-view.js';

type EmbeddedData = {
  kind: 'analyze';
  trace: TraceSession;
} | {
  kind: 'stat';
  stat: StatReport;
};

function readEmbeddedData(): EmbeddedData {
  const el = document.getElementById('trace-data');
  if (el === null || el.textContent === null) throw new Error('missing #trace-data element');
  const parsed: unknown = JSON.parse(el.textContent);
  if (typeof parsed !== 'object' || parsed === null || (parsed as { kind?: unknown }).kind !== 'analyze' && (parsed as { kind?: unknown }).kind !== 'stat') {
    throw new Error('unrecognized embedded data');
  }
  const record = parsed as { kind: 'analyze' | 'stat' };
  if (record.kind === 'analyze') {
    return { kind: 'analyze', trace: traceSessionSchema.parse((parsed as { trace: unknown }).trace) };
  }
  return { kind: 'stat', stat: statReportSchema.parse((parsed as { stat: unknown }).stat) };
}

function sessionTitle(trace: TraceSession): string {
  return trace.session.title ?? trace.session.id ?? '(session)';
}

function statusPill(trace: TraceSession): string {
  const parts: string[] = [];
  const { startedAt, endedAt, tokenUsage } = trace.session;
  if (startedAt !== undefined && endedAt !== undefined) {
    parts.push(`${((endedAt - startedAt) / 1000).toFixed(1)}s`);
  }
  if (tokenUsage !== undefined && (tokenUsage.input !== undefined || tokenUsage.output !== undefined)) {
    parts.push(`${(tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)} Tokens`);
  }
  if (parts.length > 0) return `✓ 运行完成 ${parts.join(' | ')}`;
  const totalEvents = trace.turns.reduce((n, t) => n + t.events.length, 0);
  return `会话 ${trace.turns.length} 轮 · ${totalEvents} 事件`;
}

export function mountApp(root: HTMLElement): void {
  const data = readEmbeddedData();
  const header = data.kind === 'analyze'
    ? `<header class="top"><span class="top-title">skillsupertracker — ${sessionTitle(data.trace)}</span><span class="status-pill">${statusPill(data.trace)}</span></header>`
    : '<header class="top"><span class="top-title">skillsupertracker — 跨会话热度统计</span></header>';
  root.innerHTML = `
    ${header}
    <main class="split">
      ${data.kind === 'analyze' ? '<div id="tree"></div><aside id="detail"></aside>' : '<div id="heat"></div>'}
    </main>`;
  if (data.kind === 'stat') {
    renderHeat(root.querySelector<HTMLElement>('#heat')!, data.stat);
    return;
  }
  const detail = root.querySelector<HTMLElement>('#detail')!;
  renderDetail(detail, { id: 'session', kind: 'session', label: sessionTitle(data.trace), data: {} });
  mountTree(root.querySelector<HTMLElement>('#tree')!, buildTraceTree(data.trace), (node) => renderDetail(detail, node));
}
