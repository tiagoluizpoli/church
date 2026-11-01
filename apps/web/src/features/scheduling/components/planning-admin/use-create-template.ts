import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  createEmptyTemplateForm,
  toTemplateRequestBlocks,
} from './planning-admin.utils';
import { toSaveRefusal, useTemplateForm } from './use-template-form';
import { adminApi } from '@/utils/api-instances';

/**
 * Create-page state: independent of any Cycle. A failed save keeps every
 * entered value; success refreshes the shared template list and returns to it.
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { form, setRefusal, fields } = useTemplateForm({
    initialForm: createEmptyTemplateForm,
  });

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createEventTemplate({
        name: form.name.trim(),
        weekday: Number.parseInt(form.weekday, 10),
        blocks: toTemplateRequestBlocks({ blocks: form.blocks }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planning-templates'] });
      toast.success(m.event_templates_created_toast());
      await navigate({ to: '/event-templates' });
    },
    onError: (error) => setRefusal(toSaveRefusal({ error })),
  });

  return {
    ...fields,
    mode: 'create' as const,
    pending: mutation.isPending,
    onSave: () => {
      if (!mutation.isPending) {
        mutation.mutate();
      }
    },
  };
}
