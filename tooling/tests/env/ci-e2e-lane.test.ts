import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import {
  LOOPBACK_HOSTS,
  ROOT,
  type WorkflowJob,
  workflow,
} from './ci-workflow';

/**
 * #253 / #263 / ADR-0005: every CI job injects its configuration explicitly
 * through the job environment, generates no environment value files, shares
 * one loopback URL set, and never depends on home-network DNS or Worktrunk
 * hooks. The E2E lane targets the PostgreSQL port the job provisions.
 */

interface ActionStep {
  name?: string;
  if?: string;
  run?: string;
}

interface CompositeActionRuns {
  steps: ActionStep[];
}

interface CompositeAction {
  inputs?: Record<string, unknown>;
  runs: CompositeActionRuns;
}

const setupAction = Bun.YAML.parse(
  readFileSync(
    resolve(ROOT, '.github/actions/setup-church-ci/action.yml'),
    'utf8',
  ),
) as CompositeAction;

// release-gate runs the full E2E suite in its own step.
const E2E_JOBS = ['develop-browser', 'e2e', 'release-gate'];
// The E2E run's own loopback set (tooling/env/e2e-environment.ts).
const CI_URL_SET: Record<string, string> = {
  BETTER_AUTH_URL: 'http://localhost:4100',
  CORS_ORIGIN: 'http://localhost:4101',
  VITE_SERVER_URL: 'http://localhost:4100',
};
const SETUP_ACTION = './.github/actions/setup-church-ci';
const VALUE_FILE_WRITE = /(>>?|tee)\s*\S*\.env\b/;

interface JobInput {
  job: WorkflowJob;
}

/** The `docker run` of a job that starts Postgres only when needed. */
function dockerRunPostgres({ job }: JobInput): string | undefined {
  return job.steps
    .map((step) => step.run ?? '')
    .find((run) => run.includes('docker run') && run.includes('postgres'));
}

/** The host port the job binds its PostgreSQL to: the `services` mapping, or
 * the `docker run -p` of a job that starts Postgres only when needed. */
function provisionedPostgresPort({ job }: JobInput): string | undefined {
  const servicePort = job.services?.postgres?.ports?.[0];
  if (servicePort) return servicePort.split(':')[0];

  return dockerRunPostgres({ job })?.match(/-p\s+(\d+):5432/)?.[1];
}

function provisionedPostgresDatabase({ job }: JobInput): string | undefined {
  const serviceDb = job.services?.postgres?.env?.POSTGRES_DB;
  if (serviceDb) return serviceDb;

  return dockerRunPostgres({ job })?.match(/POSTGRES_DB=(\S+)/)?.[1];
}

describe('CI E2E lane', () => {
  for (const name of E2E_JOBS) {
    const job = workflow.jobs[name];

    describe(name, () => {
      it('exists', () => {
        expect(job).toBeDefined();
      });

      it('injects the E2E database URL at the port it provisions', () => {
        const url = new URL(job?.env?.DATABASE_URL ?? '');
        const port = provisionedPostgresPort({ job: job as WorkflowJob });

        expect(LOOPBACK_HOSTS.has(url.hostname)).toBe(true);
        expect(port).toBeDefined();
        expect(url.port).toBe(port as string);
        expect(url.pathname).toBe(
          `/${provisionedPostgresDatabase({ job: job as WorkflowJob })}`,
        );
        expect(url.pathname).toMatch(/^\/church_[a-z0-9-]+_e2e$/);
      });

      it('uses only loopback URLs, never home-network DNS', () => {
        const urls = Object.values(job?.env ?? {}).filter((value) =>
          /^[a-z]+:\/\//.test(value),
        );

        expect(urls.length).toBeGreaterThan(0);
        for (const value of urls) {
          expect(LOOPBACK_HOSTS.has(new URL(value).hostname)).toBe(true);
        }
      });
    });
  }
});

describe('CI jobs', () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    describe(name, () => {
      it('declares only the shared loopback URL set', () => {
        for (const [key, value] of Object.entries(CI_URL_SET)) {
          if (job.env?.[key] !== undefined) expect(job.env[key]).toBe(value);
        }
      });

      it('writes no value file and runs no Worktrunk hook in its own steps', () => {
        for (const step of job.steps) {
          expect(step.run ?? '').not.toMatch(VALUE_FILE_WRITE);
          expect(step.run ?? '').not.toMatch(/\bwt\s/);
        }
      });

      it('passes the setup action no value-file option', () => {
        const setup = job.steps.find((step) => step.uses === SETUP_ACTION);

        expect(setup?.with?.['write-env-files']).toBeUndefined();
      });
    });
  }

  it('the setup action writes no value file', () => {
    expect(setupAction.inputs?.['write-env-files']).toBeUndefined();
    for (const step of setupAction.runs.steps) {
      expect(step.run ?? '').not.toMatch(VALUE_FILE_WRITE);
    }
  });
});
