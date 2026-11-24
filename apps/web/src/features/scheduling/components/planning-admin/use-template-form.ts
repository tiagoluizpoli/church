import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';
import { type Dispatch, type SetStateAction, useState } from 'react';
import type { TemplateFormState } from './planning-admin.types';
import {
  canSaveTemplate,
  createEmptyTemplateTimeBlock,
} from './planning-admin.utils';
import type { RecurrenceChangeInput } from './recurrence-editor';
import type {
  NameChangeInput,
  TemplateEditorFields,
} from './template-editor-form';
import type { TemplateTimeBlockRowProps } from './template-time-block-row';
import {
  type CreateEventTemplate422,
  CreateEventTemplate422Reason,
  type UpdateEventTemplate422,
} from '@/infrastructure/api/churchAPI.schemas';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

interface RemoveBlockInput {
  blockKey: string;
}

export interface SaveRefusal {
  nameError?: string;
  formError?: string;
}

interface SaveRefusalInput {
  error: unknown;
}

type TemplateSaveRefusalBody = CreateEventTemplate422 | UpdateEventTemplate422;

/** The server's `reason` puts a duplicate name beside the field; anything else is form-level. */
export function toSaveRefusal({ error }: SaveRefusalInput): SaveRefusal {
  const reason = isAxiosError<TemplateSaveRefusalBody>(error)
    ? error.response?.data?.reason
    : undefined;
  if (reason === CreateEventTemplate422Reason.DUPLICATE_TEMPLATE_NAME) {
    return { nameError: m.error_validation_duplicate_template_name() };
  }
  return { formError: requestErrorMessage(error) };
}

export interface UseTemplateFormInput {
  initialForm: () => TemplateFormState;
}

export interface UseTemplateFormResult {
  form: TemplateFormState;
  /** The draft differs from what the form opened with. */
  dirty: boolean;
  setRefusal: Dispatch<SetStateAction<SaveRefusal>>;
  fields: TemplateEditorFields;
}

/**
 * Draft state shared by the create and edit pages. Editing a field clears a
 * previous save refusal; the draft itself is never discarded on failure.
 */
export function useTemplateForm({
  initialForm,
}: UseTemplateFormInput): UseTemplateFormResult {
  const [form, setForm] = useState<TemplateFormState>(initialForm);
  const [baseline] = useState(() => JSON.stringify(form));
  const [refusal, setRefusal] = useState<SaveRefusal>({});

  const onBlockChange: TemplateTimeBlockRowProps['onBlockChange'] = (input) => {
    setRefusal({});
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.key === input.blockKey
          ? { ...block, [input.field]: input.value }
          : block,
      ),
    }));
  };

  return {
    form,
    dirty: baseline !== JSON.stringify(form),
    setRefusal,
    fields: {
      form,
      canSave: canSaveTemplate({ templateForm: form }),
      nameError: refusal.nameError,
      formError: refusal.formError,
      onNameChange: ({ name }: NameChangeInput) => {
        setRefusal({});
        setForm((current) => ({ ...current, name }));
      },
      onRecurrenceChange: ({ recurrence }: RecurrenceChangeInput) =>
        setForm((current) => ({ ...current, recurrence })),
      onBlockChange,
      onRemoveBlock: ({ blockKey }: RemoveBlockInput) =>
        setForm((current) => ({
          ...current,
          blocks: current.blocks.filter((block) => block.key !== blockKey),
        })),
      onAddBlock: () =>
        setForm((current) => ({
          ...current,
          blocks: [...current.blocks, createEmptyTemplateTimeBlock()],
        })),
    },
  };
}
