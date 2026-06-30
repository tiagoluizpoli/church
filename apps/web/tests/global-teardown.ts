import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_AUTH_META } from './global-setup';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../server');

/** Removes the seeded E2E domain data (church cascade + pool users). */
export default function globalTeardown(): void {
  const args = ['run', 'seed:e2e', 'cleanup'];

  if (existsSync(E2E_AUTH_META)) {
    const rawMeta = readFileSync(E2E_AUTH_META, 'utf8');
    const meta = JSON.parse(rawMeta) as {
      leaderUserId?: string;
      subLeaderUserId?: string;
    };

    if (meta.leaderUserId) {
      args.push(`--leader-user-id=${meta.leaderUserId}`);
    }

    if (meta.subLeaderUserId) {
      args.push(`--sub-leader-user-id=${meta.subLeaderUserId}`);
    }
  }

  execFileSync('bun', args, {
    cwd: SERVER_DIR,
    stdio: 'inherit',
  });

  if (existsSync(E2E_AUTH_META)) {
    rmSync(E2E_AUTH_META, { force: true });
  }
}
