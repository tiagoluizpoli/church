import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  ScheduleBuilderData,
  useScheduleBuilder,
} from '../../hooks/use-schedule-builder';
import type { SlotEditValues } from './slot-edit-modal';
import type {
  DeleteSlotState,
  SlotModalState,
} from './use-schedule-builder-controller.types';
import { trpc } from '@/utils/trpc';

interface UseSlotManagementParams {
  builderData: ScheduleBuilderData;
  eventId: string;
  invalidate: ReturnType<typeof useScheduleBuilder>['invalidate'];
  refetch: ReturnType<typeof useScheduleBuilder>['refetch'];
}

export function buildCreateSlotInitialValues(
  builderData: ScheduleBuilderData,
): SlotEditValues {
  return {
    startTime: new Date(builderData.event.startDate).toISOString(),
    endTime: new Date(builderData.event.endDate).toISOString(),
    label: undefined,
  };
}

export function useSlotManagement({
  builderData,
  eventId,
  invalidate,
  refetch,
}: UseSlotManagementParams) {
  const [slotModal, setSlotModal] = useState<SlotModalState | null>(null);
  const [slotError, setSlotError] = useState<string | undefined>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteSlotState, setDeleteSlotState] =
    useState<DeleteSlotState | null>(null);

  const createSlot = useMutation(
    trpc.adminLeader.createSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const updateSlot = useMutation(
    trpc.adminLeader.updateSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const deleteSlot = useMutation(
    trpc.adminLeader.deleteSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );

  const refreshBuilder = async () => {
    await invalidate();
    await refetch();
  };

  const handleAddManualSlot = () => {
    setSlotError(undefined);
    setSlotModal({
      mode: 'create',
      initial: buildCreateSlotInitialValues(builderData),
    });
  };

  const handleEditSlot = (slotId: string) => {
    const slot = builderData.slots.find((item) => item.id === slotId);
    if (!slot) return;

    setSlotError(undefined);
    setSlotModal({
      mode: 'edit',
      slotId,
      initial: {
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label ?? undefined,
      },
    });
  };

  const handleSaveSlot = async (values: SlotEditValues) => {
    setSlotError(undefined);

    try {
      if (slotModal?.mode === 'edit' && slotModal.slotId) {
        await updateSlot.mutateAsync({
          slotId: slotModal.slotId,
          startTime: values.startTime,
          endTime: values.endTime,
          label: values.label,
        });
      } else {
        await createSlot.mutateAsync({
          eventId,
          startTime: values.startTime,
          endTime: values.endTime,
          label: values.label,
        });
      }

      await refreshBuilder();
      setSlotModal(null);
    } catch (error) {
      setSlotError((error as Error).message);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    const result = await deleteSlot.mutateAsync({ slotId });
    await refreshBuilder();
    if (!result.success && result.assignmentCount > 0) {
      setDeleteSlotState({
        slotId,
        assignmentCount: result.assignmentCount,
      });
    }
  };

  const handleConfirmDeleteSlot = async () => {
    if (!deleteSlotState) return;

    await deleteSlot.mutateAsync({
      slotId: deleteSlotState.slotId,
      force: true,
    });
    await refreshBuilder();
    setDeleteSlotState(null);
  };

  return {
    createSlot,
    deleteSlot,
    deleteSlotState,
    handleAddManualSlot,
    handleConfirmDeleteSlot,
    handleDeleteSlot,
    handleEditSlot,
    handleSaveSlot,
    setDeleteSlotState,
    setSlotError,
    setSlotModal,
    setWizardOpen,
    slotError,
    slotModal,
    updateSlot,
    wizardOpen,
  };
}
