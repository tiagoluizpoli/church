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
  | 'templateForm'
  | 'templates'
  | 'selectedTemplateIds'
  | 'selectedCycleId'
  | 'canCreateTemplate'
  | 'templatesLoading'
  | 'createTemplatePending'
  | 'deleteTemplatePending'
  | 'applyTemplatesPending'
  | 'handleTemplateNameChange'
  | 'handleTemplateWeekdayChange'
  | 'handleTemplateBlockChange'
  | 'handleRemoveTemplateBlock'
  | 'handleAddTemplateBlock'
  | 'handleSaveTemplate'
  | 'handleToggleTemplateSelection'
  | 'handleDeleteTemplate'
  | 'handleApplyTemplates'
>;

export function useTemplateManagerCard(): TemplateManagerCardModel {
  const context = usePlanningAdminContext();

  return {
    templateForm: context.templateForm,
    templates: context.templates,
    selectedTemplateIds: context.selectedTemplateIds,
    selectedCycleId: context.selectedCycleId,
    canCreateTemplate: context.canCreateTemplate,
    templatesLoading: context.templatesLoading,
    createTemplatePending: context.createTemplatePending,
    deleteTemplatePending: context.deleteTemplatePending,
    applyTemplatesPending: context.applyTemplatesPending,
    handleTemplateNameChange: context.handleTemplateNameChange,
    handleTemplateWeekdayChange: context.handleTemplateWeekdayChange,
    handleTemplateBlockChange: context.handleTemplateBlockChange,
    handleRemoveTemplateBlock: context.handleRemoveTemplateBlock,
    handleAddTemplateBlock: context.handleAddTemplateBlock,
    handleSaveTemplate: context.handleSaveTemplate,
    handleToggleTemplateSelection: context.handleToggleTemplateSelection,
    handleDeleteTemplate: context.handleDeleteTemplate,
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
  | 'planningEventForm'
  | 'canCreatePlanningEvent'
  | 'createPlanningEventPending'
  | 'lockCyclePending'
  | 'handlePlanningEventTitleChange'
  | 'handlePlanningEventStartChange'
  | 'handlePlanningEventEndChange'
  | 'handlePlanningEventTypeChange'
  | 'handleCreatePlanningEvent'
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
    planningEventForm: context.planningEventForm,
    canCreatePlanningEvent: context.canCreatePlanningEvent,
    createPlanningEventPending: context.createPlanningEventPending,
    lockCyclePending: context.lockCyclePending,
    handlePlanningEventTitleChange: context.handlePlanningEventTitleChange,
    handlePlanningEventStartChange: context.handlePlanningEventStartChange,
    handlePlanningEventEndChange: context.handlePlanningEventEndChange,
    handlePlanningEventTypeChange: context.handlePlanningEventTypeChange,
    handleCreatePlanningEvent: context.handleCreatePlanningEvent,
    handleLockCycle: context.handleLockCycle,
  };
}
