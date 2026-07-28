import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_AUTH_META, E2E_AUTH_META_SCHEMA } from './global-setup';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../server');

/** Removes the seeded E2E domain data (church cascade + pool users). */
export default function globalTeardown(): void {
  const args = ['run', 'seed:e2e', 'cleanup'];

  if (existsSync(E2E_AUTH_META)) {
    const rawMeta = readFileSync(E2E_AUTH_META, 'utf8');
    const meta = E2E_AUTH_META_SCHEMA.parse(JSON.parse(rawMeta));

    if (meta.leaderUserId) {
      args.push(`--leader-user-id=${meta.leaderUserId}`);
    }

    if (meta.teamLeaderUserId) {
      args.push(`--team-leader-user-id=${meta.teamLeaderUserId}`);
    }

    if (meta.volunteerUserId) {
      args.push(`--volunteer-user-id=${meta.volunteerUserId}`);
    }

    if (meta.churchBAdminUserId) {
      args.push(`--church-b-admin-user-id=${meta.churchBAdminUserId}`);
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
