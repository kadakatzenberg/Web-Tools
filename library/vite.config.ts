/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Above this and something has been pulled onto the critical path that
    // should have been split. The star map and the editor are both lazy.
    chunkSizeWarningLimit: 260,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react')) return 'react';
          if (id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/zod')) return 'zod';
          // d3-force is only ever reached through the star map worker.
          if (id.includes('node_modules/d3-')) return 'force';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
