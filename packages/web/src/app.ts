import { buildTraceTree, traceSessionSchema, statReportSchema, type StatReport, type TraceSession } from '@skillsupertracker/core/pure';
import { renderDetail } from './detail.js';
import { escapeHtml } from './escape.js';
import { renderHeat } from './heat-view.js';
import { mountTree } from './tree-view.js';
import { getTheme, initTheme, onThemeChange, themePalette, toggleTheme, type Theme } from './theme.js';

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
  return trace.session.title || trace.session.id || '(未命名会话)';
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

const LEGEND_ITEMS: Array<[string, string]> = [
  ['session', '会话'],
  ['turn', '轮次'],
  ['skill', '技能'],
  ['tool', '工具'],
  ['artifact', '产物'],
];

function themeButtonMarkup(): string {
  return `<button id="theme-toggle" class="theme-toggle" title="切换深浅主题（T）">${getTheme() === 'dark' ? '☀️ 浅色' : '🌙 深色'}</button>`;
}

function legendMarkup(t: Theme): string {
  const p = themePalette(t);
  const items = LEGEND_ITEMS
    .map(([kind, label]) => {
      const color = p.strokes[kind as keyof typeof p.strokes];
      const fill = p.fills[kind as keyof typeof p.fills];
      return `<span class="legend-item"><i class="legend-dot" style="border:2px solid ${color};background:${fill}"></i>${label}</span>`;
    })
    .join('');
  return `<div class="legend"><div class="legend-title">图例 · Legend</div><div class="legend-items">${items}</div><div class="legend-hint">单击轮次展开 / 收起事件 · 单击节点聚焦并看详情 · 点空白还原 · 右键菜单 · 滚轮缩放 / 拖拽</div></div>`;
}

export function mountApp(root: HTMLElement): void {
  initTheme();
  const data = readEmbeddedData();
  const header = data.kind === 'analyze'
    ? `<header class="top"><span class="top-title">skillsupertracker — ${escapeHtml(sessionTitle(data.trace))}</span><span class="top-right"><span class="status-pill">${statusPill(data.trace)}</span>${themeButtonMarkup()}</span></header>`
    : `<header class="top"><span class="top-title">skillsupertracker — 跨会话热度统计</span><span class="top-right">${themeButtonMarkup()}</span></header>`;
  root.innerHTML = `
    ${header}
    <main class="split">
      ${data.kind === 'analyze' ? `<div id="tree">${legendMarkup(getTheme())}</div><aside id="detail"></aside>` : '<div id="heat"></div>'}
    </main>`;

  const themeButton = root.querySelector<HTMLButtonElement>('#theme-toggle');
  const syncThemeUi = (t: Theme): void => {
    if (themeButton) themeButton.textContent = t === 'dark' ? '☀️ 浅色' : '🌙 深色';
    const legend = root.querySelector('.legend');
    if (legend !== null && data.kind === 'analyze') legend.outerHTML = legendMarkup(t);
  };
  themeButton?.addEventListener('click', () => toggleTheme());
  onThemeChange(syncThemeUi);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    toggleTheme();
  });

  if (data.kind === 'stat') {
    renderHeat(root.querySelector<HTMLElement>('#heat')!, data.stat);
    return;
  }
  const detail = root.querySelector<HTMLElement>('#detail')!;
  renderDetail(detail, { id: 'session', kind: 'session', label: sessionTitle(data.trace), data: {} });
  mountTree(root.querySelector<HTMLElement>('#tree')!, buildTraceTree(data.trace), (node) => renderDetail(detail, node));
}
