export type TestLayer = 'test:unit' | 'test:integration';

export interface ClassifyChangesInput {
  changedPaths: string[];
  e2eSpecPaths?: string[];
}

export interface ValidationPlan {
  e2eSpecPaths: string[];
  lintPaths: string[];
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

const WORKSPACES: Workspace[] = [
  { name: 'server', path: 'apps/server/' },
  { name: 'web', path: 'apps/web/' },
  { name: '@church/auth', path: 'packages/auth/' },
  { name: '@church/core', path: 'packages/core/' },
  { name: '@church/db', path: 'packages/db/' },
  { name: '@church/env', path: 'packages/env/' },
  { name: '@church/config', path: 'packages/config/' },
];

const DEPENDENTS: Record<string, string[]> = {
  '@church/auth': ['server'],
  '@church/config': [
    '@church/auth',
    '@church/core',
    '@church/db',
    '@church/env',
    'server',
    'web',
  ],
  '@church/core': ['server'],
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
  e2eSpecPaths = [],
}: ClassifyChangesInput): ValidationPlan {
  const workspaceNames = new Set<string>();
  const testLayers = new Set<TestLayer>();
  const testTargets: TestTarget[] = [];
  const selectedE2eSpecPaths = new Set(e2eSpecPaths);
  let requiresFullE2e = false;

  for (const changedPath of changedPaths) {
    if (ROOT_INFRASTRUCTURE_PATHS.has(changedPath)) {
      for (const workspace of WORKSPACES) workspaceNames.add(workspace.name);
      testLayers.add('test:unit');
      testLayers.add('test:integration');
      continue;
    }

    if (FULL_E2E_PATHS.has(changedPath)) requiresFullE2e = true;

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
  }

  for (const workspaceName of workspaceNames) {
    addTestLayers({ testLayers, workspaceName });
  }

  return {
    e2eSpecPaths: [...selectedE2eSpecPaths].sort(),
    lintPaths: changedPaths.filter(isLintablePath),
    requiresFullE2e,
    testLayers: TEST_LAYERS.filter((testLayer) => testLayers.has(testLayer)),
    testTargets,
    workspaceNames: [...workspaceNames].sort(),
  };
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
