/** What `bun run perf:sign-in` prints. */

export interface SignInTimings {
  firstPaintMs: number;
  lcpMs: number;
  formReadyMs: number;
}

export interface FrameSet {
  count: number;
  directory: string;
}

export interface FormatSignInReportInput {
  url: string;
  conditions: string;
  timings: SignInTimings;
  frames: FrameSet;
}

interface Moment {
  label: string;
  timing: keyof SignInTimings;
  reference: string;
}

// Production build, Slow 4G, 4x CPU slowdown (#1121).
const MOMENTS: Moment[] = [
  { label: 'First paint', timing: 'firstPaintMs', reference: '~0.31 s' },
  { label: 'LCP', timing: 'lcpMs', reference: '~1.41 s' },
  { label: 'Form usable', timing: 'formReadyMs', reference: '~3.3 s' },
];

const MS_PER_SECOND = 1000;

export function formatSignInReport(input: FormatSignInReportInput): string[] {
  const { url, conditions, timings, frames } = input;
  const rows = MOMENTS.map(({ label, timing, reference }) => {
    const seconds = (timings[timing] / MS_PER_SECOND).toFixed(2);
    return `| ${label} | ${seconds} s | ${reference} |`;
  });

  return [
    `perf:sign-in ${url} (${conditions})`,
    '| Moment | This run | #1121 reference |',
    '| --- | --- | --- |',
    ...rows,
    `Frames: ${frames.count} in ${frames.directory}`,
  ];
}
