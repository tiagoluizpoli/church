import { readApplicationSourceFiles, type SourceFile } from './source-files';

const SEAM_SUPPRESSION_PATTERN =
  /\bbiome-ignore(?:-[a-z]+)?\s+(?:plugin|lint\/style\/noRestrictedImports)\b/;
const DATE_FNS_LOCALE_TOKEN_PATTERN =
  /(?:format|formatInTimeZone|lightFormat)\s*\([^;]*?(['"])([pP]+)\1/g;

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

function isGuardedSourcePath({ path }: { path: string }): boolean {
  return !path.startsWith('packages/time/');
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
