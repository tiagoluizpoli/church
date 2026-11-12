import { m } from '@church/i18n/messages';
import { useEffect, useState } from 'react';
import { DatePickerField } from '@/components/date-picker-field';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CycleDateRangeMode,
  CyclePrepareStatus,
  MinistryInvolvementFilter,
} from '@/features/scheduling/components/prepare/cycle-list.utils';
import { cn } from '@/lib/utils';

export interface CycleListFilters {
  dateMode: CycleDateRangeMode;
  dateStart: string;
  dateEnd: string;
  involvement: MinistryInvolvementFilter;
  status: CyclePrepareStatus | 'all';
}

export const DEFAULT_FILTERS: CycleListFilters = {
  dateMode: 'starts',
  dateStart: '',
  dateEnd: '',
  involvement: 'all',
  status: 'all',
};

interface FiltersEqualInput {
  left: CycleListFilters;
  right: CycleListFilters;
}

function filtersEqual({ left, right }: FiltersEqualInput): boolean {
  return (
    left.dateMode === right.dateMode &&
    left.dateStart === right.dateStart &&
    left.dateEnd === right.dateEnd &&
    left.involvement === right.involvement &&
    left.status === right.status
  );
}

export interface CycleListFiltersBarProps {
  appliedFilters: CycleListFilters;
  onApply: (filters: CycleListFilters) => void;
}

/** FR-033: date-range/involvement/status filters, combining with AND
 * semantics via `filterCycleSummaries`. The date range is composed from two
 * `DatePickerField` instances (research.md's cited single-date picker) —
 * no shared date-range component exists in this codebase (verified via
 * grep, post-`/speckit-analyze` finding U2), so building one from scratch
 * wasn't warranted for this single use site.
 *
 * Design-critique follow-up: filters are a local draft, not applied on
 * every change — the leader sets everything then hits "Apply filters"
 * (disabled while the draft matches what's already applied), instead of
 * firing a request per keystroke/selection. Each date field carries its
 * own clear control; "Clear filters" resets and re-applies the default
 * (empty) filter set in one action, distinct from an unsaved draft edit. */
export function CycleListFiltersBar({
  appliedFilters,
  onApply,
}: CycleListFiltersBarProps) {
  const isMobile = useFormControlSize() === 'touch';
  const [draft, setDraft] = useState<CycleListFilters>(appliedFilters);

  // Re-sync the draft whenever the applied filters change from outside this
  // bar (page-level "Clear filters" in the empty state, browser back/forward).
  useEffect(() => {
    setDraft(appliedFilters);
  }, [appliedFilters]);

  const isDirty = !filtersEqual({ left: draft, right: appliedFilters });
  const canClear =
    !filtersEqual({ left: draft, right: DEFAULT_FILTERS }) ||
    !filtersEqual({ left: appliedFilters, right: DEFAULT_FILTERS });
  const buttonSize = isMobile ? 'touch' : 'default';

  const handleClear = () => {
    setDraft(DEFAULT_FILTERS);
    onApply(DEFAULT_FILTERS);
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <div className="space-y-1">
        <Label htmlFor="prepare-cycle-date-mode-filter">
          {m.builder_ui_date_range()}
        </Label>
        {/* base-ui's Select renders a visually-hidden native `<input>`
         * (form/autofill semantics) as a direct sibling of the trigger —
         * clipped, not `display:none`, so it still occupies normal-flow
         * height (taller than the visible trigger) and was inflating
         * this column past the date-picker columns, which have no such
         * hidden sibling, pushing them down under `items-end`. An
         * explicit-height wrapper caps this column's contribution to
         * the trigger's own real height regardless of that overflow. */}
        <div className={isMobile ? 'h-11' : 'h-8'}>
          <Select
            value={draft.dateMode}
            onValueChange={(value) =>
              setDraft({ ...draft, dateMode: value as CycleDateRangeMode })
            }
          >
            <SelectTrigger
              id="prepare-cycle-date-mode-filter"
              data-testid="prepare-cycle-date-mode-filter"
              className={cn(
                'w-32',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue>
                {
                  {
                    starts: m.builder_ui_starts(),
                    ends: m.builder_ui_ends(),
                    within: m.builder_ui_within(),
                  }[draft.dateMode]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starts">{m.builder_ui_starts()}</SelectItem>
              <SelectItem value="ends">{m.builder_ui_ends()}</SelectItem>
              <SelectItem value="within">{m.builder_ui_within()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="prepare-cycle-date-start-filter">
          {m.builder_ui_from()}
        </Label>
        <DatePickerField
          id="prepare-cycle-date-start-filter"
          data-testid="prepare-cycle-date-start-filter"
          value={draft.dateStart}
          onChange={(value) => setDraft({ ...draft, dateStart: value })}
          onClear={() => setDraft({ ...draft, dateStart: '' })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="prepare-cycle-date-end-filter">
          {m.builder_ui_to()}
        </Label>
        <DatePickerField
          id="prepare-cycle-date-end-filter"
          data-testid="prepare-cycle-date-end-filter"
          value={draft.dateEnd}
          onChange={(value) => setDraft({ ...draft, dateEnd: value })}
          onClear={() => setDraft({ ...draft, dateEnd: '' })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="prepare-cycle-involvement-filter">
          {m.prepare_cycle_filter_involvement()}
        </Label>
        <div className={isMobile ? 'h-11' : 'h-8'}>
          <Select
            value={draft.involvement}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                involvement: value as MinistryInvolvementFilter,
              })
            }
          >
            <SelectTrigger
              id="prepare-cycle-involvement-filter"
              data-testid="prepare-cycle-involvement-filter"
              className={cn(
                'w-36',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue>
                {
                  {
                    all: m.prepare_cycle_filter_all(),
                    ['part_of']: m.prepare_cycle_filter_part_of(),
                    ['not_part_of']: m.prepare_cycle_filter_not_part_of(),
                  }[draft.involvement]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {m.prepare_cycle_filter_all()}
              </SelectItem>
              <SelectItem value="part_of">
                {m.prepare_cycle_filter_part_of()}
              </SelectItem>
              <SelectItem value="not_part_of">
                {m.prepare_cycle_filter_not_part_of()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="prepare-cycle-status-filter">
          {m.cycles_column_status()}
        </Label>
        <div className={isMobile ? 'h-11' : 'h-8'}>
          <Select
            value={draft.status}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                status: value as CyclePrepareStatus | 'all',
              })
            }
          >
            <SelectTrigger
              id="prepare-cycle-status-filter"
              data-testid="prepare-cycle-status-filter"
              className={cn(
                'w-36',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue>
                {
                  {
                    all: m.prepare_cycle_filter_all(),
                    ['not_started']: m.prepare_cycle_status_not_started(),
                    ['in_progress']: m.prepare_cycle_status_in_progress(),
                    published: m.schedules_published(),
                  }[draft.status]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {m.prepare_cycle_filter_all()}
              </SelectItem>
              <SelectItem value="not_started">
                {m.prepare_cycle_status_not_started()}
              </SelectItem>
              <SelectItem value="in_progress">
                {m.prepare_cycle_status_in_progress()}
              </SelectItem>
              <SelectItem value="published">
                {m.schedules_published()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Button
          type="button"
          size={buttonSize}
          disabled={!isDirty}
          data-testid="prepare-cycle-filters-apply"
          onClick={() => onApply(draft)}
        >
          {m.prepare_cycle_filter_apply()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={buttonSize}
          disabled={!canClear}
          data-testid="prepare-cycle-filters-clear"
          onClick={handleClear}
        >
          {m.builder_ui_clear_filters()}
        </Button>
      </div>
    </div>
  );
}
