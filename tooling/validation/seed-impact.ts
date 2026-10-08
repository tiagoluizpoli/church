import type { TestLayer } from './affected-plan';

/**
 * Seed-impact enforcement (ADR 0006, #331). A change to the database shape,
 * persistence, authentication, tenancy or scheduling can invalidate curated
 * seed data, so it selects the seed contracts and needs one explicit
 * decision: update the seed subsystem in the same change, or acknowledge that
 * there is no seed impact.
 */

export type SeedImpactArea =
  | 'authentication'
  | 'persistence'
  | 'scheduling'
  | 'schema'
  | 'seed-subsystem'
  | 'tenancy';

export type SeedImpactDecision =
  | 'acknowledged'
  | 'not-applicable'
  | 'seed-updated'
  | 'undecided';

export interface SeedImpactChange {
  area: SeedImpactArea;
  changedPath: string;
}

export interface SeedImpact {
  acknowledgements: string[];
  changes: SeedImpactChange[];
  contractsSelected: boolean;
  decision: SeedImpactDecision;
}

export interface SeedContractTarget {
  testLayer: TestLayer;
  testPath: string;
  workspaceName: string;
}

export interface AssessSeedImpactInput {
  acknowledgements: string[];
  changedPaths: string[];
}

export interface ReadSeedImpactTrailersInput {
  messages: string[];
}

interface SeedImpactRule {
  area: SeedImpactArea;
  prefixes: string[];
}

/** The commit trailer that acknowledges no seed impact: `Seed-Impact: none - <reason>`. */
export const SEED_IMPACT_TRAILER = 'Seed-Impact: none - <reason>';

// First match wins, so the narrower tenancy entries precede the broader
// persistence ones.
const SEED_IMPACT_RULES: SeedImpactRule[] = [
  {
    area: 'seed-subsystem',
    prefixes: ['apps/server/seeds/', 'apps/server/tests/seeds/'],
  },
  {
    area: 'tenancy',
    prefixes: [
      'packages/db/src/tenancy.ts',
      'apps/server/src/application/db-active-church',
      'apps/server/src/application/db-authority-manager.ts',
      'apps/server/src/domain/authority/',
      'apps/server/src/scripts/provision-church.ts',
      'apps/server/src/scripts/init-system.ts',
      'apps/server/src/scripts/ensure-platform-operator.ts',
    ],
  },
  {
    area: 'schema',
    prefixes: ['packages/db/src/schema/', 'packages/db/src/migrations/'],
  },
  {
    area: 'authentication',
    prefixes: [
      'packages/auth/src/',
      'apps/server/src/infrastructure/auth/',
      'apps/server/src/api/auth/',
    ],
  },
  {
    area: 'persistence',
    prefixes: [
      'apps/server/src/infrastructure/repositories/',
      'apps/server/src/infrastructure/mappers/',
      'apps/server/src/domain/entities/',
      'apps/server/src/domain/contracts/infrastructure/',
    ],
  },
  {
    area: 'scheduling',
    prefixes: [
      'apps/server/src/application/db-assignment-manager.ts',
      'apps/server/src/application/db-availability-check-manager.ts',
      'apps/server/src/application/db-event-manager.ts',
      'apps/server/src/application/db-event-template-manager.ts',
      'apps/server/src/application/db-ministry-manager.ts',
      'apps/server/src/application/db-participation-manager.ts',
      'apps/server/src/application/db-planning-cycle-manager.ts',
      'apps/server/src/application/db-planning-event-manager.ts',
      'apps/server/src/application/db-volunteer-manager.ts',
      'apps/server/src/domain/assignment/',
      'apps/server/src/domain/availability/',
      'apps/server/src/domain/conflict/',
    ],
  },
];

/**
 * The aggregate seed-contract path: every recipe's load, coherence and
 * isolation contract (`tests/seeds/`, one registry-driven suite per purpose)
 * and the wrong-purpose and wrong-target refusals that guard each
 * destructive seed command's database. Paths are relative to the workspace.
 */
export const SEED_CONTRACT_TARGETS: SeedContractTarget[] = [
  {
    testLayer: 'test:integration',
    testPath: 'tests/seeds/',
    workspaceName: 'server',
  },
  { testLayer: 'test:unit', testPath: 'tests/seeds/', workspaceName: 'server' },
  ...[
    'tests/destructive-development-commands.test.ts',
    'tests/e2e-database-reset.test.ts',
    'tests/integration-database-url.test.ts',
    'tests/purpose-database-url-guard.test.ts',
    'tests/reset-dev-command.test.ts',
  ].map(
    (testPath): SeedContractTarget => ({
      testLayer: 'test:integration',
      testPath,
      workspaceName: '@church/db',
    }),
  ),
];

function isSourcePath(changedPath: string): boolean {
  return (
    !changedPath.includes('.test.') &&
    !changedPath.includes('/tests/') &&
    !changedPath.includes('/contract-tests/')
  );
}

export function assessSeedImpact({
  acknowledgements,
  changedPaths,
}: AssessSeedImpactInput): SeedImpact {
  const changes: SeedImpactChange[] = [];
  for (const changedPath of changedPaths) {
    const rule = SEED_IMPACT_RULES.find(({ prefixes }) =>
      prefixes.some((prefix) => changedPath.startsWith(prefix)),
    );
    if (!rule) continue;
    // The subsystem's own tests are part of it; any other test is not source.
    if (rule.area !== 'seed-subsystem' && !isSourcePath(changedPath)) continue;
    changes.push({ area: rule.area, changedPath });
  }

  const validAcknowledgements = acknowledgements
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);
  const seedUpdated = changes.some(({ area }) => area === 'seed-subsystem');
  const needsDecision = changes.some(({ area }) => area !== 'seed-subsystem');

  let decision: SeedImpactDecision = 'not-applicable';
  if (seedUpdated) decision = 'seed-updated';
  else if (needsDecision) {
    decision = validAcknowledgements.length > 0 ? 'acknowledged' : 'undecided';
  }

  return {
    acknowledgements: needsDecision ? validAcknowledgements : [],
    changes,
    contractsSelected: changes.length > 0,
    decision,
  };
}

const TRAILER_PATTERN = /^Seed-Impact:\s*none\s*-\s*(.*)$/gim;

/** The reasons of every `Seed-Impact: none - <reason>` trailer; a blank reason does not count. */
export function readSeedImpactTrailers({
  messages,
}: ReadSeedImpactTrailersInput): string[] {
  const reasons: string[] = [];
  for (const message of messages) {
    for (const match of message.matchAll(TRAILER_PATTERN)) {
      const reason = (match[1] ?? '').trim();
      if (reason.length > 0) reasons.push(reason);
    }
  }
  return reasons;
}
