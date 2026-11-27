import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { expectedDatabaseName } from '../../packages/db/src/database-target-resolver';
import { LOCAL_DATABASE_SERVER_URL } from './database-targets';
import { readGeneratedWorktreeIdentity } from './local-env';

/**
 * `bun run db:sql [-- <psql arguments>]`: psql on the current worktree's
 * development database, inside the shared `db` Compose service, so the host
 * needs Docker and no `psql`. A shell that has not picked up its account's
 * `docker` group yet goes through `sg docker`.
 */

const SHARED_COMPOSE = join(import.meta.dir, 'shared-compose.sh');
const DOCKER_GROUP = 'docker';
const ARGUMENT_SEPARATOR = '--';

interface FailInput {
  message: string;
}

function fail({ message }: FailInput): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

interface GroupsInput {
  /** Omitted: the groups of this shell, not of the account. */
  user?: string;
}

function isInDockerGroup({ user }: GroupsInput): boolean {
  const { stdout } = spawnSync('id', user ? ['-nG', user] : ['-nG'], {
    encoding: 'utf8',
  });
  return (stdout ?? '').trim().split(/\s+/).includes(DOCKER_GROUP);
}

interface ShellQuoteInput {
  argument: string;
}

function shellQuote({ argument }: ShellQuoteInput): string {
  return `'${argument.replaceAll("'", `'\\''`)}'`;
}

interface CommandInput {
  command: string[];
}

/** `command`, wrapped in `sg docker` when only a new login would see it. */
function throughDockerGroup({ command }: CommandInput): string[] {
  const { username } = userInfo();
  const needsSg = !isInDockerGroup({}) && isInDockerGroup({ user: username });
  if (!needsSg) return command;

  const line = command.map((argument) => shellQuote({ argument })).join(' ');
  return ['sg', DOCKER_GROUP, '-c', line];
}

function main(): void {
  const argv = process.argv.slice(2);
  const psqlArguments = argv[0] === ARGUMENT_SEPARATOR ? argv.slice(1) : argv;

  const worktree = readGeneratedWorktreeIdentity({ cwd: process.cwd() });
  if (!worktree) {
    fail({
      message:
        'db:sql: this worktree has no generated .env.local identity. Run `bun run env:local` first.',
    });
  }
  if (!Bun.which('docker')) {
    fail({
      message:
        'db:sql needs Docker: there is no `docker` command on this machine.',
    });
  }

  const database = expectedDatabaseName({ purpose: 'development', worktree });
  const { username } = new URL(LOCAL_DATABASE_SERVER_URL);
  // Compose allocates a TTY unless told not to, which breaks piped input.
  const ttyFlags = process.stdin.isTTY ? [] : ['-T'];
  const [program = '', ...programArguments] = throughDockerGroup({
    command: [
      'sh',
      SHARED_COMPOSE,
      'exec',
      ...ttyFlags,
      'db',
      'psql',
      '-U',
      username,
      '-d',
      database,
      ...psqlArguments,
    ],
  });

  const { status } = spawnSync(program, programArguments, {
    stdio: 'inherit',
  });
  process.exit(status ?? 1);
}

main();
