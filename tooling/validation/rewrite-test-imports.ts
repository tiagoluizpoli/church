// Temporary (Spec 02c): rewrites relative test imports to @/, @/tests/, @/seeds/. Deleted in T5.
import { readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { MODULE_SPECIFIER_PATTERN } from './test-placement-guard';

const REPO_ROOT = resolve(import.meta.dir, '../..');
const ALIASES = [
  [/^(apps\/[^/]+)\/src\//, '@/'],
  [/^(apps\/[^/]+)\/tests\//, '@/tests/'],
  [/^(apps\/server)\/seeds\//, '@/seeds/'],
] as const;

const args = process.argv.slice(2);
const all = args.includes('--all');

for (const file of args.filter((arg) => arg !== '--all')) {
  const repoPath = posix.relative(
    REPO_ROOT,
    resolve(file).split('\\').join('/'),
  );
  let count = 0;
  const source = readFileSync(file, 'utf8');
  const next = source.replace(
    MODULE_SPECIFIER_PATTERN,
    (match, quote: string, specifier: string) => {
      if (!(all ? specifier.startsWith('.') : specifier.startsWith('../'))) {
        return match;
      }
      const target = posix.join(posix.dirname(repoPath), specifier);
      for (const [pattern, alias] of ALIASES) {
        // The same app only: an alias is per-app, so a cross-app target stays.
        if (
          pattern.test(target) &&
          target.startsWith(repoPath.split('/').slice(0, 2).join('/'))
        ) {
          count++;
          return match.replace(
            `${quote}${specifier}${quote}`,
            `${quote}${target.replace(pattern, alias)}${quote}`,
          );
        }
      }
      return match;
    },
  );
  if (next !== source) writeFileSync(file, next);
  console.log(`${file}: ${count} rewritten`);
}
