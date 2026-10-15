import { XIcon } from 'lucide-react';
import type {
  TimeWindowFilter,
  TimeWindowMode,
} from '../participation-tailoring.utils';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export interface TailoringFiltersProps {
  nameQuery: string;
  onNameQueryChange: (query: string) => void;
  timeWindowFilter: TimeWindowFilter;
  onTimeWindowFilterChange: (filter: TimeWindowFilter) => void;
}

/** Client-side name + time-window filter controls (FR-010) — narrows the
 * already-fetched slot list with zero network requests. The time filter is
 * one mode selector ("Starts" / "Ends" / "Between") paired with a single
 * shared start+end time range, applied per the selected mode. Promotes its
 * own controls to touch sizing below `md` (self-contained, matching
 * `TailoringSlotList`'s own responsiveness, since this bar isn't wrapped by
 * that component's `FormControlSizeProvider`); the time-range pair wraps to
 * its own line under the mode select instead of overflowing on narrow
 * phones, where three inline controls plus a fixed-width select don't fit. */
export function TailoringFilters({
  nameQuery,
  onNameQueryChange,
  timeWindowFilter,
  onTimeWindowFilterChange,
}: TailoringFiltersProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="tailoring-name-filter">Filter by name</Label>
          <Input
            id="tailoring-name-filter"
            data-testid="tailoring-name-filter"
            placeholder="Slot or event name"
            value={nameQuery}
            onChange={(event) => onNameQueryChange(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="tailoring-time-mode-filter">Filter by time</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={timeWindowFilter.mode}
              onValueChange={(value) =>
                onTimeWindowFilterChange({
                  ...timeWindowFilter,
                  mode: value as TimeWindowMode,
                })
              }
            >
              <SelectTrigger
                id="tailoring-time-mode-filter"
                data-testid="tailoring-time-mode-filter"
                className={cn(
                  'w-32 shrink-0',
                  isMobile && 'px-3 text-sm data-[size=default]:h-11',
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starts">Starts</SelectItem>
                <SelectItem value="ends">Ends</SelectItem>
                <SelectItem value="within">Between</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                <TimeOfDayField
                  aria-label="From"
                  data-testid="tailoring-time-start-filter"
                  value={timeWindowFilter.start ?? null}
                  onChange={(value) =>
                    onTimeWindowFilterChange({
                      ...timeWindowFilter,
                      start: value,
                    })
                  }
                />
              </div>
              {timeWindowFilter.start ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear from time"
                  data-testid="tailoring-time-start-filter-clear"
                  onClick={() =>
                    onTimeWindowFilterChange({
                      ...timeWindowFilter,
                      start: undefined,
                    })
                  }
                >
                  <XIcon />
                </Button>
              ) : null}
              <span className="shrink-0 text-muted-foreground text-xs">
                and
              </span>
              <div className="min-w-0 flex-1">
                <TimeOfDayField
                  aria-label="To"
                  data-testid="tailoring-time-end-filter"
                  value={timeWindowFilter.end ?? null}
                  onChange={(value) =>
                    onTimeWindowFilterChange({
                      ...timeWindowFilter,
                      end: value,
                    })
                  }
                />
              </div>
              {timeWindowFilter.end ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear to time"
                  data-testid="tailoring-time-end-filter-clear"
                  onClick={() =>
                    onTimeWindowFilterChange({
                      ...timeWindowFilter,
                      end: undefined,
                    })
                  }
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </FormControlSizeProvider>
  );
}
