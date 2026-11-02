import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import type {
  ArchiveMinistry409BlockersItem,
  ArchiveMinistryRole409BlockersItem,
  ArchiveSector409BlockersItem,
} from '@/infrastructure/api/churchAPI.schemas';

/** The blocker shape is shared by every archive 409; orval emits one copy per route. */
export type ArchiveBlocker =
  | ArchiveMinistry409BlockersItem
  | ArchiveMinistryRole409BlockersItem
  | ArchiveSector409BlockersItem;

interface ArchiveBlockedBody {
  blockers?: ArchiveBlocker[];
}

interface ArchiveErrorInput {
  error: unknown;
}

/** The typed locations of a refused archive, or undefined for any other failure. */
export function archiveBlockersOf({
  error,
}: ArchiveErrorInput): ArchiveBlocker[] | undefined {
  if (!isAxiosError<ArchiveBlockedBody>(error)) return undefined;
  if (error.response?.status !== 409) return undefined;
  return error.response.data?.blockers;
}

interface BlockerItemProps {
  blocker: ArchiveBlocker;
}

/** Each location opens in a new tab, keeping this page's context. */
function BlockerItem({ blocker }: BlockerItemProps) {
  const newTab = <span className="sr-only"> {m.sectors_opens_new_tab()}</span>;
  if (blocker.kind === 'usual_setup') {
    return (
      <Link
        to="/ministries/$ministryId/usual-setup"
        params={{ ministryId: blocker.ministryId }}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {m.ministry_blocker_usual_setup(blocker)}
        {newTab}
      </Link>
    );
  }
  return (
    <Link
      to="/schedules/$ministryId/$cycleId"
      params={{ ministryId: blocker.ministryId, cycleId: blocker.cycleId }}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4"
    >
      {m.ministry_blocker_requirement(blocker)}
      {newTab}
    </Link>
  );
}

interface ArchiveBlockerListProps {
  heading: string;
  blockers: ArchiveBlocker[];
}

/** Where current planning still uses an item, derived from IDs only. */
export function ArchiveBlockerList({
  heading,
  blockers,
}: ArchiveBlockerListProps) {
  return (
    <div className="space-y-2 text-sm" role="alert">
      <p>{heading}</p>
      <ul className="list-disc space-y-1 pl-5">
        {blockers.map((blocker) => (
          <li
            key={
              blocker.kind === 'usual_setup'
                ? `${blocker.kind}-${blocker.templateTimeBlockId}`
                : blocker.kind === 'cycle'
                  ? `${blocker.kind}-${blocker.cycleId}`
                  : `${blocker.kind}-${blocker.eventTimeBlockId}`
            }
          >
            <BlockerItem blocker={blocker} />
          </li>
        ))}
      </ul>
    </div>
  );
}
