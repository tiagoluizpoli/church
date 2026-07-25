import {
  SearchIcon,
  SlidersHorizontalIcon,
  UsersRoundIcon,
  XIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type PoolVolunteer,
  useVolunteerPool,
} from '../../../hooks/use-volunteer-pool';
import type { AssignableFitTier } from '../../../utils/builder/cycle-builder-fit.utils';
import {
  type GroupMode,
  partitionVolunteersByFocus,
  toGroupMode,
} from '../../../utils/builder/volunteer-pool-groups';
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
  /**
   * Everyone the leader may commit to the focused shift×role, mapped to the
   * fit tier that pick would land in — computed upstream, since the rail cannot
   * see the board's assignment state. While it and the handler below are set,
   * each listed card's "Select slot" action becomes "Pick me", and the tier is
   * what lets that button warn when the pick will demand an override reason.
   */
  assignableVolunteerFits?: Map<string, AssignableFitTier>;
  /**
   * Commits a person straight to the focused shift×role. The rail stops being a
   * hint and becomes the assignment surface.
   */
  onAssignFocusedVolunteer?: (volunteerId: string) => void;
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
  assignableVolunteerFits,
  onAssignFocusedVolunteer,
  onClearFocus,
}: VolunteerPoolSidebarProps) {
  const isTouch = useFormControlSize() === 'touch';
  // The base-ui ScrollArea Viewport is the actual scroller; the list windows
  // itself against it. A state-backed callback ref (not a plain ref) is what
  // hands the element over: base-ui attaches the viewport a commit after the
  // list's virtualizer first runs, so a plain ref would still read null there —
  // the state update re-renders once the node exists and the virtualizer picks
  // it up deterministically.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [groupMode, setGroupMode] = useState<GroupMode>('all');
  // Any listed person the leader may pick for the focused slot — the leader is
  // free to overrule the recommendation, so this reaches past the ranked
  // candidates to everyone this shift could take, each with what that pick
  // would cost.
  const assignableFits =
    assignableVolunteerFits && onAssignFocusedVolunteer
      ? assignableVolunteerFits
      : null;
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
  const hasPoolFilter = nameFilter.trim() !== '' || roleFilter !== 'all';

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
                size={isTouch ? 'icon-touch' : 'icon-sm'}
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
                  <DropdownMenuRadioItem key={role.id} value={role.name}>
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
              size={isTouch ? 'touch' : 'sm'}
              variant="ghost"
              onClick={onClearFocus}
            >
              All volunteers
            </Button>
          ) : null}
        </div>
      ) : null}
      {roleFilter !== 'all' ? (
        // The role filter lives inside the sliders menu, so without this the
        // only cue a filter is on is the shorter list — which reads as "nobody
        // else qualifies". A removable chip makes the filter, and its scope,
        // explicit.
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            Filtered by role:
          </span>
          <Badge
            variant="secondary"
            className="gap-1 py-0.5 pr-1 pl-2"
            data-testid="volunteer-role-filter-chip"
          >
            {roleFilter}
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              aria-label={`Clear ${roleFilter} filter`}
              className={cn(
                'flex items-center justify-center rounded-full hover:bg-foreground/10',
                isTouch ? 'size-11' : 'p-0.5',
              )}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {focusPartition
          ? 'Select or drag a person onto a role. Best fits for the focused role come first.'
          : 'Select or drag a person onto a role. Ordered by current availability and cycle workload.'}{' '}
        {/* Dragging is pointer-only (no KeyboardSensor is registered), so the
            keyboard paths have to be stated rather than discovered — the grip
            used to claim them by announcing dnd-kit's default instructions. */}
        <span className="sr-only">
          Dragging needs a mouse or touch. To assign with the keyboard, choose a
          role on the board, then use the Pick me button on a volunteer card.
        </span>
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

      <ScrollArea
        className="h-80 xl:h-[calc(100vh-16rem)]"
        viewportRef={setScrollElement}
      >
        {sortedFilteredVolunteers.length === 0 ? (
          // "No volunteers match" read the same whether the leader had
          // filtered everyone out or the cycle simply has nobody eligible —
          // the first is one click from recovery, the second is not a filter
          // problem at all.
          <div
            className="flex flex-col items-start gap-2 px-1 py-4 pr-2"
            data-testid="volunteer-pool-empty"
          >
            {hasPoolFilter ? (
              <>
                <p className="text-muted-foreground text-xs">
                  {nameFilter.trim()
                    ? `No volunteers match “${nameFilter.trim()}”.`
                    : `No volunteers are qualified for ${roleFilter}.`}
                </p>
                <Button
                  type="button"
                  size={isTouch ? 'touch' : 'sm'}
                  variant="outline"
                  onClick={() => {
                    setNameFilter('');
                    setRoleFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                No volunteers are eligible for this cycle yet.
              </p>
            )}
          </div>
        ) : (
          <VolunteerPoolList
            groupMode={groupMode}
            focusedVolunteers={focusPartition?.focused ?? null}
            otherVolunteers={focusPartition?.others ?? sortedFilteredVolunteers}
            selectedVolunteerId={selectedVolunteerId}
            idealVolunteerId={idealVolunteerId}
            onSelectVolunteer={onSelectVolunteer}
            assignableVolunteerFits={assignableFits}
            onAssignVolunteer={onAssignFocusedVolunteer}
            scrollElement={scrollElement}
          />
        )}
      </ScrollArea>
    </aside>
  );
}
