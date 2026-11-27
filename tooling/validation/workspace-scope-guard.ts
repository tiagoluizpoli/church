import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Workspace {
  path: string;
  name: string | undefined;
}

export function getWorkspaceScopeFailures({
  workspaces,
}: {
  workspaces: Workspace[];
}): string[] {
  return workspaces.flatMap(({ path, name }) => {
    if (!name?.startsWith('@church/')) {
      return [`${path}: workspace name '${name}' must start with '@church/'`];
    }
    return [];
  });
}

function readWorkspaces(): Workspace[] {
  const workspaces: Workspace[] = [];
  for (const dir of ['apps', 'packages']) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = join(dir, entry.name, 'package.json');
        try {
          const content = readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(content);
          workspaces.push({ path: pkgPath, name: pkg.name });
        } catch {
          // Skip if package.json doesn't exist or can't be read
        }
      }
    }
  }
  return workspaces;
}

if (import.meta.main) {
  const failures = getWorkspaceScopeFailures({
    workspaces: readWorkspaces(),
  });

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
