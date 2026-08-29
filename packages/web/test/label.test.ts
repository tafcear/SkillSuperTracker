import { describe, expect, it } from 'vitest';
import { cardLines, shortLabel, TREE_STYLE, KIND_EMOJI } from '../src/tree-view.js';
import type { TreeNode } from '@skillsupertracker/core';

describe('shortLabel', () => {
  it('shortens a tool name to the segment after the last __', () => {
    expect(shortLabel('tool', 'mcp__obsidian-zhuku__obsidian_search_notes')).toBe('obsidian_search_notes');
  });

  it('leaves a tool name without __ unchanged', () => {
    expect(shortLabel('tool', 'pwsh')).toBe('pwsh');
  });

  it('shortens an artifact path to the basename (backslash)', () => {
    expect(shortLabel('artifact', 'C:\\work\\docs\\plan.md')).toBe('plan.md');
  });

  it('shortens an artifact path to the basename (forward slash)', () => {
    expect(shortLabel('artifact', 'a/b/c.txt')).toBe('c.txt');
  });

  it('leaves an artifact label without separators unchanged', () => {
    expect(shortLabel('artifact', 'commit')).toBe('commit');
  });

  it('leaves a skill label unchanged', () => {
    expect(shortLabel('skill', 'writing-plans')).toBe('writing-plans');
  });

  it('leaves a session label unchanged', () => {
    expect(shortLabel('session', 'Plugin ecosystem docume...')).toBe('Plugin ecosystem docume...');
  });
});

const mk = (kind, label, data = {}, time?) =>
  ({ id: 'x', kind, label, data, ...(time === undefined ? {} : { time }) }) satisfies TreeNode;

describe('cardLines (compact light card)', () => {
  it('session card shows agent + model + tokens', () => {
    const n = mk('session', 'Plugin ecosystem doc...', { agent: 'dsh', model: 'deepseek-v4-pro', tokenUsage: { input: 100, output: 50 } });
    expect(cardLines(n)).toEqual({ title: 'Plugin ecosystem doc...', lines: ['dsh', 'deepseek-v4-pro', 'Tokens: 150'] });
  });

  it('turn card merges time and duration into one line', () => {
    const n = mk('turn', 'Turn 2', { endedAt: 1700000060000 }, 1700000000000);
    const r = cardLines(n);
    expect(r.title).toBe('Turn 2');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatch(/^\d{2}:\d{2} · \d+\.\ds$/);
  });

  it('skill card is title-only (details live in the side panel)', () => {
    const n = mk('skill', 'writing-plans', { name: 'writing-plans', sourceRoot: 'C:\\skills\\writing-plans' });
    expect(cardLines(n)).toEqual({ title: 'writing-plans', lines: [] });
  });

  it('tool outcome glyph goes inline after the name, target on second line', () => {
    const n = mk('tool', 'mcp__obsidian-zhuku__obsidian_search_notes', { name: 'mcp__obsidian-zhuku__obsidian_search_notes', outcome: 'ok', target: 'C:\\tools\\search.py' });
    expect(cardLines(n)).toEqual({ title: 'obsidian_search_notes ✓', lines: ['search.py'] });
  });

  it('tool without outcome has no glyph', () => {
    const n = mk('tool', 'pwsh', { name: 'pwsh' });
    expect(cardLines(n)).toEqual({ title: 'pwsh', lines: [] });
  });

  it('artifact file is title-only', () => {
    const n = mk('artifact', 'C:\\work\\docs\\plan.md', { kind: 'file', path: 'C:\\work\\docs\\plan.md' });
    expect(cardLines(n)).toEqual({ title: 'plan.md', lines: [] });
  });

  it('artifact commit shows message line', () => {
    const n = mk('artifact', 'commit', { kind: 'commit', message: 'feat: x' });
    expect(cardLines(n)).toEqual({ title: 'commit', lines: ['feat: x'] });
  });
});

describe('TREE_STYLE (Coze light cards)', () => {
  it('base node is a white label-sized card with centered wrapped text', () => {
    const s = TREE_STYLE.find((r) => r.selector === 'node')?.style;
    expect(s?.shape).toBe('round-rectangle');
    expect(s?.width).toBe('label');
    expect(s?.['text-wrap']).toBe('wrap');
    expect(s?.['text-halign']).toBe('center');
    expect(s?.['text-valign']).toBe('center');
    expect(s?.['background-color']).toBe('#FFFFFF');
  });

  it('session card falls back to a placeholder when label is empty', () => {
    const n = mk('session', '', { agent: 'dsh' });
    expect(cardLines(n).title).toBe('(未命名会话)');
  });

  it('selected card glows indigo', () => {
    const s = TREE_STYLE.find((r) => r.selector === 'node:selected')?.style;
    expect(s?.['border-color']).toBe('#6366F1');
    expect(s?.['shadow-color']).toBe('#6366F1');
  });

  it('event edges are light gray, temporal chain edges are darker and thicker', () => {
    const edge = TREE_STYLE.find((r) => r.selector === 'edge')?.style;
    expect(edge?.['curve-style']).toBe('bezier');
    expect(edge?.['line-color']).toBe('#CBD5E1');
    const chain = TREE_STYLE.find((r) => r.selector === 'edge[chain]')?.style;
    expect(chain?.['line-color']).toBe('#94A3B8');
    expect(chain?.width).toBeGreaterThan(edge?.width as number);
  });
});

describe('KIND_EMOJI', () => {
  it('has an emoji marker for all 5 kinds', () => {
    const keys = Object.keys(KIND_EMOJI).sort();
    expect(keys).toEqual(['artifact', 'session', 'skill', 'tool', 'turn']);
    for (const k of keys) {
      expect(KIND_EMOJI[k as keyof typeof KIND_EMOJI].length).toBeGreaterThan(0);
    }
  });
});
