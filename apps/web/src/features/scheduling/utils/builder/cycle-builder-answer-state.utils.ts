import type { CycleBuilderEligibleVolunteerSummary } from '../../hooks/use-cycle-builder';

const ANSWER_STATE_ORDER = [
  'available',
  'unanswered',
  'not_asked',
  'unavailable',
] as const;

export function answerStateRank(
  state: CycleBuilderEligibleVolunteerSummary['answerState'],
): number {
  return ANSWER_STATE_ORDER.indexOf(state);
}
