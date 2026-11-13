import { createHash } from 'node:crypto';
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
 *     Staging also takes --candidate=<vX.Y.Z-rc.N> --content=<identity>: it
 *     withdraws the candidate's evidence before the backup and publishes
 *     fresh evidence on its GitHub release only after the rollout verified.
 *
 *   release
 *     routes the published GitHub release in GITHUB_EVENT_PATH (#882):
 *     a vX.Y.Z-rc.N prerelease selects staging, a vX.Y.Z release production,
 *     only when the tag, prerelease flag, master membership and recorded
 *     package.json version agree. Writes environment, tag, version, revision
 *     and content (the application content identity) outputs.
 *
 *   promote --release=<vX.Y.Z> --content=<identity> --compose-file=<path>
 *     promotes the newest published vX.Y.Z-rc.N candidate to production
 *     (#883). Its staging evidence must be verified, name the candidate's
 *     current commit and record the stable release's content; otherwise
 *     nothing is backed up or deployed. The rollout then reuses the
 *     evidenced image digests and revision, never rebuilding. Production is
 *     reachable only this way: `rollout` refuses it.
 *
 *   rollback --environment=<env> --revision=<sha> --compose-file=<path>
 *     redeploys the image set a verified rollout of the revision recorded for
 *     the environment (#887), never rebuilding and never touching the
 *     database beyond the required backup. It refuses a revision never
 *     verified there, and one whose migration journal lacks a migration the
 *     environment's Dokploy history deployed unless that migration's SQL
 *     declares `-- rollback-compatible: <why>`. The rollout itself is the
 *     same backup, Dokploy and health verification as any deployment.
 *
 * Every verified rollout records its revision and image digests as a GitHub
 * deployment in `verified-<environment>`: the durable list rollback picks
 * from. A rollout refuses while a Dokploy deployment of the compose still
 * runs, so a timed-out job cannot overlap migrations with the next one.
 *
 * Nothing here seeds or provisions data. See docs/operations/deployments.md.
 */

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
type Environment = (typeof ENVIRONMENTS)[number];

const REVISION = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const RELEASE_TAG =
  /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(-rc\.[1-9]\d*)?)$/;
const CONTENT_IDENTITY = /^[0-9a-f]{64}$/;
const EVIDENCE_ASSET = 'staging-evidence.json';
const ROLLOUT_TASK = 'church:verified-rollout';
const MIGRATIONS = 'packages/db/src/migrations';
const ROLLBACK_COMPATIBLE = /^-- rollback-compatible: \S/m;
const DESCRIBED_REVISION = /revision ([0-9a-f]{40})/;
// GitHub compare statuses meaning the commit is reachable from master.
const ON_MASTER = new Set(['behind', 'identical']);
const RELEASES_PAGE = 100;
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
  method?: 'DELETE';
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

interface Candidate {
  tag: string;
  content: string;
}

interface RolloutCommand {
  command: 'rollout';
  environment: Environment;
  revision: string;
  serverImage: string;
  webImage: string;
  composeFile: string;
  candidate: Candidate | undefined;
  promotion?: Promotion;
  rollback?: boolean;
}

interface RollbackCommand {
  command: 'rollback';
  environment: Environment;
  revision: string;
  composeFile: string;
}

interface VerifiedRollout {
  schema: number;
  environment: string;
  revision: string;
  images: { server: string; web: string };
}

interface RolloutRecord {
  environment: Environment;
  revision: string;
  origin: string;
  serverImage: string;
  webImage: string;
  deploymentId: string;
}

interface Promotion {
  release: string;
  candidate: string;
}

interface ReleaseCommand {
  command: 'release';
}

interface PromoteCommand {
  command: 'promote';
  release: string;
  content: string;
  composeFile: string;
}

type Command =
  | ChecksCommand
  | RolloutCommand
  | ReleaseCommand
  | PromoteCommand
  | RollbackCommand;

interface Asset {
  id: number;
  name: string;
}

interface ListedRelease {
  // biome-ignore lint/style/useNamingConvention: GitHub's response field
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Asset[];
}

interface StagingEvidence {
  schema: number;
  environment: string;
  candidate: { tag: string };
  revision: string;
  content: string;
  images: { server: string; web: string };
  rollout: { status: string };
}

interface GitHubRelease {
  // biome-ignore lint/style/useNamingConvention: GitHub's response field
  upload_url: string;
  assets: Asset[];
}

interface UploadInput {
  release: GitHubRelease;
  evidence: unknown;
}

interface ReleaseEvent {
  action?: string;
  release?: {
    // biome-ignore lint/style/useNamingConvention: GitHub's payload field
    tag_name?: string;
    prerelease?: boolean;
    draft?: boolean;
  };
}

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
    method: request.method ?? (body === undefined ? 'GET' : 'POST'),
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
  return text ? JSON.parse(text) : null;
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

  async commit(ref: string): Promise<string> {
    const url = `${this.api}/repos/${this.repository}/commits/${encodeURIComponent(ref)}`;
    const { sha } = (await callApi({ url, headers: this.headers })) as {
      sha: string;
    };
    return sha;
  }

  async onMaster(revision: string): Promise<boolean> {
    const url = `${this.api}/repos/${this.repository}/compare/master...${revision}`;
    const { status } = (await callApi({ url, headers: this.headers })) as {
      status: string;
    };
    return ON_MASTER.has(status);
  }

  release(tag: string): Promise<GitHubRelease> {
    const url = `${this.api}/repos/${this.repository}/releases/tags/${encodeURIComponent(tag)}`;
    return callApi({ url, headers: this.headers }) as Promise<GitHubRelease>;
  }

  async releases(): Promise<ListedRelease[]> {
    const all: ListedRelease[] = [];
    for (let page = 1; ; page++) {
      const url = `${this.api}/repos/${this.repository}/releases?per_page=${RELEASES_PAGE}&page=${page}`;
      const batch = (await callApi({
        url,
        headers: this.headers,
      })) as ListedRelease[];
      all.push(...batch);
      if (batch.length < RELEASES_PAGE) return all;
    }
  }

  async downloadAsset(id: number): Promise<string> {
    const url = `${this.api}/repos/${this.repository}/releases/assets/${id}`;
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      let response = await fetch(url, {
        headers: { ...this.headers, accept: 'application/octet-stream' },
        redirect: 'manual',
        signal,
      });
      const location = response.headers.get('location');
      // The signed storage URL must not receive the GitHub token.
      if (location) response = await fetch(location, { signal });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return text;
    } catch (error) {
      throw new DeployFailure(
        `Release asset ${id} could not be downloaded: ${String(error)}`,
      );
    }
  }

  async deleteAsset(id: number): Promise<void> {
    const url = `${this.api}/repos/${this.repository}/releases/assets/${id}`;
    await callApi({ url, headers: this.headers, method: 'DELETE' });
  }

  async uploadAsset(input: UploadInput): Promise<void> {
    const { release, evidence } = input;
    // upload_url is an RFC 6570 template ending in {?name,label}.
    const base = release.upload_url.replace(/\{.*\}$/, '');
    const url = `${base}?name=${EVIDENCE_ASSET}`;
    await callApi({ url, headers: this.headers, body: evidence });
  }

  // Its own environment keeps the record clear of the job's protection rules.
  async recordRollout(record: RolloutRecord): Promise<void> {
    const { environment, revision, origin, serverImage, webImage } = record;
    const { GITHUB_SERVER_URL: host, GITHUB_RUN_ID: runId } = process.env;
    const { id } = (await callApi({
      url: `${this.api}/repos/${this.repository}/deployments`,
      headers: this.headers,
      body: {
        ref: revision,
        task: ROLLOUT_TASK,
        environment: `verified-${environment}`,
        description: `Verified ${environment} rollout`,
        // biome-ignore lint/style/useNamingConvention: GitHub's request field
        auto_merge: false,
        // biome-ignore lint/style/useNamingConvention: GitHub's request field
        required_contexts: [],
        payload: {
          schema: 1,
          environment,
          revision,
          images: { server: serverImage, web: webImage },
          url: origin,
          dokployDeploymentId: record.deploymentId,
          run:
            host && runId
              ? `${host}/${this.repository}/actions/runs/${runId}`
              : null,
        },
      },
    })) as { id: number };
    await callApi({
      url: `${this.api}/repos/${this.repository}/deployments/${id}/statuses`,
      headers: this.headers,
      // biome-ignore lint/style/useNamingConvention: GitHub's request fields
      body: { state: 'success', environment_url: origin, auto_inactive: false },
    });
  }

  async verifiedRollout(
    command: RollbackCommand,
  ): Promise<Partial<VerifiedRollout> | undefined> {
    const query = new URLSearchParams({
      environment: `verified-${command.environment}`,
      task: ROLLOUT_TASK,
      sha: command.revision,
      // biome-ignore lint/style/useNamingConvention: GitHub's query parameter
      per_page: '1',
    });
    const [newest] = (await callApi({
      url: `${this.api}/repos/${this.repository}/deployments?${query}`,
      headers: this.headers,
    })) as Array<{ payload: Partial<VerifiedRollout> | null }>;
    return newest && (newest.payload ?? {});
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

// ── release ───────────────────────────────────────────────────────────────

function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args]);
  if (result.exitCode !== 0) {
    throw new DeployFailure(
      `git ${args.join(' ')} failed: ${String(result.stderr).trim()}`,
    );
  }
  return String(result.stdout);
}

function recordedManifest(revision: string): Record<string, unknown> {
  return JSON.parse(git(['show', `${revision}:package.json`]));
}

/**
 * The revision's application content: every tracked file, with the root
 * package.json version left out so finalizing a candidate's version keeps
 * its identity while any other change produces a new one.
 */
function contentIdentity(revision: string): string {
  const files = git(['ls-tree', '-r', '--full-tree', revision])
    .split('\n')
    .filter((line) => line && !line.endsWith('\tpackage.json'));
  const { version: _version, ...manifest } = recordedManifest(revision);
  const sha256 = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  files.push(`manifest ${sha256(JSON.stringify(manifest))}`);
  return sha256(files.join('\n'));
}

async function routeRelease(): Promise<void> {
  const event = JSON.parse(
    readFileSync(requiredEnv('GITHUB_EVENT_PATH'), 'utf8'),
  ) as ReleaseEvent;
  if (
    process.env.GITHUB_EVENT_NAME !== 'release' ||
    event.action !== 'published'
  ) {
    throw new DeployFailure(
      `Event ${process.env.GITHUB_EVENT_NAME}/${event.action ?? 'none'} does not deploy; only a published release deploys.`,
    );
  }
  const { tag_name: tag = '', prerelease, draft } = event.release ?? {};
  if (draft !== false) {
    throw new DeployFailure(`Release ${tag} is a draft; drafts never deploy.`);
  }
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new DeployFailure(
      `Tag "${tag}" is not vX.Y.Z or vX.Y.Z-rc.N; not deploying.`,
    );
  }
  const [, version = '', rc] = match;
  const candidate = rc !== undefined;
  if (prerelease !== candidate) {
    throw new DeployFailure(
      `Tag ${tag} needs prerelease=${candidate}, but the release has prerelease=${prerelease}; not deploying.`,
    );
  }
  const github = new GitHub();
  const revision = await github.commit(tag);
  if (!(await github.onMaster(revision))) {
    throw new DeployFailure(
      `${tag} points at ${revision}, which does not belong to master; not deploying.`,
    );
  }
  const recorded = recordedManifest(revision).version;
  if (recorded !== version) {
    throw new DeployFailure(
      `${tag} points at ${revision}, whose package.json records version ${recorded ?? '(none)'}; not deploying.`,
    );
  }
  const environment = candidate ? 'staging' : 'production';
  const content = contentIdentity(revision);
  console.log(
    `✔ ${tag} (${revision}) selects ${environment}; content ${content}.`,
  );
  for (const [name, value] of Object.entries({
    environment,
    tag,
    version,
    revision,
    content,
  })) {
    writeOutput(`${name}=${value}`);
  }
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
    if (body.revision !== revision) {
      problems.push(`API serves revision ${body.revision ?? 'unknown'}`);
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
  const { environment, revision, serverImage, webImage, candidate, promotion } =
    command;
  const rows = [
    // The release's own commit only bumps the version; Revision is what runs.
    ...(promotion
      ? [
          ['Release', promotion.release],
          ['Promoted candidate', promotion.candidate],
        ]
      : []),
    ...(candidate
      ? [
          ['Candidate', candidate.tag],
          ['Content', candidate.content],
        ]
      : []),
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
      `### ${command.rollback ? 'Rolled back' : 'Deployed'} ${environment}`,
      '',
      '| | |',
      '| --- | --- |',
      ...table,
      '',
    ].join('\n');
    appendFileSync(summaryPath, summary);
  }
}

interface WithdrawInput {
  github: GitHub;
  tag: string;
}

// Evidence left by an earlier run must not outlive this rollout's outcome.
async function withdrawEvidence(input: WithdrawInput): Promise<GitHubRelease> {
  const release = await input.github.release(input.tag);
  for (const asset of release.assets) {
    if (asset.name === EVIDENCE_ASSET) await input.github.deleteAsset(asset.id);
  }
  return release;
}

interface EvidenceInput {
  command: RolloutCommand;
  candidate: Candidate;
  origin: string;
  deploymentId: string;
}

function evidence(input: EvidenceInput) {
  const { command, candidate, origin, deploymentId } = input;
  const {
    GITHUB_SERVER_URL: host,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: runId,
  } = process.env;
  return {
    schema: 1,
    environment: command.environment,
    candidate: { tag: candidate.tag, version: candidate.tag.slice(1) },
    revision: command.revision,
    content: candidate.content,
    images: { server: command.serverImage, web: command.webImage },
    rollout: {
      status: 'verified',
      url: origin,
      dokployDeploymentId: deploymentId,
      run: host && runId ? `${host}/${repository}/actions/runs/${runId}` : null,
    },
  };
}

interface PublishInput {
  github: GitHub;
  release: GitHubRelease;
  evidence: ReturnType<typeof evidence>;
}

async function publishEvidence(input: PublishInput): Promise<void> {
  const { github, release } = input;
  try {
    await github.uploadAsset({ release, evidence: input.evidence });
  } catch (error) {
    throw new DeployFailure(
      `Staging is verified, but its evidence was not published (${(error as Error).message}); re-run the deployment before promoting ${input.evidence.candidate.tag}.`,
    );
  }
  console.log(
    `✔ Published ${EVIDENCE_ASSET} on ${input.evidence.candidate.tag}.`,
  );
}

async function rollout(command: RolloutCommand): Promise<void> {
  const { environment, revision, serverImage, webImage } = command;
  const composeFile = readFileSync(command.composeFile, 'utf8');
  const github = new GitHub();
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

  const before = await deploymentIds(dokploy, composeId);
  const running = before.find(({ status }) => status === 'running');
  if (running) {
    throw new DeployFailure(
      `Dokploy deployment ${running.deploymentId} of ${environment} is still running; refusing to overlap its migrations. Wait for it to finish.`,
    );
  }
  const previous = new Set(before.map(({ deploymentId }) => deploymentId));

  const release = command.candidate
    ? await withdrawEvidence({ github, tag: command.candidate.tag })
    : undefined;

  await backUp(environment);

  const nextEnv = withImages({ env, serverImage, webImage });
  await dokploy.mutate('compose.update', {
    composeId,
    composeFile,
    env: nextEnv,
  });
  await dokploy.mutate('compose.deploy', {
    composeId,
    title: `Church ${command.rollback ? 'rollback ' : ''}${revision.slice(0, 12)}`,
    description: `${command.rollback ? 'rollback to ' : ''}revision ${revision}`,
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
  try {
    await github.recordRollout({
      environment,
      revision,
      origin,
      serverImage,
      webImage,
      deploymentId,
    });
  } catch (error) {
    throw new DeployFailure(
      `${environment} is verified, but its rollout record was not saved (${(error as Error).message}); re-run before relying on rolling back to ${revision}.`,
    );
  }
  if (release && command.candidate) {
    await publishEvidence({
      github,
      release,
      evidence: evidence({
        command,
        candidate: command.candidate,
        origin,
        deploymentId,
      }),
    });
  }
}

// ── promote ───────────────────────────────────────────────────────────────

interface ResolveInput {
  github: GitHub;
  command: PromoteCommand;
}

interface Resolved {
  tag: string;
  evidence: StagingEvidence;
}

// The newest published candidate of the version is the one staging tested last.
async function latestCandidate(input: ResolveInput): Promise<ListedRelease> {
  const { release } = input.command;
  const prefix = `${release}-rc.`;
  const candidates = (await input.github.releases())
    .filter(
      (r) =>
        !r.draft &&
        r.prerelease &&
        r.tag_name.startsWith(prefix) &&
        RELEASE_TAG.test(r.tag_name),
    )
    .sort(
      (a, b) =>
        Number(b.tag_name.slice(prefix.length)) -
        Number(a.tag_name.slice(prefix.length)),
    );
  const [latest] = candidates;
  if (!latest) {
    throw new DeployFailure(
      `No published ${prefix}N candidate exists; publish one and verify it on staging before ${release}. Not promoting.`,
    );
  }
  return latest;
}

async function resolveCandidate(input: ResolveInput): Promise<Resolved> {
  const { github, command } = input;
  const candidate = await latestCandidate(input);
  const tag = candidate.tag_name;
  const asset = candidate.assets.find(({ name }) => name === EVIDENCE_ASSET);
  if (!asset) {
    throw new DeployFailure(
      `${tag} has no ${EVIDENCE_ASSET}: it was never verified on staging. Not promoting.`,
    );
  }
  let text: string;
  try {
    text = await github.downloadAsset(asset.id);
  } catch (error) {
    throw new DeployFailure(
      `${tag}'s evidence: ${(error as Error).message}. Not promoting.`,
    );
  }
  let evidence: Partial<StagingEvidence>;
  try {
    evidence = JSON.parse(text) ?? {};
  } catch {
    throw new DeployFailure(
      `${tag}'s ${EVIDENCE_ASSET} is not JSON. Not promoting.`,
    );
  }
  if (
    evidence.schema !== 1 ||
    evidence.environment !== 'staging' ||
    evidence.candidate?.tag !== tag ||
    !REVISION.test(evidence.revision ?? '') ||
    !IMAGE_DIGEST.test(evidence.images?.server ?? '') ||
    !IMAGE_DIGEST.test(evidence.images?.web ?? '')
  ) {
    throw new DeployFailure(
      `${tag}'s ${EVIDENCE_ASSET} does not describe a staging rollout of ${tag} with immutable images. Not promoting.`,
    );
  }
  if (evidence.rollout?.status !== 'verified') {
    throw new DeployFailure(
      `${tag} was not verified on staging (rollout ${evidence.rollout?.status ?? 'unknown'}). Not promoting.`,
    );
  }
  if (evidence.content !== command.content) {
    throw new DeployFailure(
      `${command.release} has content ${command.content}, but staging verified ${tag} with ${evidence.content}: the application changed. Publish another candidate. Not promoting.`,
    );
  }
  const current = await github.commit(tag);
  if (current !== evidence.revision) {
    throw new DeployFailure(
      `${tag} now points at ${current}, but staging verified ${evidence.revision}. Not promoting.`,
    );
  }
  return { tag, evidence: evidence as StagingEvidence };
}

async function promote(command: PromoteCommand): Promise<void> {
  const { tag, evidence } = await resolveCandidate({
    github: new GitHub(),
    command,
  });
  console.log(
    `✔ ${command.release} promotes ${tag} (revision ${evidence.revision}), verified on staging with unchanged content.`,
  );
  await rollout({
    command: 'rollout',
    environment: 'production',
    revision: evidence.revision,
    serverImage: evidence.images.server,
    webImage: evidence.images.web,
    composeFile: command.composeFile,
    candidate: undefined,
    promotion: { release: command.release, candidate: tag },
  });
}

// ── rollback ──────────────────────────────────────────────────────────────

function migrations(revision: string): string[] {
  try {
    const journal = JSON.parse(
      git(['show', `${revision}:${MIGRATIONS}/meta/_journal.json`]),
    ) as { entries: Array<{ tag: string }> };
    return journal.entries.map(({ tag }) => tag);
  } catch (error) {
    throw new DeployFailure(
      `The migrations of ${revision} cannot be read (${(error as Error).message}). Not rolling back.`,
    );
  }
}

interface CompatibilityInput {
  target: string;
  // Every revision the environment's Dokploy history deployed.
  deployed: string[];
}

/**
 * The database can hold any migration a deployed revision knew. The target
 * must know none beyond them (its rollout would migrate forward) and lack
 * only migrations declared compatible with the application before them.
 */
function checkCompatibility(input: CompatibilityInput): void {
  const { target, deployed } = input;
  if (deployed.length === 0) {
    throw new DeployFailure(
      'Dokploy records no deployed revision, so the current schema is unknown. Not rolling back.',
    );
  }
  const known = new Set(migrations(target));
  const applied = new Map<string, string>();
  for (const revision of deployed) {
    for (const tag of migrations(revision)) {
      if (!applied.has(tag)) applied.set(tag, revision);
    }
  }
  const forward = [...known].filter((tag) => !applied.has(tag));
  if (forward.length > 0) {
    throw new DeployFailure(
      `${target} has migrations no deployed revision applied (${forward.join(', ')}); deploy it forward instead. Not rolling back.`,
    );
  }
  const incompatible = [...applied]
    .filter(
      ([tag, revision]) =>
        !known.has(tag) &&
        !ROLLBACK_COMPATIBLE.test(
          git(['show', `${revision}:${MIGRATIONS}/${tag}.sql`]),
        ),
    )
    .map(([tag]) => tag);
  if (incompatible.length > 0) {
    throw new DeployFailure(
      `The database may hold ${incompatible.join(', ')}, which ${target} predates and which do not declare "-- rollback-compatible:". Fix forward or restore the database (docs/operations/backups.md). Not rolling back.`,
    );
  }
}

async function rollback(command: RollbackCommand): Promise<void> {
  const { environment, revision } = command;
  const record = await new GitHub().verifiedRollout(command);
  if (!record) {
    throw new DeployFailure(
      `${revision} has no verified ${environment} rollout to return to. Not rolling back.`,
    );
  }
  const { server = '', web = '' } = record.images ?? {};
  if (
    record.schema !== 1 ||
    record.environment !== environment ||
    record.revision !== revision ||
    !IMAGE_DIGEST.test(server) ||
    !IMAGE_DIGEST.test(web)
  ) {
    throw new DeployFailure(
      `The ${environment} rollout record of ${revision} does not name its immutable images. Not rolling back.`,
    );
  }
  const dokploy = new Dokploy();
  const composeId = requiredEnv('DOKPLOY_COMPOSE_ID');
  const deployed = (await deploymentIds(dokploy, composeId)).flatMap(
    ({ description }) => DESCRIBED_REVISION.exec(description ?? '')?.[1] ?? [],
  );
  checkCompatibility({ target: revision, deployed: [...new Set(deployed)] });
  console.log(
    `✔ ${revision} was verified on ${environment} and fits its current schema; rolling back without rebuilding.`,
  );
  await rollout({
    command: 'rollout',
    environment,
    revision,
    serverImage: server,
    webImage: web,
    composeFile: command.composeFile,
    candidate: undefined,
    rollback: true,
  });
}

// ── entry ─────────────────────────────────────────────────────────────────

interface CandidateInput {
  environment: Environment;
  tag: string | undefined;
  content: string | undefined;
}

// Staging deploys only release candidates, and only staging records evidence.
function parseCandidate(input: CandidateInput): Candidate | undefined {
  const { environment, tag, content } = input;
  if (environment !== 'staging') {
    if (tag !== undefined || content !== undefined) {
      throw new UsageError('--candidate and --content are for staging only.');
    }
    return undefined;
  }
  if (!tag || !RELEASE_TAG.exec(tag)?.[2]) {
    throw new UsageError(
      `Staging deploys a release candidate: --candidate must be vX.Y.Z-rc.N, got "${tag ?? ''}".`,
    );
  }
  if (!content || !CONTENT_IDENTITY.test(content)) {
    throw new UsageError(
      `--content must be the candidate's 64-hex content identity, got "${content ?? ''}".`,
    );
  }
  return { tag, content };
}

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
      candidate: { type: 'string' },
      content: { type: 'string' },
      release: { type: 'string' },
    },
  });
  const [command] = positionals;
  const { revision = '', branch, check: checks = [], environment } = values;
  const serverImage = values['server-image'] ?? '';
  const webImage = values['web-image'] ?? '';
  const composeFile = values['compose-file'];
  if (command === 'release') return { command };
  if (command === 'promote') {
    const { release = '', content = '' } = values;
    const match = RELEASE_TAG.exec(release);
    if (!match || match[2]) {
      throw new UsageError(
        `--release must be a stable vX.Y.Z tag, got "${release}".`,
      );
    }
    if (!CONTENT_IDENTITY.test(content)) {
      throw new UsageError(
        `--content must be the release's 64-hex content identity, got "${content}".`,
      );
    }
    if (!composeFile) throw new UsageError('--compose-file is required.');
    return { command, release, content, composeFile };
  }
  if (!REVISION.test(revision)) {
    throw new UsageError(
      `--revision must be a full commit SHA, got "${revision}".`,
    );
  }
  if (command === 'rollback') {
    if (!ENVIRONMENTS.includes(environment as Environment)) {
      throw new UsageError(
        `--environment must be one of ${ENVIRONMENTS.join(', ')}.`,
      );
    }
    if (!composeFile) throw new UsageError('--compose-file is required.');
    return {
      command,
      environment: environment as Environment,
      revision,
      composeFile,
    };
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
    if (environment === 'production') {
      throw new UsageError(
        'Production deploys only by promoting a verified staging candidate (deploy.ts promote).',
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
      candidate: parseCandidate({
        environment: environment as Environment,
        tag: values.candidate,
        content: values.content,
      }),
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
      '       deploy.ts rollout --environment=<env> --revision=<sha> --server-image=<ref@sha256:…> --web-image=<ref@sha256:…> --compose-file=<path> [--candidate=<vX.Y.Z-rc.N> --content=<identity>]\n' +
      '       deploy.ts release\n' +
      '       deploy.ts promote --release=<vX.Y.Z> --content=<identity> --compose-file=<path>\n' +
      '       deploy.ts rollback --environment=<env> --revision=<sha> --compose-file=<path>',
  );
}

async function main(): Promise<void> {
  const command = parseCommand();
  if (command.command === 'checks') await awaitChecks(command);
  else if (command.command === 'release') await routeRelease();
  else if (command.command === 'promote') await promote(command);
  else if (command.command === 'rollback') await rollback(command);
  else await rollout(command);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? EXIT_USAGE : EXIT_FAILURE);
});
