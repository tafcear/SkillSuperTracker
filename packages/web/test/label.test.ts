import { describe, expect, it } from 'vitest';
import { shortLabel } from '../src/tree-view.js';

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