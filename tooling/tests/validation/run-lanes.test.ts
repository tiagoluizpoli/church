import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import {
  formatStepTable,
  type LaneStep,
  type OutputSink,
  runLanes,
  runStages,
  type WriteTextInput,
} from '../../validation/run-lanes';

interface CapturedOutput extends OutputSink {
  stderrLines: string[];
  stdoutLines: string[];
}

interface ScriptStepInput {
  code: string;
  label: string;
}

interface LabelInput {
  label: string;
}

interface RendezvousStepInput {
  label: string;
  other: string;
}

interface MarkerStepInput {
  label: string;
  marker: string;
}

const scratchDir = mkdtempSync(join(tmpdir(), 'run-lanes-'));
afterAll(() => rmSync(scratchDir, { force: true, recursive: true }));

function markerPath(name: string): string {
  return join(scratchDir, name);
}

function captureOutput(): CapturedOutput {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stderr: ({ text }: WriteTextInput) => stderrLines.push(text),
    stderrLines,
    stdout: ({ text }: WriteTextInput) => stdoutLines.push(text),
    stdoutLines,
  };
}

function scriptStep({ code, label }: ScriptStepInput): LaneStep {
  return { args: ['-e', code], command: 'bun', label };
}

function passing({ label }: LabelInput): LaneStep {
  return scriptStep({ code: '0', label });
}

function failing({ label }: LabelInput): LaneStep {
  return scriptStep({ code: 'process.exit(3)', label });
}

/** Writes its own marker, then waits (10 s cap) for the other lane's marker. */
function rendezvousStep({ label, other }: RendezvousStepInput): LaneStep {
  return scriptStep({
    code: `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(markerPath(label))}, '');
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(${JSON.stringify(markerPath(other))})) {
        if (Date.now() > deadline) process.exit(1);
        await Bun.sleep(10);
      }
    `,
    label,
  });
}

function markerStep({ label, marker }: MarkerStepInput): LaneStep {
  return scriptStep({
    code: `require('node:fs').writeFileSync(${JSON.stringify(markerPath(marker))}, '')`,
    label,
  });
}

describe('runLanes', () => {
  it('runs lanes concurrently: each step sees the other lane running', async () => {
    const results = await runLanes({
      lanes: [
        [rendezvousStep({ label: 'a', other: 'b' })],
        [rendezvousStep({ label: 'b', other: 'a' })],
      ],
      output: captureOutput(),
    });

    expect(results.map((result) => result.status)).toEqual([
      'passed',
      'passed',
    ]);
  });

  it('stops a lane at its first failure and never starts its later steps', async () => {
    const results = await runLanes({
      lanes: [
        [
          failing({ label: 'one' }),
          markerStep({ label: 'two', marker: 'stop-two' }),
          passing({ label: 'three' }),
        ],
      ],
      output: captureOutput(),
    });

    expect(results.map(({ label, status }) => [label, status])).toEqual([
      ['one', 'failed'],
      ['two', 'skipped'],
      ['three', 'skipped'],
    ]);
    expect(existsSync(markerPath('stop-two'))).toBe(false);
  });

  it('lets the other lane run to completion when one lane fails', async () => {
    const results = await runLanes({
      lanes: [
        [failing({ label: 'bad' })],
        [
          markerStep({ label: 'slow', marker: 'other-slow' }),
          markerStep({ label: 'slower', marker: 'other-slower' }),
        ],
      ],
      output: captureOutput(),
    });

    expect(results.map(({ label, status }) => [label, status])).toEqual([
      ['bad', 'failed'],
      ['slow', 'passed'],
      ['slower', 'passed'],
    ]);
    expect(existsSync(markerPath('other-slower'))).toBe(true);
  });

  it('prefixes lines per step on the matching stream and flushes a trailing partial line', async () => {
    const output = captureOutput();
    await runLanes({
      lanes: [
        [
          scriptStep({
            code: "process.stdout.write('out1\\nout2'); process.stderr.write('err1\\nerr2')",
            label: 'step',
          }),
        ],
      ],
      output,
    });

    expect(output.stdoutLines.sort()).toEqual([
      '[step] out1\n',
      '[step] out2\n',
    ]);
    expect(output.stderrLines.sort()).toEqual([
      '[step] err1\n',
      '[step] err2\n',
    ]);
  });

  it('keeps each line under its own step prefix when steps print concurrently', async () => {
    const output = captureOutput();
    const chatty = ({ label }: LabelInput): LaneStep =>
      scriptStep({
        code: `for (let i = 0; i < 50; i++) { process.stdout.write('${label}-' + i + '\\n'); await Bun.sleep(1); }`,
        label,
      });
    await runLanes({
      lanes: [[chatty({ label: 'aa' })], [chatty({ label: 'bb' })]],
      output,
    });

    expect(output.stdoutLines).toHaveLength(100);
    for (const line of output.stdoutLines) {
      expect(line).toMatch(/^\[(aa|bb)\] \1-\d+\n$/);
    }
  });

  it('does not hang when a grandchild keeps the output pipes open', async () => {
    const output = captureOutput();
    const startedAt = performance.now();
    const results = await runLanes({
      lanes: [
        [
          {
            args: ['-c', '(sleep 8 &); echo hi'],
            command: 'sh',
            label: 'leaky',
          },
        ],
      ],
      output,
    });

    expect(results[0]?.status).toBe('passed');
    // The grandchild holds the pipe for 8 s; finishing well before that
    // proves the step stopped reading after the drain grace.
    expect(performance.now() - startedAt).toBeLessThan(4500);
    expect(output.stdoutLines).toEqual(['[leaky] hi\n']);
  });

  it('reports a command that cannot start as failed', async () => {
    const output = captureOutput();
    const results = await runLanes({
      lanes: [[{ args: [], command: 'definitely-not-a-command', label: 'x' }]],
      output,
    });

    expect(results[0]?.status).toBe('failed');
    expect(output.stderrLines.join('')).toContain('[x]');
  });
});

describe('runStages', () => {
  it('runs the final steps after the lanes when everything passed', async () => {
    const results = await runStages({
      finalSteps: [passing({ label: 'e2e' })],
      lanes: [[passing({ label: 'a' })], [passing({ label: 'b' })]],
      output: captureOutput(),
    });

    expect(results.map(({ label, status }) => [label, status])).toEqual([
      ['a', 'passed'],
      ['b', 'passed'],
      ['e2e', 'passed'],
    ]);
  });

  it('skips the final steps when any lane step failed', async () => {
    const results = await runStages({
      finalSteps: [markerStep({ label: 'e2e', marker: 'stage-e2e' })],
      lanes: [[failing({ label: 'a' })], [passing({ label: 'b' })]],
      output: captureOutput(),
    });

    expect(results.map(({ label, status }) => [label, status])).toEqual([
      ['a', 'failed'],
      ['b', 'passed'],
      ['e2e', 'skipped'],
    ]);
    expect(existsSync(markerPath('stage-e2e'))).toBe(false);
  });
});

describe('formatStepTable', () => {
  it('lists label, status and elapsed per step', () => {
    expect(
      formatStepTable({
        results: [
          { label: 'lint', ms: 1234, status: 'passed' },
          { label: 'test:unit', ms: 500, status: 'failed' },
          { label: 'test:e2e', ms: 0, status: 'skipped' },
        ],
      }),
    ).toBe(
      [
        '| Step | Status | Elapsed |',
        '| --- | --- | --- |',
        '| lint | passed | 1.2s |',
        '| test:unit | failed | 0.5s |',
        '| test:e2e | skipped | - |',
      ].join('\n'),
    );
  });
});
