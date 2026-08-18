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
      // Every directory that has tests, not just components/
      include: [
        'app/javascript/components/**/*.{ts,tsx}',
        'app/javascript/contexts/**/*.{ts,tsx}',
        'app/javascript/hooks/**/*.{ts,tsx}',
        'app/javascript/lib/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './app/javascript'),
    },
  },
});
