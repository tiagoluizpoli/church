/**
 * A workspace's `test:unit:related` script: `vitest related` over the changed
 * files, then the workspace's whole `test:unit` suite when no test imports
 * them (a type-only change, an unimported module, a `seeds/` file), so the
 * no-docker tier never narrows a workspace to zero tests. A real failure
 * exits with the related run's code and is never rerun.
 *
 * Usage: `bun tooling/validation/vitest-related.ts [vitest flags] -- <files>`.
 */

interface NeedsWholeSuiteInput {
  exitCode: number;
  output: string;
}

export function needsWholeSuite({
  exitCode,
  output,
}: NeedsWholeSuiteInput): boolean {
  // Vitest prints "No affected test files found" / "No test files found".
  return exitCode === 0 && /No (?:affected )?test files found/.test(output);
}

if (import.meta.main) {
  const related = Bun.spawn(
    ['bunx', 'vitest', 'related', '--run', ...Bun.argv.slice(2)],
    { stderr: 'inherit', stdout: 'pipe' },
  );
  let output = '';
  const decoder = new TextDecoder();
  for await (const chunk of related.stdout) {
    process.stdout.write(chunk);
    output += decoder.decode(chunk, { stream: true });
  }
  const exitCode = await related.exited;

  if (needsWholeSuite({ exitCode, output })) {
    console.log(
      'No unit test imports the changed files; running the whole suite.',
    );
    const wholeSuite = Bun.spawn(['bun', 'run', 'test:unit'], {
      stderr: 'inherit',
      stdout: 'inherit',
    });
    process.exit(await wholeSuite.exited);
  }
  process.exit(exitCode);
}
