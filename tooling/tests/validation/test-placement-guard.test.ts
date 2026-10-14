import { describe, expect, it } from 'bun:test';
import { getTestPlacementFailures } from '../../validation/test-placement-guard';

const failuresFor = (path: string, source = '') =>
  getTestPlacementFailures({ files: [{ path, source }] });

describe('test placement guard', () => {
  it('accepts a clean file under src/', () => {
    expect(failuresFor('apps/web/src/features/x/x.ts', 'export {};')).toEqual(
      [],
    );
  });

  it('rejects test-named files under src/', () => {
    for (const path of [
      'apps/web/src/features/x/x.component.test.tsx',
      'apps/web/src/features/x/x.spec.ts',
      'apps/server/src/domain/x.contract-spec.ts',
    ]) {
      expect(failuresFor(path)).toEqual([
        `${path}: test file under src/: move it to the project's tests/ folder`,
      ]);
    }
  });

  it('rejects test-only folders under src/', () => {
    for (const path of [
      'apps/web/src/__tests__/a.ts',
      'apps/server/src/test-support/a.ts',
      'apps/web/src/lib/__mocks__/a.ts',
      'apps/server/src/domain/contracts/contract-tests/a.ts',
    ]) {
      expect(failuresFor(path)).toEqual([
        `${path}: test file under src/: move it to the project's tests/ folder`,
      ]);
    }
  });

  it('rejects test-library imports under src/', () => {
    const path = 'apps/web/src/lib/fake-repo.ts';
    for (const [source, module] of [
      ["import { vi } from 'vitest';", 'vitest'],
      [
        "import { render } from '@testing-library/react';",
        '@testing-library/react',
      ],
      ["import { setupServer } from 'msw/node';", 'msw/node'],
      ["import 'msw';", 'msw'],
      ["const v = await import('vitest');", 'vitest'],
    ] as const) {
      expect(failuresFor(path, source)).toEqual([
        `${path}: imports ${module} under src/: test code belongs in the project's tests/ folder`,
      ]);
    }
  });

  it('accepts test names, folders and imports under tests/', () => {
    for (const path of [
      'apps/web/tests/features/x.component.test.tsx',
      'apps/web/tests/__tests__/a.ts',
      'apps/server/tests/test-support/a.ts',
    ]) {
      expect(failuresFor(path, "import { vi } from 'vitest';")).toEqual([]);
    }
  });

  it('rejects ../ climbs inside an app tests/ folder', () => {
    const path = 'apps/server/tests/a/b.test.ts';
    for (const specifier of ['../../src/x', '../c']) {
      expect(failuresFor(path, `import { x } from '${specifier}';`)).toEqual([
        `${path}: '${specifier}' climbs with ../: import it as @/…, @/tests/… or @/seeds/…`,
      ]);
    }
    for (const specifier of ['@/x', '@/tests/c', './c']) {
      expect(failuresFor(path, `import { x } from '${specifier}';`)).toEqual(
        [],
      );
    }
  });

  it('rejects a ../ climb in vi.importActual with a type argument', () => {
    const path = 'apps/server/tests/a/b.test.ts';
    expect(
      failuresFor(
        path,
        "const m = await vi.importActual<typeof import('x')>('../c');",
      ),
    ).toEqual([
      `${path}: '../c' climbs with ../: import it as @/…, @/tests/… or @/seeds/…`,
    ]);
  });

  it('allows a ../ climb that leaves the app', () => {
    expect(
      failuresFor(
        'apps/web/tests/fixtures/x.ts',
        "import { e } from '../../../../tooling/env/e2e-environment';",
      ),
    ).toEqual([]);
  });

  it('ignores files outside src/ and an app tests/ folder', () => {
    const source = "import { vi } from 'vitest'; import { a } from '../a';";
    expect(failuresFor('tooling/x.test.ts', source)).toEqual([]);
    expect(failuresFor('apps/server/seeds/x.ts', source)).toEqual([]);
  });
});
