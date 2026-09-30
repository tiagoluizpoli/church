import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // From Varlock (the package scripts' development purpose) or the job
    // environment, never from a value file loaded here (ADR-0005).
    url: process.env.DATABASE_URL || '',
  },
});
