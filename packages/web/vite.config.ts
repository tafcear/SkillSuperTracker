/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      '@skillsupertracker/core/pure': fileURLToPath(new URL('../core/src/pure.ts', import.meta.url)),
      '@skillsupertracker/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});