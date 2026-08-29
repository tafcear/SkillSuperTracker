import { buildTraceTree, traceSessionSchema, statReportSchema, type StatReport, type TraceSession, type TreeNode } from '@skillsupertracker/core/pure';
import { renderDetail } from './detail.js';
import { escapeHtml } from './escape.js';
import { renderHeat } from './heat-view.js';
import { mountTree, type TreeViewHandle } from './tree-view.js';
import { getTheme, initTheme, onThemeChange, themePalette, toggleTheme, type Theme } from './theme.js';

type EmbeddedData =
  | { kind: 'analyze'; traces: TraceSession[] }
  | { kind: 'stat'; stat: StatReport };

/** 解析内嵌数据：多会话 traces，兼容旧的单 trace；stat 原样 */
export function parseEmbeddedData(raw: unknown): EmbeddedData {
  if (typeof raw !== 'object' || raw === null) throw new Error('unrecognized embedded data');
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === 'stat') {
    return { kind: 'stat', stat: statReportSchema.parse((raw as { stat: unknown }).stat) };
  }
  if (kind === 'analyze') {
    const list = (raw as { traces?: unknown }).traces;
    if (list !== undefined) {
      if (!Array.isArray(list)) throw new Error('embedded traces must be an array');
      return { kind: 'analyze', traces: list.map((t) => traceSessionSchema.parse(t)) };
    }
    const single = (raw as { trace?: unknown }).trace;
    if (single !== undefined) {
      return { kind: 'analyze', traces: [traceSessionSchema.parse(single)] };
    }
    throw new Error('analyze payload is missing trace(s)');
  }
  throw new Error('unrecognized embedded data');
}

function readEmbeddedData(): EmbeddedData {
  const el = document.getElementById('trace-data');
  if (el === null || el.textContent === null) throw new Error('missing #trace-data element');
  const parsed: unknown = JSON.parse(el.textContent);
  return parseEmbeddedData(parsed);
}

function sessionTitle(trace: TraceSession): string {
  return trace.session.title || trace.session.id || '(未命名会话)';
}

function sessionOptionLabel(trace: TraceSession): string {
  const base = `${sessionTitle(trace)}（${trace.session.id ?? '无 ID'}）`;
  return base.length > 60 ? `${base.slice(0, 59)}…` : base;
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
  if (data.kind === 'stat') {
    root.innerHTML = `
      <header class="top"><span class="top-title">skillsupertracker — 跨会话热度统计</span><span class="top-right">${themeButtonMarkup()}</span></header>
      <main class="split"><div id="heat"></div></main>`;
    const themeButton0 = root.querySelector<HTMLButtonElement>('#theme-toggle');
    themeButton0?.addEventListener('click', () => toggleTheme());
    onThemeChange((t) => {
      if (themeButton0) themeButton0.textContent = t === 'dark' ? '☀️ 浅色' : '🌙 深色';
    });
    renderHeat(root.querySelector<HTMLElement>('#heat')!, data.stat);
    return;
  }

  const traces = data.traces;
  const switcher = traces.length > 1
    ? `<select id="session-select" class="session-select">${traces.map((t, i) => `<option value="${i}">${escapeHtml(sessionOptionLabel(t))}</option>`).join('')}</select>`
    : '';
  root.innerHTML = `
    <header class="top">
      <span class="top-title">skillsupertracker — 会话轨迹${traces.length > 1 ? `（共 ${traces.length} 个）` : ''}</span>
      <span class="top-right">${switcher}<span id="status-pill" class="status-pill">${statusPill(traces[0])}</span>${themeButtonMarkup()}</span>
    </header>
    <main class="split">
      <div id="tree">${legendMarkup(getTheme())}</div><aside id="detail"></aside>
    </main>`;

  const detail = root.querySelector<HTMLElement>('#detail')!;
  const treeEl = root.querySelector<HTMLElement>('#tree')!;
  let treeHandle: TreeViewHandle | undefined;
  const onSelect = (node: TreeNode): void => renderDetail(detail, node);

  const renderTree = (trace: TraceSession): void => {
    treeHandle?.destroy();
    treeEl.innerHTML = legendMarkup(getTheme());
    renderDetail(detail, { id: 'session', kind: 'session', label: sessionTitle(trace), data: {} });
    const pill = root.querySelector<HTMLElement>('#status-pill');
    if (pill !== null) pill.textContent = statusPill(trace);
    treeHandle = mountTree(treeEl, buildTraceTree(trace), onSelect);
  };
  renderTree(traces[0]);

  const select = root.querySelector<HTMLSelectElement>('#session-select');
  select?.addEventListener('change', () => {
    const idx = Number(select.value);
    if (Number.isInteger(idx) && traces[idx] !== undefined) renderTree(traces[idx]);
  });

  const themeButton = root.querySelector<HTMLButtonElement>('#theme-toggle');
  const syncThemeUi = (t: Theme): void => {
    if (themeButton) themeButton.textContent = t === 'dark' ? '☀️ 浅色' : '🌙 深色';
    const legend = root.querySelector('.legend');
    if (legend !== null) legend.outerHTML = legendMarkup(t);
  };
  themeButton?.addEventListener('click', () => toggleTheme());
  onThemeChange(syncThemeUi);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    toggleTheme();
  });
}
