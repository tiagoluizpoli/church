import { defineConfig } from 'vitest/config';

// `test:unit` pins TZ to a non-UTC zone (Pacific/Auckland: far from UTC, with
// DST) so a seam that leans on the process clock fails here, not in production.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
