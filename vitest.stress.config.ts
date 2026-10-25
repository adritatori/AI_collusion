import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/stress/**/*.stress.ts'], testTimeout: 600_000 },
});
