import { describe, expect, it } from 'vitest';
import { cardLines, shortLabel, TREE_STYLE } from '../src/tree-view.js';
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

describe('cardLines (Coze card)', () => {
  it('session card shows agent as subtitle', () => {
    const n = mk('session', 'Plugin ecosystem doc...', { agent: 'dsh' });
    expect(cardLines(n)).toEqual({ title: 'Plugin ecosystem doc...', subtitle: 'dsh' });
  });

  it('turn card shows HH:MM:SS time subtitle', () => {
    const n = mk('turn', 'Turn 2', {}, 1700000000000);
    const r = cardLines(n);
    expect(r.title).toBe('Turn 2');
    expect(r.subtitle).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('skill card subtitle is 技能', () => {
    const n = mk('skill', 'writing-plans', { name: 'writing-plans' });
    expect(cardLines(n)).toEqual({ title: 'writing-plans', subtitle: '技能' });
  });

  it('tool card shortens label and shows outcome', () => {
    const n = mk('tool', 'mcp__obsidian-zhuku__obsidian_search_notes', { name: 'mcp__obsidian-zhuku__obsidian_search_notes', outcome: 'ok' });
    expect(cardLines(n)).toEqual({ title: 'obsidian_search_notes', subtitle: 'ok' });
  });

  it('tool without outcome falls back to 工具', () => {
    const n = mk('tool', 'pwsh', { name: 'pwsh' });
    expect(cardLines(n)).toEqual({ title: 'pwsh', subtitle: '工具' });
  });

  it('artifact card uses basename + 产物', () => {
    const n = mk('artifact', 'C:\\work\\docs\\plan.md', { kind: 'file', path: 'C:\\work\\docs\\plan.md' });
    expect(cardLines(n)).toEqual({ title: 'plan.md', subtitle: '产物' });
  });
});

describe('TREE_STYLE (Coze cards)', () => {
  it('base node is a label-sized card', () => {
    const s = TREE_STYLE.find((r) => r.selector === 'node')?.style;
    expect(s?.shape).toBe('round-rectangle');
    expect(s?.width).toBe('label');
    expect(s?.['text-wrap']).toBe('wrap');
  });

  it('selected card glows amber', () => {
    const s = TREE_STYLE.find((r) => r.selector === 'node:selected')?.style;
    expect(s?.['border-color']).toBe('#f59e0b');
    expect(s?.['shadow-color']).toBe('#f59e0b');
  });

  it('edges are smooth bezier', () => {
    const s = TREE_STYLE.find((r) => r.selector === 'edge')?.style;
    expect(s?.['curve-style']).toBe('bezier');
  });
});
