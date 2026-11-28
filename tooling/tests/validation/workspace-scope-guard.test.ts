import { describe, expect, it } from 'bun:test';
import { getWorkspaceScopeFailures } from '../../validation/workspace-scope-guard';

describe('workspace scope guard', () => {
  it('passes when all workspaces are @church/ scoped', () => {
    expect(
      getWorkspaceScopeFailures({
        workspaces: [
          { path: 'apps/web/package.json', name: '@church/web' },
          { path: 'apps/server/package.json', name: '@church/server' },
          { path: 'packages/db/package.json', name: '@church/db' },
        ],
      }),
    ).toEqual([]);
  });

  it('fails when a workspace name is not scoped', () => {
    expect(
      getWorkspaceScopeFailures({
        workspaces: [
          { path: 'apps/web/package.json', name: 'web' },
          { path: 'apps/server/package.json', name: '@church/server' },
        ],
      }),
    ).toEqual([
      "apps/web/package.json: workspace name 'web' must start with '@church/'",
    ]);
  });

  it('fails when a workspace name is scoped to a different org', () => {
    expect(
      getWorkspaceScopeFailures({
        workspaces: [{ path: 'packages/ui/package.json', name: '@other/ui' }],
      }),
    ).toEqual([
      "packages/ui/package.json: workspace name '@other/ui' must start with '@church/'",
    ]);
  });

  it('fails for multiple unscoped workspaces', () => {
    const failures = getWorkspaceScopeFailures({
      workspaces: [
        { path: 'apps/web/package.json', name: 'web' },
        { path: 'packages/db/package.json', name: 'db' },
        { path: 'apps/server/package.json', name: '@church/server' },
      ],
    });

    expect(failures).toHaveLength(2);
    expect(failures).toContain(
      "apps/web/package.json: workspace name 'web' must start with '@church/'",
    );
    expect(failures).toContain(
      "packages/db/package.json: workspace name 'db' must start with '@church/'",
    );
  });

  it('fails when workspace name is missing', () => {
    expect(
      getWorkspaceScopeFailures({
        workspaces: [{ path: 'apps/web/package.json', name: undefined }],
      }),
    ).toEqual([
      "apps/web/package.json: workspace name 'undefined' must start with '@church/'",
    ]);
  });
});
