import { m } from '@church/i18n/messages';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import {
  formatCalendarDateOnly,
  formatInstantOf,
} from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';

export interface RenderedNotification {
  title: string;
  body: string;
  kindLabel: string;
  /** The detail action's words when the kind names its own. */
  actionLabel?: string;
}

/**
 * Words for a Notification, rendered at read time from its kind and frozen
 * data, so the cached history follows a locale change. A kind this build does
 * not know yet (a later Flow, or a stale client) stays readable.
 */
export function renderNotification(
  item: GetNotifications200ItemsItem,
): RenderedNotification {
  switch (item.kind) {
    case 'ministry_invitation':
      return {
        ...ministryInvitationWords(item.data),
        kindLabel: m.notification_kind_ministry_invitation(),
        actionLabel: m.notification_ministry_invitation_action(),
      };
    case 'availability_opened': {
      const facts = availabilityFacts(item.data);
      return {
        title: m.notification_availability_opened_title(facts),
        body: m.notification_availability_opened_body(facts),
        kindLabel: m.notification_kind_availability_opened(),
      };
    }
    case 'availability_reminder': {
      const facts = availabilityFacts(item.data);
      return {
        title: m.notification_availability_reminder_title(facts),
        body: m.notification_availability_reminder_body(facts),
        kindLabel: m.notification_kind_availability_reminder(),
      };
    }
    case 'schedule_published': {
      const { data } = item;
      const at = (value: string) =>
        formatInstantOf({ value, timeZone: data.churchTimezone });
      const shifts =
        data.shifts.length > 0
          ? m.notification_schedule_published_shifts({
              shifts: data.shifts
                .map((shift) => `${shift.roleName} (${at(shift.startsAt)})`)
                .join(', '),
            })
          : m.notification_schedule_published_no_shifts();
      return {
        title: m.notification_schedule_published_title({
          ministryName: data.ministryName,
        }),
        body: `${m.notification_schedule_published_body({
          eventTitle: data.eventTitle,
          startsAt: at(data.eventStart),
          ministryName: data.ministryName,
        })}\n${shifts}`,
        kindLabel: m.notification_kind_schedule_published(),
      };
    }
    case 'cycle_ready_to_prepare':
      return {
        ...cycleReadyToPrepareWords(item.data),
        kindLabel: m.notification_kind_cycle_ready_to_prepare(),
        actionLabel: m.notification_cycle_ready_to_prepare_action(),
      };
    default:
      return {
        title: m.notification_unknown_title(),
        body: m.notification_unknown_body(),
        kindLabel: m.notification_unknown_kind(),
      };
  }
}

type MinistryInvitationData = Extract<
  GetNotifications200ItemsItem,
  { kind: 'ministry_invitation' }
>['data'];

/**
 * T1's inviter-led offer from the frozen facts. A row stored before those
 * facts existed keeps its original words rather than guessing them.
 */
function ministryInvitationWords(data: MinistryInvitationData) {
  const { ministryName, churchName, churchTimezone, inviterName } = data;
  const { ministryAccessLevel, roleNames, expiresAt } = data;
  if (
    churchName === undefined ||
    churchTimezone === undefined ||
    inviterName === undefined ||
    ministryAccessLevel === undefined ||
    roleNames === undefined ||
    expiresAt === undefined
  ) {
    return {
      title: m.notification_ministry_invitation_title({ ministryName }),
      body: m.notification_ministry_invitation_body({ ministryName }),
    };
  }
  const names = { inviterName, ministryName, churchName };
  const isLeader = ministryAccessLevel === 'leader';
  const expires = m.email_invitation_expires({
    expiresAt: formatInstantOf({ value: expiresAt, timeZone: churchTimezone }),
  });
  return {
    title: isLeader
      ? m.email_invitation_lead_title(names)
      : m.email_invitation_serve_title(names),
    body: [
      isLeader
        ? m.email_invitation_lead_body_inviter(names)
        : m.email_invitation_serve_body_inviter(names),
      ...(roleNames.length > 0
        ? [m.email_invitation_roles({ roles: roleNames.join(', ') })]
        : []),
      expires,
    ].join('\n'),
  };
}

interface AvailabilityData {
  ministryName: string;
  cycleName: string;
  cycleStartDate: string;
  cycleEndDate: string;
}

/** Cycle bounds name days, so they never pass through a timezone. */
function availabilityFacts(data: AvailabilityData) {
  return {
    ministryName: data.ministryName,
    cycleName: data.cycleName,
    startDate: formatCalendarDateOnly({ value: data.cycleStartDate }),
    endDate: formatCalendarDateOnly({ value: data.cycleEndDate }),
  };
}

type CycleReadyToPrepareData = Extract<
  GetNotifications200ItemsItem,
  { kind: 'cycle_ready_to_prepare' }
>['data'];

/** N2: the sent Cycle, its days and Events, and the recipient's Ministries. */
function cycleReadyToPrepareWords(data: CycleReadyToPrepareData) {
  const { cycleName, eventCount, ministries } = data;
  const events = pluralMessage({
    count: eventCount,
    one: m.notification_cycle_ready_to_prepare_events_one,
    other: () =>
      m.notification_cycle_ready_to_prepare_events_other({ count: eventCount }),
  });
  const ministryList = {
    ministryNames: ministries.map((ministry) => ministry.name).join(', '),
  };
  return {
    title: m.notification_cycle_ready_to_prepare_title({ cycleName }),
    body: [
      m.notification_cycle_ready_to_prepare_body({
        cycleName,
        startDate: formatCalendarDateOnly({ value: data.cycleStartDate }),
        endDate: formatCalendarDateOnly({ value: data.cycleEndDate }),
        events,
      }),
      pluralMessage({
        count: ministries.length,
        one: () =>
          m.notification_cycle_ready_to_prepare_ministries_one(ministryList),
        other: () =>
          m.notification_cycle_ready_to_prepare_ministries_other(ministryList),
      }),
    ].join('\n'),
  };
}
