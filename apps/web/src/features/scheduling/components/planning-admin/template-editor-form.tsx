import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatWeekdayOfIndex } from '@church/time';
import type { ReactNode } from 'react';
import type { TemplateFormState } from './planning-admin.types';
import { templateBlockErrors } from './planning-admin.utils';
import {
  TemplateTimeBlockRow,
  type TemplateTimeBlockRowProps,
} from './template-time-block-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NameChangeInput {
  name: string;
}

interface WeekdayChangeInput {
  weekday: string;
}

/** Everything the editor renders and reports, independent of where its state
 * lives (a nested page or the legacy edit dialog). */
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
  onWeekdayChange: (input: WeekdayChangeInput) => void;
  onBlockChange: TemplateTimeBlockRowProps['onBlockChange'];
  onRemoveBlock: TemplateTimeBlockRowProps['onRemoveBlock'];
  onAddBlock: () => void;
  onSave: () => void;
  submitButtonClassName?: string;
  /** Rendered beside Save (e.g. Cancel). */
  actions?: ReactNode;
}

export function TemplateEditorForm({
  form: templateForm,
  mode,
  canSave,
  pending,
  nameError,
  formError,
  onNameChange,
  onWeekdayChange,
  onBlockChange,
  onRemoveBlock,
  onAddBlock,
  onSave,
  submitButtonClassName,
  actions,
}: TemplateEditorFormProps) {
  const blockErrors = templateBlockErrors({ blocks: templateForm.blocks });
  const selectedWeekdayIndex = Number.parseInt(templateForm.weekday, 10);
  const selectedWeekdayLabel = Number.isNaN(selectedWeekdayIndex)
    ? null
    : formatWeekdayOfIndex({
        index: selectedWeekdayIndex as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        locale: getLocale(),
      });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
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
      <div className="space-y-1">
        <Label>{m.event_templates_weekday_label()}</Label>
        <Select
          value={templateForm.weekday}
          onValueChange={(weekday) => {
            if (weekday !== null) {
              onWeekdayChange({ weekday });
            }
          }}
        >
          <SelectTrigger
            id="template-weekday-select"
            aria-label={m.event_templates_weekday_label()}
            data-testid="template-weekday-select"
            className="w-full"
          >
            <SelectValue placeholder={m.event_templates_weekday_placeholder()}>
              {selectedWeekdayLabel}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {([0, 1, 2, 3, 4, 5, 6] as const).map((index) => (
              <SelectItem
                key={index}
                value={String(index)}
                data-testid={`template-weekday-option-${index}`}
              >
                {formatWeekdayOfIndex({ index, locale: getLocale() })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="add-template-time-block-button"
          onClick={onAddBlock}
        >
          {m.event_templates_block_add()}
        </Button>
        <Button
          type="button"
          data-testid="create-template-button"
          className={submitButtonClassName}
          disabled={!canSave || pending}
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
        {actions}
      </div>
    </div>
  );
}
