import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import type { ListSchedules200SchedulesItem } from '@/infrastructure/api/churchAPI.schemas';

export interface ScheduleRowsProps {
  schedules: ListSchedules200SchedulesItem[];
  /** Home: name what is outstanding (unanswered, unfilled) instead of the bare stage. */
  showOutstanding?: boolean;
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
  switch (row.stage) {
    case 'to_prepare':
      return m.schedules_to_prepare();
    case 'asking':
      if (!row.asking) return m.schedules_asking_stage();
      return showOutstanding
        ? m.schedules_asking_outstanding({
            count: row.asking.asked - row.asking.confirmed,
          })
        : m.schedules_asking(row.asking);
    case 'assigning':
      return showOutstanding
        ? m.schedules_assigning_gaps({ count: row.gapCount })
        : m.schedules_assigning();
    case 'published': {
      const published =
        row.affectedVolunteerCount > 0
          ? m.schedules_unsent({ count: row.affectedVolunteerCount })
          : m.schedules_published();
      return row.openSwapRequestCount > 0
        ? `${published} · ${swapRequestCountLabel(row.openSwapRequestCount)}`
        : published;
    }
    case 'not_serving':
      return m.schedules_not_serving();
  }
}

export function ScheduleRows({
  schedules,
  showOutstanding = false,
}: ScheduleRowsProps) {
  return (
    <ul className="grid gap-2">
      {schedules.map((row) => (
        <li key={`${row.ministry.id}:${row.cycle.id}`}>
          <Link
            to="/schedules/$ministryId/$cycleId"
            params={{ ministryId: row.ministry.id, cycleId: row.cycle.id }}
            className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>
              {row.ministry.name} · {row.cycle.name}
            </span>
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
                {stageLabel({ row, showOutstanding })}
              </Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
