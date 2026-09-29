import {
  assertE2eProcessEnvironment,
  type E2eProcessRole,
} from './e2e-environment';

const role = process.argv[2] as E2eProcessRole | undefined;

if (role !== 'server' && role !== 'web') {
  console.error('usage: e2e-process-preflight.ts <server|web>');
  process.exit(2);
}

try {
  assertE2eProcessEnvironment({ role });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
