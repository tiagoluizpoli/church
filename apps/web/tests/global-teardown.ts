import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../server');

/** Removes the seeded E2E domain data (church cascade + pool users). */
export default function globalTeardown(): void {
  execFileSync('bun', ['run', 'seed:e2e', 'cleanup'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
  });
}
