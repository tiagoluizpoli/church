import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  CycleFormDialog,
  type CycleFormSubmitInput,
} from './cycle-form-dialog';
import { adminApi } from '@/utils/api-instances';

interface NewCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Creates a Cycle, refreshes the list and its detail, and opens the new Cycle. */
export function NewCycleDialog({ open, onOpenChange }: NewCycleDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function createCycle({ values }: CycleFormSubmitInput) {
    const cycle = await adminApi.createCycle(values);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cycles'] }),
      queryClient.invalidateQueries({ queryKey: ['cycle-details', cycle.id] }),
    ]);
    toast.success(m.cycles_created());
    onOpenChange(false);
    await navigate({ to: '/cycles/$cycleId', params: { cycleId: cycle.id } });
  }

  return (
    <CycleFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.cycles_form_title_new()}
      description={m.cycles_form_description_new()}
      submitLabel={m.cycles_form_submit_new()}
      onSubmit={createCycle}
    />
  );
}
