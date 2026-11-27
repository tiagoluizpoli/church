import type { CalendarDay } from '@church/time';
import type {
  CycleParticipationFilters,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
} from '@/domain/contracts/application/prepare-manager';

export interface FilterCycleParticipationInput {
  events: ParticipationEventView[];
  filters: CycleParticipationFilters;
  timeZone: string;
}

export interface FilteredCycleParticipation {
  /** Events with only the matching blocks, in block order. */
  events: ParticipationEventView[];
  /** Church-local days with at least one block, over the unfiltered cycle. */
  dayMarkers: CalendarDay[];
  /** Blocks of the unfiltered cycle. */
  totalBlocks: number;
  /** Served, uncancelled blocks of the unfiltered cycle with a Shift that has no headcount. */
  needsAttentionBlocks: number;
}

export interface BlockMatchesInput {
  block: ParticipationEventTimeBlockView;
  eventTitle: string;
  filters: CycleParticipationFilters;
  timeZone: string;
}

export interface CompareBlocksInput {
  left: ParticipationEventTimeBlockView;
  right: ParticipationEventTimeBlockView;
}
