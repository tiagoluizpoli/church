import {
  type CalendarDay,
  type Instant,
  isCalendarDay,
  parseCalendarDay,
  today,
} from '@church/time';

const ANCHOR_FLAG = '--anchor=';

export interface ReseedArgumentErrorInput {
  message: string;
}

export class ReseedArgumentError extends Error {
  constructor({ message }: ReseedArgumentErrorInput) {
    super(message);
    this.name = 'ReseedArgumentError';
  }
}

export interface ParseReseedArgumentsInput {
  argv: string[];
}

export interface ReseedArguments {
  /** Absent: the anchor defaults to today in the Church Timezone. */
  anchor: CalendarDay | undefined;
}

/**
 * The command's only option is `--anchor=YYYY-MM-DD`. Anything else is
 * refused before the target is resolved, so a typo can never lead to a reset
 * run with the wrong anchor.
 */
export function parseReseedArguments({
  argv,
}: ParseReseedArgumentsInput): ReseedArguments {
  let anchor: CalendarDay | undefined;

  for (const argument of argv) {
    if (!argument.startsWith(ANCHOR_FLAG)) {
      throw new ReseedArgumentError({
        message: `Unknown argument "${argument}". The only option is --anchor=YYYY-MM-DD.`,
      });
    }
    if (anchor !== undefined) {
      throw new ReseedArgumentError({
        message: '--anchor may be given only once.',
      });
    }

    const value = argument.slice(ANCHOR_FLAG.length);
    if (!isCalendarDay({ value })) {
      throw new ReseedArgumentError({
        message: `Invalid --anchor "${value}": expected a real day as YYYY-MM-DD.`,
      });
    }
    anchor = parseCalendarDay({ value });
  }

  return { anchor };
}

export interface ResolveReseedAnchorInput {
  anchor: CalendarDay | undefined;
  instant: Instant;
  timeZone: string;
}

export function resolveReseedAnchor({
  anchor,
  instant,
  timeZone,
}: ResolveReseedAnchorInput): CalendarDay {
  return anchor ?? today({ instant, timeZone });
}

/** The only order the destructive workflow may run in. */
const RESEED_PHASE_ORDER = ['reset', 'migrate', 'load', 'verify'] as const;

export type ReseedPhase = (typeof RESEED_PHASE_ORDER)[number];

export interface VerifyReseedInput<TResult> {
  seeded: TResult;
}

/** The destructive workflow in the only order it may run. */
export interface ReseedPhases<TResult> {
  reset(): Promise<void>;
  migrate(): Promise<void>;
  /** Transactional: a failure leaves no partial graph behind. */
  load(): Promise<TResult>;
  verify(input: VerifyReseedInput<TResult>): Promise<void>;
}

export interface ReasonOfInput {
  error: unknown;
}

/** The message a failure is reported with, whatever was thrown. */
export function reasonOf({ error }: ReasonOfInput): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ReseedPhaseErrorInput {
  phase: ReseedPhase;
  cause: unknown;
}

export class ReseedPhaseError extends Error {
  readonly phase: ReseedPhase;

  constructor({ phase, cause }: ReseedPhaseErrorInput) {
    super(`failed at phase "${phase}": ${reasonOf({ error: cause })}`, {
      cause,
    });
    this.name = 'ReseedPhaseError';
    this.phase = phase;
  }
}

export interface ReseedReportInput {
  message: string;
}

export type ReseedReport = (input: ReseedReportInput) => void;

export interface RunReseedPhasesInput<TResult> {
  phases: ReseedPhases<TResult>;
  report: ReseedReport;
}

interface RunPhaseInput<T> {
  phase: ReseedPhase;
  run: () => Promise<T>;
}

/**
 * Runs reset, migrate, load and verify in order, stopping at the first
 * failure with a `ReseedPhaseError` naming it. A phase is reported `ok` only
 * after it completes, so a failed run never prints success for it.
 */
export async function runReseedPhases<TResult>({
  phases,
  report,
}: RunReseedPhasesInput<TResult>): Promise<TResult> {
  const runPhase = async <T>({ phase, run }: RunPhaseInput<T>): Promise<T> => {
    let value: T;
    try {
      value = await run();
    } catch (cause) {
      throw new ReseedPhaseError({ phase, cause });
    }
    const position = RESEED_PHASE_ORDER.indexOf(phase) + 1;
    report({
      message: `[${position}/${RESEED_PHASE_ORDER.length}] ${phase}: ok`,
    });
    return value;
  };

  await runPhase({ phase: 'reset', run: () => phases.reset() });
  await runPhase({
    phase: 'migrate',
    run: () => phases.migrate(),
  });
  const seeded = await runPhase({
    phase: 'load',
    run: () => phases.load(),
  });
  await runPhase({
    phase: 'verify',
    run: () => phases.verify({ seeded }),
  });

  return seeded;
}
