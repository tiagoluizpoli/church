import { useMemo, useState } from 'react';
import type { PickerVolunteer } from '../../../utils/builder/cycle-builder-candidate.types';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type AssigneeMembership,
  formatAssigneeRoleLabel,
} from '@/utils/format-assignee-role-label';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface SubstitutionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  declinedVolunteerName: string;
  declinedVolunteerMembership?: AssigneeMembership;
  declinedVolunteerId: string;
  volunteers: PickerVolunteer[];
  onSelect: (newVolunteerId: string) => void;
  /**
   * The team this picker is filling a slot for, if any. Candidates only badge
   * as "Team Leader" when they lead this specific team — a team they lead
   * elsewhere in the ministry does not qualify (FR-013).
   */
  contextTeamId?: string;
}

export function SubstitutionPicker({
  open,
  onOpenChange,
  declinedVolunteerName,
  declinedVolunteerMembership,
  declinedVolunteerId,
  volunteers,
  onSelect,
  contextTeamId,
}: SubstitutionPickerProps) {
  const [search, setSearch] = useState('');

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return volunteers
      .filter(
        (v) =>
          v.id !== declinedVolunteerId &&
          v.availabilityStatus === 'available' &&
          (!q || v.name.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [volunteers, declinedVolunteerId, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Find replacement for {formatVolunteerName(declinedVolunteerName)}
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex items-center justify-between rounded border border-destructive/35 bg-destructive/10 px-2 py-1 text-xs"
          data-testid="declined-pinned"
        >
          <span className="flex items-center gap-1">
            {formatVolunteerName(declinedVolunteerName)}
            <AssigneeIdentityBadge
              roleLabel={formatAssigneeRoleLabel({
                membership: declinedVolunteerMembership,
                contextTeamId,
              })}
              fullNameOnExpand={declinedVolunteerName}
            />
          </span>
          <Badge variant="destructive">Declined — find replacement</Badge>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search available volunteers…"
          className="h-7 text-xs"
        />

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {available.length === 0 && (
            <li className="px-1 py-2 text-muted-foreground text-xs">
              No available volunteers
            </li>
          )}
          {available.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-xs hover:bg-muted/60"
                onClick={() => {
                  onSelect(v.id);
                  onOpenChange(false);
                }}
              >
                <span className="flex items-center gap-1">
                  {formatVolunteerName(v.name)}
                  <AssigneeIdentityBadge
                    roleLabel={formatAssigneeRoleLabel({
                      membership: v.membership,
                      contextTeamId,
                    })}
                    fullNameOnExpand={v.name}
                  />
                </span>
                <Badge
                  variant="outline"
                  className="border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
                >
                  available
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
