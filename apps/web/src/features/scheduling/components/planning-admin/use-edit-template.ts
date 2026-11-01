import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PlanningTemplateSummary } from './planning-admin.types';
import {
  createTemplateFormFromTemplate,
  toTemplateRequestBlocks,
} from './planning-admin.utils';
import { toSaveRefusal, useTemplateForm } from './use-template-form';
import { adminApi } from '@/utils/api-instances';

export interface RemovedBlockUsage {
  blockId: string;
  label: string;
  ministryCount: number;
}

export interface UseEditTemplateInput {
  template: PlanningTemplateSummary;
}

interface TemplateQueryKeyInput {
  templateId: string;
}

export function templateDetailQueryKey({ templateId }: TemplateQueryKeyInput) {
  return ['planning-template', templateId] as const;
}

export function templateUsageQueryKey({ templateId }: TemplateQueryKeyInput) {
  return ['planning-template-usage', templateId] as const;
}

/**
 * Edit-page state prefilled from the scoped detail read. Save sends the
 * complete desired state with persisted block ids; when persisted blocks were
 * removed it first reads fresh usage and asks for confirmation if any removed
 * block still carries Usual setup.
 */
export function useEditTemplate({ template }: UseEditTemplateInput) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templateId = template.id;
  const { form, setRefusal, fields } = useTemplateForm({
    initialForm: () => createTemplateFormFromTemplate({ template }),
  });
  const [confirmation, setConfirmation] = useState<RemovedBlockUsage[] | null>(
    null,
  );

  const removedBlocks = template.blocks.filter(
    (block) => !form.blocks.some((draft) => draft.persistedId === block.id),
  );

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateEventTemplate(templateId, {
        name: form.name.trim(),
        weekday: Number.parseInt(form.weekday, 10),
        blocks: toTemplateRequestBlocks({ blocks: form.blocks }),
      }),
    onSuccess: async () => {
      setConfirmation(null);
      await Promise.all(
        [
          ['planning-templates'],
          templateDetailQueryKey({ templateId }),
          templateUsageQueryKey({ templateId }),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      toast.success(m.event_templates_updated_toast());
      await navigate({ to: '/event-templates' });
    },
    onError: (error) => {
      setConfirmation(null);
      setRefusal(toSaveRefusal({ error }));
    },
  });

  // Counts are an advisory current read: always fetched fresh, never assumed zero.
  const usageCheck = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery({
        queryKey: templateUsageQueryKey({ templateId }),
        queryFn: () => adminApi.getEventTemplateUsage(templateId),
        staleTime: 0,
      }),
    onSuccess: (usage) => {
      const used = removedBlocks
        .map((block) => ({
          blockId: block.id,
          label: block.label,
          ministryCount:
            usage.blocks.find((entry) => entry.blockId === block.id)
              ?.ministryCount ?? 0,
        }))
        .filter((block) => block.ministryCount > 0);
      if (used.length > 0) {
        setConfirmation(used);
      } else {
        save.mutate();
      }
    },
  });

  const pending = save.isPending || usageCheck.isPending;

  function onSave() {
    if (pending) return;
    setRefusal({});
    if (removedBlocks.length === 0) {
      save.mutate();
    } else {
      usageCheck.mutate();
    }
  }

  return {
    ...fields,
    mode: 'edit' as const,
    pending,
    onSave,
    usageFailed: usageCheck.isError,
    confirmation,
    onConfirmRemoval: () => save.mutate(),
    onCancelRemoval: () => setConfirmation(null),
  };
}
