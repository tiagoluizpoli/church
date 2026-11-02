import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import type {
  ArchiveMinistryRole409,
  ArchiveMinistryRole409BlockersItem,
} from '@/infrastructure/api/churchAPI.schemas';

export type ArchiveBlocker = ArchiveMinistryRole409BlockersItem;

interface ArchiveErrorInput {
  error: unknown;
}

/** The typed locations of a refused archive, or undefined for any other failure. */
export function archiveBlockersOf({
  error,
}: ArchiveErrorInput): ArchiveBlocker[] | undefined {
  if (!isAxiosError<ArchiveMinistryRole409>(error)) return undefined;
  if (error.response?.status !== 409) return undefined;
  return error.response.data?.blockers;
}

interface BlockerItemProps {
  blocker: ArchiveBlocker;
}

/** Cycle and requirement locations open the Cycle's schedule in a new tab. */
function BlockerItem({ blocker }: BlockerItemProps) {
  if (blocker.kind === 'usual_setup') {
    // shortcut: no link until Spec 14 ships the Usual setup editor (no dead links).
    return <>{m.ministry_blocker_usual_setup(blocker)}</>;
  }
  const label =
    blocker.kind === 'cycle'
      ? m.ministry_blocker_cycle(blocker)
      : m.ministry_blocker_requirement(blocker);
  return (
    <Link
      to="/schedules/$ministryId/$cycleId"
      params={{ ministryId: blocker.ministryId, cycleId: blocker.cycleId }}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4"
    >
      {label}
    </Link>
  );
}

interface ArchiveBlockerListProps {
  blockers: ArchiveBlocker[];
}

/** Where current planning still uses an item, derived from IDs only. */
export function ArchiveBlockerList({ blockers }: ArchiveBlockerListProps) {
  return (
    <div className="space-y-2 text-sm" role="alert">
      <p>{m.ministry_roles_archive_blocked()}</p>
      <ul className="list-disc space-y-1 pl-5">
        {blockers.map((blocker) => (
          <li
            key={
              blocker.kind === 'usual_setup'
                ? `${blocker.kind}-${blocker.templateTimeBlockId}`
                : blocker.kind === 'requirement'
                  ? `${blocker.kind}-${blocker.eventTimeBlockId}`
                  : `${blocker.kind}-${blocker.cycleId}`
            }
          >
            <BlockerItem blocker={blocker} />
          </li>
        ))}
      </ul>
    </div>
  );
}
