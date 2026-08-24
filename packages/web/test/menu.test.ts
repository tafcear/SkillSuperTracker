import { describe, expect, it } from 'vitest';
import { menuStateFor } from '../src/menu.js';

describe('menuStateFor (L0/L1 layering)', () => {
  it('enables detail for every node kind', () => {
    for (const kind of ['session', 'turn', 'skill', 'tool', 'artifact'] as const) {
      const items = menuStateFor(kind, 'L0');
      const detail = items.find((i) => i.id === 'detail');
      expect(detail?.enabled).toBe(true);
    }
  });

  it('shows disabled L1 write actions only on skill nodes in the MVP layer', () => {
    const skillItems = menuStateFor('skill', 'L0');
    expect(skillItems.map((i) => i.id)).toEqual(['detail', 'select-opt', 'replace', 'delete', 'freeze']);
    for (const item of skillItems.filter((i) => i.layer === 'L1')) {
      expect(item.enabled).toBe(false);
      expect(item.reason).toMatch(/P1/);
    }
    expect(menuStateFor('tool', 'L0').map((i) => i.id)).toEqual(['detail']);
  });

  it('is deterministic and pure', () => {
    const a = menuStateFor('skill', 'L0');
    const b = menuStateFor('skill', 'L0');
    expect(a).not.toBe(b); // fresh arrays
    expect(a).toEqual(b);
  });
});