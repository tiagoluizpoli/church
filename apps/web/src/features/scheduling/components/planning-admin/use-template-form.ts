import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import type { TemplateFormState } from './planning-admin.types';
import {
  canCreateTemplate,
  createEmptyTemplateTimeBlock,
  getErrorMessage,
} from './planning-admin.utils';
import type { TemplateTimeBlockRowProps } from './template-time-block-row';

interface NameChangeInput {
  name: string;
}

interface WeekdayChangeInput {
  weekday: string;
}

interface RemoveBlockInput {
  blockId: string;
}

export interface SaveRefusal {
  nameError?: string;
  formError?: string;
}

interface SaveRefusalInput {
  error: unknown;
}

/** The server's `reason` puts a duplicate name beside the field; anything else is form-level. */
export function toSaveRefusal({ error }: SaveRefusalInput): SaveRefusal {
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

export interface UseTemplateFormInput {
  initialForm: () => TemplateFormState;
}

/**
 * Draft state shared by the create and edit pages. Editing a field clears a
 * previous save refusal; the draft itself is never discarded on failure.
 */
export function useTemplateForm({ initialForm }: UseTemplateFormInput) {
  const [form, setForm] = useState<TemplateFormState>(initialForm);
  const [refusal, setRefusal] = useState<SaveRefusal>({});

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
    setRefusal,
    fields: {
      form,
      canSave: canCreateTemplate({ templateForm: form }),
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
    },
  };
}
