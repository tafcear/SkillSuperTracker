import type { StatReport } from '@skillsupertracker/core/pure';
import { escapeHtml } from './escape.js';

export function renderHeat(container: HTMLElement, stat: StatReport): void {
  const rows = stat.skills.map((skill) => {
    const trend = skill.perDay.slice(-7).map((d) => d.calls).join(' / ');
    return `<tr>
      <td>${escapeHtml(skill.name)}</td>
      <td>${skill.calls}</td>
      <td>${skill.sessions}</td>
      <td>${new Date(skill.firstAt).toLocaleDateString()}</td>
      <td>${new Date(skill.lastAt).toLocaleDateString()}</td>
      <td>${trend || '—'}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <h2>技能使用热度（${stat.sessions} 个会话）</h2>
    <table class="heat">
      <thead><tr><th>技能</th><th>调用次数</th><th>会话数</th><th>首次</th><th>最近</th><th>近 7 天每日调用</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}