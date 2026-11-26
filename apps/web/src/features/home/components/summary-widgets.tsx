import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link, type LinkProps, linkOptions } from '@tanstack/react-router';
import {
  Check,
  ClipboardCheck,
  HandHeart,
  Layers,
  type LucideIcon,
  Mail,
  MailX,
  ShieldCheck,
  UserCog,
  UserX,
} from 'lucide-react';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type {
  HomeReadProps,
  HomeSectionProps,
} from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { notificationQueryKey } from '@/features/notifications/lib/notification-cache';
import { notificationUnreadLabel } from '@/features/notifications/lib/notification-unread-label';
import { cn } from '@/lib/utils';
import {
  adminApi,
  invitationsApi,
  notificationsApi,
  peopleApi,
} from '@/utils/api-instances';

interface AttentionRowProps {
  label: string;
  count: number;
  link: LinkProps;
  Icon: LucideIcon;
}

/** One needs-attention fact: amber count while something waits, a quiet check once clear. */
function AttentionRow({ label, count, link, Icon }: AttentionRowProps) {
  return (
    <li>
      <Link
        {...link}
        className="radius-control -mx-2 flex min-h-11 items-center gap-3 px-2 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className={cn(
            'radius-icon flex size-8 shrink-0 items-center justify-center',
            count > 0
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {count > 0 ? (
            <Icon className="size-4" />
          ) : (
            <Check className="size-4" />
          )}
        </span>
        <span
          className={cn(
            'flex-1 text-sm',
            count === 0 && 'text-muted-foreground',
          )}
        >
          {label}
        </span>{' '}
        <span
          className={cn(
            'font-semibold tabular-nums',
            count > 0
              ? 'text-amber-700 text-lg dark:text-amber-400'
              : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      </Link>
    </li>
  );
}

interface PeopleRowProps {
  label: string;
  count: number;
  link: LinkProps;
  Icon: LucideIcon;
}

/** A plain count row with the same rhythm as the attention rows beside it. */
function PeopleRow({ label, count, link, Icon }: PeopleRowProps) {
  return (
    <li>
      <Link
        {...link}
        className="radius-control -mx-2 flex min-h-11 items-center gap-3 px-2 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="radius-icon flex size-8 shrink-0 items-center justify-center bg-primary/8 text-primary"
        >
          <Icon className="size-4" />
        </span>
        <span className="flex-1 text-sm">{label}</span>{' '}
        <span className="font-semibold tabular-nums">{count}</span>
      </Link>
    </li>
  );
}

export function usePeopleCounts({
  churchId,
  userId,
  enabled = true,
}: HomeReadProps) {
  return useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['people-counts'],
    }),
    queryFn: () => peopleApi.listPeople({ limit: 1 }),
    enabled,
  });
}

export function AdminSummary({ churchId, userId }: HomeSectionProps) {
  const people = usePeopleCounts({ churchId, userId });
  const invitations = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['invitation-counts'],
    }),
    queryFn: () => invitationsApi.listInvitations({ limit: 1 }),
  });
  const ministries = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['ministry-counts'],
    }),
    queryFn: () => adminApi.listMinistryDirectory({ limit: 1 }),
  });
  const error = people.isError || invitations.isError || ministries.isError;
  const counts = people.data?.counts;
  const serving = counts ? counts.total - counts.withoutMinistry : 0;
  const attention =
    people.data && invitations.data && ministries.data
      ? [
          {
            label: m.home_people_without_ministry(),
            count: people.data.counts.withoutMinistry,
            link: linkOptions({
              to: '/app/people',
              search: { withoutMinistry: true },
            }),
            Icon: UserX,
          },
          {
            label: m.home_invites_pending(),
            count: invitations.data.counts.pending,
            link: linkOptions({
              to: '/app/invitations',
              search: { status: 'pending' },
            }),
            Icon: Mail,
          },
          {
            label: m.home_invites_expired(),
            count: invitations.data.counts.expired,
            link: linkOptions({
              to: '/app/invitations',
              search: { status: 'expired' },
            }),
            Icon: MailX,
          },
          {
            label: m.home_ministries_review(),
            count: ministries.data.counts.review,
            link: linkOptions({
              to: '/app/ministries',
              search: { status: 'review' },
            }),
            Icon: ClipboardCheck,
          },
          {
            label: m.home_ministries_no_sectors(),
            count: ministries.data.counts.noSectors,
            link: linkOptions({
              to: '/app/ministries',
              search: { status: 'no-sectors' },
            }),
            Icon: Layers,
          },
        ]
      : null;
  return (
    <HomeWidget
      title={m.home_section_church()}
      loading={
        people.isPending || invitations.isPending || ministries.isPending
      }
      error={
        error
          ? {
              message: m.home_load_error(),
              retry: () => {
                void people.refetch();
                void invitations.refetch();
                void ministries.refetch();
              },
            }
          : undefined
      }
    >
      {counts && attention ? (
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <section aria-label={m.home_people_group()} className="space-y-3">
            <h3 className="font-medium text-sm">{m.home_people_group()}</h3>
            <Link
              to="/app/people"
              className="radius-control -mx-2 block space-y-2 px-2 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold text-2xl tabular-nums">
                    {counts.total}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {m.home_people_total()}
                  </span>
                </span>{' '}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {m.home_people_serving({ count: serving })}
                </span>
              </span>
              <span
                aria-hidden
                className="radius-control block h-1.5 overflow-hidden bg-muted"
              >
                <span
                  className="radius-control block h-full bg-chart-1"
                  style={{
                    width: `${counts.total ? (serving * 100) / counts.total : 0}%`,
                  }}
                />
              </span>
            </Link>
            <ul>
              <PeopleRow
                label={m.home_admins()}
                count={counts.admins}
                link={linkOptions({
                  to: '/app/people',
                  search: { access: 'admin' },
                })}
                Icon={ShieldCheck}
              />
              <PeopleRow
                label={m.home_leaders()}
                count={counts.leaders}
                link={linkOptions({
                  to: '/app/people',
                  search: { access: 'leader' },
                })}
                Icon={UserCog}
              />
              <PeopleRow
                label={m.home_volunteers()}
                count={counts.volunteers}
                link={linkOptions({
                  to: '/app/people',
                  search: { access: 'volunteer' },
                })}
                Icon={HandHeart}
              />
            </ul>
          </section>
          <section
            aria-label={m.home_attention_group()}
            className="space-y-3 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
          >
            <h3 className="font-medium text-sm">{m.home_attention_group()}</h3>
            {attention.every(({ count }) => count === 0) ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Check aria-hidden className="size-4" />
                {m.home_all_clear()}
              </p>
            ) : (
              <ul>
                {attention.map((row) => (
                  <AttentionRow key={row.label} {...row} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </HomeWidget>
  );
}

export function NotificationSummary({ churchId, userId }: HomeSectionProps) {
  const query = useQuery({
    queryKey: notificationQueryKey({ churchId, userId }),
    queryFn: () => notificationsApi.getNotifications(),
  });
  if (query.isPending)
    return (
      <Pending label={m.home_notifications()}>
        <Skeleton className="h-6 w-48" />
      </Pending>
    );
  if (query.isError)
    return (
      <HomeError
        message={m.home_load_error()}
        onRetry={() => query.refetch()}
      />
    );
  return (
    <Link
      to="/app/notifications"
      className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
    >
      {m.home_notifications()} ·{' '}
      {notificationUnreadLabel(query.data.unreadCount)}
    </Link>
  );
}
