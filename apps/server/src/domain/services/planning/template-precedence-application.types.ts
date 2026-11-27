import type { CalendarDay } from '@church/time';
import type { EventId, EventTimeBlockId } from '../../branded-ids';
import type { Recurrence } from '../../recurrence';

export interface PrecedenceTemplateBlock {
  id: string;
  startTime: string;
  endTime: string;
}

/** The parts of an EventTemplate that precedence reads. */
export interface PrecedenceTemplate {
  id: string;
  name: string;
  recurrence: Recurrence;
  blocks: PrecedenceTemplateBlock[];
}

/** One stored answer other than "both": `winner` beats `loser`. */
export interface PrecedencePair {
  winner: PrecedenceTemplate;
  loser: PrecedenceTemplate;
}

export interface LosingBlockIdsInput {
  day: CalendarDay;
  loser: PrecedenceTemplate;
  pairs: PrecedencePair[];
}

export interface BeatenOnDayInput {
  loserBlock: PrecedenceTemplateBlock;
  winner: PrecedenceTemplate;
  day: CalendarDay;
}

export interface ExistingLoserEventTimeBlock {
  eventId: EventId;
  eventTitle: string;
  eventDate: CalendarDay;
  eventTimeBlockId: EventTimeBlockId;
  label?: string;
  startTime: string;
  endTime: string;
  sourceTemplateTimeBlockId?: string;
}

export interface LosingEventTimeBlock extends ExistingLoserEventTimeBlock {
  loserTemplateName: string;
  winnerTemplateName: string;
}

export interface ListLosingEventTimeBlocksInput {
  pairs: PrecedencePair[];
  cycleStart: CalendarDay;
  cycleEnd: CalendarDay;
  existing: ExistingLoserEventTimeBlock[];
}
