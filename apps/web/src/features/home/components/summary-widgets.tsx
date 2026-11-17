import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';
import { HomeWidget } from '@/features/home/components/home-widget';
import { useHomeSchedules } from '@/features/home/components/leadership-section';
import { homeSectionQueryKey } from '@/features/home/lib/home-query-keys';
import { notificationQueryKey } from '@/features/notifications/lib/notification-cache';
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
  href: string;
}
function Metric({ label, count, href }: MetricProps) {
  return (
    <a
      href={href}
      className="flex min-h-11 flex-col justify-center rounded-md border p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="font-semibold text-2xl tabular-nums">{count}</span>{' '}
      <span>{label}</span>
    </a>
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric
            label={m.schedules_to_prepare()}
            count={counts.to_prepare}
            href="/schedules?stage=to_prepare"
          />
          <Metric
            label={m.schedules_asking_stage()}
            count={counts.asking}
            href="/schedules?stage=asking"
          />
          <Metric
            label={m.schedules_assigning()}
            count={counts.assigning}
            href="/schedules?stage=assigning"
          />
          <Metric
            label={m.schedules_published()}
            count={counts.published}
            href="/schedules?stage=published"
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric
            label={m.home_people_total()}
            count={people.data.counts.total}
            href="/people"
          />
          <Metric
            label={m.home_admins()}
            count={people.data.counts.admins}
            href="/people?access=admin"
          />
          <Metric
            label={m.home_leaders()}
            count={people.data.counts.leaders}
            href="/people?access=leader"
          />
          <Metric
            label={m.home_volunteers()}
            count={people.data.counts.volunteers}
            href="/people?access=volunteer"
          />
          <Metric
            label={m.home_people_without_ministry()}
            count={people.data.counts.withoutMinistry}
            href="/people?withoutMinistry=true"
          />
          <Metric
            label={m.home_invites_pending()}
            count={invitations.data.counts.pending}
            href="/invitations?status=pending"
          />
          <Metric
            label={m.home_invites_expired()}
            count={invitations.data.counts.expired}
            href="/invitations?status=expired"
          />
          <Metric
            label={m.home_ministries_review()}
            count={ministries.data.counts.review}
            href="/ministries?status=review"
          />
          <Metric
            label={m.home_ministries_no_sectors()}
            count={ministries.data.counts.noSectors}
            href="/ministries?status=no-sectors"
          />
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
  return (
    <HomeWidget
      title={m.home_notifications()}
      loading={query.isPending}
      error={
        query.isError
          ? { message: m.home_load_error(), retry: () => query.refetch() }
          : undefined
      }
    >
      <Link
        to="/notifications"
        className="inline-flex min-h-11 items-center underline"
      >
        {m.notification_unread_count({ count: query.data?.unreadCount ?? 0 })}
      </Link>
    </HomeWidget>
  );
}
