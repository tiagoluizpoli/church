import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import { formatWeekdayOfIndex } from '@church/time';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { TemplateRecurrence } from './planning-admin.types';
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

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Entry = Extract<
  TemplateRecurrence,
  { kind: 'monthly' }
>['entries'][number];
type Ordinal = Extract<Entry, { kind: 'nthWeekday' }>['ordinal'];

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const ORDINALS: readonly Ordinal[] = [1, 2, 3, 4, 5, 'last'];
const FIRST_DAY_OF_MONTH = 1;
const LAST_POSSIBLE_DAY_OF_MONTH = 31;
const DEFAULT_ENTRY: Entry = { kind: 'nthWeekday', ordinal: 1, weekday: 0 };
const NEW_ENTRIES: Record<Entry['kind'], Entry> = {
  nthWeekday: DEFAULT_ENTRY,
  dayOfMonth: { kind: 'dayOfMonth', day: 1 },
  lastDayOfMonth: { kind: 'lastDayOfMonth' },
};

function entryTypeLabel(kind: Entry['kind']) {
  return {
    nthWeekday: m.event_templates_recurrence_entry_nth_weekday(),
    dayOfMonth: m.event_templates_recurrence_entry_day_of_month(),
    lastDayOfMonth: m.event_templates_recurrence_entry_last_day(),
  }[kind];
}

function ordinalLabel(ordinal: Ordinal) {
  return {
    1: m.recurrence_ordinal_1_m(),
    2: m.recurrence_ordinal_2_m(),
    3: m.recurrence_ordinal_3_m(),
    4: m.recurrence_ordinal_4_m(),
    5: m.recurrence_ordinal_5_m(),
    last: m.recurrence_ordinal_last_m(),
  }[ordinal];
}

interface EntryChangeInput {
  index: number;
  entry: Entry;
}

interface EntryRemoveInput {
  index: number;
}

export interface RecurrenceChangeInput {
  recurrence: TemplateRecurrence;
}

export interface RecurrenceEditorProps {
  recurrence: TemplateRecurrence;
  onChange: (input: RecurrenceChangeInput) => void;
}

interface EntryRowProps {
  entry: Entry;
  index: number;
  canRemove: boolean;
  onEntryChange: (input: EntryChangeInput) => void;
  onRemove: (input: EntryRemoveInput) => void;
}

function weekdayLabel(weekday: Weekday) {
  return formatWeekdayOfIndex({ index: weekday, locale: getLocale() });
}

function EntryRow({
  entry,
  index,
  canRemove,
  onEntryChange,
  onRemove,
}: EntryRowProps) {
  const testId = `template-recurrence-entry-${index}`;

  return (
    <div className="flex flex-wrap items-end gap-2" data-testid={testId}>
      <div className="space-y-1">
        <Label>{m.event_templates_recurrence_entry_type_label()}</Label>
        <Select
          value={entry.kind}
          onValueChange={(kind) => {
            if (kind !== null) {
              onEntryChange({
                index,
                entry: NEW_ENTRIES[kind as Entry['kind']],
              });
            }
          }}
        >
          <SelectTrigger
            aria-label={m.event_templates_recurrence_entry_type_label()}
            data-testid={`${testId}-type`}
          >
            <SelectValue>{entryTypeLabel(entry.kind)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(NEW_ENTRIES) as Entry['kind'][]).map((kind) => (
              <SelectItem
                key={kind}
                value={kind}
                data-testid={`${testId}-type-${kind}`}
              >
                {entryTypeLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {entry.kind === 'nthWeekday' ? (
        <>
          <div className="space-y-1">
            <Label>{m.event_templates_recurrence_ordinal_label()}</Label>
            <Select
              value={String(entry.ordinal)}
              onValueChange={(value) => {
                const ordinal = ORDINALS.find((o) => String(o) === value);
                if (ordinal !== undefined) {
                  onEntryChange({ index, entry: { ...entry, ordinal } });
                }
              }}
            >
              <SelectTrigger
                aria-label={m.event_templates_recurrence_ordinal_label()}
                data-testid={`${testId}-ordinal`}
              >
                <SelectValue>{ordinalLabel(entry.ordinal)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ORDINALS.map((ordinal) => (
                  <SelectItem
                    key={ordinal}
                    value={String(ordinal)}
                    data-testid={`${testId}-ordinal-${ordinal}`}
                  >
                    {ordinalLabel(ordinal)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{m.event_templates_weekday_label()}</Label>
            <Select
              value={String(entry.weekday)}
              onValueChange={(value) => {
                const weekday = WEEKDAYS.find((w) => String(w) === value);
                if (weekday !== undefined) {
                  onEntryChange({ index, entry: { ...entry, weekday } });
                }
              }}
            >
              <SelectTrigger
                aria-label={m.event_templates_weekday_label()}
                data-testid={`${testId}-weekday`}
              >
                <SelectValue>{weekdayLabel(entry.weekday)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((weekday) => (
                  <SelectItem
                    key={weekday}
                    value={String(weekday)}
                    data-testid={`${testId}-weekday-${weekday}`}
                  >
                    {weekdayLabel(weekday)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}
      {entry.kind === 'dayOfMonth' ? (
        <div className="space-y-1">
          <Label>{m.event_templates_recurrence_day_label()}</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={FIRST_DAY_OF_MONTH}
            max={LAST_POSSIBLE_DAY_OF_MONTH}
            className="w-20"
            aria-label={m.event_templates_recurrence_day_label()}
            data-testid={`${testId}-day`}
            value={entry.day}
            onChange={(event) => {
              const typed = Number.parseInt(event.target.value, 10);
              const day = Number.isNaN(typed)
                ? FIRST_DAY_OF_MONTH
                : Math.min(
                    LAST_POSSIBLE_DAY_OF_MONTH,
                    Math.max(FIRST_DAY_OF_MONTH, typed),
                  );
              onEntryChange({ index, entry: { kind: 'dayOfMonth', day } });
            }}
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canRemove}
        aria-label={m.event_templates_recurrence_remove_entry()}
        data-testid={`${testId}-remove`}
        onClick={() => onRemove({ index })}
      >
        <Trash2Icon aria-hidden />
      </Button>
    </div>
  );
}

export function RecurrenceEditor({
  recurrence,
  onChange,
}: RecurrenceEditorProps) {
  const kindLabels = {
    weekly: m.event_templates_recurrence_kind_weekly(),
    monthly: m.event_templates_recurrence_kind_monthly(),
  };

  return (
    <div className="space-y-3" data-testid="template-recurrence-editor">
      <div className="space-y-1">
        <Label>{m.event_templates_recurrence_kind_label()}</Label>
        <Select
          value={recurrence.kind}
          onValueChange={(kind) => {
            if (kind === recurrence.kind) {
              return;
            }
            onChange({
              recurrence:
                kind === 'monthly'
                  ? { kind: 'monthly', entries: [DEFAULT_ENTRY] }
                  : { kind: 'weekly', weekdays: [0] },
            });
          }}
        >
          <SelectTrigger
            aria-label={m.event_templates_recurrence_kind_label()}
            data-testid="template-recurrence-kind"
            className="w-full"
          >
            <SelectValue>{kindLabels[recurrence.kind]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="weekly"
              data-testid="template-recurrence-kind-weekly"
            >
              {kindLabels.weekly}
            </SelectItem>
            <SelectItem
              value="monthly"
              data-testid="template-recurrence-kind-monthly"
            >
              {kindLabels.monthly}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {recurrence.kind === 'weekly' ? (
        <fieldset className="space-y-1">
          <legend className="font-medium text-sm">
            {m.event_templates_recurrence_weekdays_label()}
          </legend>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((weekday) => {
              const picked = recurrence.weekdays.includes(weekday);
              const isOnlyPicked = picked && recurrence.weekdays.length === 1;
              return (
                <Button
                  key={weekday}
                  type="button"
                  size="sm"
                  variant={picked ? 'default' : 'outline'}
                  aria-pressed={picked}
                  disabled={isOnlyPicked}
                  data-testid={`template-weekday-toggle-${weekday}`}
                  onClick={() =>
                    onChange({
                      recurrence: {
                        kind: 'weekly',
                        weekdays: picked
                          ? recurrence.weekdays.filter((w) => w !== weekday)
                          : [...recurrence.weekdays, weekday],
                      },
                    })
                  }
                >
                  {weekdayLabel(weekday)}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <div className="space-y-2">
          <Label>{m.event_templates_recurrence_entries_label()}</Label>
          {recurrence.entries.map((entry, index) => (
            <EntryRow
              // biome-ignore lint/suspicious/noArrayIndexKey: entries have no identity beyond their position
              key={index}
              entry={entry}
              index={index}
              canRemove={recurrence.entries.length > 1}
              onEntryChange={({ index: at, entry: next }) =>
                onChange({
                  recurrence: {
                    kind: 'monthly',
                    entries: recurrence.entries.map((e, i) =>
                      i === at ? next : e,
                    ),
                  },
                })
              }
              onRemove={({ index: at }) =>
                onChange({
                  recurrence: {
                    kind: 'monthly',
                    entries: recurrence.entries.filter((_, i) => i !== at),
                  },
                })
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="template-recurrence-add-entry"
            onClick={() =>
              onChange({
                recurrence: {
                  kind: 'monthly',
                  entries: [...recurrence.entries, DEFAULT_ENTRY],
                },
              })
            }
          >
            <PlusIcon aria-hidden />
            {m.event_templates_recurrence_add_entry()}
          </Button>
        </div>
      )}
    </div>
  );
}
