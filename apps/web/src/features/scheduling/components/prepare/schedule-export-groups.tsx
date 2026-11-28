import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { useEventGroups } from '@/features/ministries/ministry-queries';

interface ScheduleExportGroupsProps {
  ministryId: string;
  cycleId: string;
}

/**
 * The export dialog's Grupos line (#1247): the Ministry's Event groups as the
 * export shows them, and the way to the tab that organizes them.
 */
export function ScheduleExportGroups({
  ministryId,
  cycleId,
}: ScheduleExportGroupsProps) {
  const { data } = useEventGroups({ ministryId });
  const names =
    data && data.groups.length > 0
      ? [
          ...data.groups.map((group) => group.name),
          data.catchAllName ?? m.export_catch_all_default(),
        ].join(' · ')
      : m.export_groups_none();
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
      <span className="text-muted-foreground">{m.export_groups_label()}</span>
      <div className="space-y-1">
        <p className="font-medium">{data ? names : null}</p>
        <Link
          to="/app/ministries/$ministryId/event-groups"
          params={{ ministryId }}
          search={{ cycleId }}
          className="text-sm underline underline-offset-2"
        >
          {m.export_groups_organize()}
        </Link>
      </div>
    </div>
  );
}
