import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../..');

/** The images that build and run the app on Bun; each must use the pinned one. */
const DOCKERFILES = [
  'deployment/server.Dockerfile',
  'deployment/web.Dockerfile',
];

interface BunPinFiles {
  /** Contents by repository path. */
  dockerfiles?: Record<string, string>;
  miseToml: string;
  packageJson: string;
}

export function readBunPinFiles(): BunPinFiles {
  return {
    miseToml: readFileSync(resolve(REPO_ROOT, 'mise.toml'), 'utf8'),
    packageJson: readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
    dockerfiles: Object.fromEntries(
      DOCKERFILES.map((path) => [
        path,
        readFileSync(resolve(REPO_ROOT, path), 'utf8'),
      ]),
    ),
  };
}

function getDockerfileFailures({
  dockerfiles,
  pinned,
}: {
  dockerfiles: Record<string, string>;
  pinned: string;
}): string[] {
  const expected = `oven/bun:${pinned}`;
  return Object.entries(dockerfiles).flatMap(([path, content]) => {
    const images = [...content.matchAll(/^FROM\s+(oven\/bun\S*)/gim)].map(
      ([, image]) => image,
    );
    if (images.length === 0) {
      return [
        `${path}: no FROM ${expected} line, but mise.toml pins bun "${pinned}"`,
      ];
    }
    return images
      .filter((image) => image !== expected)
      .map(
        (image) =>
          `${path}: FROM ${image}, but mise.toml pins bun "${pinned}": make it "${expected}"`,
      );
  });
}

export function getBunVersionFailures({
  dockerfiles = {},
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
  const found = packageManager ? `"${packageManager}"` : 'missing';
  return [
    ...(packageManager === expected
      ? []
      : [
          `package.json: packageManager is ${found}, but mise.toml pins bun "${pinned}": make it "${expected}"`,
        ]),
    ...getDockerfileFailures({ dockerfiles, pinned }),
  ];
}

if (import.meta.main) {
  const failures = getBunVersionFailures(readBunPinFiles());

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
