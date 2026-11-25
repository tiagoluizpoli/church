export interface AgoraCheck {
  id: string;
  ministryName: string;
  cycleName: string;
  answerBy?: string | null;
}

interface AgoraFocus {
  cycleId: string;
  name: string;
  ministries: {
    ministryId: string;
    name: string;
    needed: number;
    filled: number;
  }[];
}

export type Agora =
  | { kind: 'check-overdue'; check: AgoraCheck }
  | { kind: 'setup' }
  | {
      kind: 'coverage-gap';
      ministryId: string;
      ministryName: string;
      cycleId: string;
      cycleName: string;
      open: number;
    }
  | { kind: 'unanswered'; cycleName: string; count: number }
  | { kind: 'check-pending'; check: AgoraCheck }
  | { kind: 'people-without-ministry'; count: number }
  | { kind: 'calm' };

/** Each source is absent when the caller does not hold it or it has not loaded. */
interface AgoraInput {
  /** The Church's today, `YYYY-MM-DD`. */
  churchDay: string;
  /** The caller's unanswered availability checks, in server order. */
  checks?: AgoraCheck[];
  setupDone?: boolean;
  focus?: AgoraFocus | null;
  focusAvailability?: { asked: number; answered: number };
  withoutMinistry?: number;
}

const answerDay = (check: AgoraCheck) => check.answerBy?.slice(0, 10);

/**
 * The one thing Home asks for first, by a fixed priority: an overdue answer
 * of the caller's own, unfinished setup, the focus Cycle's biggest staffing
 * gap, its unanswered availability, the caller's next answer, then people
 * without a Ministry. `calm` when nothing waits.
 */
export function deriveAgora({
  churchDay,
  checks = [],
  setupDone,
  focus,
  focusAvailability,
  withoutMinistry,
}: AgoraInput): Agora {
  // Undated checks sort last; equal days keep server order.
  const byDeadline = checks
    .map((check, index) => ({ check, day: answerDay(check) ?? '9999', index }))
    .toSorted((a, b) => a.day.localeCompare(b.day) || a.index - b.index);
  const overdue = byDeadline.find(({ day }) => day < churchDay);
  if (overdue) return { kind: 'check-overdue', check: overdue.check };
  if (setupDone === false) return { kind: 'setup' };
  const gap = focus?.ministries.reduce<AgoraFocus['ministries'][number] | null>(
    (worst, ministry) =>
      ministry.needed - ministry.filled >
      (worst ? worst.needed - worst.filled : 0)
        ? ministry
        : worst,
    null,
  );
  if (focus && gap)
    return {
      kind: 'coverage-gap',
      ministryId: gap.ministryId,
      ministryName: gap.name,
      cycleId: focus.cycleId,
      cycleName: focus.name,
      open: gap.needed - gap.filled,
    };
  const unanswered = focusAvailability
    ? focusAvailability.asked - focusAvailability.answered
    : 0;
  if (focus && unanswered > 0)
    return { kind: 'unanswered', cycleName: focus.name, count: unanswered };
  if (byDeadline[0])
    return { kind: 'check-pending', check: byDeadline[0].check };
  if (withoutMinistry)
    return { kind: 'people-without-ministry', count: withoutMinistry };
  return { kind: 'calm' };
}
