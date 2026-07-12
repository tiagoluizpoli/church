import type {
  TimeWindowFilter,
  TimeWindowMode,
} from '../participation-tailoring.utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface TailoringFiltersProps {
  nameQuery: string;
  onNameQueryChange: (query: string) => void;
  timeWindowFilter: TimeWindowFilter;
  onTimeWindowFilterChange: (filter: TimeWindowFilter) => void;
}

/** Client-side name + time-window filter controls (FR-010) — narrows the
 * already-fetched slot list with zero network requests. The time filter is
 * one mode selector ("Starts" / "Ends" / "Between") paired with a single
 * shared start+end time range, applied per the selected mode. */
export function TailoringFilters({
  nameQuery,
  onNameQueryChange,
  timeWindowFilter,
  onTimeWindowFilterChange,
}: TailoringFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
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
        <Label htmlFor="tailoring-time-mode-filter">Time</Label>
        <div className="flex items-center gap-2">
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
              className="w-32 shrink-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starts">Starts</SelectItem>
              <SelectItem value="ends">Ends</SelectItem>
              <SelectItem value="within">Between</SelectItem>
            </SelectContent>
          </Select>
          <Input
            data-testid="tailoring-time-start-filter"
            type="time"
            aria-label="From"
            value={timeWindowFilter.start ?? ''}
            onChange={(event) =>
              onTimeWindowFilterChange({
                ...timeWindowFilter,
                start: event.target.value || undefined,
              })
            }
          />
          <span className="text-muted-foreground text-xs">and</span>
          <Input
            data-testid="tailoring-time-end-filter"
            type="time"
            aria-label="To"
            value={timeWindowFilter.end ?? ''}
            onChange={(event) =>
              onTimeWindowFilterChange({
                ...timeWindowFilter,
                end: event.target.value || undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
