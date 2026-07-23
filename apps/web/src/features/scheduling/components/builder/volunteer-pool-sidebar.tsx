import {
  SearchIcon,
  SlidersHorizontalIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type PoolVolunteer,
  useVolunteerPool,
} from '../../hooks/use-volunteer-pool';
import {
  type GroupMode,
  partitionVolunteersByFocus,
  toGroupMode,
} from './volunteer-pool-groups';
import { VolunteerPoolList } from './volunteer-pool-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
  /**
   * Candidates for the focused shift×role, ranked best-first. They are
   * promoted to the top of the rail rather than filtering it — an unranked
   * volunteer is still assignable, that is the override path.
   */
  focusedVolunteerIds?: string[];
  focusLabel?: string;
  /** Top of the focused shift's safe recommendations, badged as the Ideal pick. */
  idealVolunteerId?: string;
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
  idealVolunteerId,
  onClearFocus,
}: VolunteerPoolSidebarProps) {
  const isTouch = useFormControlSize() === 'touch';
  const [groupMode, setGroupMode] = useState<GroupMode>('all');
  const {
    nameFilter,
    roleFilter,
    setNameFilter,
    setRoleFilter,
    sortedFilteredVolunteers,
  } = useVolunteerPool(volunteers, assignments);
  const focusPartition = useMemo(
    () =>
      focusedVolunteerIds
        ? partitionVolunteersByFocus({
            volunteers: sortedFilteredVolunteers,
            focusedVolunteerIds,
          })
        : null,
    [focusedVolunteerIds, sortedFilteredVolunteers],
  );
  const isGrouped = groupMode !== 'all';

  return (
    <aside
      className="surface-panel flex h-full w-full flex-col gap-3 p-4 xl:w-95"
      data-testid="volunteer-pool"
    >
      <div className="flex items-center gap-2">
        <UsersRoundIcon className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">Volunteer list</h2>
        <Badge variant="secondary" className="ml-auto">
          {sortedFilteredVolunteers.length}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant={
                  isGrouped || roleFilter !== 'all' ? 'secondary' : 'ghost'
                }
                aria-label="Filter and group volunteers"
              />
            }
          >
            <SlidersHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Group volunteers</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={groupMode}
                onValueChange={(value) => {
                  const mode = toGroupMode({ value });
                  if (mode) setGroupMode(mode);
                }}
              >
                <DropdownMenuRadioItem value="all">
                  Show all
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="status">
                  By status
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="role">
                  By role
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value)}
              >
                <DropdownMenuRadioItem value="all">
                  All roles
                </DropdownMenuRadioItem>
                {roles.map((role) => (
                  <DropdownMenuRadioItem key={role.id} value={role.id}>
                    {role.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {focusLabel ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{focusLabel}</p>
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
      ) : null}
      <p className="text-muted-foreground text-xs">
        {focusPartition
          ? 'Select or drag a person onto a role. Best fits for the focused role come first.'
          : 'Select or drag a person onto a role. Ordered by current availability and cycle workload.'}
      </p>

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          placeholder="Search by name…"
          aria-label="Search volunteers by name"
          className={cn('pl-8', isTouch ? 'text-sm' : 'h-8 text-xs')}
        />
      </div>

      <ScrollArea className="h-80 xl:h-[calc(100vh-16rem)]">
        <div className="flex flex-col gap-2 pr-2">
          {sortedFilteredVolunteers.length === 0 ? (
            <p className="px-1 py-4 text-muted-foreground text-xs">
              No volunteers match
            </p>
          ) : (
            <VolunteerPoolList
              groupMode={groupMode}
              focusedVolunteers={focusPartition?.focused ?? null}
              otherVolunteers={
                focusPartition?.others ?? sortedFilteredVolunteers
              }
              selectedVolunteerId={selectedVolunteerId}
              idealVolunteerId={idealVolunteerId}
              onSelectVolunteer={onSelectVolunteer}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
