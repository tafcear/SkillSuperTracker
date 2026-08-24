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

export function mountApp(root: HTMLElement): void {
  const data = readEmbeddedData();
  root.innerHTML = `
    <header class="top">skillsupertracker — ${data.kind === 'analyze' ? '单会话时序树' : '跨会话热度统计'}</header>
    <main class="split">
      ${data.kind === 'analyze' ? '<div id="tree"></div><aside id="detail"></aside>' : '<div id="heat"></div>'}
    </main>`;
  if (data.kind === 'stat') {
    renderHeat(root.querySelector<HTMLElement>('#heat')!, data.stat);
    return;
  }
  const detail = root.querySelector<HTMLElement>('#detail')!;
  renderDetail(detail, { id: 'session', kind: 'session', label: data.trace.session.title ?? data.trace.session.id ?? '(session)', data: {} });
  mountTree(root.querySelector<HTMLElement>('#tree')!, buildTraceTree(data.trace), (node) => renderDetail(detail, node));
}