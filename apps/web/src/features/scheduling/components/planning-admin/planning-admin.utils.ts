import { isAxiosError } from 'axios';
import type {
  CycleFormState,
  PlanningCycleEventGroup,
  PlanningTemplateSummary,
  SelectedPlanningCycle,
  TemplateBlockDraft,
  TemplateFormState,
} from './planning-admin.types';
import type {
  CreateEventTemplateBody,
  GetPlanningCycle200EventsItemEventStatus,
  ListPlanningCycles200CyclesItemState,
} from '@/infrastructure/api/churchAPI.schemas';

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

let templateBlockDraftCounter = 0;

interface FormatDateInput {
  date: string;
}

interface DescribeTemplateInput {
  template: PlanningTemplateSummary;
}

interface ErrorMessageInput {
  error: unknown;
}

interface ForbiddenErrorInput {
  error: unknown;
}

interface SelectedCycleIdInput {
  selectedCycleId: string | null;
}

interface SortTemplateBlocksInput {
  blocks: TemplateBlockDraft[];
}

interface CycleStateVariantInput {
  state: ListPlanningCycles200CyclesItemState;
}

interface EventStatusVariantInput {
  status: GetPlanningCycle200EventsItemEventStatus;
}

interface TotalSlotsInput {
  events: PlanningCycleEventGroup[] | undefined;
}

interface CycleFormValidityInput {
  cycleForm: CycleFormState;
}

interface TemplateFormValidityInput {
  templateForm: TemplateFormState;
}

interface SelectedCycleInput {
  cycle: SelectedPlanningCycle | null | undefined;
}

export function createEmptyCycleForm(): CycleFormState {
  return {
    name: '',
    startDate: '',
    endDate: '',
  };
}

export function createEmptyTemplateBlock(): TemplateBlockDraft {
  templateBlockDraftCounter += 1;

  return {
    id: `template-block-${templateBlockDraftCounter}`,
    label: '',
    startTime: '',
    endTime: '',
  };
}

export function createEmptyTemplateForm(): TemplateFormState {
  return {
    name: '',
    weekday: '0',
    blocks: [createEmptyTemplateBlock()],
  };
}

export function getErrorMessage({ error }: ErrorMessageInput): string {
  if (isAxiosError(error)) {
    const response = error.response?.data;

    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof response.message === 'string'
    ) {
      return response.message;
    }

    if (
      response &&
      typeof response === 'object' &&
      'error' in response &&
      typeof response.error === 'string'
    ) {
      return response.error;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

export function isForbiddenError({ error }: ForbiddenErrorInput): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

export function getSelectedCycleIdOrThrow({
  selectedCycleId,
}: SelectedCycleIdInput): string {
  if (!selectedCycleId) {
    throw new Error('No planning cycle selected');
  }

  return selectedCycleId;
}

export function formatCycleDate({ date }: FormatDateInput): string {
  return date.slice(0, 10);
}

export function formatEventDateTime({ date }: FormatDateInput): string {
  return `${date.slice(0, 10)} ${date.slice(11, 16)}Z`;
}

export function describeTemplate({ template }: DescribeTemplateInput): string {
  return `${WEEKDAYS[template.weekday] ?? 'Unknown'} · ${template.blocks.length} block${template.blocks.length === 1 ? '' : 's'}`;
}

export function sortTemplateBlocks({
  blocks,
}: SortTemplateBlocksInput): CreateEventTemplateBody['blocks'] {
  return blocks.map((block, index) => ({
    label: block.label.trim(),
    startTime: block.startTime,
    endTime: block.endTime,
    order: index,
  }));
}

export function stateBadgeVariant({
  state,
}: CycleStateVariantInput): 'default' | 'outline' | 'secondary' {
  if (state === 'locked') {
    return 'default';
  }

  if (state === 'archived') {
    return 'outline';
  }

  return 'secondary';
}

export function eventStatusBadgeVariant({
  status,
}: EventStatusVariantInput): 'default' | 'destructive' | 'secondary' {
  if (status === 'scheduled') {
    return 'default';
  }

  if (status === 'cancelled') {
    return 'destructive';
  }

  return 'secondary';
}

export function calculateTotalSlots({ events }: TotalSlotsInput): number {
  return (
    events?.reduce((count, eventGroup) => count + eventGroup.slots.length, 0) ??
    0
  );
}

export function canCreateCycle({ cycleForm }: CycleFormValidityInput): boolean {
  return (
    cycleForm.name.trim() !== '' &&
    cycleForm.startDate !== '' &&
    cycleForm.endDate !== '' &&
    cycleForm.startDate < cycleForm.endDate
  );
}

export function canCreateTemplate({
  templateForm,
}: TemplateFormValidityInput): boolean {
  return (
    templateForm.name.trim() !== '' &&
    templateForm.blocks.length > 0 &&
    templateForm.blocks.every(
      (block) =>
        block.label.trim() !== '' &&
        block.startTime !== '' &&
        block.endTime !== '' &&
        block.startTime < block.endTime,
    )
  );
}

export function cycleIsLocked({ cycle }: SelectedCycleInput): boolean {
  return cycle?.state === 'locked';
}
