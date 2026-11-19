import { m } from '@church/i18n/messages';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import type {
  TimeWindowFilter,
  TimeWindowMode,
} from '../participation-prepare.utils';
import { InfoHint } from './info-hint';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';

export interface PrepareFiltersProps {
  needsAttention?: boolean;
  onNeedsAttentionChange?: (value: boolean) => void;
  nameQuery: string;
  onNameQueryChange: (query: string) => void;
  timeWindowFilter: TimeWindowFilter;
  onTimeWindowFilterChange: (filter: TimeWindowFilter) => void;
  /** Closes the filter row, e.g. a hint about the list below. */
  trailing?: ReactNode;
}

type NameFilterProps = Pick<
  PrepareFiltersProps,
  'nameQuery' | 'onNameQueryChange'
>;

/** Its own component: a keystroke re-renders this field, not the time controls beside it. */
function NameFilter({ nameQuery, onNameQueryChange }: NameFilterProps) {
  // Typing stays local; the URL (and the read) change once typing pauses.
  const { search, setSearch, commitNow } = useDebouncedSearch({
    committed: nameQuery,
    onCommit: (commit) => onNameQueryChange(commit.search ?? ''),
  });
  return (
    // Narrow enough to share one line with the time and attention controls beside an open block, so opening one never re-wraps the row above the list.
    <div className="@lg:min-w-40 min-w-0 flex-1 space-y-1">
      <Label htmlFor="prepare-name-filter">{m.prepare_filter_name()}</Label>
      <Input
        id="prepare-name-filter"
        data-testid="prepare-name-filter"
        placeholder={m.prepare_filter_name_placeholder()}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        // Leaving the field (e.g. to open a block) commits at once, so no late commit races it.
        onBlur={() => {
          if (search.trim() !== nameQuery) commitNow();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitNow();
        }}
      />
    </div>
  );
}

function PrepareFiltersView({
  needsAttention = false,
  onNeedsAttentionChange,
  nameQuery,
  onNameQueryChange,
  timeWindowFilter,
  onTimeWindowFilterChange,
  trailing,
}: PrepareFiltersProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      {/* One row on a wide column; in a narrowed one the name takes its own line. */}
      <div className="flex @lg:flex-row flex-col @lg:flex-wrap @lg:items-end gap-3">
        <NameFilter
          nameQuery={nameQuery}
          onNameQueryChange={onNameQueryChange}
        />

        <div className="space-y-1">
          <Label htmlFor="prepare-time-mode-filter">
            {m.prepare_filter_time()}
          </Label>
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
                id="prepare-time-mode-filter"
                data-testid="prepare-time-mode-filter"
                className={cn(
                  'w-auto min-w-32 shrink-0',
                  isMobile && 'px-3 text-sm data-[size=default]:h-11',
                )}
              >
                <SelectValue>
                  {timeWindowFilter.mode === 'starts'
                    ? m.prepare_filter_starts()
                    : timeWindowFilter.mode === 'ends'
                      ? m.prepare_filter_ends()
                      : m.prepare_filter_between()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="starts">
                    {m.prepare_filter_starts()}
                  </SelectItem>
                  <SelectItem value="ends">
                    {m.prepare_filter_ends()}
                  </SelectItem>
                  <SelectItem value="within">
                    {m.prepare_filter_between()}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                <TimeOfDayField
                  aria-label={m.prepare_filter_from()}
                  data-testid="prepare-time-start-filter"
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
                  size="icon-touch"
                  aria-label={m.prepare_filter_clear_from()}
                  data-testid="prepare-time-start-filter-clear"
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
                {m.prepare_filter_and()}
              </span>
              <div className="min-w-0 flex-1">
                <TimeOfDayField
                  aria-label={m.prepare_filter_to()}
                  data-testid="prepare-time-end-filter"
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
                  size="icon-touch"
                  aria-label={m.prepare_filter_clear_to()}
                  data-testid="prepare-time-end-filter-clear"
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
        <div className="flex items-center gap-1">
          {/* Without a handler (nothing needs attention) the switch would only ever find nothing. */}
          {onNeedsAttentionChange ? (
            <>
              <Label className="flex min-h-11 items-center gap-2 whitespace-nowrap md:min-h-8">
                <Switch
                  checked={needsAttention}
                  onCheckedChange={onNeedsAttentionChange}
                />
                {m.prepare_needs_attention_filter()}
              </Label>
              <InfoHint label={m.prepare_attention_help_label()}>
                {m.prepare_attention_help()}
              </InfoHint>
            </>
          ) : null}
          {trailing}
        </div>
      </div>
    </FormControlSizeProvider>
  );
}

/** Memoised: the prepare page re-renders on every filter change. */
export const PrepareFilters = memo(PrepareFiltersView);
