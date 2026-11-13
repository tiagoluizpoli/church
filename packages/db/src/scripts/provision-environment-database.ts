import { z } from 'zod';
import { provisionEnvironmentDatabase } from '../environment-database';

// Operator command run once per environment on its host's PostgreSQL instance
// (see deployment/README.md). Credentials arrive through the process
// environment, never arguments, and nothing secret is printed.
const input = z
  .object({
    environment: z.enum(['development', 'staging', 'production']),
    POSTGRES_ADMIN_URL: z.string().min(1),
    ENVIRONMENT_DATABASE_PASSWORD: z.string().min(1),
  })
  .parse({ ...process.env, environment: process.argv[2] });

const name = `church_${input.environment}`;
await provisionEnvironmentDatabase({
  adminUrl: input.POSTGRES_ADMIN_URL,
  name,
  password: input.ENVIRONMENT_DATABASE_PASSWORD,
});
console.log(
  `Role and database ${name} are ready; only role ${name} can connect to it.`,
);
