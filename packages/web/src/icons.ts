import type { TreeNodeKind } from '@skillsupertracker/core/pure';

const KIND_GLYPH: Record<TreeNodeKind, { color: string; glyph: string }> = {
  session: { color: '#64748B', glyph: '会' },
  turn: { color: '#94A3B8', glyph: '轮' },
  skill: { color: '#3B82F6', glyph: '技' },
  tool: { color: '#8B5CF6', glyph: '工' },
  artifact: { color: '#16A34A', glyph: '产' },
};

function svgIcon(color: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="1" y="1" width="18" height="18" rx="5" fill="${color}"/><text x="10" y="14.5" font-size="11" text-anchor="middle" fill="#fff" font-family="sans-serif">${glyph}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const KIND_ICONS: Record<TreeNodeKind, string> = {
  session: svgIcon(KIND_GLYPH.session.color, KIND_GLYPH.session.glyph),
  turn: svgIcon(KIND_GLYPH.turn.color, KIND_GLYPH.turn.glyph),
  skill: svgIcon(KIND_GLYPH.skill.color, KIND_GLYPH.skill.glyph),
  tool: svgIcon(KIND_GLYPH.tool.color, KIND_GLYPH.tool.glyph),
  artifact: svgIcon(KIND_GLYPH.artifact.color, KIND_GLYPH.artifact.glyph),
};
