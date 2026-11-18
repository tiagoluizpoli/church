import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  CycleFormDialog,
  type CycleFormSubmitInput,
  type CycleFormValues,
} from './cycle-form-dialog';
import { adminApi } from '@/utils/api-instances';

export interface EditCycleDialogCycle extends CycleFormValues {
  id: string;
}

export interface EditCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: EditCycleDialogCycle;
}

/** Renames or re-dates a Draft in place; the detail route stays selected. */
export function EditCycleDialog({
  open,
  onOpenChange,
  cycle,
}: EditCycleDialogProps) {
  const queryClient = useQueryClient();
  const { id, name, startDate, endDate } = cycle;
  // Stable while open, so a background refetch does not reset the draft.
  const initialValues = useMemo(
    () => ({ name, startDate, endDate }),
    [name, startDate, endDate],
  );

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      queryClient.invalidateQueries({ queryKey: ['cycle-details', id] }),
    ]);
  }

  async function updateCycle({ values }: CycleFormSubmitInput) {
    try {
      await adminApi.updateCycle(id, values);
    } catch (error) {
      // A refusal may come from a state this page has not seen yet.
      await refresh();
      throw error;
    }
    await refresh();
    toast.success(m.cycles_updated());
    onOpenChange(false);
  }

  return (
    <CycleFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.cycles_form_title_edit()}
      description={m.cycles_form_description_edit()}
      submitLabel={m.cycles_form_submit_edit()}
      initialValues={initialValues}
      onSubmit={updateCycle}
    />
  );
}
