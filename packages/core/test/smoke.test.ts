import { describe, expect, it } from 'vitest';
import { coreVersion } from '../src/index.js';

describe('core smoke', () => {
  it('exports a version constant', () => {
    expect(coreVersion).toBe('0.1.0');
  });
});