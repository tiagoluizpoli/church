import type { OutputSink, WriteTextInput } from './run-lanes';
import type { SeedImpactDecision } from './seed-impact';

/**
 * The end of a `validate:affected` log: what each stage did, the result and the
 * tree it judged, then the exit code. A log without these lines is incomplete.
 */

export interface CheckTiming {
  failed?: boolean;
  label: string;
  ms: number;
  skipped?: boolean;
}

/** Tests per outcome, as the stage's own runners totalled them. */
type Totals = Record<string, number>;

export interface FormatGateSummaryInput {
  /** Keyed by step label. */
  counts?: Record<string, Totals>;
  /** Undefined when the run ended before it had a plan. */
  journeyFallbacks?: string[];
  seedDecision?: SeedImpactDecision;
  timings?: CheckTiming[];
}

export interface FormatGateEndingInput extends FormatGateSummaryInput {
  exitCode: number;
  tree: string;
}

const OUTCOMES = [
  'passed',
  'failed',
  'flaky',
  'skipped',
  'todo',
  'interrupted',
  'did not run',
];

const BUN_OUTCOMES: Record<string, string> = {
  fail: 'failed',
  pass: 'passed',
  skip: 'skipped',
  todo: 'todo',
};

// An optional turbo `package:task:` prefix precedes each runner's own line.
const VITEST_TOTALS = /^(?:\S+: )? +Tests {2}([\w |]+?) \(\d+\)\s*$/;
const PLAYWRIGHT_TOTAL =
  /^(?:\S+: )? {2}(\d+) (passed|failed|flaky|skipped|interrupted|did not run)(?: \([\d.]+\w+\))?\s*$/;
const BUN_TOTAL = /^ *(\d+) (pass|fail|skip|todo)\s*$/;

const readVitest = (line: string) =>
  VITEST_TOTALS.exec(line)?.[1]
    ?.split(' | ')
    .map((part) => /^(\d+) (\w+)$/.exec(part)) ?? [];

/** Per step label: the `[count, outcome]` matches on one output line. */
const READERS: Record<string, (line: string) => (RegExpExecArray | null)[]> = {
  'test:e2e': (line) => [PLAYWRIGHT_TOTAL.exec(line)],
  'test:integration': readVitest,
  'test:tooling': (line) => [BUN_TOTAL.exec(line)],
  'test:unit': readVitest,
};

/** Wraps a sink so the totals printed by test runners are summed per step. */
export function countTests({ output }: { output: OutputSink }) {
  const counts: Record<string, Totals> = {};
  const count = ({ text }: WriteTextInput) => {
    const [, label = '', line = ''] =
      /^\[([^\]]+)\] (.*)/.exec(Bun.stripANSI(text)) ?? [];
    for (const match of READERS[label]?.(line) ?? []) {
      if (!match) continue;
      const [, amount, word = ''] = match;
      const outcome = BUN_OUTCOMES[word] ?? word;
      counts[label] ??= {};
      counts[label][outcome] = (counts[label][outcome] ?? 0) + Number(amount);
    }
  };
  const sink: OutputSink = {
    stderr: (input) => {
      count(input);
      output.stderr(input);
    },
    stdout: (input) => {
      count(input);
      output.stdout(input);
    },
  };
  return { counts, output: sink };
}

const formatTotals = (totals: Totals = {}) =>
  OUTCOMES.filter((outcome) => totals[outcome])
    .map((outcome) => `${totals[outcome]} ${outcome}`)
    .join(', ') || '-';

export function formatGateSummary({
  counts = {},
  journeyFallbacks,
  seedDecision,
  timings = [],
}: FormatGateSummaryInput): string {
  const rows = timings.map(({ failed, label, ms, skipped }) => {
    const status = skipped ? 'skipped' : failed ? 'failed' : 'passed';
    // The E2E row's label says which journeys ran: `test:e2e (full suite)`.
    const tests = formatTotals(counts[label.split(' ')[0] ?? label]);
    const elapsed = skipped ? '-' : `${(ms / 1000).toFixed(1)}s`;
    return `| ${label} | ${status} | ${tests} | ${elapsed} |`;
  });
  const table =
    rows.length === 0
      ? ['No stage results.']
      : [
          '| Stage | Status | Tests | Elapsed |',
          '| --- | --- | --- | --- |',
          ...rows,
        ];
  const fallbacks =
    journeyFallbacks === undefined
      ? 'not assessed'
      : journeyFallbacks.join(', ') || 'none';
  return [
    ...table,
    `Seed impact: ${seedDecision ?? 'not assessed'}`,
    `Journey fallbacks: ${fallbacks}`,
  ].join('\n');
}

export function formatGateEnding({
  exitCode,
  tree,
  ...summary
}: FormatGateEndingInput): string {
  return [
    '',
    'Gate summary:',
    formatGateSummary(summary),
    `VALIDATE_AFFECTED: ${exitCode === 0 ? 'PASSED' : 'FAILED'} ${tree}`,
    `EXIT ${exitCode}`,
    '',
  ].join('\n');
}
