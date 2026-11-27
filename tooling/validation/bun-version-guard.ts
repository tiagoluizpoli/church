import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../..');

interface BunPinFiles {
  miseToml: string;
  packageJson: string;
}

export function readBunPinFiles(): BunPinFiles {
  return {
    miseToml: readFileSync(resolve(REPO_ROOT, 'mise.toml'), 'utf8'),
    packageJson: readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
  };
}

export function getBunVersionFailures({
  miseToml,
  packageJson,
}: BunPinFiles): string[] {
  const { tools } = Bun.TOML.parse(miseToml) as { tools?: { bun?: unknown } };
  const pinned = tools?.bun;
  if (typeof pinned !== 'string') {
    return ['mise.toml: [tools] has no bun version string'];
  }

  const { packageManager } = JSON.parse(packageJson) as {
    packageManager?: string;
  };
  const expected = `bun@${pinned}`;
  if (packageManager === expected) return [];

  const found = packageManager ? `"${packageManager}"` : 'missing';
  return [
    `package.json: packageManager is ${found}, but mise.toml pins bun "${pinned}": make it "${expected}"`,
  ];
}

if (import.meta.main) {
  const failures = getBunVersionFailures(readBunPinFiles());

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
