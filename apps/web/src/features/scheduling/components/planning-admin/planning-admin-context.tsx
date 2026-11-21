import { createContext, type ReactNode, useContext } from 'react';
import type { SelectedCycle } from './planning-admin.types';
import {
  type SelectCycleInput,
  type UsePlanningAdminResult,
  usePlanningAdmin,
} from './use-planning-admin';
import type {
  ListCycles200Counts,
  ListCycles200Next,
} from '@/infrastructure/api/churchAPI.schemas';

const PlanningAdminContext = createContext<UsePlanningAdminResult | undefined>(
  undefined,
);

interface PlanningAdminProviderProps {
  children: ReactNode;
}

export function PlanningAdminProvider({
  children,
}: PlanningAdminProviderProps) {
  const planningAdmin = usePlanningAdmin();

  return (
    <PlanningAdminContext.Provider value={planningAdmin}>
      {children}
    </PlanningAdminContext.Provider>
  );
}

function usePlanningAdminContext(): UsePlanningAdminResult {
  const context = useContext(PlanningAdminContext);

  if (context === undefined) {
    throw new Error(
      'usePlanningAdmin selector hooks must be used within a PlanningAdminProvider',
    );
  }

  return context;
}

export function useIsPlanningAccessDenied(): boolean {
  return usePlanningAdminContext().isAccessDenied;
}

export type PlanningStep =
  | 'create-cycle'
  | 'template-and-review'
  | 'sent-review';

/**
 * Derives the active guided step from existing query state (`research.md`
 * R4) — no persisted status field. `create-cycle` covers both "no cycles
 * exist yet" and the brief tick before the first cycle auto-selects.
 */
export function usePlanningStep(): PlanningStep {
  const { selectedCycleId, cycles, selectedCycle } = usePlanningAdminContext();

  if (!selectedCycleId || cycles.length === 0) {
    return 'create-cycle';
  }

  if (selectedCycle?.state === 'sent') {
    return 'sent-review';
  }

  return 'template-and-review';
}

export interface CycleSelectionModel {
  selectedCycleId: string | null;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleClearSelectedCycle: () => void;
}

/**
 * Route-boundary sync point: `cycles` route files call this to keep
 * `usePlanningAdmin`'s internal `selectedCycleId` state aligned with the
 * `$cycleId` URL segment (source of truth is the URL; this hook's state is a
 * cache/derived-data key, per `research.md` R6).
 */
export function useCycleSelection(): CycleSelectionModel {
  const context = usePlanningAdminContext();

  return {
    selectedCycleId: context.selectedCycleId,
    handleSelectCycle: context.handleSelectCycle,
    handleClearSelectedCycle: context.handleClearSelectedCycle,
  };
}

export interface CycleHeaderCounts {
  eventCount: number;
  eventTimeBlockCount: number;
}

export interface CycleHeaderNameAndStatus {
  name: string;
  status: SelectedCycle['state'];
}

export interface CycleHeaderPeriod {
  startDate: string;
  endDate: string;
}

export interface CycleHeaderModel {
  nameAndStatus: CycleHeaderNameAndStatus | null;
  period: CycleHeaderPeriod | null;
  counts: CycleHeaderCounts | null;
}

/**
 * Single source of truth for the selected cycle's status display (`research.md`
 * Q-status-chip-dedup, `data-model.md`'s `CycleHeaderModel`) — no
 * other component should render `selectedCycle.state` as a badge.
 */
export function useCycleHeader(): CycleHeaderModel {
  const { selectedCycle, cycleEvents, totalEventTimeBlocks } =
    usePlanningAdminContext();

  if (!selectedCycle) {
    return { nameAndStatus: null, period: null, counts: null };
  }

  return {
    nameAndStatus: { name: selectedCycle.name, status: selectedCycle.state },
    period: {
      startDate: selectedCycle.startDate,
      endDate: selectedCycle.endDate,
    },
    counts: {
      eventCount: cycleEvents.length,
      eventTimeBlockCount: totalEventTimeBlocks,
    },
  };
}

/**
 * The server's per-state counts for the plain "Cycles" list view's stat
 * chips, null until they load — distinct from `useCycleHeader`, which only
 * ever reflects the single selected cycle.
 */
export function useCycleListStats(): ListCycles200Counts | null {
  return usePlanningAdminContext().cycleCounts;
}

/** The month the list offers to create next, null until the list loads. */
export function useCycleListNext(): ListCycles200Next | null {
  return usePlanningAdminContext().cycleNext;
}

export interface PlanningTemplateLibraryStatsModel {
  totalCount: number;
}

/**
 * The template library's own stat chip (saved-template count) — the block
 * count per template isn't meaningful at the library level, so this stays a
 * single chip rather than mirroring `CycleListStats`'s three.
 */
export function usePlanningTemplateLibraryStats(): PlanningTemplateLibraryStatsModel {
  const { templates } = usePlanningAdminContext();

  return { totalCount: templates.length };
}

export type CycleReviewCardModel = Pick<
  UsePlanningAdminResult,
  | 'selectedCycleId'
  | 'selectedCycle'
  | 'cycleDetailsLoading'
  | 'cycleDetailsError'
  | 'refetchCycleDetails'
  | 'cycleEvents'
  | 'ownedEventCount'
  | 'deleteEventTimeBlockPending'
  | 'handleDeleteEventTimeBlock'
>;

export function useCycleReviewCard(): CycleReviewCardModel {
  const context = usePlanningAdminContext();

  return {
    selectedCycleId: context.selectedCycleId,
    selectedCycle: context.selectedCycle,
    cycleDetailsLoading: context.cycleDetailsLoading,
    cycleDetailsError: context.cycleDetailsError,
    refetchCycleDetails: context.refetchCycleDetails,
    cycleEvents: context.cycleEvents,
    ownedEventCount: context.ownedEventCount,
    deleteEventTimeBlockPending: context.deleteEventTimeBlockPending,
    handleDeleteEventTimeBlock: context.handleDeleteEventTimeBlock,
  };
}
