import { readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

/**
 * `bun tooling/ci/failed-tests-summary.ts <test output log>`: prints the job
 * summary's "Failed tests" section (#1162), or nothing when no test failed.
 * It reads the `::error` annotations the runners printed on GitHub Actions
 * (Vitest's and Playwright's GitHub reporters, tooling/ci/bun-test.ts), so
 * it lists exactly what the PR shows, past GitHub's per-step annotation cap.
 */

interface FailedTest {
  file: string;
  line: string;
  message: string;
  title: string;
}

interface TextInput {
  text: string;
}

interface ReadFailedTestsInput {
  log: string;
  workspace: string | undefined;
}

interface FenceInput {
  lines: string[];
}

interface RenderInput {
  failedTests: FailedTest[];
}

/** A test's error is cut to its first lines: enough to name the cause. */
const MAX_ERROR_LINES = 8;
/** Bounds the summary when a broken change fails a whole suite. */
const MAX_LISTED_TESTS = 30;
/** Markdown's shortest code fence. */
const MIN_FENCE_LENGTH = 3;

const ANNOTATION = /^::error ((?:[^:]|:(?!:))*)::(.*)$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes.
const ANSI_ESCAPE = /\u001b\[[\d;]*m/g;

// https://docs.github.com/actions/reference/workflows-and-actions/workflow-commands
const unescapeData = ({ text }: TextInput) =>
  text.replace(/%0D/g, '\r').replace(/%0A/g, '\n').replace(/%25/g, '%');

const unescapeProperty = ({ text }: TextInput) =>
  unescapeData({
    text: text.replace(/%3A/g, ':').replace(/%2C/g, ','),
  });

function readProperties({ text }: TextInput): Map<string, string> {
  const properties = new Map<string, string>();
  for (const pair of text.split(',')) {
    const separator = pair.indexOf('=');
    if (separator > 0) {
      const value = unescapeProperty({ text: pair.slice(separator + 1) });
      properties.set(pair.slice(0, separator), value);
    }
  }
  return properties;
}

/** The first non-blank lines, without their shared indentation. */
function firstErrorLines({ text }: TextInput): string[] {
  const lines = text
    .replace(ANSI_ESCAPE, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, MAX_ERROR_LINES);
  const indents = lines.map((line) => line.length - line.trimStart().length);
  const sharedIndent = Math.min(...indents);
  return lines.map((line) => line.slice(sharedIndent));
}

/** Every annotated failed test, once each, in output order. */
function readFailedTests({
  log,
  workspace,
}: ReadFailedTestsInput): FailedTest[] {
  const seen = new Set<string>();
  const failedTests: FailedTest[] = [];
  for (const line of log.split('\n')) {
    const match = ANNOTATION.exec(line.trimEnd());
    if (!match || seen.has(line)) continue;
    seen.add(line);
    const [, propertyText = '', data = ''] = match;
    const properties = readProperties({ text: propertyText });
    const file = properties.get('file');
    if (file === undefined) continue;
    failedTests.push({
      file: workspace && isAbsolute(file) ? relative(workspace, file) : file,
      line: properties.get('line') ?? '',
      message: unescapeData({ text: data }),
      title: properties.get('title') ?? file,
    });
  }
  return failedTests;
}

/** Longer than any backtick run inside, so no error line closes it early. */
function codeFence({ lines }: FenceInput): string {
  const runs = lines.join('\n').match(/`+/g) ?? [];
  const longestRun = Math.max(0, ...runs.map((run) => run.length));
  return '`'.repeat(Math.max(MIN_FENCE_LENGTH, longestRun + 1));
}

function renderFailedTests({ failedTests }: RenderInput): string {
  if (failedTests.length === 0) return '';
  const listed = failedTests.slice(0, MAX_LISTED_TESTS);
  const items = listed.map(({ file, line, message, title }) => {
    const location = line ? `${file}:${line}` : file;
    const errorLines = firstErrorLines({ text: message });
    const fence = codeFence({ lines: errorLines });
    return [
      `- **${title}** at \`${location}\``,
      ...[fence, ...errorLines, fence].map((errorLine) => `  ${errorLine}`),
    ].join('\n');
  });
  const unlisted = failedTests.length - listed.length;
  const more = unlisted > 0 ? [`- …and ${unlisted} more in the job log`] : [];
  return ['### Failed tests', '', ...items, ...more, ''].join('\n');
}

if (import.meta.main) {
  const [logPath] = process.argv.slice(2);
  if (logPath === undefined) {
    console.error(
      'Usage: bun tooling/ci/failed-tests-summary.ts <test output log>',
    );
    process.exit(2);
  }
  const log = readFileSync(logPath, 'utf8');
  const failedTests = readFailedTests({
    log,
    workspace: process.env.GITHUB_WORKSPACE,
  });
  process.stdout.write(renderFailedTests({ failedTests }));
}
