import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const APPLICATION_ROOTS = ['apps/', 'packages/'];
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const SEAM_SUPPRESSION_PATTERN =
  /\bbiome-ignore(?:-[a-z]+)?\s+(?:plugin|lint\/style\/noRestrictedImports)\b/;
const DATE_FNS_LOCALE_TOKEN_PATTERN =
  /(?:format|formatInTimeZone|lightFormat)\s*\([^;]*?(['"])([pP]+)\1/g;

export interface SourceFile {
  path: string;
  source: string;
}

export function getDateTimeSeamGuardFailures({
  files,
}: {
  files: SourceFile[];
}): string[] {
  return files.flatMap(({ path, source }) => {
    if (!isGuardedSourcePath({ path })) return [];

    const failures: string[] = [];
    if (SEAM_SUPPRESSION_PATTERN.test(source)) {
      failures.push(`${path}: biome-ignore suppresses a date-time seam rule`);
    }

    const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const match of executableSource.matchAll(
      DATE_FNS_LOCALE_TOKEN_PATTERN,
    )) {
      failures.push(
        `${path}: date-fns locale token ${match[1]}${match[2]}${match[1]} is forbidden`,
      );
    }

    return failures;
  });
}

export function readApplicationSourceFiles(): SourceFile[] {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter(Boolean);

  return paths
    .filter((path) => isGuardedSourcePath({ path }))
    .map((path) => ({
      path,
      source: readFileSync(resolve(REPO_ROOT, path), 'utf8'),
    }));
}

function isGuardedSourcePath({ path }: { path: string }): boolean {
  return (
    SOURCE_FILE_PATTERN.test(path) &&
    APPLICATION_ROOTS.some((root) => path.startsWith(root)) &&
    !path.startsWith('packages/time/')
  );
}

if (import.meta.main) {
  const failures = getDateTimeSeamGuardFailures({
    files: readApplicationSourceFiles(),
  });

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
