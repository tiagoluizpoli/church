import { m } from '@church/i18n/messages';
import { Badge } from '@/components/ui/badge';
import { ChangeMinistryAccessDialog } from '@/features/people/components/change-ministry-access-dialog';
import { EditRolesDialog } from '@/features/people/components/edit-roles-dialog';
import { RemoveFromMinistryDialog } from '@/features/people/components/remove-from-ministry-dialog';
import type { GetPerson200MinistriesItem } from '@/infrastructure/api/churchAPI.schemas';

interface MinistryCardProps {
  card: GetPerson200MinistriesItem;
  memberId: string;
  personName: string;
  isSelf: boolean;
}

/** One active Ministry Membership of the scoped member detail; actions follow the server's hints. */
export function MinistryCard({
  card,
  memberId,
  personName,
  isSelf,
}: MinistryCardProps) {
  return (
    <li className="surface-panel space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{card.ministryName}</h3>
        <Badge variant="outline">
          {card.ministryAccessLevel === 'leader'
            ? m.ministry_invitation_access_leader()
            : m.ministry_invitation_access_volunteer()}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {m.people_detail_roles()}:
        </span>
        {card.roles.length === 0 ? (
          <span className="text-muted-foreground">
            {m.people_detail_no_roles()}
          </span>
        ) : (
          card.roles.map((role) => (
            <Badge key={role.id} variant="secondary">
              {role.name}
              {role.archived ? ` · ${m.people_role_archived()}` : ''}
            </Badge>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {card.canEditRoles ? (
          <EditRolesDialog
            memberId={memberId}
            personName={personName}
            card={card}
          />
        ) : null}
        {card.canChangeMinistryAccess ? (
          <ChangeMinistryAccessDialog
            memberId={memberId}
            personName={personName}
            card={card}
            isSelf={isSelf}
          />
        ) : null}
        {card.canEndMembership ? (
          <RemoveFromMinistryDialog
            memberId={memberId}
            personName={personName}
            card={card}
            isSelf={isSelf}
          />
        ) : null}
      </div>
    </li>
  );
}
