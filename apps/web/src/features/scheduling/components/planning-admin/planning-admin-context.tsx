import { createContext, type ReactNode, useContext } from 'react';
import type { SelectedPlanningCycle } from './planning-admin.types';
import {
  type SelectCycleInput,
  type UsePlanningAdminResult,
  usePlanningAdmin,
} from './use-planning-admin';

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
  | 'locked-review';

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

  if (selectedCycle?.state === 'locked') {
    return 'locked-review';
  }

  return 'template-and-review';
}

export type CreateCycleCardModel = Pick<
  UsePlanningAdminResult,
  | 'cycleForm'
  | 'cycleErrorMessage'
  | 'canCreateCycle'
  | 'createCyclePending'
  | 'handleCycleNameChange'
  | 'handleCycleStartDateChange'
  | 'handleCycleEndDateChange'
  | 'handleCreateCycle'
>;

export function useCreateCycleCard(): CreateCycleCardModel {
  const context = usePlanningAdminContext();

  return {
    cycleForm: context.cycleForm,
    cycleErrorMessage: context.cycleErrorMessage,
    canCreateCycle: context.canCreateCycle,
    createCyclePending: context.createCyclePending,
    handleCycleNameChange: context.handleCycleNameChange,
    handleCycleStartDateChange: context.handleCycleStartDateChange,
    handleCycleEndDateChange: context.handleCycleEndDateChange,
    handleCreateCycle: context.handleCreateCycle,
  };
}

export type CycleListCardModel = Pick<
  UsePlanningAdminResult,
  'cycles' | 'cyclesLoading' | 'selectedCycleId' | 'handleSelectCycle'
>;

export function useCycleListCard(): CycleListCardModel {
  const context = usePlanningAdminContext();

  return {
    cycles: context.cycles,
    cyclesLoading: context.cyclesLoading,
    selectedCycleId: context.selectedCycleId,
    handleSelectCycle: context.handleSelectCycle,
  };
}

export type TemplateManagerCardModel = Pick<
  UsePlanningAdminResult,
  | 'templates'
  | 'templatesLoading'
  | 'deleteTemplatePending'
  | 'handleDeleteTemplate'
  | 'handleStartEditTemplate'
>;

export function useTemplateManagerCard(): TemplateManagerCardModel {
  const context = usePlanningAdminContext();

  return {
    templates: context.templates,
    templatesLoading: context.templatesLoading,
    deleteTemplatePending: context.deleteTemplatePending,
    handleDeleteTemplate: context.handleDeleteTemplate,
    handleStartEditTemplate: context.handleStartEditTemplate,
  };
}

export type TemplateEditorModel = Pick<
  UsePlanningAdminResult,
  | 'editingTemplateId'
  | 'templateForm'
  | 'canCreateTemplate'
  | 'saveTemplatePending'
  | 'templateSaveSuccessCount'
  | 'handleStartCreateTemplate'
  | 'handleResetTemplateEditor'
  | 'handleTemplateNameChange'
  | 'handleTemplateWeekdayChange'
  | 'handleTemplateBlockChange'
  | 'handleRemoveTemplateBlock'
  | 'handleAddTemplateBlock'
  | 'handleSaveTemplate'
>;

export function useTemplateEditor(): TemplateEditorModel {
  const context = usePlanningAdminContext();

  return {
    editingTemplateId: context.editingTemplateId,
    templateForm: context.templateForm,
    canCreateTemplate: context.canCreateTemplate,
    saveTemplatePending: context.saveTemplatePending,
    templateSaveSuccessCount: context.templateSaveSuccessCount,
    handleStartCreateTemplate: context.handleStartCreateTemplate,
    handleResetTemplateEditor: context.handleResetTemplateEditor,
    handleTemplateNameChange: context.handleTemplateNameChange,
    handleTemplateWeekdayChange: context.handleTemplateWeekdayChange,
    handleTemplateBlockChange: context.handleTemplateBlockChange,
    handleRemoveTemplateBlock: context.handleRemoveTemplateBlock,
    handleAddTemplateBlock: context.handleAddTemplateBlock,
    handleSaveTemplate: context.handleSaveTemplate,
  };
}

export type TemplateApplyDialogModel = Pick<
  UsePlanningAdminResult,
  | 'templates'
  | 'templatesLoading'
  | 'selectedTemplateIds'
  | 'selectedCycleId'
  | 'applyTemplatesPending'
  | 'applyTemplatesError'
  | 'resetApplyTemplates'
  | 'handleToggleTemplateSelection'
  | 'handleApplyTemplates'
>;

export function useTemplateApplyDialog(): TemplateApplyDialogModel {
  const context = usePlanningAdminContext();

  return {
    templates: context.templates,
    templatesLoading: context.templatesLoading,
    selectedTemplateIds: context.selectedTemplateIds,
    selectedCycleId: context.selectedCycleId,
    applyTemplatesPending: context.applyTemplatesPending,
    applyTemplatesError: context.applyTemplatesError,
    resetApplyTemplates: context.resetApplyTemplates,
    handleToggleTemplateSelection: context.handleToggleTemplateSelection,
    handleApplyTemplates: context.handleApplyTemplates,
  };
}

export interface PlanningCycleSelectionModel {
  selectedCycleId: string | null;
  handleSelectCycle: (input: SelectCycleInput) => void;
  handleClearSelectedCycle: () => void;
}

/**
 * Route-boundary sync point: `planning-cycles` route files call this to keep
 * `usePlanningAdmin`'s internal `selectedCycleId` state aligned with the
 * `$cycleId` URL segment (source of truth is the URL; this hook's state is a
 * cache/derived-data key, per `research.md` R6).
 */
export function usePlanningCycleSelection(): PlanningCycleSelectionModel {
  const context = usePlanningAdminContext();

  return {
    selectedCycleId: context.selectedCycleId,
    handleSelectCycle: context.handleSelectCycle,
    handleClearSelectedCycle: context.handleClearSelectedCycle,
  };
}

export interface PlanningCycleHeaderCounts {
  eventCount: number;
  slotCount: number;
}

export interface PlanningCycleHeaderNameAndStatus {
  name: string;
  status: SelectedPlanningCycle['state'];
}

export interface PlanningCycleHeaderPeriod {
  startDate: string;
  endDate: string;
}

export interface PlanningCycleHeaderModel {
  nameAndStatus: PlanningCycleHeaderNameAndStatus | null;
  period: PlanningCycleHeaderPeriod | null;
  counts: PlanningCycleHeaderCounts | null;
}

/**
 * Single source of truth for the selected cycle's status display (`research.md`
 * Q-status-chip-dedup, `data-model.md`'s `PlanningCycleHeaderModel`) — no
 * other component should render `selectedCycle.state` as a badge.
 */
export function usePlanningCycleHeader(): PlanningCycleHeaderModel {
  const { selectedCycle, cycleEvents, totalSlots } = usePlanningAdminContext();

  if (!selectedCycle) {
    return { nameAndStatus: null, period: null, counts: null };
  }

  return {
    nameAndStatus: { name: selectedCycle.name, status: selectedCycle.state },
    period: {
      startDate: selectedCycle.startDate,
      endDate: selectedCycle.endDate,
    },
    counts: { eventCount: cycleEvents.length, slotCount: totalSlots },
  };
}

export interface PlanningCycleListStatsModel {
  totalCount: number;
  draftCount: number;
  lockedCount: number;
}

/**
 * Counts for the plain "Planning cycles" list view's own stat chips —
 * distinct from `usePlanningCycleHeader`, which only ever reflects the
 * single selected cycle.
 */
export function usePlanningCycleListStats(): PlanningCycleListStatsModel {
  const { cycles } = usePlanningAdminContext();

  return {
    totalCount: cycles.length,
    draftCount: cycles.filter((cycle) => cycle.state === 'draft').length,
    lockedCount: cycles.filter((cycle) => cycle.state === 'locked').length,
  };
}

export interface PlanningTemplateLibraryStatsModel {
  totalCount: number;
}

/**
 * The template library's own stat chip (saved-template count) — the block
 * count per template isn't meaningful at the library level, so this stays a
 * single chip rather than mirroring `PlanningCycleListStats`'s three.
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
  | 'cycleEvents'
  | 'lockCyclePending'
  | 'handleLockCycle'
  | 'updateEventPending'
  | 'deleteEventPending'
  | 'createSlotPending'
  | 'updateSlotPending'
  | 'deleteSlotPending'
  | 'handleUpdateEvent'
  | 'handleDeleteEvent'
  | 'handleCreateSlot'
  | 'handleUpdateSlot'
  | 'handleDeleteSlot'
>;

export function useCycleReviewCard(): CycleReviewCardModel {
  const context = usePlanningAdminContext();

  return {
    selectedCycleId: context.selectedCycleId,
    selectedCycle: context.selectedCycle,
    cycleDetailsLoading: context.cycleDetailsLoading,
    cycleEvents: context.cycleEvents,
    updateEventPending: context.updateEventPending,
    deleteEventPending: context.deleteEventPending,
    createSlotPending: context.createSlotPending,
    updateSlotPending: context.updateSlotPending,
    deleteSlotPending: context.deleteSlotPending,
    handleUpdateEvent: context.handleUpdateEvent,
    handleDeleteEvent: context.handleDeleteEvent,
    handleCreateSlot: context.handleCreateSlot,
    handleUpdateSlot: context.handleUpdateSlot,
    handleDeleteSlot: context.handleDeleteSlot,
    lockCyclePending: context.lockCyclePending,
    handleLockCycle: context.handleLockCycle,
  };
}
