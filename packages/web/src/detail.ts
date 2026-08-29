import type { TreeNode } from '@skillsupertracker/core/pure';
import { escapeHtml } from './escape.js';

const KIND_LABELS: Record<string, string> = {
  session: '会话',
  turn: '轮次',
  skill: '技能',
  tool: '工具',
  artifact: '产物',
};

const KIND_ICON: Record<string, { color: string; glyph: string }> = {
  session: { color: '#64748B', glyph: '会' },
  turn: { color: '#94A3B8', glyph: '轮' },
  skill: { color: '#3B82F6', glyph: '技' },
  tool: { color: '#8B5CF6', glyph: '工' },
  artifact: { color: '#16A34A', glyph: '产' },
};

function stringifyValue(v: unknown): string {
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

export function renderDetail(container: HTMLElement, node: TreeNode): void {
  const kindLabel = KIND_LABELS[node.kind] ?? node.kind;
  const icon = KIND_ICON[node.kind] ?? { color: '#94A3B8', glyph: '?' };

  const basicRows: Array<[string, string]> = [
    ['类型', kindLabel],
    ['名称', node.label],
  ];
  if (node.time !== undefined) basicRows.push(['时间', new Date(node.time).toLocaleString()]);

  const dataPills = Object.entries(node.data)
    .map(([k, v]) => `<span class="pill">${escapeHtml(k)}: ${escapeHtml(stringifyValue(v))}</span>`)
    .join('');
  const dataSection = dataPills === ''
    ? '<div class="detail-empty">暂无附加数据</div>'
    : `<div class="detail-data">${dataPills}</div>`;

  container.innerHTML = `
    <div class="detail-header">
      <span class="kind-icon" style="background:${icon.color}">${icon.glyph}</span>
      <div class="detail-heading">
        <h2>${escapeHtml(kindLabel)}</h2>
        <div class="detail-subtitle">${escapeHtml(node.label)}</div>
      </div>
    </div>
    <section class="detail-section">
      <h3>基本信息</h3>
      ${basicRows.map(([k, v]) => `<div class="detail-row"><span class="detail-key">${escapeHtml(k)}</span><span class="detail-val">${escapeHtml(v)}</span></div>`).join('')}
    </section>
    <section class="detail-section">
      <h3>数据</h3>
      ${dataSection}
    </section>`;
}
