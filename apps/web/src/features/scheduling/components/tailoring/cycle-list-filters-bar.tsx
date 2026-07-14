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
  CycleTailoringStatus,
  MinistryInvolvementFilter,
} from '@/features/scheduling/components/tailoring/cycle-list.utils';
import { cn } from '@/lib/utils';

export interface CycleListFilters {
  dateMode: CycleDateRangeMode;
  dateStart: string;
  dateEnd: string;
  involvement: MinistryInvolvementFilter;
  status: CycleTailoringStatus | 'all';
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
        <Label htmlFor="tailoring-cycle-date-mode-filter">Date range</Label>
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
              id="tailoring-cycle-date-mode-filter"
              data-testid="tailoring-cycle-date-mode-filter"
              className={cn(
                'w-32',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starts">Starts</SelectItem>
              <SelectItem value="ends">Ends</SelectItem>
              <SelectItem value="within">Within</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tailoring-cycle-date-start-filter">From</Label>
        <DatePickerField
          id="tailoring-cycle-date-start-filter"
          data-testid="tailoring-cycle-date-start-filter"
          value={draft.dateStart}
          onChange={(value) => setDraft({ ...draft, dateStart: value })}
          onClear={() => setDraft({ ...draft, dateStart: '' })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tailoring-cycle-date-end-filter">To</Label>
        <DatePickerField
          id="tailoring-cycle-date-end-filter"
          data-testid="tailoring-cycle-date-end-filter"
          value={draft.dateEnd}
          onChange={(value) => setDraft({ ...draft, dateEnd: value })}
          onClear={() => setDraft({ ...draft, dateEnd: '' })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="tailoring-cycle-involvement-filter">Involvement</Label>
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
              id="tailoring-cycle-involvement-filter"
              data-testid="tailoring-cycle-involvement-filter"
              className={cn(
                'w-36',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="part_of">Part of</SelectItem>
              <SelectItem value="not_part_of">Not part of</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tailoring-cycle-status-filter">Status</Label>
        <div className={isMobile ? 'h-11' : 'h-8'}>
          <Select
            value={draft.status}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                status: value as CycleTailoringStatus | 'all',
              })
            }
          >
            <SelectTrigger
              id="tailoring-cycle-status-filter"
              data-testid="tailoring-cycle-status-filter"
              className={cn(
                'w-36',
                isMobile && 'px-3 text-sm data-[size=default]:h-11',
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Button
          type="button"
          size={buttonSize}
          disabled={!isDirty}
          data-testid="tailoring-cycle-filters-apply"
          onClick={() => onApply(draft)}
        >
          Apply filters
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={buttonSize}
          disabled={!canClear}
          data-testid="tailoring-cycle-filters-clear"
          onClick={handleClear}
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}
