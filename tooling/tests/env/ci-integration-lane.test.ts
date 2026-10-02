import { describe, expect, it } from 'bun:test';
import {
  E2E_STEPS,
  INTEGRATION_LANE,
  LINT_TYPECHECK_UNIT_LANE,
} from '../../validation/validate';
import {
  LOOPBACK_HOSTS,
  type WorkflowJob,
  type WorkflowStep,
  workflow,
} from './ci-workflow';

/**
 * #264 / ADR-0005: integration runs resolve through the typed integration
 * target, which accepts only `church_<worktree>_int`. CI declares no
 * CHURCH_WORKTREE, so its integration database is the reserved
 * `church_unspecified_int`, and a job that also runs E2E gives each purpose
 * its own database instead of one job-wide URL.
 */

const INTEGRATION_DATABASE = 'church_unspecified_int';

/** How each integration job gets its database created and migrated: the
 * Postgres service's own database (migrated by setup-church-ci), or a
 * `db:setup-test` step beside the job's E2E database. */
const INTEGRATION_PROVISIONING: Record<string, 'service' | 'setup-step'> = {
  'develop-fast': 'service',
  'fast-gate': 'service',
  'release-gate': 'setup-step',
};

const RUNS_INTEGRATION = new RegExp(
  [
    // A root or turbo integration task.
    String.raw`\btest:integration\b`,
    // Affected validation, unless it is limited to browser journeys.
    'validate:affected(?!.*--only-e2e)',
    // A root script that chains integration and E2E.
    String.raw`bun run (validate|test)\s*$`,
  ].join('|'),
  'm',
);
const RUNS_E2E = new RegExp(
  [
    // A root or turbo E2E task.
    String.raw`\btest:e2e\b`,
    // A root script that chains integration and E2E.
    String.raw`bun run (validate|test)\s*$`,
  ].join('|'),
  'm',
);
// A step running exactly one root script, e.g. `bun run test:unit`.
const BARE_SCRIPT_RUN = /^bun run ([\w:-]+)$/;

interface JobStepInput {
  job: WorkflowJob;
  step: WorkflowStep;
}

function effectiveDatabaseUrl({ job, step }: JobStepInput): URL {
  return new URL(step.env?.DATABASE_URL ?? job.env?.DATABASE_URL ?? '');
}

/** The root scripts `bun run validate` runs (tooling/validation/validate.ts),
 * in its lane order. */
const VALIDATE_SCRIPTS = [
  ...LINT_TYPECHECK_UNIT_LANE,
  ...INTEGRATION_LANE,
  ...E2E_STEPS,
].map((step) => step.args[1]);

describe('CI integration lane', () => {
  for (const [name, provisioning] of Object.entries(INTEGRATION_PROVISIONING)) {
    const job = workflow.jobs[name] as WorkflowJob;
    const integrationSteps = (job?.steps ?? []).filter((step) =>
      RUNS_INTEGRATION.test(step.run ?? ''),
    );

    describe(name, () => {
      it('runs integration tests', () => {
        expect(integrationSteps.length).toBeGreaterThan(0);
      });

      it('runs integration and E2E tests in separate steps', () => {
        for (const step of integrationSteps) {
          expect(RUNS_E2E.test(step.run ?? '')).toBe(false);
        }
      });

      it(`targets ${INTEGRATION_DATABASE} on the PostgreSQL it provisions`, () => {
        const servicePort = job.services?.postgres?.ports?.[0]?.split(':')[0];

        for (const step of integrationSteps) {
          const url = effectiveDatabaseUrl({ job, step });

          expect(LOOPBACK_HOSTS.has(url.hostname)).toBe(true);
          expect(url.port).toBe(servicePort as string);
          expect(url.pathname).toBe(`/${INTEGRATION_DATABASE}`);
        }
      });

      if (provisioning === 'service') {
        it('provisions the integration database as its Postgres service database', () => {
          expect(job.services?.postgres?.env?.POSTGRES_DB).toBe(
            INTEGRATION_DATABASE,
          );
        });
      } else {
        it('creates and migrates the integration database before using it', () => {
          const firstIntegration = job.steps.indexOf(
            integrationSteps[0] as WorkflowStep,
          );
          const setup = job.steps
            .slice(0, firstIntegration)
            .find((step) => /\bdb:setup-test\b/.test(step.run ?? ''));

          expect(setup).toBeDefined();
          expect(
            effectiveDatabaseUrl({ job, step: setup as WorkflowStep }).pathname,
          ).toBe(`/${INTEGRATION_DATABASE}`);
        });
      }
    });
  }

  it('release-gate runs every script `bun run validate` runs, in order', () => {
    const steps = workflow.jobs['release-gate']?.steps ?? [];
    const gateScripts = steps
      .map((step) => step.run?.trim().match(BARE_SCRIPT_RUN)?.[1])
      .filter((script) => script !== undefined);

    expect(gateScripts).toEqual(VALIDATE_SCRIPTS);
  });
});
