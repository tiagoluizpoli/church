import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type ExecutionPurpose, runWithPurpose } from './run-with-purpose';

/**
 * Exercises the real Varlock CLI (ADR-0005: purpose selection is explicit,
 * derived from neither `NODE_ENV` nor a fallback) against a fixture schema,
 * proving `CHURCH_EXEC_PURPOSE` selects the matching `.env.<purpose>`
 * overlay and that a missing required value still fails the command instead
 * of running it.
 */

let projectDir: string;

function writeFixture(): void {
  writeFileSync(
    join(projectDir, '.env.schema'),
    [
      '# @defaultSensitive=false @defaultRequired=infer @currentEnv=$CHURCH_EXEC_PURPOSE',
      '# ---',
      '',
      '# @type=enum(development, integration, e2e)',
      'CHURCH_EXEC_PURPOSE=development',
      '',
      '# @required @type=string',
      'TARGET_LABEL=',
    ].join('\n'),
  );
  writeFileSync(join(projectDir, '.env'), 'TARGET_LABEL=base\n');
  writeFileSync(
    join(projectDir, '.env.integration'),
    'TARGET_LABEL=integration-target\n',
  );
}

function runNodeAndReadOutput(purpose: ExecutionPurpose): string {
  const outputPath = join(projectDir, 'output.txt');
  runWithPurpose({
    schemaDir: projectDir,
    purpose,
    command: [
      'node',
      '-e',
      `require('fs').writeFileSync(${JSON.stringify(outputPath)}, process.env.TARGET_LABEL ?? '')`,
    ],
  });
  return readFileSync(outputPath, 'utf8');
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'varlock-run-with-purpose-'));
  writeFixture();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('runWithPurpose', () => {
  it('injects the base value when the purpose has no overlay', () => {
    expect(runNodeAndReadOutput('development')).toBe('base');
  });

  it('selects the explicit purpose overlay over the base value', () => {
    expect(runNodeAndReadOutput('integration')).toBe('integration-target');
  });

  it('fails fast instead of running the command when a required value is missing', () => {
    writeFileSync(join(projectDir, '.env'), '');
    writeFileSync(join(projectDir, '.env.integration'), '');

    expect(() =>
      runWithPurpose({
        schemaDir: projectDir,
        purpose: 'integration',
        command: [
          'node',
          '-e',
          `require('fs').writeFileSync(${JSON.stringify(join(projectDir, 'output.txt'))}, 'ran')`,
        ],
      }),
    ).toThrow();
  });
});
