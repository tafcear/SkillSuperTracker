import type { StatReport } from '@skillsupertracker/core/pure';
import { escapeHtml } from './escape.js';

function sparkline(perDay: Array<{ day: string; calls: number }>): string {
  const days = perDay.slice(-7);
  if (days.length === 0) return '—';
  const max = Math.max(1, ...days.map((d) => d.calls));
  const bars = days
    .map((d) => `<i style="height:${Math.max(8, Math.round((d.calls / max) * 100))}%" title="${escapeHtml(d.day)}: ${d.calls} 次"></i>`)
    .join('');
  return `<span class="spark">${bars}</span>`;
}

export function renderHeat(container: HTMLElement, stat: StatReport): void {
  if (stat.skills.length === 0) {
    container.innerHTML = `
      <h2>技能使用热度（${stat.sessions} 个会话）</h2>
      <div class="heat-empty">
        <h2>暂无技能调用记录</h2>
        <p>没有在所选范围内解析到技能触发事件——先用 <code>analyze</code> 分析一个会话，或确认会话目录里有技能调用记录。</p>
      </div>`;
    return;
  }
  const rows = stat.skills.map((skill) => `
    <tr>
      <td>${escapeHtml(skill.name)}</td>
      <td>${skill.calls}</td>
      <td>${skill.sessions}</td>
      <td>${new Date(skill.firstAt).toLocaleDateString()}</td>
      <td>${new Date(skill.lastAt).toLocaleDateString()}</td>
      <td>${sparkline(skill.perDay)}</td>
    </tr>`).join('');
  container.innerHTML = `
    <h2>技能使用热度（${stat.sessions} 个会话）</h2>
    <table class="heat">
      <thead><tr><th>技能</th><th>调用次数</th><th>会话数</th><th>首次</th><th>最近</th><th>近 7 天调用</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
