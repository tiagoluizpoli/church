import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const APPLICATION_ROOTS = ['apps/', 'packages/'];
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

export interface SourceFile {
  path: string;
  source: string;
}

export function readApplicationSourceFiles(): SourceFile[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split('\n')
    .filter(
      (path) =>
        SOURCE_FILE_PATTERN.test(path) &&
        APPLICATION_ROOTS.some((root) => path.startsWith(root)),
    )
    .map((path) => ({
      path,
      source: readFileSync(resolve(REPO_ROOT, path), 'utf8'),
    }));
}
