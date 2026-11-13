import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * Deployment command run by the deployment workflows (#881).
 *
 *   checks --revision=<sha> --branch=<branch> --check=<name>...
 *     waits for the required checks on the revision. Writes `deploy=true`
 *     once they all succeed, `deploy=false` once the branch has moved past
 *     the revision (an obsolete revision is skipped), and fails on a failed
 *     check.
 *
 *   rollout --environment=<env> --revision=<sha> --server-image=<ref@sha256:…>
 *           --web-image=<ref@sha256:…> --compose-file=<path>
 *     refuses a mismatched Dokploy target, takes the required backup
 *     (backup.ts), selects the images, deploys through Dokploy, waits for
 *     Dokploy to finish (the compose's migrate service runs pending
 *     migrations once before the server starts) and succeeds only when the
 *     public frontend and API serve the revision with a reachable database.
 *
 * Nothing here seeds or provisions data. See docs/operations/deployments.md.
 */

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type Environment = (typeof ENVIRONMENTS)[number];

const REVISION = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const DEFAULT_POLL_INTERVAL_MS = 10_000;
// Poll budgets at the default interval: 30 minutes for checks and Dokploy,
// 3 minutes for the public endpoints to serve the new revision.
const CHECK_POLLS = 180;
const DOKPLOY_POLLS = 180;
const HEALTH_POLLS = 18;
const REQUEST_TIMEOUT_MS = 30_000;
const ERROR_DETAIL_LENGTH = 500;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

class DeployFailure extends Error {}

class UsageError extends Error {}

interface ApiRequest {
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

interface DokployCompose {
  sourceType: string;
  env: string | null;
}

interface DokployDeployment {
  deploymentId: string;
  description: string | null;
  status: 'running' | 'done' | 'error' | 'cancelled';
  errorMessage: string | null;
}

interface ChecksCommand {
  command: 'checks';
  revision: string;
  branch: string;
  checks: string[];
}

interface RolloutCommand {
  command: 'rollout';
  environment: Environment;
  revision: string;
  serverImage: string;
  webImage: string;
  composeFile: string;
}

type Command = ChecksCommand | RolloutCommand;

interface Images {
  serverImage: string;
  webImage: string;
}

interface WithImagesInput extends Images {
  env: string;
}

interface Health {
  healthy: boolean;
  observation: string;
}

interface HealthInput {
  origin: string;
  revision: string;
}

const pollIntervalMs = Number(
  process.env.CHURCH_DEPLOY_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS,
);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new DeployFailure(`Missing prerequisite: ${name} is not set.`);
  return value;
}

function detail(text: string): string {
  try {
    const { message } = JSON.parse(text) as { message?: unknown };
    if (typeof message === 'string') return message;
  } catch {}
  return text.slice(0, ERROR_DETAIL_LENGTH);
}

async function callApi(request: ApiRequest): Promise<unknown> {
  const { url, headers, body } = request;
  const init: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const { pathname } = new URL(url);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new DeployFailure(`${pathname} did not answer: ${String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new DeployFailure(
      `${pathname} failed (HTTP ${response.status}): ${detail(text)}`,
    );
  }
  return JSON.parse(text);
}

function writeOutput(line: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) appendFileSync(outputPath, `${line}\n`);
}

// ── checks ────────────────────────────────────────────────────────────────

class GitHub {
  private readonly api: string;
  private readonly repository: string;
  private readonly headers: Record<string, string>;

  constructor() {
    this.api = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(
      /\/+$/,
      '',
    );
    this.repository = requiredEnv('GITHUB_REPOSITORY');
    const token = requiredEnv('GITHUB_TOKEN');
    this.headers = {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
    };
  }

  async branchHead(branch: string): Promise<string> {
    const url = `${this.api}/repos/${this.repository}/branches/${encodeURIComponent(branch)}`;
    const { commit } = (await callApi({ url, headers: this.headers })) as {
      commit: { sha: string };
    };
    return commit.sha;
  }

  async checkRuns(revision: string): Promise<CheckRun[]> {
    const url = `${this.api}/repos/${this.repository}/commits/${revision}/check-runs?per_page=100`;
    const { check_runs: runs } = (await callApi({
      url,
      headers: this.headers,
      // biome-ignore lint/style/useNamingConvention: GitHub's response field
    })) as { check_runs: CheckRun[] };
    return runs;
  }
}

// A re-run adds a newer check run with the same name; the newest one counts.
function latestRun(runs: CheckRun[], name: string): CheckRun | undefined {
  const named = runs.filter((run) => run.name === name);
  return named.sort((a, b) => b.id - a.id)[0];
}

async function awaitChecks(command: ChecksCommand): Promise<void> {
  const { revision, branch, checks } = command;
  const github = new GitHub();
  for (let poll = 0; poll < CHECK_POLLS; poll++) {
    const head = await github.branchHead(branch);
    if (head !== revision) {
      console.log(
        `↷ ${branch} moved to ${head}; skipping obsolete revision ${revision}.`,
      );
      writeOutput('deploy=false');
      return;
    }
    const runs = await github.checkRuns(revision);
    const pending: string[] = [];
    for (const name of checks) {
      const run = latestRun(runs, name);
      if (!run || run.status !== 'completed') {
        pending.push(name);
        continue;
      }
      if (run.conclusion !== 'success') {
        throw new DeployFailure(
          `Required check "${name}" concluded ${run.conclusion} for ${revision}; not deploying.`,
        );
      }
    }
    if (pending.length === 0) {
      console.log(
        `✔ Required checks passed for ${revision}: ${checks.join(', ')}.`,
      );
      writeOutput('deploy=true');
      return;
    }
    console.log(`… waiting for ${pending.join(', ')} on ${revision}`);
    await sleep(pollIntervalMs);
  }
  throw new DeployFailure(
    `Required checks did not complete for ${revision}; not deploying.`,
  );
}

// ── rollout ───────────────────────────────────────────────────────────────

class Dokploy {
  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor() {
    this.url = requiredEnv('DOKPLOY_URL').replace(/\/+$/, '');
    this.headers = { 'x-api-key': requiredEnv('DOKPLOY_API_KEY') };
  }

  query(path: string): Promise<unknown> {
    return callApi({ url: `${this.url}/api/${path}`, headers: this.headers });
  }

  mutate(path: string, body: unknown): Promise<unknown> {
    return callApi({
      url: `${this.url}/api/${path}`,
      headers: this.headers,
      body,
    });
  }
}

function envValue(env: string, name: string): string | undefined {
  const line = env
    .split('\n')
    .find((entry) => entry.trim().startsWith(`${name}=`));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

function withImages(input: WithImagesInput): string {
  const kept = input.env
    .split('\n')
    .filter((line) => !/^\s*(SERVER_IMAGE|WEB_IMAGE)=/.test(line))
    .join('\n')
    .trimEnd();
  return `${kept}\nSERVER_IMAGE=${input.serverImage}\nWEB_IMAGE=${input.webImage}\n`;
}

async function backUp(environment: Environment): Promise<void> {
  const backupScript = join(import.meta.dir, 'backup.ts');
  const child = Bun.spawn(
    [
      process.execPath,
      backupScript,
      'create',
      `--environment=${environment}`,
      `--database=church_${environment}`,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new DeployFailure(
      `Required backup of church_${environment} failed; nothing was deployed.`,
    );
  }
}

async function deploymentIds(
  dokploy: Dokploy,
  composeId: string,
): Promise<DokployDeployment[]> {
  return (await dokploy.query(
    `deployment.allByCompose?composeId=${encodeURIComponent(composeId)}`,
  )) as DokployDeployment[];
}

interface AwaitDokployInput {
  dokploy: Dokploy;
  composeId: string;
  revision: string;
  previous: Set<string>;
}

async function awaitDokploy(input: AwaitDokployInput): Promise<string> {
  const { dokploy, composeId, revision, previous } = input;
  for (let poll = 0; poll < DOKPLOY_POLLS; poll++) {
    const deployments = await deploymentIds(dokploy, composeId);
    const ours = deployments.find(
      ({ deploymentId, description }) =>
        !previous.has(deploymentId) && description?.includes(revision),
    );
    if (ours?.status === 'done') return ours.deploymentId;
    if (ours?.status === 'error' || ours?.status === 'cancelled') {
      const reason = (ours.errorMessage ?? 'no error message').slice(
        0,
        ERROR_DETAIL_LENGTH,
      );
      throw new DeployFailure(
        `Dokploy deployment ${ours.deploymentId} ended ${ours.status}: ${reason}. ` +
          'A failed migration or backup leaves the previous application running; see its Dokploy log.',
      );
    }
    await sleep(pollIntervalMs);
  }
  throw new DeployFailure(
    `Dokploy accepted the deployment of ${revision} but did not report it finished.`,
  );
}

async function observe(input: HealthInput): Promise<Health> {
  const { origin, revision } = input;
  const problems: string[] = [];
  try {
    const response = await fetch(`${origin}/revision.txt`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const served = (await response.text()).trim();
    if (!response.ok)
      problems.push(`frontend answered HTTP ${response.status}`);
    else if (served !== revision)
      problems.push(`frontend serves revision ${served}`);
  } catch (error) {
    problems.push(`frontend unreachable (${String(error)})`);
  }
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: { database?: string; revision?: string } = {};
    try {
      body = JSON.parse(text);
    } catch {}
    if (body.revision && body.revision !== revision) {
      problems.push(`API serves revision ${body.revision}`);
    }
    if (body.database !== 'ok') {
      problems.push(
        `API answered HTTP ${response.status} with database ${body.database ?? 'unknown'}`,
      );
    }
  } catch (error) {
    problems.push(`API unreachable (${String(error)})`);
  }
  return {
    healthy: problems.length === 0,
    observation: problems.join('; '),
  };
}

async function awaitHealth(input: HealthInput): Promise<void> {
  let last = '';
  for (let poll = 0; poll < HEALTH_POLLS; poll++) {
    const { healthy, observation } = await observe(input);
    if (healthy) return;
    last = observation;
    await sleep(pollIntervalMs);
  }
  throw new DeployFailure(
    `${input.origin} did not become healthy on ${input.revision}: ${last}.`,
  );
}

function report(command: RolloutCommand, origin: string): void {
  const { environment, revision, serverImage, webImage } = command;
  const rows = [
    ['Environment', environment],
    ['URL', origin],
    ['Revision', revision],
    ['Server image', serverImage],
    ['Web image', webImage],
  ];
  for (const [label, value] of rows) console.log(`  ${label}: ${value}`);
  writeOutput(`url=${origin}`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const table = rows.map(([label, value]) => `| ${label} | \`${value}\` |`);
    const summary = [
      `### Deployed ${environment}`,
      '',
      '| | |',
      '| --- | --- |',
      ...table,
      '',
    ].join('\n');
    appendFileSync(summaryPath, summary);
  }
}

async function rollout(command: RolloutCommand): Promise<void> {
  const { environment, revision, serverImage, webImage } = command;
  const composeFile = readFileSync(command.composeFile, 'utf8');
  const dokploy = new Dokploy();
  const composeId = requiredEnv('DOKPLOY_COMPOSE_ID');
  const origin = requiredEnv('PUBLIC_ORIGIN').replace(/\/+$/, '');

  const compose = (await dokploy.query(
    `compose.one?composeId=${encodeURIComponent(composeId)}`,
  )) as DokployCompose;
  if (compose.sourceType !== 'raw') {
    throw new DeployFailure(
      `Dokploy compose ${composeId} has source "${compose.sourceType}"; it must be "raw" so the deployment selects the revision's compose file.`,
    );
  }
  const env = compose.env ?? '';
  const targetEnvironment = envValue(env, 'CHURCH_ENVIRONMENT');
  if (targetEnvironment !== environment) {
    throw new DeployFailure(
      `Dokploy compose ${composeId} is configured for CHURCH_ENVIRONMENT=${targetEnvironment ?? '(unset)'}, not ${environment}; refusing.`,
    );
  }

  await backUp(environment);

  const nextEnv = withImages({ env, serverImage, webImage });
  await dokploy.mutate('compose.update', {
    composeId,
    composeFile,
    env: nextEnv,
  });
  const before = await deploymentIds(dokploy, composeId);
  const previous = new Set(before.map(({ deploymentId }) => deploymentId));
  await dokploy.mutate('compose.deploy', {
    composeId,
    title: `Church ${revision.slice(0, 12)}`,
    description: `revision ${revision}`,
  });
  console.log(`Dokploy accepted ${revision}; waiting for it to finish…`);
  const deploymentId = await awaitDokploy({
    dokploy,
    composeId,
    revision,
    previous,
  });
  console.log(`✔ Dokploy deployment ${deploymentId} finished.`);
  await awaitHealth({ origin, revision });
  console.log(`✔ ${environment} serves ${revision} with a reachable database.`);
  report(command, origin);
}

// ── entry ─────────────────────────────────────────────────────────────────

function parseCommand(): Command {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      revision: { type: 'string' },
      branch: { type: 'string' },
      check: { type: 'string', multiple: true },
      environment: { type: 'string' },
      'server-image': { type: 'string' },
      'web-image': { type: 'string' },
      'compose-file': { type: 'string' },
    },
  });
  const [command] = positionals;
  const { revision = '', branch, check: checks = [], environment } = values;
  const serverImage = values['server-image'] ?? '';
  const webImage = values['web-image'] ?? '';
  const composeFile = values['compose-file'];
  if (!REVISION.test(revision)) {
    throw new UsageError(
      `--revision must be a full commit SHA, got "${revision}".`,
    );
  }
  if (command === 'checks' && branch && checks.length > 0) {
    return { command, revision, branch, checks };
  }
  if (command === 'rollout') {
    if (!ENVIRONMENTS.includes(environment as Environment)) {
      throw new UsageError(
        `--environment must be one of ${ENVIRONMENTS.join(', ')}.`,
      );
    }
    for (const image of [serverImage, webImage]) {
      if (!IMAGE_DIGEST.test(image)) {
        throw new UsageError(
          `Images must be immutable digests (<image>@sha256:<64 hex>), got "${image}".`,
        );
      }
    }
    if (!composeFile) throw new UsageError('--compose-file is required.');
    return {
      command,
      environment: environment as Environment,
      revision,
      serverImage,
      webImage,
      composeFile,
    };
  }
  throw new UsageError(
    'Usage: deploy.ts checks --revision=<sha> --branch=<branch> --check=<name>...\n' +
      '       deploy.ts rollout --environment=<env> --revision=<sha> --server-image=<ref@sha256:…> --web-image=<ref@sha256:…> --compose-file=<path>',
  );
}

async function main(): Promise<void> {
  const command = parseCommand();
  if (command.command === 'checks') await awaitChecks(command);
  else await rollout(command);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? EXIT_USAGE : EXIT_FAILURE);
});
