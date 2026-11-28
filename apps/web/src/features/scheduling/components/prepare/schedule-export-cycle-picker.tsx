import { m } from '@church/i18n/messages';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ListScheduleExportCycles200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';
import { formatCalendarDateOnly } from '@/shared/utils/church-time';
import { exportApi } from '@/utils/api-instances';

export type ExportCycle = Pick<
  ListScheduleExportCycles200CyclesItem,
  'id' | 'name' | 'startDate' | 'endDate'
>;

interface UseExportCyclesInput {
  ministryId: string;
  q: string;
  enabled?: boolean;
}

/** The Ministry's Cycles with a Schedule, newest first, as the server searched them. */
function useExportCycles({
  ministryId,
  q,
  enabled = true,
}: UseExportCyclesInput) {
  return useQuery({
    queryKey: ['schedule-export-cycles', ministryId, q],
    queryFn: () =>
      exportApi.listScheduleExportCycles(ministryId, q ? { q } : undefined),
    placeholderData: keepPreviousData,
    enabled,
  });
}

interface CycleSpanInput {
  cycle: ExportCycle;
}

interface DaySpanInput {
  from: string;
  to: string;
}

/** Two CalendarDays as "01/01/2027 – 31/01/2027". */
export function daySpan({ from, to }: DaySpanInput): string {
  return `${formatCalendarDateOnly({ value: from })} – ${formatCalendarDateOnly({ value: to })}`;
}

export function cycleSpan({ cycle }: CycleSpanInput): string {
  return daySpan({ from: cycle.startDate, to: cycle.endDate });
}

interface ScheduleExportCyclePickerProps {
  ministryId: string;
  value: ExportCycle;
  onChange: (cycle: ExportCycle) => void;
}

/**
 * Ciclo: ‹ name › steps one Cycle; the name opens the server-searched list,
 * grouped by start year (#1246).
 */
export function ScheduleExportCyclePicker({
  ministryId,
  value,
  onChange,
}: ScheduleExportCyclePickerProps) {
  const [listOpen, setListOpen] = useState(false);
  const [q, setQ] = useState('');
  const all = useExportCycles({ ministryId, q: '' }).data?.cycles ?? [];
  const found = useExportCycles({ ministryId, q: q.trim(), enabled: listOpen });
  const index = all.findIndex((cycle) => cycle.id === value.id);
  // Newest first: the previous Cycle is the next one down the list.
  const previous = index >= 0 ? all[index + 1] : undefined;
  const next = index > 0 ? all[index - 1] : undefined;
  const choose = (cycle: ExportCycle) => {
    setListOpen(false);
    setQ('');
    onChange(cycle);
  };
  const years = new Map<string, ListScheduleExportCycles200CyclesItem[]>();
  for (const cycle of found.data?.cycles ?? []) {
    const year = cycle.startDate.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), cycle]);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={m.export_previous_cycle()}
          disabled={!previous}
          onClick={() => previous && choose(previous)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          className="min-w-0 flex-1 justify-center font-medium"
          aria-label={m.export_choose_cycle({ cycle: value.name })}
          aria-expanded={listOpen}
          onClick={() => setListOpen(!listOpen)}
        >
          <span className="truncate">{value.name}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={m.export_next_cycle()}
          disabled={!next}
          onClick={() => next && choose(next)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      {listOpen ? (
        <div className="space-y-2 rounded-md border p-2">
          <Input
            type="search"
            aria-label={m.export_search_cycles()}
            placeholder={m.export_search_cycles_placeholder()}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {found.data && years.size === 0 ? (
              <p className="px-2 py-1 text-muted-foreground text-sm">
                {m.export_no_cycles()}
              </p>
            ) : null}
            {[...years].map(([year, cycles]) => (
              <section key={year}>
                <h3 className="px-2 font-medium text-muted-foreground text-xs">
                  {year}
                </h3>
                <ul aria-label={year}>
                  {cycles.map((cycle) => (
                    <li key={cycle.id}>
                      <Button
                        variant={cycle.id === value.id ? 'secondary' : 'ghost'}
                        className="h-auto w-full justify-between gap-2 py-1.5"
                        onClick={() => choose(cycle)}
                      >
                        <span className="truncate">{cycle.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                          {cycleSpan({ cycle })}
                          {cycle.isCurrent ? (
                            <Badge variant="outline">
                              {m.export_current_cycle()}
                            </Badge>
                          ) : null}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
