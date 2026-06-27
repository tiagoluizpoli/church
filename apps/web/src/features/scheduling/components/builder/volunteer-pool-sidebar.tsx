import { Input } from '@church/ui/components/input';
import { ScrollArea } from '@church/ui/components/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@church/ui/components/select';
import {
  type PoolVolunteer,
  useVolunteerPool,
} from '../../hooks/use-volunteer-pool';
import { VolunteerCard } from './volunteer-card';

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
}

export function VolunteerPoolSidebar({
  volunteers,
  assignments,
  roles,
}: VolunteerPoolSidebarProps) {
  const {
    nameFilter,
    roleFilter,
    setNameFilter,
    setRoleFilter,
    sortedFilteredVolunteers,
  } = useVolunteerPool(volunteers, assignments);

  return (
    <aside
      className="flex w-64 flex-col gap-2 border-r pr-3"
      data-testid="volunteer-pool"
    >
      <h2 className="font-semibold text-sm">Volunteers</h2>

      <Input
        value={nameFilter}
        onChange={(e) => setNameFilter(e.target.value)}
        placeholder="Search by name…"
        className="h-8 text-xs"
      />

      <Select
        value={roleFilter}
        onValueChange={(v) => setRoleFilter(v ?? 'all')}
      >
        <SelectTrigger size="sm" aria-label="Filter by role">
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

      <ScrollArea className="h-[calc(100vh-16rem)]">
        <div className="flex flex-col gap-1.5 pr-2">
          {sortedFilteredVolunteers.length === 0 ? (
            <p className="px-1 py-4 text-muted-foreground text-xs">
              No volunteers match
            </p>
          ) : (
            sortedFilteredVolunteers.map((v) => (
              <VolunteerCard key={v.volunteerId} volunteer={v} />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
