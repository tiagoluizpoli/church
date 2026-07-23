import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  LocateFixed,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VolunteerPoolItem } from '../../hooks/use-volunteer-pool';
import { VolunteerCard } from './volunteer-card';
import {
  type GroupMode,
  groupVolunteersByRole,
  groupVolunteersByStatus,
} from './volunteer-pool-groups';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface VolunteerRowsProps {
  volunteers: VolunteerPoolItem[];
  selectedVolunteerId?: string;
  idealVolunteerId?: string;
  onSelectVolunteer?: (volunteerId: string) => void;
  dragIdPrefix?: string;
}

interface VolunteerPoolListProps {
  groupMode: GroupMode;
  /**
   * People ranked for the focused shift×role, best first, or null when nothing
   * is focused. They are promoted above the rest of the pool rather than
   * replacing it — an unranked volunteer is still assignable as an override.
   */
  focusedVolunteers: VolunteerPoolItem[] | null;
  otherVolunteers: VolunteerPoolItem[];
  selectedVolunteerId?: string;
  idealVolunteerId?: string;
  onSelectVolunteer?: (volunteerId: string) => void;
}

interface GroupHeaderProps {
  label: string;
  count: number;
  icon?: 'role' | 'focus';
}

export function VolunteerRows({
  volunteers,
  selectedVolunteerId,
  idealVolunteerId,
  onSelectVolunteer,
  dragIdPrefix,
}: VolunteerRowsProps) {
  return volunteers.map((volunteer) => (
    <VolunteerCard
      key={volunteer.volunteerId}
      volunteer={volunteer}
      isSelected={selectedVolunteerId === volunteer.volunteerId}
      isIdeal={idealVolunteerId === volunteer.volunteerId}
      onSelect={onSelectVolunteer}
      dragId={
        dragIdPrefix ? `${dragIdPrefix}-${volunteer.volunteerId}` : undefined
      }
    />
  ));
}

/**
 * The rail body. Focus and grouping are independent: focused people keep their
 * slot ranking wherever they land, so a grouped rail still shows the best
 * candidate first inside each group (both group helpers preserve input order).
 */
export function VolunteerPoolList({
  groupMode,
  focusedVolunteers,
  otherVolunteers,
  selectedVolunteerId,
  idealVolunteerId,
  onSelectVolunteer,
}: VolunteerPoolListProps) {
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const allVolunteers = useMemo(
    () => [...(focusedVolunteers ?? []), ...otherVolunteers],
    [focusedVolunteers, otherVolunteers],
  );
  const statusGroups = useMemo(
    () =>
      groupMode === 'status'
        ? groupVolunteersByStatus({ volunteers: allVolunteers })
        : null,
    [allVolunteers, groupMode],
  );
  const roleGroups = useMemo(
    () =>
      groupMode === 'role'
        ? groupVolunteersByRole({ volunteers: allVolunteers })
        : null,
    [allVolunteers, groupMode],
  );

  if (statusGroups) {
    return (
      <>
        {statusGroups.ready.length ? (
          <section className="flex flex-col gap-2">
            <GroupHeader label="Ready" count={statusGroups.ready.length} />
            <VolunteerRows
              volunteers={statusGroups.ready}
              selectedVolunteerId={selectedVolunteerId}
              idealVolunteerId={idealVolunteerId}
              onSelectVolunteer={onSelectVolunteer}
            />
          </section>
        ) : null}
        {statusGroups.awaiting.length ? (
          <section className="flex flex-col gap-2 pt-2">
            <GroupHeader
              label="Awaiting"
              count={statusGroups.awaiting.length}
            />
            <VolunteerRows
              volunteers={statusGroups.awaiting}
              selectedVolunteerId={selectedVolunteerId}
              idealVolunteerId={idealVolunteerId}
              onSelectVolunteer={onSelectVolunteer}
            />
          </section>
        ) : null}
        {statusGroups.unavailable.length ? (
          <Collapsible
            open={unavailableOpen}
            onOpenChange={setUnavailableOpen}
            className="pt-2"
          >
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
              {unavailableOpen ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
              Unavailable ({statusGroups.unavailable.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">
              <VolunteerRows
                volunteers={statusGroups.unavailable}
                selectedVolunteerId={selectedVolunteerId}
                idealVolunteerId={idealVolunteerId}
                onSelectVolunteer={onSelectVolunteer}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </>
    );
  }

  if (roleGroups) {
    return roleGroups.map((group) => (
      <section
        key={group.roleName}
        className="flex flex-col gap-2 not-first:pt-2"
      >
        <GroupHeader
          label={group.roleName}
          count={group.volunteers.length}
          icon="role"
        />
        <VolunteerRows
          volunteers={group.volunteers}
          selectedVolunteerId={selectedVolunteerId}
          idealVolunteerId={idealVolunteerId}
          onSelectVolunteer={onSelectVolunteer}
          dragIdPrefix={`role-${group.roleName}`}
        />
      </section>
    ));
  }

  if (!focusedVolunteers) {
    return (
      <VolunteerRows
        volunteers={otherVolunteers}
        selectedVolunteerId={selectedVolunteerId}
        idealVolunteerId={idealVolunteerId}
        onSelectVolunteer={onSelectVolunteer}
      />
    );
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <GroupHeader
          label="Best for this role"
          count={focusedVolunteers.length}
          icon="focus"
        />
        {focusedVolunteers.length ? (
          <VolunteerRows
            volunteers={focusedVolunteers}
            selectedVolunteerId={selectedVolunteerId}
            idealVolunteerId={idealVolunteerId}
            onSelectVolunteer={onSelectVolunteer}
          />
        ) : (
          <p className="px-1 text-muted-foreground text-xs">
            No candidates for this role
          </p>
        )}
      </section>
      {otherVolunteers.length ? (
        <section className="flex flex-col gap-2 pt-2">
          <GroupHeader label="Everyone else" count={otherVolunteers.length} />
          <VolunteerRows
            volunteers={otherVolunteers}
            selectedVolunteerId={selectedVolunteerId}
            idealVolunteerId={idealVolunteerId}
            onSelectVolunteer={onSelectVolunteer}
          />
        </section>
      ) : null}
    </>
  );
}

export function GroupHeader({ label, count, icon }: GroupHeaderProps) {
  return (
    <h3 className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
      {icon === 'role' ? <LayersIcon className="size-3.5" /> : null}
      {icon === 'focus' ? (
        <LocateFixed className="size-3.5 text-primary" />
      ) : null}
      <span>{label}</span>
      <span className="ml-auto normal-case">{count}</span>
    </h3>
  );
}
