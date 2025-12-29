import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['app/javascript/**/*.test.{ts,tsx}'],
    // Pool configuration for better parallelization (Vitest 4.x)
    pool: 'threads',
    // Disable test isolation for faster execution (tests are already independent)
    isolate: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/javascript/components/**/*.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app/javascript'),
    },
  },
});
