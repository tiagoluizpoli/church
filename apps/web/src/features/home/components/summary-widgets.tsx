import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link, type LinkProps, linkOptions } from '@tanstack/react-router';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { useHomeSchedules } from '@/features/home/components/leadership-section';
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

interface SummaryProps extends HomeSectionProps {
  scope: string;
}
interface MetricProps {
  label: string;
  count: number;
  link: LinkProps;
  attention?: boolean;
}
/** One stat cell: the whole cell is the link; a zero is muted, a non-zero needing attention gets the accent. */
function Metric({ label, count, link, attention }: MetricProps) {
  return (
    <Link
      {...link}
      className={cn(
        'flex min-h-11 rounded-md px-2 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
        attention
          ? 'items-center gap-3 xl:flex-col xl:items-start xl:justify-center xl:gap-0'
          : 'flex-col justify-center',
      )}
    >
      <span
        className={cn(
          'font-semibold tabular-nums',
          attention ? 'min-w-6 text-xl xl:text-3xl' : 'text-3xl',
          count === 0 && 'text-muted-foreground',
          attention && count > 0 && 'text-primary',
        )}
      >
        {count}
      </span>{' '}
      <span className="text-muted-foreground text-sm">{label}</span>
    </Link>
  );
}
export function ScheduleSummary(props: SummaryProps) {
  const query = useHomeSchedules(props);
  const counts = query.data?.counts;
  return (
    <HomeWidget
      title={m.home_summary()}
      loading={query.isPending}
      error={
        query.isError
          ? { message: m.schedules_error(), retry: () => query.refetch() }
          : undefined
      }
    >
      {counts ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:grid-cols-4">
          <Metric
            label={m.schedules_to_prepare()}
            count={counts.to_prepare}
            link={linkOptions({
              to: '/schedules',
              search: { stage: 'to_prepare' },
            })}
          />
          <Metric
            label={m.schedules_asking_stage()}
            count={counts.asking}
            link={linkOptions({
              to: '/schedules',
              search: { stage: 'asking' },
            })}
          />
          <Metric
            label={m.schedules_assigning()}
            count={counts.assigning}
            link={linkOptions({
              to: '/schedules',
              search: { stage: 'assigning' },
            })}
          />
          <Metric
            label={m.schedules_published()}
            count={counts.published}
            link={linkOptions({
              to: '/schedules',
              search: { stage: 'published' },
            })}
          />
        </div>
      ) : null}
    </HomeWidget>
  );
}
export function AdminSummary({ churchId, userId }: HomeSectionProps) {
  const people = useQuery({
    queryKey: homeSectionQueryKey({
      section: 'church',
      churchId,
      userId,
      parts: ['people-counts'],
    }),
    queryFn: () => peopleApi.listPeople({ limit: 1 }),
  });
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
      {people.data && invitations.data && ministries.data ? (
        <div className="space-y-4">
          <section aria-label={m.home_people_group()} className="space-y-2">
            <h3 className="font-medium">{m.home_people_group()}</h3>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:grid-cols-4">
              <Metric
                label={m.home_people_total()}
                count={people.data.counts.total}
                link={linkOptions({ to: '/people' })}
              />
              <Metric
                label={m.home_admins()}
                count={people.data.counts.admins}
                link={linkOptions({
                  to: '/people',
                  search: { access: 'admin' },
                })}
              />
              <Metric
                label={m.home_leaders()}
                count={people.data.counts.leaders}
                link={linkOptions({
                  to: '/people',
                  search: { access: 'leader' },
                })}
              />
              <Metric
                label={m.home_volunteers()}
                count={people.data.counts.volunteers}
                link={linkOptions({
                  to: '/people',
                  search: { access: 'volunteer' },
                })}
              />
            </div>
          </section>
          <section
            aria-label={m.home_attention_group()}
            className="space-y-2 border-t pt-4"
          >
            <h3 className="font-medium">{m.home_attention_group()}</h3>
            {people.data.counts.withoutMinistry === 0 &&
            invitations.data.counts.pending === 0 &&
            invitations.data.counts.expired === 0 &&
            ministries.data.counts.review === 0 &&
            ministries.data.counts.noSectors === 0 ? (
              <p className="text-muted-foreground">{m.home_all_clear()}</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-2 xl:grid-cols-5 xl:gap-y-3">
                <Metric
                  attention
                  label={m.home_people_without_ministry()}
                  count={people.data.counts.withoutMinistry}
                  link={linkOptions({
                    to: '/people',
                    search: { withoutMinistry: true },
                  })}
                />
                <Metric
                  attention
                  label={m.home_invites_pending()}
                  count={invitations.data.counts.pending}
                  link={linkOptions({
                    to: '/invitations',
                    search: { status: 'pending' },
                  })}
                />
                <Metric
                  attention
                  label={m.home_invites_expired()}
                  count={invitations.data.counts.expired}
                  link={linkOptions({
                    to: '/invitations',
                    search: { status: 'expired' },
                  })}
                />
                <Metric
                  attention
                  label={m.home_ministries_review()}
                  count={ministries.data.counts.review}
                  link={linkOptions({
                    to: '/ministries',
                    search: { status: 'review' },
                  })}
                />
                <Metric
                  attention
                  label={m.home_ministries_no_sectors()}
                  count={ministries.data.counts.noSectors}
                  link={linkOptions({
                    to: '/ministries',
                    search: { status: 'no-sectors' },
                  })}
                />
              </div>
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
      <Pending role="status" aria-label={m.home_notifications()}>
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
      to="/notifications"
      className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4"
    >
      {m.home_notifications()} ·{' '}
      {notificationUnreadLabel(query.data.unreadCount)}
    </Link>
  );
}
