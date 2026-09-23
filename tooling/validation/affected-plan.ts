import { CRITICAL_SMOKE_SPEC_PATHS, JOURNEY_MAP } from './journey-map';

export type TestLayer = 'test:unit' | 'test:integration';

export interface ClassifyChangesInput {
  changedPaths: string[];
  /**
   * The daily gate (task-branch to develop) never requires the full E2E
   * suite — per #210's Implementation Decisions, only a develop-to-master
   * release gate does, and only once #121 is repeatedly green. Set this for
   * that gate's invocation so a change to shared E2E infrastructure (e.g.
   * playwright.config.ts) still selects its normal mapped/critical-journey
   * specs, but never escalates to the full suite.
   */
  dailyGate?: boolean;
  e2eSpecPaths?: string[];
}

export interface ValidationPlan {
  e2eSpecPaths: string[];
  lintPaths: string[];
  missingJourneyMappings: string[];
  requiresFullE2e: boolean;
  testLayers: TestLayer[];
  testTargets: TestTarget[];
  workspaceNames: string[];
}

export interface TestTarget {
  testLayer: TestLayer;
  testPath: string;
  workspaceName: string;
}

interface Workspace {
  name: string;
  path: string;
}

interface AddTestLayersInput {
  testLayers: Set<TestLayer>;
  workspaceName: string;
}

interface AddWorkspaceAndDependentsInput {
  workspaceName: string;
  workspaceNames: Set<string>;
}

interface GetTestLayerInput {
  changedPath: string;
  workspaceName: string;
}

interface GetTestTargetInput {
  changedPath: string;
  workspace: Workspace;
}

interface GetJourneySpecPathsInput {
  changedPath: string;
}

interface IsProductionSourcePathInput {
  changedPath: string;
  workspaceName: string;
}

const WORKSPACES: Workspace[] = [
  { name: 'server', path: 'apps/server/' },
  { name: 'web', path: 'apps/web/' },
  { name: '@church/auth', path: 'packages/auth/' },
  { name: '@church/core', path: 'packages/core/' },
  { name: '@church/db', path: 'packages/db/' },
  { name: '@church/env', path: 'packages/env/' },
  { name: '@church/config', path: 'packages/config/' },
  { name: '@church/time', path: 'packages/time/' },
];

const DEPENDENTS: Record<string, string[]> = {
  '@church/auth': ['server'],
  '@church/config': [
    '@church/auth',
    '@church/core',
    '@church/db',
    '@church/env',
    '@church/time',
    'server',
    'web',
  ],
  '@church/core': ['server'],
  '@church/time': ['@church/auth', '@church/db', 'server', 'web'],
  '@church/db': ['@church/auth', 'server'],
  '@church/env': ['@church/auth', '@church/db', 'server', 'web'],
  server: [],
  web: [],
};

const FULL_E2E_PATHS = new Set([
  'apps/web/playwright.config.ts',
  'apps/web/tests/global-setup.ts',
  'apps/web/tests/global-teardown.ts',
  'apps/server/src/test-support/e2e-seed.ts',
]);

const ROOT_INFRASTRUCTURE_PATHS = new Set([
  'bun.lock',
  'package.json',
  'turbo.json',
  'tsconfig.json',
]);

const SERVER_INTEGRATION_TEST_PATHS = new Set([
  'apps/server/tests/application/event-builder.rostering.integration.test.ts',
  'apps/server/tests/application/planning-phase3.managers.test.ts',
  'apps/server/tests/application/scheduling-phase4.managers.test.ts',
  'apps/server/tests/application/scheduling-phase5.volunteer-availability.test.ts',
  'apps/server/tests/application/scheduling-phase6.rostering.test.ts',
  'apps/server/tests/application/scheduling-phase7.live-changes.test.ts',
]);

const TEST_LAYERS: TestLayer[] = ['test:unit', 'test:integration'];

export function classifyChanges({
  changedPaths,
  dailyGate = false,
  e2eSpecPaths = [],
}: ClassifyChangesInput): ValidationPlan {
  const workspaceNames = new Set<string>();
  const testLayers = new Set<TestLayer>();
  const testTargets: TestTarget[] = [];
  const selectedE2eSpecPaths = new Set(e2eSpecPaths);
  const missingJourneyMappings = new Set<string>();
  let requiresFullE2e = false;
  let hasUnmappedProductionChange = false;

  for (const changedPath of changedPaths) {
    if (ROOT_INFRASTRUCTURE_PATHS.has(changedPath)) {
      for (const workspace of WORKSPACES) workspaceNames.add(workspace.name);
      testLayers.add('test:unit');
      testLayers.add('test:integration');
      continue;
    }

    const isSharedE2eInfrastructure = FULL_E2E_PATHS.has(changedPath);
    if (isSharedE2eInfrastructure && !dailyGate) requiresFullE2e = true;

    const workspace = WORKSPACES.find(({ path }) =>
      changedPath.startsWith(path),
    );
    if (!workspace) continue;

    const testTarget = getTestTarget({ changedPath, workspace });
    if (testTarget) testTargets.push(testTarget);

    addWorkspaceAndDependents({
      workspaceName: workspace.name,
      workspaceNames,
    });

    if (
      !isSharedE2eInfrastructure &&
      isProductionSourcePath({ changedPath, workspaceName: workspace.name })
    ) {
      const journeySpecPaths = getJourneySpecPaths({ changedPath });
      if (journeySpecPaths.length > 0) {
        for (const specPath of journeySpecPaths) {
          selectedE2eSpecPaths.add(specPath);
        }
      } else {
        hasUnmappedProductionChange = true;
        missingJourneyMappings.add(changedPath);
      }
    }
  }

  if (hasUnmappedProductionChange) {
    for (const specPath of CRITICAL_SMOKE_SPEC_PATHS) {
      selectedE2eSpecPaths.add(specPath);
    }
  }

  for (const workspaceName of workspaceNames) {
    addTestLayers({ testLayers, workspaceName });
  }

  return {
    e2eSpecPaths: [...selectedE2eSpecPaths].sort(),
    lintPaths: changedPaths.filter(isLintablePath),
    missingJourneyMappings: [...missingJourneyMappings].sort(),
    requiresFullE2e,
    testLayers: TEST_LAYERS.filter((testLayer) => testLayers.has(testLayer)),
    testTargets,
    workspaceNames: [...workspaceNames].sort(),
  };
}

function isProductionSourcePath({
  changedPath,
  workspaceName,
}: IsProductionSourcePathInput): boolean {
  if (workspaceName !== 'web' && workspaceName !== 'server') return false;
  if (!/\.tsx?$/.test(changedPath)) return false;
  if (changedPath.includes('.test.')) return false;
  if (changedPath.includes('/tests/')) return false;

  return true;
}

function getJourneySpecPaths({
  changedPath,
}: GetJourneySpecPathsInput): string[] {
  return JOURNEY_MAP.filter(({ sourcePathPrefix }) =>
    changedPath.startsWith(sourcePathPrefix),
  ).flatMap(({ specPaths }) => specPaths);
}

function addWorkspaceAndDependents({
  workspaceName,
  workspaceNames,
}: AddWorkspaceAndDependentsInput): void {
  workspaceNames.add(workspaceName);

  for (const dependent of DEPENDENTS[workspaceName] ?? []) {
    workspaceNames.add(dependent);
  }
}

function addTestLayers({
  testLayers,
  workspaceName,
}: AddTestLayersInput): void {
  if (workspaceName === '@church/core' || workspaceName === 'web') {
    testLayers.add('test:unit');
    return;
  }

  if (workspaceName === '@church/auth' || workspaceName === '@church/db') {
    testLayers.add('test:integration');
    return;
  }

  if (workspaceName === 'server') {
    testLayers.add('test:unit');
    testLayers.add('test:integration');
  }
}

function isLintablePath(path: string): boolean {
  return /\.(?:cjs|cts|js|json|jsonc|jsx|mjs|mts|ts|tsx)$/.test(path);
}

function getTestTarget({
  changedPath,
  workspace,
}: GetTestTargetInput): TestTarget | null {
  const testLayer = getTestLayer({
    changedPath,
    workspaceName: workspace.name,
  });
  if (!testLayer) return null;

  return {
    testLayer,
    testPath: changedPath.slice(workspace.path.length),
    workspaceName: workspace.name,
  };
}

function getTestLayer({
  changedPath,
  workspaceName,
}: GetTestLayerInput): TestLayer | null {
  if (!changedPath.includes('.test.')) return null;

  if (workspaceName === 'web') {
    return changedPath.includes('.integration.test.')
      ? 'test:integration'
      : 'test:unit';
  }

  if (workspaceName === 'server') {
    return SERVER_INTEGRATION_TEST_PATHS.has(changedPath) ||
      changedPath.includes('/tests/behavior/') ||
      changedPath.includes('/tests/http/') ||
      changedPath.includes('/tests/integration/') ||
      changedPath.includes('.integration.test.')
      ? 'test:integration'
      : 'test:unit';
  }

  if (workspaceName === '@church/core') return 'test:unit';
  if (workspaceName === '@church/auth' || workspaceName === '@church/db') {
    return 'test:integration';
  }

  return null;
}
