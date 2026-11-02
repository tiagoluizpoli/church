import { m } from '@church/i18n/messages';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { useInvitationList } from '@/features/invitations/invitation-queries';
import type { ListInvitations200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';

interface InvitationRowProps {
  item: ListInvitations200ItemsItem;
  timeZone: string;
}

function accessLabel(item: ListInvitations200ItemsItem): string | null {
  if (item.ministryAccessLevel === 'leader') {
    return m.ministry_invitation_access_leader();
  }
  if (item.ministryAccessLevel === 'volunteer') {
    return m.ministry_invitation_access_volunteer();
  }
  return null;
}

function emailFact({ item, timeZone }: InvitationRowProps): string {
  const { state, sentAt } = item.emailDelivery;
  if (state === 'sent') {
    return sentAt
      ? m.invitations_email_sent({
          date: formatInstantOf({ value: sentAt, timeZone }),
        })
      : m.invitations_email_sent_unknown_time();
  }
  if (state === 'pending') return m.invitations_email_pending();
  if (state === 'failed') return m.invitations_email_failed();
  return m.invitations_email_unavailable();
}

function InvitationRow({ item, timeZone }: InvitationRowProps) {
  const expired = item.displayStatus === 'expired';
  const expiry = formatInstantOf({ value: item.expiresAt, timeZone });
  const access = accessLabel(item);
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all font-medium">{item.email}</span>
        {expired ? (
          <Badge variant="destructive">{m.invitations_expired_badge()}</Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {item.churchAccessLevel ? (
          <Badge variant="secondary">
            {m.invitations_church_access()}: {m.join_church_access_admin()}
          </Badge>
        ) : null}
        {item.ministryName ? (
          <Badge variant="outline">
            {item.ministryName}
            {access ? ` · ${access}` : ''}
          </Badge>
        ) : null}
        {item.ministryName ? (
          <span className="min-w-0 break-words text-muted-foreground">
            {m.ministry_invitation_roles_label()}:{' '}
            {item.roles.length > 0
              ? item.roles.map((role) => role.name).join(', ')
              : m.ministry_invitation_roles_none()}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        {[
          m.invitations_invited_by({ name: item.invitedBy.name }),
          m.invitations_created({
            date: formatInstantOf({ value: item.createdAt, timeZone }),
          }),
          expired
            ? m.invitations_expired_on({ date: expiry })
            : m.invitations_expires({ date: expiry }),
          emailFact({ item, timeZone }),
        ].join(' · ')}
      </p>
    </li>
  );
}

/** The Active Church's pending offers within the caller's authority; read-only. */
export function InvitationListPage() {
  const { churchTimezone } = useTimezone();
  const query = useInvitationList();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_invitations()}
        description={m.invitations_description()}
        autoFocusTitle
      />
      {query.isError && items.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.invitations_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => query.refetch()}
            >
              {m.invitations_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="grid gap-3" data-testid="invitations-loading">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground" role="status">
          {m.invitations_empty()}
        </p>
      ) : (
        <>
          <ul
            aria-label={m.invitations_list_label()}
            className="surface-panel divide-y divide-border"
          >
            {items.map((item) => (
              <InvitationRow
                key={`${item.kind}:${item.id}`}
                item={item}
                timeZone={churchTimezone}
              />
            ))}
          </ul>
          {query.isFetchNextPageError ? (
            <Alert variant="destructive">
              <AlertDescription>{m.invitations_load_failed()}</AlertDescription>
            </Alert>
          ) : null}
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? m.invitations_loading_more()
                : m.invitations_load_more()}
            </Button>
          ) : null}
        </>
      )}
    </WorkspacePage>
  );
}
