import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TemplateFormState } from './planning-admin.types';
import {
  canCreateTemplate,
  createEmptyTemplateForm,
  createEmptyTemplateTimeBlock,
  getErrorMessage,
  toTemplateRequestBlocks,
} from './planning-admin.utils';
import type { TemplateTimeBlockRowProps } from './template-time-block-row';
import { adminApi } from '@/utils/api-instances';

interface NameChangeInput {
  name: string;
}

interface WeekdayChangeInput {
  weekday: string;
}

interface RemoveBlockInput {
  blockId: string;
}

interface SaveRefusal {
  nameError?: string;
  formError?: string;
}

interface SaveRefusalInput {
  error: unknown;
}

/** The server's `reason` puts a duplicate name beside the field; anything else is form-level. */
function toSaveRefusal({ error }: SaveRefusalInput): SaveRefusal {
  const data = isAxiosError(error) ? error.response?.data : undefined;
  const reason =
    data && typeof data === 'object' && 'reason' in data
      ? data.reason
      : undefined;
  if (reason === 'DUPLICATE_TEMPLATE_NAME') {
    return { nameError: m.error_validation_duplicate_template_name() };
  }
  return { formError: getErrorMessage({ error }) };
}

/**
 * Create-page state: independent of any Cycle. A failed save keeps every
 * entered value; success refreshes the shared template list and returns to it.
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<TemplateFormState>(createEmptyTemplateForm);
  const [refusal, setRefusal] = useState<SaveRefusal>({});

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

  const onBlockChange: TemplateTimeBlockRowProps['onBlockChange'] = (input) => {
    setRefusal({});
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.key === input.blockId
          ? { ...block, [input.field]: input.value }
          : block,
      ),
    }));
  };

  return {
    form,
    mode: 'create' as const,
    canSave: canCreateTemplate({ templateForm: form }),
    pending: mutation.isPending,
    nameError: refusal.nameError,
    formError: refusal.formError,
    onNameChange: ({ name }: NameChangeInput) => {
      setRefusal({});
      setForm((current) => ({ ...current, name }));
    },
    onWeekdayChange: ({ weekday }: WeekdayChangeInput) =>
      setForm((current) => ({ ...current, weekday })),
    onBlockChange,
    onRemoveBlock: ({ blockId }: RemoveBlockInput) =>
      setForm((current) => ({
        ...current,
        blocks: current.blocks.filter((block) => block.key !== blockId),
      })),
    onAddBlock: () =>
      setForm((current) => ({
        ...current,
        blocks: [...current.blocks, createEmptyTemplateTimeBlock()],
      })),
    onSave: () => {
      if (!mutation.isPending) {
        mutation.mutate();
      }
    },
  };
}
