import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `bun tooling/ci/bun-test.ts <bun test arguments...>`: runs `bun test` and
 * keeps its exit status. On GitHub Actions it also writes a JUnit report and
 * prints one `::error` annotation per failed test from it (#1162): file,
 * failing line, title, and the error. `bun test` annotates too, without the
 * test's name and titled by the error's first line, so its `::error` lines
 * are held back and printed only for a file the report has no failure for
 * (one that did not load). The rest of its output is untouched.
 */

interface FailedTest {
  file: string;
  line: string;
  message: string;
  title: string;
}

interface XmlInput {
  xml: string;
}

interface AttributeInput {
  attributes: string;
  name: string;
}

interface FailureLineInput {
  body: string;
  file: string;
}

interface FormatAnnotationInput {
  failedTest: FailedTest;
}

interface EscapeInput {
  text: string;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

const NUMERIC_ENTITY_RADIX = 10;
const HEX_ENTITY_RADIX = 16;

function decodeXml({ text }: EscapeInput): string {
  return text.replace(/&(#x?[\da-f]+|\w+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) {
      return String.fromCodePoint(
        Number.parseInt(code.slice(2), HEX_ENTITY_RADIX),
      );
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(
        Number.parseInt(code.slice(1), NUMERIC_ENTITY_RADIX),
      );
    }
    return XML_ENTITIES[code] ?? entity;
  });
}

function attribute({ attributes, name }: AttributeInput): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match?.[1] === undefined ? '' : decodeXml({ text: match[1] });
}

const escapeRegExp = ({ text }: EscapeInput) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The line the error was thrown at, from the first stack frame in the file. */
function failureLine({ body, file }: FailureLineInput): string | undefined {
  const frame = new RegExp(`${escapeRegExp({ text: file })}:(\\d+):\\d+`).exec(
    body,
  );
  return frame?.[1];
}

const JUNIT_TAG = /<(\/?)(testsuite|testcase|failure)\b([^>]*?)(\/?)>/g;

/**
 * The failed tests of a `bun test` JUnit report. The title joins the file,
 * the enclosing describe blocks and the test name, read from the nested
 * suites (bun writes `classname` innermost-first).
 */
function readFailedTests({ xml }: XmlInput): FailedTest[] {
  const suites: string[] = [];
  const failedTests: FailedTest[] = [];
  let testcase: Omit<FailedTest, 'message'> | undefined;

  for (const match of xml.matchAll(JUNIT_TAG)) {
    const [, closing, tag, attributes = '', selfClosing] = match;
    if (tag === 'testsuite') {
      if (closing) suites.pop();
      else if (!selfClosing)
        suites.push(attribute({ attributes, name: 'name' }));
    } else if (tag === 'testcase') {
      testcase =
        closing || selfClosing
          ? undefined
          : {
              file: attribute({ attributes, name: 'file' }),
              line: attribute({ attributes, name: 'line' }),
              title: [...suites, attribute({ attributes, name: 'name' })].join(
                ' > ',
              ),
            };
    } else if (tag === 'failure' && !closing && testcase) {
      const bodyStart = (match.index ?? 0) + match[0].length;
      const bodyEnd = xml.indexOf('</failure>', bodyStart);
      const body = decodeXml({
        text: selfClosing ? '' : xml.slice(bodyStart, bodyEnd),
      }).trimEnd();
      const message =
        body || attribute({ attributes, name: 'message' }).trimEnd();
      const line =
        failureLine({ body: message, file: testcase.file }) ?? testcase.line;
      failedTests.push({ ...testcase, line, message });
    }
  }

  return failedTests;
}

// https://docs.github.com/actions/reference/workflows-and-actions/workflow-commands
const escapeData = ({ text }: EscapeInput) =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const escapeProperty = ({ text }: EscapeInput) =>
  escapeData({ text }).replace(/:/g, '%3A').replace(/,/g, '%2C');

function formatAnnotation({ failedTest }: FormatAnnotationInput): string {
  const { file, line, message, title } = failedTest;
  const properties = [
    `file=${escapeProperty({ text: file })}`,
    `line=${escapeProperty({ text: line })}`,
    `title=${escapeProperty({ text: title })}`,
  ].join(',');
  return `::error ${properties}::${escapeData({ text: message })}`;
}

/** A `::error` line `bun test` printed, with the file whose group held it. */
interface NativeAnnotation {
  file: string;
  text: string;
}

interface HoldNativeAnnotationsInput {
  exited: Promise<number>;
  stream: ReadableStream<Uint8Array>;
}

const FILE_GROUP = /^::group::(.*):$/;
// A process a test left running can keep stderr open after bun test exits.
const DRAIN_GRACE_MS = 2000;

/** Forwards stderr line by line, holding back the `::error` lines. */
async function holdNativeAnnotations({
  exited,
  stream,
}: HoldNativeAnnotationsInput): Promise<NativeAnnotation[]> {
  const held: NativeAnnotation[] = [];
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  exited.then(() => setTimeout(() => reader.cancel(), DRAIN_GRACE_MS).unref());
  let file = '';
  let pending = '';

  const forward = ({ text }: EscapeInput) => {
    file = FILE_GROUP.exec(text.trimEnd())?.[1] ?? file;
    if (text.startsWith('::error ')) held.push({ file, text });
    else process.stderr.write(text);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) forward({ text: `${line}\n` });
  }
  if (pending) forward({ text: pending });
  return held;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return Bun.spawn([process.execPath, 'test', ...args], {
      stdio: ['inherit', 'inherit', 'inherit'],
    }).exited;
  }

  const reportDirectory = mkdtempSync(join(tmpdir(), 'church-bun-test-junit-'));
  const reportPath = join(reportDirectory, 'junit.xml');
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        ...args,
        '--reporter=junit',
        `--reporter-outfile=${reportPath}`,
      ],
      { stdio: ['inherit', 'inherit', 'pipe'] },
    );
    const { exited, stderr: stream } = child;
    const held = await holdNativeAnnotations({ exited, stream });
    const exitCode = await exited;
    // A run that crashed before writing its report has nothing to read.
    const xml = await Bun.file(reportPath)
      .text()
      .catch(() => '');
    const failedTests = exitCode === 0 ? [] : readFailedTests({ xml });
    const annotatedFiles = new Set(failedTests.map(({ file }) => file));
    for (const { file, text } of held) {
      if (!annotatedFiles.has(file)) process.stderr.write(text);
    }
    for (const failedTest of failedTests) {
      console.log(formatAnnotation({ failedTest }));
    }
    return exitCode;
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exit(await main());
}
