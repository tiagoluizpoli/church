import { m } from '@church/i18n/messages';
import { PlusIcon } from 'lucide-react';
import type { TemplateFormState } from './planning-admin.types';
import { templateBlockErrors } from './planning-admin.utils';
import {
  type RecurrenceChangeInput,
  RecurrenceEditor,
} from './recurrence-editor';
import {
  TemplateTimeBlockRow,
  type TemplateTimeBlockRowProps,
} from './template-time-block-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface NameChangeInput {
  name: string;
}

/** Everything the editor renders and reports, independent of which page owns
 * its state. */
export interface TemplateEditorFormProps {
  form: TemplateFormState;
  /** Whether the form is saving an existing template or creating a new one. */
  mode: 'create' | 'edit';
  canSave: boolean;
  pending: boolean;
  nameError?: string;
  /** A save refusal that has no field of its own. */
  formError?: string;
  onNameChange: (input: NameChangeInput) => void;
  onRecurrenceChange: (input: RecurrenceChangeInput) => void;
  onBlockChange: TemplateTimeBlockRowProps['onBlockChange'];
  onRemoveBlock: TemplateTimeBlockRowProps['onRemoveBlock'];
  onAddBlock: () => void;
  onSave: () => void;
}

/** What a create or edit hook hands the editor. */
export type TemplateEditorState = TemplateEditorFormProps;

/** The draft fields shared by both hooks, before mode and save are added. */
export type TemplateEditorFields = Omit<
  TemplateEditorState,
  'mode' | 'pending' | 'onSave'
>;

export function TemplateEditorForm({
  form: templateForm,
  nameError,
  formError,
  onNameChange,
  onRecurrenceChange,
  onBlockChange,
  onRemoveBlock,
  onAddBlock,
}: TemplateEditorFormProps) {
  const blockErrors = templateBlockErrors({ blocks: templateForm.blocks });
  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-1">
        <Label htmlFor="template-name">{m.event_templates_name_label()}</Label>
        <Input
          id="template-name"
          data-testid="template-name-input"
          value={templateForm.name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'template-name-error' : undefined}
          onChange={(event) => onNameChange({ name: event.target.value })}
          placeholder={m.event_templates_name_placeholder()}
        />
        {nameError ? (
          <p
            id="template-name-error"
            className="text-destructive text-xs"
            data-testid="template-name-error"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      <RecurrenceEditor
        recurrence={templateForm.recurrence}
        onChange={onRecurrenceChange}
      />

      <div className="space-y-3">
        {templateForm.blocks.map((block, index) => (
          <TemplateTimeBlockRow
            key={block.key}
            block={block}
            index={index}
            totalBlocks={templateForm.blocks.length}
            labelError={
              blockErrors.duplicateLabelKeys.has(block.key)
                ? m.error_validation_duplicate_template_block_label()
                : undefined
            }
            timeError={
              blockErrors.equalTimeKeys.has(block.key)
                ? m.event_templates_block_time_equal()
                : undefined
            }
            onBlockChange={onBlockChange}
            onRemoveBlock={onRemoveBlock}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="add-template-time-block-button"
          onClick={onAddBlock}
        >
          <PlusIcon aria-hidden />
          {m.event_templates_block_add()}
        </Button>
      </div>

      {formError ? (
        <p
          className="text-destructive text-sm"
          role="alert"
          data-testid="template-form-error"
        >
          {formError}
        </p>
      ) : null}
    </div>
  );
}

interface TemplateEditorFooterProps
  extends Pick<
    TemplateEditorFormProps,
    'mode' | 'canSave' | 'pending' | 'onSave'
  > {
  onCancel: () => void;
}

const SAVE_BLOCKED_HINT_ID = 'template-save-blocked-hint';

/** Cancel then Save, for the surface footer; a blocked Save says why. */
export function TemplateEditorFooter({
  mode,
  canSave,
  pending,
  onSave,
  onCancel,
}: TemplateEditorFooterProps) {
  return (
    <>
      {canSave ? null : (
        <p
          id={SAVE_BLOCKED_HINT_ID}
          className="self-center text-muted-foreground text-xs sm:mr-auto"
          data-testid="template-save-blocked-hint"
        >
          {m.event_templates_save_blocked_hint()}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        data-testid="cancel-template-button"
        onClick={onCancel}
      >
        {m.event_templates_cancel()}
      </Button>
      <Button
        type="button"
        data-testid="create-template-button"
        disabled={!canSave || pending}
        aria-describedby={canSave ? undefined : SAVE_BLOCKED_HINT_ID}
        onClick={onSave}
      >
        {pending
          ? mode === 'edit'
            ? m.event_templates_save_pending()
            : m.event_templates_create_pending()
          : mode === 'edit'
            ? m.event_templates_save_submit()
            : m.event_templates_create_submit()}
      </Button>
    </>
  );
}
