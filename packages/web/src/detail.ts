import type { TreeNode } from '@skillsupertracker/core/pure';
import { escapeHtml } from './escape.js';

const KIND_LABELS: Record<string, string> = {
  session: '会话',
  turn: '轮次',
  skill: '技能',
  tool: '工具',
  artifact: '产物',
};

export function renderDetail(container: HTMLElement, node: TreeNode): void {
  const rows = Object.entries({ 类型: KIND_LABELS[node.kind] ?? node.kind, 名称: node.label, ...(node.time === undefined ? {} : { 时间: new Date(node.time).toLocaleString() }), ...Object.fromEntries(Object.entries(node.data).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [`data.${k}`, String(v)])) });
  container.innerHTML = `<h2>${escapeHtml(KIND_LABELS[node.kind] ?? node.kind)}</h2>` + rows.map(([k, v]) => `<div><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</div>`).join('');
}