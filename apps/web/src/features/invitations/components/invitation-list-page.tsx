import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { HeaderStatChip } from '@/components/header-stat-chip';
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
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

function useRefresh() {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  // Every row of the Active Church may change (siblings, delivery, history); filters stay as they are.
  return () =>
    queryClient.invalidateQueries({
      queryKey: [...INVITATIONS_QUERY_KEY, churchId],
    });
}

/** A ministry row without its Ministry cannot be addressed, so it offers no action. */
function isAddressable(item: ListInvitations200ItemsItem): boolean {
  return item.kind === 'church' || Boolean(item.ministryId);
}

/** Resend for a row the server allows, dispatched by its tagged kind. */
function useResend(item: ListInvitations200ItemsItem) {
  const refresh = useRefresh();
  const [pending, setPending] = useState(false);
  const { ministryId, id, email } = item;
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
  return { pending, resend };
}

interface RevokeDialogProps extends RowActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Revoke behind a confirmation, dispatched by its tagged kind; the server records who, when and why. */
function RevokeDialog({ item, open, onOpenChange }: RevokeDialogProps) {
  const refresh = useRefresh();
  const [pending, setPending] = useState(false);
  const { ministryId, id, email } = item;
  const revoke = async () => {
    if (pending) return;
    setPending(true);
    try {
      await (item.kind === 'church'
        ? invitationsApi.revokeChurchInvitation(id)
        : adminApi.revokeMinistryInvitation(ministryId as string, id));
      toast.success(m.invitations_revoked_toast({ email }));
      onOpenChange(false);
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
      onOpenChange(false);
      await refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
  );
}

const REVOCATION_REASONS: Record<string, () => string> = {
  manual: () => m.invitations_revoke_reason_manual(),
  'ministry-archived': () => m.invitations_revoke_reason_ministry_archived(),
};

type StatusFilter = Exclude<NonNullable<InvitationFilters['status']>, 'any'>;
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

function emailFact({ item, timeZone }: InvitationRowProps): string | null {
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
  return null;
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
          : '';
  } else if (item.displayStatus === 'declined') {
    fact =
      actor && date
        ? m.invitations_declined_by_on({ name: actor.name, date })
        : date
          ? m.invitations_declined_link_on({ date })
          : '';
  } else {
    fact =
      actor && date
        ? m.invitations_revoked_by_on({ name: actor.name, date })
        : date
          ? m.invitations_revoked_on({ date })
          : '';
  }
  const revocationReason = reason ? REVOCATION_REASONS[reason] : undefined;
  if (!fact) return null;
  if (revocationReason) return `${fact} · ${revocationReason()}`;
  return reason
    ? `${fact} · ${m.invitations_closure_reason({ reason })}`
    : fact;
}

/** Short Access badges: Administrator, or "Ministry · Level". */
function Grants({ item }: RowActionProps) {
  const access = accessLabel(item);
  return (
    <div className="flex items-center gap-2 text-sm">
      {item.churchAccessLevel ? (
        <Badge variant="secondary">{m.join_church_access_admin()}</Badge>
      ) : null}
      {item.ministryName ? (
        <Badge variant="outline">
          {item.ministryName}
          {access ? ` · ${access}` : ''}
        </Badge>
      ) : null}
    </div>
  );
}

interface Fact {
  key: string;
  text: string;
}

/** What the main row leaves out; unavailable facts are omitted. */
function factsOf({ item, timeZone }: InvitationRowProps): Fact[] {
  const delivery = emailFact({ item, timeZone });
  const closure = closureFact({ item, timeZone });
  const facts: Fact[] = [
    {
      key: 'inviter',
      text: m.invitations_invited_by({ name: item.invitedBy.name }),
    },
    {
      key: 'created',
      text: m.invitations_created({
        date: formatInstantOf({ value: item.createdAt, timeZone }),
      }),
    },
  ];
  if (delivery) facts.push({ key: 'email', text: delivery });
  if (closure) facts.push({ key: 'closure', text: closure });
  if (item.ministryName) {
    facts.push({
      key: 'roles',
      text: `${m.ministry_invitation_roles_label()}: ${
        item.roles.length > 0
          ? item.roles.map((role) => role.name).join(', ')
          : m.ministry_invitation_roles_none()
      }`,
    });
  }
  return facts;
}

function endDate({ item }: RowActionProps): string | null | undefined {
  return item.displayStatus === 'pending' ? item.expiresAt : item.closure?.at;
}

function factRowId(item: ListInvitations200ItemsItem, key: string): string {
  return `${invitationRowId(item)}:${key}`;
}

function invitationRowId(item: ListInvitations200ItemsItem): string {
  return `${item.kind}:${item.id}`;
}

type VisibleRow =
  | { kind: 'invitation'; item: ListInvitations200ItemsItem }
  | {
      kind: 'fact';
      item: ListInvitations200ItemsItem;
      fact: Fact;
    };

function visibleRows({
  items,
  expanded,
  timeZone,
}: {
  items: ListInvitations200ItemsItem[];
  expanded: ReadonlySet<string>;
  timeZone: string;
}): VisibleRow[] {
  return items.flatMap((item): VisibleRow[] => [
    { kind: 'invitation', item },
    ...(expanded.has(invitationRowId(item))
      ? factsOf({ item, timeZone }).map(
          (fact): VisibleRow => ({ kind: 'fact', item, fact }),
        )
      : []),
  ]);
}

/** The ⋯ menu with the actions the server allows; nothing when none. */
function RowActions({ item }: RowActionProps) {
  const { pending, resend } = useResend(item);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const addressable = isAddressable(item);
  const canResend = item.canResend && addressable;
  const canRevoke = item.canRevoke && addressable;
  if (!canResend && !canRevoke) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="max-md:size-11"
              aria-label={m.invitations_actions_label({ email: item.email })}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          {canResend ? (
            <DropdownMenuItem
              className="min-h-11 md:min-h-0"
              disabled={pending}
              onClick={resend}
            >
              {pending ? m.invitations_resending() : m.invitations_resend()}
            </DropdownMenuItem>
          ) : null}
          {canRevoke ? (
            <DropdownMenuItem
              className="min-h-11 md:min-h-0"
              variant="destructive"
              onClick={() => setRevokeOpen(true)}
            >
              {m.invitations_revoke()}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canRevoke ? (
        <RevokeDialog
          item={item}
          open={revokeOpen}
          onOpenChange={setRevokeOpen}
        />
      ) : null}
    </>
  );
}

interface ToggleProps {
  item: ListInvitations200ItemsItem;
  expanded: boolean;
  onToggle: (item: ListInvitations200ItemsItem) => void;
}

function InvitationCard({
  item,
  timeZone,
  expanded,
  onToggle,
}: InvitationRowProps & ToggleProps) {
  const date = endDate({ item });
  const panelId = `${invitationRowId(item)}:details`;
  return (
    <div className="surface-subtle workspace-panel space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
            {item.email}
          </span>
          <Badge variant="outline">{statusLabel(item.displayStatus)}</Badge>
        </div>
        <RowActions item={item} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Grants item={item} />
        {date ? (
          <span className="text-muted-foreground text-sm">
            {formatInstantOf({ value: date, timeZone })}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 px-2 text-sm"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() => onToggle(item)}
      >
        {expanded ? <ChevronDown /> : <ChevronRight />}
        {m.invitations_details()}
      </Button>
      {expanded ? (
        <ul
          id={panelId}
          className="space-y-1 text-muted-foreground text-sm [overflow-wrap:anywhere]"
        >
          {factsOf({ item, timeZone }).map((fact) => (
            <li key={fact.key}>{fact.text}</li>
          ))}
        </ul>
      ) : null}
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
  const committed = filters.email ?? '';
  const [email, setEmail] = useState(committed);
  const [syncedEmail, setSyncedEmail] = useState(committed);
  if (committed !== syncedEmail) {
    setSyncedEmail(committed);
    if (committed !== email.trim()) setEmail(committed);
  }
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trimmed = email.trim();
  useEffect(() => {
    if (trimmed === committed) return;
    timer.current = setTimeout(
      () =>
        latest.current.onChange({
          ...latest.current.filters,
          email: trimmed || undefined,
        }),
      300,
    );
    return () => clearTimeout(timer.current);
  }, [trimmed, committed]);
  const isAdmin = options?.invitedAs.includes('admin') ?? false;
  const showMinistry = isAdmin || (options?.ministries.length ?? 0) >= 2;
  const status = filters.status ?? 'pending';
  return (
    <form
      aria-label={m.invitations_filters_label()}
      className="flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        onChange({ ...filters, email: trimmed || undefined });
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="invitations-filter-email">
          {m.invitations_filter_email()}
        </Label>
        <Input
          id="invitations-filter-email"
          type="search"
          value={email}
          className="min-h-11 md:min-h-0"
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invitations-filter-status">
          {m.invitations_filter_status()}
        </Label>
        <Select
          value={status}
          onValueChange={(value) =>
            onChange({
              ...filters,
              status: value as InvitationFilters['status'],
            })
          }
        >
          <SelectTrigger
            id="invitations-filter-status"
            className="min-h-11 w-full md:min-h-0 md:w-48"
          >
            <SelectValue>
              {status === ANY
                ? m.invitations_filter_all()
                : statusLabel(status as StatusFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.invitations_filter_all()}</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {statusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showMinistry ? (
        <div className="flex flex-col gap-1">
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
            <SelectTrigger
              id="invitations-filter-ministry"
              className="min-h-11 w-full md:min-h-0 md:w-48"
            >
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
      <div className="flex flex-col gap-1">
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
          <SelectTrigger
            id="invitations-filter-invited-as"
            className="min-h-11 w-full md:min-h-0 md:w-48"
          >
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
    </form>
  );
}

interface InvitationListPageProps {
  filters: InvitationFilters;
  onFiltersChange: (filters: InvitationFilters) => void;
}

/** The Active Church's invitations and their history within the caller's authority, with Resend and Revoke where allowed. */
export function InvitationListPage({
  filters,
  onFiltersChange,
}: InvitationListPageProps) {
  const { churchTimezone } = useTimezone();
  const query = useInvitationList({ filters });
  const data =
    query.isError && !query.isFetchNextPageError ? undefined : query.data;
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const options = data?.pages[0]?.options;
  const counts = data?.pages[0]?.counts;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (item: ListInvitations200ItemsItem) =>
    setExpanded((current) => {
      const next = new Set(current);
      const id = invitationRowId(item);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const rows = visibleRows({ items, expanded, timeZone: churchTimezone });
  const status = filters.status ?? 'pending';
  const isFiltered = Boolean(
    filters.ministryId || filters.invitedAs || filters.email,
  );
  // A new filter set shows the previous rows only as placeholder data.
  const loading = query.isLoading || query.isPlaceholderData;
  // The server defaults to Pending, so the default status stays off the request.
  const change = (next: InvitationFilters) =>
    onFiltersChange({
      ...next,
      status: next.status === 'pending' ? undefined : next.status,
    });

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.nav_invitations()}
        description={m.invitations_description()}
        autoFocusTitle
        aside={
          counts ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <HeaderStatChip
                testId="invitations-pending-chip"
                label={m.invitations_stat_pending()}
                value={counts.pending}
              />
              <HeaderStatChip
                testId="invitations-expired-chip"
                label={m.invitations_stat_expired()}
                value={counts.expired}
              />
              <HeaderStatChip
                testId="invitations-accepted-chip"
                label={m.invitations_stat_accepted()}
                value={counts.accepted}
              />
            </div>
          ) : undefined
        }
      />
      <FilterBar filters={filters} options={options} onChange={change} />
      <div
        className={
          query.isSuccess &&
          !loading &&
          !isFiltered &&
          status === 'pending' &&
          items.length === 0
            ? 'space-y-2'
            : 'flex justify-end'
        }
      >
        {query.isSuccess &&
        !loading &&
        !isFiltered &&
        status === 'pending' &&
        items.length === 0 ? (
          <p role="status" className="text-muted-foreground">
            {m.invitations_empty()}
          </p>
        ) : null}
        <InviteDialog />
      </div>
      {query.isError && items.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-3">
            <span>{m.invitations_load_failed()}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => query.refetch()}
            >
              {m.invitations_retry()}
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Card className="surface-panel">
          <CardContent
            className="grid gap-3 md:gap-0"
            data-testid="invitations-loading"
          >
            <Skeleton className="hidden h-[41px] w-full md:block" />
            {[0, 1, 2].map((row) => (
              <Skeleton
                key={row}
                className="h-27 w-full md:mt-px md:h-[40px]"
              />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 &&
        !isFiltered &&
        status === 'pending' ? null : items.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {isFiltered
              ? m.invitations_empty_filtered()
              : status === 'pending'
                ? m.invitations_empty()
                : status === 'any'
                  ? m.invitations_empty_history()
                  : status === 'expired'
                    ? m.invitations_empty_expired()
                    : status === 'accepted'
                      ? m.invitations_empty_accepted()
                      : status === 'declined'
                        ? m.invitations_empty_declined()
                        : m.invitations_empty_revoked()}
          </p>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 md:min-h-0"
              onClick={() => change({ status: filters.status })}
            >
              {m.invitations_clear_filters()}
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="surface-panel">
          <CardContent className="space-y-3">
            <DataTable<VisibleRow>
              aria-label={m.invitations_list_label()}
              columns={[
                {
                  id: 'invitation',
                  name: m.invitations_column_invitation(),
                  isRowHeader: true,
                },
                { id: 'status', name: m.invitations_column_status() },
                { id: 'grants', name: m.invitations_column_grants() },
                { id: 'end', name: m.invitations_column_end() },
                { id: 'actions', name: m.invitations_column_actions() },
              ]}
              items={rows}
              mobileItems={rows.filter((row) => row.kind === 'invitation')}
              rowId={({ item }) =>
                item.kind === 'fact'
                  ? factRowId(item.item, item.fact.key)
                  : invitationRowId(item.item)
              }
              // react-aria memoizes a row's cells by key, so the toggle state is part of it.
              rowKey={({ item }) =>
                item.kind === 'fact'
                  ? factRowId(item.item, item.fact.key)
                  : `${invitationRowId(item.item)}:${expanded.has(invitationRowId(item.item))}`
              }
              renderCell={({ item: row, column }) => {
                const { item } = row;
                if (row.kind === 'fact') {
                  return column.id === 'invitation' ? (
                    <span className="pl-9 text-muted-foreground">
                      {row.fact.text}
                    </span>
                  ) : null;
                }
                if (column.id === 'status')
                  return (
                    <Badge variant="outline">
                      {statusLabel(item.displayStatus)}
                    </Badge>
                  );
                if (column.id === 'grants') return <Grants item={item} />;
                if (column.id === 'actions') return <RowActions item={item} />;
                if (column.id === 'end') {
                  const date = endDate({ item });
                  return date
                    ? formatInstantOf({ value: date, timeZone: churchTimezone })
                    : null;
                }
                const isOpen = expanded.has(invitationRowId(item));
                return (
                  <span className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-expanded={isOpen}
                      aria-controls={
                        isOpen
                          ? factsOf({ item, timeZone: churchTimezone })
                              .map(({ key }) => factRowId(item, key))
                              .join(' ')
                          : undefined
                      }
                      aria-label={
                        isOpen
                          ? m.invitations_collapse_label({ email: item.email })
                          : m.invitations_expand_label({ email: item.email })
                      }
                      onClick={() => toggle(item)}
                    >
                      {isOpen ? <ChevronDown /> : <ChevronRight />}
                    </Button>
                    <span className="font-medium [overflow-wrap:anywhere]">
                      {item.email}
                    </span>
                  </span>
                );
              }}
              renderMobileCard={({ item: row }) => (
                <InvitationCard
                  item={row.item}
                  timeZone={churchTimezone}
                  expanded={expanded.has(invitationRowId(row.item))}
                  onToggle={toggle}
                />
              )}
            />
            {query.isFetchNextPageError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center gap-3">
                  <span>{m.invitations_load_failed()}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 md:min-h-0"
                    onClick={() => query.fetchNextPage()}
                  >
                    {m.invitations_retry()}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {query.hasNextPage && !query.isFetchNextPageError ? (
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetchingNextPage}
                className="min-h-11 w-full md:min-h-0 md:w-auto"
                onClick={() => query.fetchNextPage()}
              >
                {query.isFetchingNextPage
                  ? m.invitations_loading_more()
                  : m.invitations_load_more()}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </WorkspacePage>
  );
}
