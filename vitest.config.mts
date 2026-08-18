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
    // Isolation stays ON. It was disabled in 998242e for speed, on the premise
    // that "tests are already independent" -- they are not. Files that share a
    // worker also share the module registry, so a vi.mock in one file leaks into
    // another. Which files share a worker depends on the machine's core count,
    // so the suite passed on a 32-core dev box and failed in CI (run
    // 32183347632, PreferencesPanel). Locally, --maxWorkers=1 broke I18nContext,
    // PreferencesContext and SuggestedTags as well. See ttrb-99cu.
    isolate: true,
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
