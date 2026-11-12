import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';

export interface ScheduleRowsProps {
  schedules: ListSchedules200SchedulesItem[];
  /** Home: name what is outstanding (unanswered, unfilled) instead of the bare stage. */
  showOutstanding?: boolean;
  /** Text stays selectable; only the row-end Open link navigates. */
  explicitAction?: boolean;
}

export function swapRequestCountLabel(count: number): string {
  return count === 1
    ? m.schedules_swap_request_one()
    : m.schedules_swap_requests_other({ count });
}

interface StageLabelInput {
  row: ListSchedules200SchedulesItem;
  showOutstanding: boolean;
}

function stageLabel({ row, showOutstanding }: StageLabelInput): string {
  const { stage, asking, gapCount, affectedVolunteerCount } = row;
  switch (stage) {
    case 'to_prepare':
      return m.schedules_to_prepare();
    case 'asking': {
      if (!asking) return m.schedules_asking_stage();
      if (!showOutstanding) return m.schedules_asking(asking);
      const unanswered = asking.asked - asking.confirmed;
      return m.schedules_asking_outstanding({ count: unanswered });
    }
    case 'assigning':
      return showOutstanding
        ? m.schedules_assigning_gaps({ count: gapCount })
        : m.schedules_assigning();
    case 'published':
      return affectedVolunteerCount > 0
        ? m.schedules_unsent({ count: affectedVolunteerCount })
        : m.schedules_published();
    case 'not_serving':
      return m.schedules_not_serving();
  }
}

/** Stage label; Home also shows the open Swap request count on any stage, the Schedules list only on published rows. */
function rowLabel({ row, showOutstanding }: StageLabelInput): string {
  const label = stageLabel({ row, showOutstanding });
  const { openSwapRequestCount, stage } = row;
  const showsSwapCount = showOutstanding || stage === 'published';
  return showsSwapCount && openSwapRequestCount > 0
    ? `${label} · ${swapRequestCountLabel(openSwapRequestCount)}`
    : label;
}

export function ScheduleRows({
  schedules,
  showOutstanding = false,
  explicitAction = false,
}: ScheduleRowsProps) {
  return (
    <ul className="grid gap-2">
      {schedules.map((row) => {
        const title = `${row.ministry.name} · ${row.cycle.name}`;
        const status = (
          <span className="flex items-center gap-2">
            {row.lateMarkCount > 0 ? (
              <Badge
                variant="outline"
                aria-label={m.schedule_late_mark_count({
                  count: row.lateMarkCount,
                })}
              >
                ⚠ {row.lateMarkCount}
              </Badge>
            ) : null}
            <Badge variant="secondary">
              {rowLabel({ row, showOutstanding })}
            </Badge>
          </span>
        );
        const params = { ministryId: row.ministry.id, cycleId: row.cycle.id };
        return (
          <li key={`${row.ministry.id}:${row.cycle.id}`}>
            {explicitAction ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <span>{title}</span>
                {status}
                <div className="flex basis-full justify-end sm:basis-auto">
                  <Link
                    to="/schedules/$ministryId/$cycleId"
                    params={params}
                    aria-label={m.schedules_open_label({ name: title })}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'min-h-11 min-w-11',
                    })}
                  >
                    {m.schedules_open()}
                  </Link>
                </div>
              </div>
            ) : (
              <Link
                to="/schedules/$ministryId/$cycleId"
                params={params}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span>{title}</span>
                {status}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
