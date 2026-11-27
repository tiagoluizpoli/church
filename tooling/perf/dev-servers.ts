import { type ChildProcess, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export interface DevServerInput {
  root: string;
  port: number;
}

export interface DevServer {
  stop: () => void;
}

interface DevScriptInput extends DevServerInput {
  /** The root script that starts the server. */
  script: 'dev:server' | 'dev:web';
  /** How the failure names the server. */
  name: string;
  /** Answers 2xx once the server is up. */
  path: string;
}

interface ChildInput {
  child: ChildProcess;
}

interface UrlInput {
  url: string;
}

const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

async function isUp(input: UrlInput): Promise<boolean> {
  try {
    const response = await fetch(input.url);
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

/** Uses the server already answering on the worktree's port, or starts one. */
async function ensureDevScript(input: DevScriptInput): Promise<DevServer> {
  const { root, port, script, path, name } = input;
  const url = `http://localhost:${port}${path}`;
  if (await isUp({ url })) return { stop: () => {} };

  const child = spawn('bun', ['run', script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
  });
  stopOnSignal({ child });
  const deadline = performance.now() + START_TIMEOUT_MS;

  while (performance.now() < deadline && child.exitCode === null) {
    if (await isUp({ url })) return { stop: () => stopTree({ child }) };
    await delay(POLL_INTERVAL_MS);
  }

  stopTree({ child });
  throw new Error(
    `${name} did not answer on port ${port}. Run \`bun run ${script}\` to see why.`,
  );
}

export function ensureApiServer(input: DevServerInput): Promise<DevServer> {
  const path = '/api/auth/get-session';
  const name = 'The API';
  return ensureDevScript({ ...input, script: 'dev:server', path, name });
}

/** `vite dev`, after the translation compile `turbo dev` runs first. */
export function ensureWebDevServer(input: DevServerInput): Promise<DevServer> {
  const name = 'vite dev';
  const path = '/login';
  return ensureDevScript({ ...input, script: 'dev:web', path, name });
}
