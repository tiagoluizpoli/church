import { m } from '@church/i18n/messages';
import type { Instant } from '@church/time';
import type { ReactNode } from 'react';
import type {
  EventBlockErrors,
  EventEditorBlock,
  EventSaveRefusal,
} from './event-editor.utils';
import type { EventEditorFields } from './use-event-form';
import { InstantField } from '@/components/instant-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface EventEditorFormProps extends EventEditorFields {
  pending: boolean;
  onSave: () => void;
  /** Rendered beside Save (e.g. Cancel). */
  actions?: ReactNode;
}

/** What a create or edit hook hands the editor. */
export type EventEditorState = Omit<EventEditorFormProps, 'actions'>;

interface FieldErrorProps {
  id: string;
  message: string | undefined;
}

function FieldError({ id, message }: FieldErrorProps) {
  return message ? (
    <p id={id} className="text-destructive text-xs" data-testid={id}>
      {message}
    </p>
  ) : null;
}

interface EventInstantFieldProps {
  id: string;
  label: string;
  value: Instant;
  timeZone: string;
  error: string | undefined;
  onChange: (value: Instant) => void;
}

function EventInstantField({
  id,
  label,
  value,
  timeZone,
  error,
  onChange,
}: EventInstantFieldProps) {
  return (
    <div className="space-y-1">
      <Label id={`${id}-label`} htmlFor={`${id}-date`}>
        {label}
      </Label>
      <InstantField
        idPrefix={id}
        value={value}
        timeZone={timeZone}
        data-testid={id}
        aria-labelledby={`${id}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={onChange}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

interface RowErrorsInput {
  index: number;
  clientErrors: EventBlockErrors | undefined;
  refusal: EventSaveRefusal | null;
}

/** The client rule wins; otherwise a server refusal naming this row. */
function rowErrors({
  index,
  clientErrors,
  refusal,
}: RowErrorsInput): EventBlockErrors {
  const target = refusal?.target;
  const refused = target?.kind === 'block' && target.index === index;
  return {
    label:
      clientErrors?.label ??
      (refused && target.part === 'label' ? refusal?.message : undefined),
    time:
      clientErrors?.time ??
      (refused && target.part === 'time' ? refusal?.message : undefined),
  };
}

interface EventBlockRowProps {
  block: EventEditorBlock;
  index: number;
  totalBlocks: number;
  errors: EventBlockErrors;
  timeZone: string;
  onBlockChange: EventEditorFields['onBlockChange'];
  onRemoveBlock: EventEditorFields['onRemoveBlock'];
}

function EventBlockRow({
  block,
  index,
  totalBlocks,
  errors,
  timeZone,
  onBlockChange,
  onRemoveBlock,
}: EventBlockRowProps) {
  const number = index + 1;
  const id = `event-block-${number}`;
  return (
    <fieldset
      className="surface-subtle workspace-panel space-y-2"
      data-testid="event-time-block-row"
    >
      <div className="flex items-center justify-between gap-3">
        <legend className="font-medium text-sm">
          {m.event_editor_block_title({ number })}
        </legend>
        {totalBlocks > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemoveBlock({ blockKey: block.key })}
          >
            {m.event_editor_block_remove({ number })}
          </Button>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-label-input`}>
          {m.event_editor_block_label()}
        </Label>
        <Input
          id={`${id}-label-input`}
          value={block.label}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={errors.label ? `${id}-label-error` : undefined}
          onChange={(event) =>
            onBlockChange({
              blockKey: block.key,
              field: 'label',
              value: event.target.value,
            })
          }
        />
        <FieldError id={`${id}-label-error`} message={errors.label} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <EventInstantField
          id={`${id}-start`}
          label={m.event_editor_start_label()}
          value={block.start}
          timeZone={timeZone}
          error={errors.time}
          onChange={(value) =>
            onBlockChange({ blockKey: block.key, field: 'start', value })
          }
        />
        <EventInstantField
          id={`${id}-end`}
          label={m.event_editor_end_label()}
          value={block.end}
          timeZone={timeZone}
          error={errors.time}
          onChange={(value) =>
            onBlockChange({ blockKey: block.key, field: 'end', value })
          }
        />
      </div>
    </fieldset>
  );
}

/** Title, optional location, explicit bounds, then labelled Time block rows. */
export function EventEditorForm({
  form,
  errors,
  refusal,
  canSave,
  timeZone,
  pending,
  onEventChange,
  onBlockChange,
  onRemoveBlock,
  onAddBlock,
  onSave,
  actions,
}: EventEditorFormProps) {
  const refusedField = (kind: 'start' | 'end' | 'form') =>
    refusal?.target.kind === kind ? refusal.message : undefined;
  const formError = errors.form ?? refusedField('form');

  return (
    <form
      className="space-y-4"
      data-testid="event-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="event-title">{m.event_editor_title_label()}</Label>
        <Input
          id="event-title"
          value={form.title}
          placeholder={m.event_editor_title_placeholder()}
          onChange={(event) =>
            onEventChange({ field: 'title', value: event.target.value })
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="event-location">
          {m.event_editor_location_label()}
        </Label>
        <Input
          id="event-location"
          value={form.location}
          onChange={(event) =>
            onEventChange({ field: 'location', value: event.target.value })
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <EventInstantField
          id="event-start"
          label={m.event_editor_start_label()}
          value={form.start}
          timeZone={timeZone}
          error={errors.start ?? refusedField('start')}
          onChange={(value) => onEventChange({ field: 'start', value })}
        />
        <EventInstantField
          id="event-end"
          label={m.event_editor_end_label()}
          value={form.end}
          timeZone={timeZone}
          error={errors.end ?? refusedField('end')}
          onChange={(value) => onEventChange({ field: 'end', value })}
        />
      </div>

      <section className="space-y-3" aria-labelledby="event-blocks-heading">
        <div className="space-y-1">
          <h3 id="event-blocks-heading" className="font-medium text-sm">
            {m.event_editor_blocks_heading()}
          </h3>
          <p className="text-muted-foreground text-xs">
            {m.event_editor_blocks_help()}
          </p>
        </div>
        {form.blocks.map((block, index) => (
          <EventBlockRow
            key={block.key}
            block={block}
            index={index}
            totalBlocks={form.blocks.length}
            errors={rowErrors({
              index,
              clientErrors: errors.blocks.get(block.key),
              refusal,
            })}
            timeZone={timeZone}
            onBlockChange={onBlockChange}
            onRemoveBlock={onRemoveBlock}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={onAddBlock}>
          {m.event_editor_block_add()}
        </Button>
      </section>

      {formError ? (
        <p
          className="text-destructive text-sm"
          role="alert"
          data-testid="event-form-error"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave || pending}>
          {pending ? m.event_editor_saving() : m.event_editor_create_submit()}
        </Button>
        {actions}
      </div>
    </form>
  );
}
