import { createContext, type ReactNode, useContext } from 'react';
import {
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
  'cycles' | 'cyclesLoading' | 'handleSelectCycle'
>;

export function useCycleListCard(): CycleListCardModel {
  const context = usePlanningAdminContext();

  return {
    cycles: context.cycles,
    cyclesLoading: context.cyclesLoading,
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

export type CycleReviewCardModel = Pick<
  UsePlanningAdminResult,
  | 'selectedCycleId'
  | 'selectedCycle'
  | 'cycleDetailsLoading'
  | 'totalSlots'
  | 'cycleEvents'
  | 'lockCyclePending'
  | 'handleLockCycle'
>;

export function useCycleReviewCard(): CycleReviewCardModel {
  const context = usePlanningAdminContext();

  return {
    selectedCycleId: context.selectedCycleId,
    selectedCycle: context.selectedCycle,
    cycleDetailsLoading: context.cycleDetailsLoading,
    totalSlots: context.totalSlots,
    cycleEvents: context.cycleEvents,
    lockCyclePending: context.lockCyclePending,
    handleLockCycle: context.handleLockCycle,
  };
}
