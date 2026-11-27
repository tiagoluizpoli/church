import { type ChildProcess, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export interface ApiServerInput {
  root: string;
  port: number;
}

export interface ApiServer {
  stop: () => void;
}

interface ChildInput {
  child: ChildProcess;
}

interface PortInput {
  port: number;
}

const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

async function isApiUp(input: PortInput): Promise<boolean> {
  try {
    const url = `http://localhost:${input.port}/api/auth/get-session`;
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/** Its own process group, so `stop` takes the whole tree down. */
function stopTree(input: ChildInput): void {
  const { pid, exitCode } = input.child;
  if (pid === undefined || exitCode !== null) return;
  process.kill(-pid, 'SIGTERM');
}

/** A detached group does not get the terminal's Ctrl-C: stop it ourselves. */
function stopOnSignal(input: ChildInput): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stopTree(input);
      process.exit(1);
    });
  }
}

/** Uses the API already answering on the worktree's port, or starts one. */
export async function ensureApiServer(
  input: ApiServerInput,
): Promise<ApiServer> {
  const { root, port } = input;
  if (await isApiUp({ port })) return { stop: () => {} };

  const child = spawn('bun', ['run', 'dev:server'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
  });
  stopOnSignal({ child });
  const deadline = performance.now() + START_TIMEOUT_MS;

  while (performance.now() < deadline && child.exitCode === null) {
    if (await isApiUp({ port })) return { stop: () => stopTree({ child }) };
    await delay(POLL_INTERVAL_MS);
  }

  stopTree({ child });
  throw new Error(
    `The API did not answer on port ${port}. Run \`bun run dev:server\` to see why.`,
  );
}
