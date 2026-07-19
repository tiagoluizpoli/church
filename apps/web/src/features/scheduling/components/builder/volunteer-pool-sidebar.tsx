import {
  type PoolVolunteer,
  useVolunteerPool,
} from '../../hooks/use-volunteer-pool';
import { VolunteerCard } from './volunteer-card';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RoleOption {
  id: string;
  name: string;
}

interface PoolAssignmentInput {
  volunteerId: string;
  roleId: string;
  status: string;
}

interface VolunteerPoolSidebarProps {
  volunteers: PoolVolunteer[];
  assignments: PoolAssignmentInput[];
  roles: RoleOption[];
  selectedVolunteerId?: string;
  onSelectVolunteer?: (volunteerId: string) => void;
  focusedVolunteerIds?: Set<string>;
  focusLabel?: string;
  onClearFocus?: () => void;
}

export function VolunteerPoolSidebar({
  volunteers,
  assignments,
  roles,
  selectedVolunteerId,
  onSelectVolunteer,
  focusedVolunteerIds,
  focusLabel,
  onClearFocus,
}: VolunteerPoolSidebarProps) {
  const isTouch = useFormControlSize() === 'touch';
  const {
    nameFilter,
    roleFilter,
    setNameFilter,
    setRoleFilter,
    sortedFilteredVolunteers,
  } = useVolunteerPool(volunteers, assignments);
  const displayedVolunteers = focusedVolunteerIds
    ? sortedFilteredVolunteers.filter((volunteer) =>
        focusedVolunteerIds.has(volunteer.volunteerId),
      )
    : sortedFilteredVolunteers;

  return (
    <aside
      className="surface-panel flex h-full w-full flex-col gap-3 p-4 xl:w-80"
      data-testid="volunteer-pool"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm">
            {focusLabel ? 'Candidates' : 'Volunteers'}
          </h2>
          {focusLabel ? (
            <p className="text-muted-foreground text-xs">{focusLabel}</p>
          ) : null}
        </div>
        {onClearFocus ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClearFocus}
          >
            All volunteers
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Select or drag a person onto a role. Ordered by current availability and
        cycle workload.
      </p>

      <Input
        value={nameFilter}
        onChange={(e) => setNameFilter(e.target.value)}
        placeholder="Search by name…"
        aria-label="Search volunteers by name"
        className={isTouch ? 'text-sm' : 'h-8 text-xs'}
      />

      {!focusedVolunteerIds ? (
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v ?? 'all')}
        >
          <SelectTrigger
            size={isTouch ? 'default' : 'sm'}
            aria-label="Filter by role"
            className={
              isTouch ? 'w-full px-3 text-sm data-[size=default]:h-11' : ''
            }
          >
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <ScrollArea className="h-80 xl:h-[calc(100vh-16rem)]">
        <div className="flex flex-col gap-1.5 pr-2">
          {displayedVolunteers.length === 0 ? (
            <p className="px-1 py-4 text-muted-foreground text-xs">
              {focusedVolunteerIds
                ? 'No candidates match'
                : 'No volunteers match'}
            </p>
          ) : (
            displayedVolunteers.map((v) => (
              <VolunteerCard
                key={v.volunteerId}
                volunteer={v}
                isSelected={selectedVolunteerId === v.volunteerId}
                onSelect={onSelectVolunteer}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
