import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { InviteDialog } from '@/features/invitations/components/invite-dialog';
import {
  INVITATIONS_QUERY_KEY,
  type InvitationFilters,
  useInvitationList,
} from '@/features/invitations/invitation-queries';
import type {
  ListInvitations200ItemsItem,
  ListInvitations200Options,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';
import { adminApi, invitationsApi } from '@/utils/api-instances';

interface InvitationRowProps {
  item: ListInvitations200ItemsItem;
  timeZone: string;
}

interface RowActionProps {
  item: ListInvitations200ItemsItem;
}

interface RefusalBody {
  error?: string;
}

const RESEND_REFUSALS: Record<string, () => string> = {
  RESEND_COOLDOWN_ACTIVE: () => m.error_resend_cooldown_active(),
  RESEND_DAILY_CAP_EXCEEDED: () => m.error_resend_daily_cap_exceeded(),
  INVITATION_NOT_PENDING: () => m.error_invitation_not_pending(),
};

/** Resend for a row the server allows, dispatched by its tagged kind. */
function ResendButton({ item }: RowActionProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const [pending, setPending] = useState(false);
  const { ministryId, id, email } = item;
  if (!item.canResend || (item.kind === 'ministry' && !ministryId)) return null;

  // Every row of the Active Church may change (siblings, delivery); filters stay as they are.
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [...INVITATIONS_QUERY_KEY, churchId],
    });
  const resend = async () => {
    if (pending) return;
    setPending(true);
    try {
      await (item.kind === 'church'
        ? invitationsApi.resendChurchInvitation(id)
        : adminApi.resendMinistryInvitation(ministryId as string, id));
      toast.success(m.invitations_resend_queued_toast({ email }));
      await refresh();
    } catch (error) {
      const code = isAxiosError<RefusalBody>(error)
        ? error.response?.data?.error
        : undefined;
      const known = code ? RESEND_REFUSALS[code] : undefined;
      toast.error(known ? known() : m.invitations_resend_failed());
      if (code === 'INVITATION_NOT_PENDING') await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      aria-label={m.invitations_resend_label({ email })}
      onClick={resend}
    >
      {pending ? m.invitations_resending() : m.invitations_resend()}
    </Button>
  );
}

/** Revoke behind a confirmation for a row the server allows, dispatched by its tagged kind; the server records who, when and why. */
function RevokeButton({ item }: RowActionProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { ministryId, id, email } = item;
  if (!item.canRevoke || (item.kind === 'ministry' && !ministryId)) return null;

  // The row leaves Pending and history changes; filters stay as they are.
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [...INVITATIONS_QUERY_KEY, churchId],
    });
  const revoke = async () => {
    if (pending) return;
    setPending(true);
    try {
      await (item.kind === 'church'
        ? invitationsApi.revokeChurchInvitation(id)
        : adminApi.revokeMinistryInvitation(ministryId as string, id));
      toast.success(m.invitations_revoked_toast({ email }));
      setOpen(false);
      await refresh();
    } catch (error) {
      const code = isAxiosError<RefusalBody>(error)
        ? error.response?.data?.error
        : undefined;
      toast.error(
        code === 'INVITATION_NOT_PENDING'
          ? m.error_invitation_not_pending()
          : m.invitations_revoke_failed(),
      );
      setOpen(false);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={m.invitations_revoke_label({ email })}
        onClick={() => setOpen(true)}
      >
        {m.invitations_revoke()}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.invitations_revoke_dialog_title({ email })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {item.kind === 'church'
                ? m.invitations_revoke_church_description()
                : m.invitations_revoke_description()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {m.invitations_revoke_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={revoke}
            >
              {pending
                ? m.invitations_revoking()
                : m.invitations_revoke_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const REVOCATION_REASONS: Record<string, () => string> = {
  manual: () => m.invitations_revoke_reason_manual(),
  'ministry-archived': () => m.invitations_revoke_reason_ministry_archived(),
};

type StatusFilter = NonNullable<InvitationFilters['status']>;
const STATUSES: StatusFilter[] = [
  'pending',
  'expired',
  'accepted',
  'declined',
  'revoked',
];

function statusLabel(status: StatusFilter): string {
  return {
    pending: m.invitations_status_pending(),
    expired: m.invitations_status_expired(),
    accepted: m.invitations_status_accepted(),
    declined: m.invitations_status_declined(),
    revoked: m.invitations_status_revoked(),
  }[status];
}

function invitedAsLabel(value: string): string {
  if (value === 'admin') return m.join_church_access_admin();
  return value === 'leader'
    ? m.ministry_invitation_access_leader()
    : m.ministry_invitation_access_volunteer();
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

function closureFact({ item, timeZone }: InvitationRowProps): string | null {
  if (item.status === 'pending') return null;
  const { actor, at, reason } = item.closure ?? {};
  const date = at ? formatInstantOf({ value: at, timeZone }) : undefined;
  let fact: string;
  if (item.displayStatus === 'accepted') {
    fact =
      actor && date
        ? m.invitations_accepted_by_on({ name: actor.name, date })
        : date
          ? m.invitations_accepted_on({ date })
          : m.invitations_closure_unavailable();
  } else if (item.displayStatus === 'declined') {
    fact =
      actor && date
        ? m.invitations_declined_by_on({ name: actor.name, date })
        : date
          ? m.invitations_declined_link_on({ date })
          : m.invitations_closure_unavailable();
  } else {
    fact =
      actor && date
        ? m.invitations_revoked_by_on({ name: actor.name, date })
        : date
          ? m.invitations_revoked_on({ date })
          : m.invitations_closure_unavailable();
  }
  const revocationReason = reason ? REVOCATION_REASONS[reason] : undefined;
  if (revocationReason) return `${fact} · ${revocationReason()}`;
  return reason
    ? `${fact} · ${m.invitations_closure_reason({ reason })}`
    : fact;
}

function ExpiredBadge({ item }: { item: ListInvitations200ItemsItem }) {
  return item.displayStatus === 'expired' ? (
    <Badge variant="destructive">{m.invitations_expired_badge()}</Badge>
  ) : null;
}

function Grants({ item }: { item: ListInvitations200ItemsItem }) {
  const access = accessLabel(item);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {item.status !== 'pending' ? (
        <Badge variant="outline">{statusLabel(item.displayStatus)}</Badge>
      ) : null}
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
  );
}

function Facts({ item, timeZone }: InvitationRowProps) {
  const expiry = formatInstantOf({ value: item.expiresAt, timeZone });
  return (
    <p className="break-words text-muted-foreground text-sm">
      {[
        m.invitations_invited_by({ name: item.invitedBy.name }),
        m.invitations_created({
          date: formatInstantOf({ value: item.createdAt, timeZone }),
        }),
        item.displayStatus === 'expired'
          ? m.invitations_expired_on({ date: expiry })
          : m.invitations_expires({ date: expiry }),
        emailFact({ item, timeZone }),
        closureFact({ item, timeZone }),
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  );
}

/** Direct, wrapping, right-aligned actions the server allows; nothing when none. */
function RowActions({ item }: RowActionProps) {
  if (!item.canResend && !item.canRevoke) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2 md:pt-0 [&_button]:min-h-11 md:[&_button]:min-h-0">
      <ResendButton item={item} />
      <RevokeButton item={item} />
    </div>
  );
}

function InvitationCard({ item, timeZone }: InvitationRowProps) {
  return (
    <div className="surface-subtle workspace-panel space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all font-medium">{item.email}</span>
        <ExpiredBadge item={item} />
      </div>
      <Grants item={item} />
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          {m.invitations_details()}
        </summary>
        <Facts item={item} timeZone={timeZone} />
      </details>
    </div>
  );
}

const ANY = 'any';

interface FilterBarProps {
  filters: InvitationFilters;
  options?: ListInvitations200Options;
  onChange: (filters: InvitationFilters) => void;
}

function FilterBar({ filters, options, onChange }: FilterBarProps) {
  const [email, setEmail] = useState(filters.email ?? '');
  const isAdmin = options?.invitedAs.includes('admin') ?? false;
  const showMinistry = isAdmin || (options?.ministries.length ?? 0) >= 2;
  const status = filters.status ?? 'pending';
  return (
    <form
      aria-label={m.invitations_filters_label()}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...filters, email: email.trim() || undefined });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="invitations-filter-status">
          {m.invitations_filter_status()}
        </Label>
        <Select
          value={status}
          onValueChange={(value) =>
            onChange({ ...filters, status: value as StatusFilter })
          }
        >
          <SelectTrigger id="invitations-filter-status" className="w-40">
            <SelectValue>{statusLabel(status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {statusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showMinistry ? (
        <div className="space-y-1">
          <Label htmlFor="invitations-filter-ministry">
            {m.invitations_filter_ministry()}
          </Label>
          <Select
            value={filters.ministryId ?? ANY}
            onValueChange={(value) =>
              onChange({
                ...filters,
                ministryId: value === ANY ? undefined : (value ?? undefined),
              })
            }
          >
            <SelectTrigger id="invitations-filter-ministry" className="w-48">
              <SelectValue>
                {options?.ministries.find((x) => x.id === filters.ministryId)
                  ?.name ?? m.invitations_filter_any()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{m.invitations_filter_any()}</SelectItem>
              {options?.ministries.map((ministry) => (
                <SelectItem key={ministry.id} value={ministry.id}>
                  {ministry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="invitations-filter-invited-as">
          {m.invitations_filter_invited_as()}
        </Label>
        <Select
          value={filters.invitedAs ?? ANY}
          onValueChange={(value) =>
            onChange({
              ...filters,
              invitedAs:
                value === ANY
                  ? undefined
                  : (value as InvitationFilters['invitedAs']),
            })
          }
        >
          <SelectTrigger id="invitations-filter-invited-as" className="w-40">
            <SelectValue>
              {filters.invitedAs
                ? invitedAsLabel(filters.invitedAs)
                : m.invitations_filter_any()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.invitations_filter_any()}</SelectItem>
            {options?.invitedAs.map((value) => (
              <SelectItem key={value} value={value}>
                {invitedAsLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="invitations-filter-email">
          {m.invitations_filter_email()}
        </Label>
        <Input
          id="invitations-filter-email"
          type="search"
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" variant="outline">
        {m.invitations_filter_search()}
      </Button>
    </form>
  );
}

/** The Active Church's invitations and their history within the caller's authority, with Resend and Revoke where allowed. */
export function InvitationListPage() {
  const { churchTimezone } = useTimezone();
  const [filters, setFilters] = useState<InvitationFilters>({});
  const query = useInvitationList({ filters });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const options = query.data?.pages[0]?.options;
  const status = filters.status ?? 'pending';
  const isFiltered = Boolean(
    filters.ministryId || filters.invitedAs || filters.email,
  );
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;
  // The server defaults to Pending, so the default status stays off the request.
  const change = (next: InvitationFilters) =>
    setFilters({
      ...next,
      status: next.status === 'pending' ? undefined : next.status,
    });

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_invitations()}
        description={m.invitations_description()}
        autoFocusTitle
        aside={<InviteDialog />}
      />
      <FilterBar
        key={filters.email ?? ''}
        filters={filters}
        options={options}
        onChange={change}
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
      ) : loading ? (
        <div className="grid gap-3" data-testid="invitations-loading">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered
              ? m.invitations_empty_filtered()
              : status === 'pending'
                ? m.invitations_empty()
                : m.invitations_empty_history()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => change({ status: filters.status })}
            >
              {m.invitations_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <DataTable
            aria-label={m.invitations_list_label()}
            columns={[
              {
                id: 'invitation',
                name: m.invitations_column_invitation(),
                isRowHeader: true,
              },
              { id: 'grants', name: m.invitations_column_grants() },
              { id: 'details', name: m.invitations_details() },
              { id: 'actions', name: m.people_column_actions() },
            ]}
            items={items}
            rowId={({ item }) => `${item.kind}:${item.id}`}
            renderCell={({ item, column }) => {
              if (column.id === 'grants') return <Grants item={item} />;
              if (column.id === 'details') {
                return <Facts item={item} timeZone={churchTimezone} />;
              }
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{item.email}</span>
                  <ExpiredBadge item={item} />
                </div>
              );
            }}
            renderMobileCard={({ item }) => (
              <InvitationCard item={item} timeZone={churchTimezone} />
            )}
            rowActions={({ item }) => <RowActions item={item} />}
          />
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
