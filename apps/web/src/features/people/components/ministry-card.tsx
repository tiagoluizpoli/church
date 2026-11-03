import { m } from '@church/i18n/messages';
import { Badge } from '@/components/ui/badge';
import type { GetPerson200MinistriesItem } from '@/infrastructure/api/churchAPI.schemas';

interface MinistryCardProps {
  card: GetPerson200MinistriesItem;
}

/** One active Ministry Membership of the scoped member detail. */
export function MinistryCard({ card }: MinistryCardProps) {
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
    </li>
  );
}
