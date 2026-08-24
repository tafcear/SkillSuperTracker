import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
  resolve: {
    alias: {
      '@skillsupertracker/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@skillsupertracker/adapters': fileURLToPath(new URL('../adapters/src/index.ts', import.meta.url)),
    },
  },
});