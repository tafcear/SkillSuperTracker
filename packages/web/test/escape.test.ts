import { describe, expect, it } from 'vitest';
import type { StatReport, TreeNode } from '@skillsupertracker/core/pure';
import { renderDetail } from '../src/detail.js';
import { renderHeat } from '../src/heat-view.js';

const stat: StatReport = {
  agent: 'dsh',
  sessions: 1,
  range: { firstAt: 0, lastAt: 1 },
  skills: [{
    name: '<img src=x onerror=alert(1)>',
    calls: 1,
    sessions: 1,
    firstAt: 0,
    lastAt: 1,
    perDay: [{ day: '2026-08-23', calls: 1 }],
  }],
};

const node: TreeNode = {
  id: 'n1',
  kind: 'skill',
  label: '<script>alert(1)</script>',
  data: {},
};

describe('XSS escaping in the view layer', () => {
  it('escapes skill names in the heat view', () => {
    const container = document.createElement('div');
    renderHeat(container, stat);
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).toContain('&lt;img');
  });

  it('escapes node labels in the detail view', () => {
    const container = document.createElement('div');
    renderDetail(container, node);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('&lt;script');
  });
});