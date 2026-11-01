import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  createEmptyTemplateForm,
  toTemplateRequestBody,
} from './planning-admin.utils';
import type { TemplateEditorState } from './template-editor-form';
import { TEMPLATE_LIST_QUERY_KEY } from './template-query-keys';
import { toSaveRefusal, useTemplateForm } from './use-template-form';
import { adminApi } from '@/utils/api-instances';

export type UseCreateTemplateResult = TemplateEditorState;

/**
 * Create-page state: independent of any Cycle. A failed save keeps every
 * entered value; success refreshes the shared template list and returns to it.
 */
export function useCreateTemplate(): UseCreateTemplateResult {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { form, setRefusal, fields } = useTemplateForm({
    initialForm: createEmptyTemplateForm,
  });

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createEventTemplate(toTemplateRequestBody({ form })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: TEMPLATE_LIST_QUERY_KEY,
      });
      toast.success(m.event_templates_created_toast());
      await navigate({ to: '/event-templates' });
    },
    onError: (error) => setRefusal(toSaveRefusal({ error })),
  });

  return {
    ...fields,
    mode: 'create',
    pending: mutation.isPending,
    onSave: () => {
      if (!mutation.isPending) {
        mutation.mutate();
      }
    },
  };
}
