import { m } from '@church/i18n/messages';
import {
  addCalendarDays,
  type CalendarDay,
  formatCalendarDay,
  weekdayIndex,
} from '@church/time';
import { Link } from '@tanstack/react-router';
import { TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type {
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { dayOf, formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';

export interface PrepareEventTimeBlockListProps {
  events: GetCycleParticipation200EventsItem[];
  ministryId: string;
  cycleId: string;
}

interface BlockSummaryInput {
  block: GetCycleParticipation200EventsItemEventTimeBlocksItem;
}

function blockSummary({ block }: BlockSummaryInput): string {
  if (!block.included) return m.prepare_not_served();
  if (block.shifts.some((shift) => shift.flagged))
    return m.prepare_needs_headcount();
  const shiftCount = block.shifts.length;
  const peopleCount = block.shifts.reduce(
    (total, shift) =>
      total +
      shift.requirements.reduce(
        (sum, requirement) => sum + requirement.peopleNeeded,
        0,
      ),
    0,
  );
  const shifts = pluralMessage({
    count: shiftCount,
    one: () => m.usual_setup_shift_count_one(),
    other: () => m.usual_setup_shift_count_other({ count: shiftCount }),
  });
  const people = pluralMessage({
    count: peopleCount,
    one: () => m.prepare_people_count_one(),
    other: () => m.prepare_people_count_other({ count: peopleCount }),
  });
  return m.prepare_row_summary({ shifts, people });
}

const DAYS_IN_WEEK = 7;

export function PrepareEventTimeBlockList({
  events,
  ministryId,
  cycleId,
}: PrepareEventTimeBlockListProps) {
  const { churchTimezone } = useTimezone();
  const rows = events.flatMap((event) =>
    event.eventTimeBlocks.map((block) => ({ event, block })),
  );
  rows.sort((left, right) => {
    const { startTime: leftStart, id: leftId } = left.block.eventTimeBlock;
    const { startTime: rightStart, id: rightId } = right.block.eventTimeBlock;
    return leftStart.localeCompare(rightStart) || leftId.localeCompare(rightId);
  });
  const weeks = new Map<CalendarDay, typeof rows>();
  for (const row of rows) {
    const { startTime } = row.block.eventTimeBlock;
    const day = dayOf({
      value: startTime,
      timeZone: churchTimezone,
    });
    const weekday = weekdayIndex({ day });
    const weekStart = addCalendarDays({ day, days: -weekday });
    const weekRows = weeks.get(weekStart) ?? [];
    weekRows.push(row);
    weeks.set(weekStart, weekRows);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...weeks].map(([weekStart, weekRows]) => {
        const weekEnd = addCalendarDays({
          day: weekStart,
          days: DAYS_IN_WEEK - 1,
        });
        const weekLabel = m.cycle_review_week({
          start: formatCalendarDay({ day: weekStart }),
          end: formatCalendarDay({ day: weekEnd }),
        });
        return (
          <section
            key={weekStart}
            aria-label={weekLabel}
            className="flex flex-col gap-2"
          >
            <h2 className="font-medium text-sm">{weekLabel}</h2>
            {weekRows.map(({ event, block }) => {
              const { id, startTime, endTime, label } = block.eventTimeBlock;
              return (
                <Link
                  key={id}
                  id={`event-time-block-${id}`}
                  data-testid={`prepare-event-time-block-row-${id}`}
                  to="/schedules/$ministryId/$cycleId/slots/$timeSlotId"
                  params={{ ministryId, cycleId, timeSlotId: id }}
                  className="radius-control flex min-h-11 flex-wrap items-center justify-between gap-3 border p-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="wrap-break-word font-medium">
                        {event.event.title}
                        {label ? ` · ${label}` : ''}
                      </span>
                      {!event.generatedFromTemplate ? (
                        <Badge variant="outline">{m.prepare_one_off()}</Badge>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-sm">
                      {formatInstantRangeOf({
                        start: startTime,
                        end: endTime,
                        timeZone: churchTimezone,
                      })}
                    </span>
                    {block.shiftsChangedAfterAsk ? (
                      <span className="text-muted-foreground text-sm">
                        {m.prepare_answers_coverage_note()}
                      </span>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-2 text-sm">
                    {block.included &&
                    block.shifts.some((shift) => shift.flagged) ? (
                      <TriangleAlertIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    ) : null}
                    {blockSummary({ block })}
                  </span>
                </Link>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
