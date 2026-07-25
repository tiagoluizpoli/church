import { ChevronDownIcon, ChevronUpIcon, FilterIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  type DateMode,
  type DateSpanMode,
  weekdayLongName,
} from '../../../utils/builder/cycle-builder-date.utils';
import { DatePickerField } from '@/components/date-picker-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** `Label`'s type treatment for a `<legend>`, which names a group of controls. */
const GROUP_LABEL_CLASS =
  'flex select-none items-center gap-2 text-xs leading-none';

interface CycleBuilderDateFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventQuery: string;
  onEventQueryChange: (value: string) => void;
  dateMode: DateMode;
  onDateModeChange: (mode: DateMode) => void;
  dateSpanMode: DateSpanMode;
  onDateSpanModeChange: (mode: DateSpanMode) => void;
  rangeStart: string;
  onRangeStartChange: (value: string) => void;
  rangeEnd: string;
  onRangeEndChange: (value: string) => void;
  cycleStartDate: string;
  cycleEndDate: string;
  weekdayFilters: number[];
  weekday: number | null;
  onWeekdayChange: (weekday: number | null) => void;
  activeDateFilterCount: number;
  filtersAreDefault: boolean;
  onClearFilters: () => void;
  visibleDateCount: number;
  totalDateCount: number;
  /** Audit/publish controls — live here so they share the toolbar's row
   * instead of stretching the header for no reason. */
  actions?: ReactNode;
}

/**
 * The date-filter toolbar. Search and "Show" (event dates vs. all cycle
 * dates) stay visible — a leader touches those every session — while
 * everything date-shaped (span mode, range, weekday) folds behind one
 * disclosure that says how many of its filters are on, so a folded filter
 * still announces itself instead of silently hiding dates (B-4).
 */
export function CycleBuilderDateFilters({
  open,
  onOpenChange,
  eventQuery,
  onEventQueryChange,
  dateMode,
  onDateModeChange,
  dateSpanMode,
  onDateSpanModeChange,
  rangeStart,
  onRangeStartChange,
  rangeEnd,
  onRangeEndChange,
  cycleStartDate,
  cycleEndDate,
  weekdayFilters,
  weekday,
  onWeekdayChange,
  activeDateFilterCount,
  filtersAreDefault,
  onClearFilters,
  visibleDateCount,
  totalDateCount,
  actions,
}: CycleBuilderDateFiltersProps) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="space-y-3 border-b pb-3"
    >
      <section className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-1">
          <Label htmlFor="cycle-builder-event-search">Search events</Label>
          <Input
            id="cycle-builder-event-search"
            value={eventQuery}
            onChange={(event) => onEventQueryChange(event.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
            className="w-40"
          />
        </div>
        {/* A fieldset, not a `Label`: "Show" names a group of toggles, and a
            <label> that owns no control is announced with nothing attached
            to it (B-3). */}
        <fieldset className="space-y-1">
          <legend className={GROUP_LABEL_CLASS}>Show</legend>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={dateMode === 'event_dates' ? 'secondary' : 'ghost'}
              aria-pressed={dateMode === 'event_dates'}
              onClick={() => onDateModeChange('event_dates')}
            >
              Event dates
            </Button>
            <Button
              type="button"
              variant={dateMode === 'all_cycle_dates' ? 'secondary' : 'ghost'}
              aria-pressed={dateMode === 'all_cycle_dates'}
              onClick={() => onDateModeChange('all_cycle_dates')}
            >
              All cycle dates
            </Button>
          </div>
        </fieldset>
        <CollapsibleTrigger
          data-testid="cycle-builder-date-filters"
          render={<Button type="button" variant="outline" />}
        >
          <FilterIcon className="size-3.5" />
          Date filters
          {activeDateFilterCount > 0 ? (
            <Badge variant="secondary">{activeDateFilterCount}</Badge>
          ) : null}
          {open ? (
            <ChevronUpIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </CollapsibleTrigger>
        <div className="ml-auto flex items-end gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={filtersAreDefault}
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
          <span className="pb-1.5 text-muted-foreground text-xs">
            {visibleDateCount} of {totalDateCount} dates visible
          </span>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-end gap-2">{actions}</div>
        ) : null}
      </section>
      <CollapsibleContent className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cycle-builder-date-span-mode">Date range</Label>
            {/* No height-forcing wrapper: `SelectTrigger` now reads the
                surrounding `FormControlSizeProvider` like every other
                control on this row (B-7). */}
            <Select
              value={dateSpanMode}
              onValueChange={(value) => {
                if (
                  value === 'starts' ||
                  value === 'ends' ||
                  value === 'within'
                )
                  onDateSpanModeChange(value);
              }}
            >
              <SelectTrigger
                id="cycle-builder-date-span-mode"
                data-testid="cycle-builder-date-span-mode"
                className="w-32"
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
          <div className="space-y-1">
            <Label htmlFor="cycle-builder-date-start-filter">From</Label>
            <DatePickerField
              id="cycle-builder-date-start-filter"
              value={rangeStart}
              onChange={onRangeStartChange}
              placeholder="From"
              minDate={cycleStartDate}
              maxDate={cycleEndDate}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cycle-builder-date-end-filter">To</Label>
            <DatePickerField
              id="cycle-builder-date-end-filter"
              value={rangeEnd}
              onChange={onRangeEndChange}
              placeholder="To"
              minDate={cycleStartDate}
              maxDate={cycleEndDate}
            />
          </div>
        </div>
        {weekdayFilters.length > 0 ? (
          <fieldset className="space-y-1">
            <legend className={GROUP_LABEL_CLASS}>Repeats on</legend>
            <div className="flex flex-wrap gap-1">
              {weekdayFilters.map((day) => (
                <Button
                  key={day}
                  type="button"
                  variant={weekday === day ? 'secondary' : 'ghost'}
                  aria-pressed={weekday === day}
                  onClick={() => onWeekdayChange(weekday === day ? null : day)}
                >
                  {weekdayLongName({ weekday: day })}s
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
