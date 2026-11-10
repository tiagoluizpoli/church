import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import {
  formatDayLabel,
  formatTimeOfDay,
  parseInstant,
  today,
  toTimeOfDay,
} from '@church/time';
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
    case 'availability_opened':
      return {
        title: m.notification_availability_opened_title(item.data),
        body: availabilityBody({ data: item.data, isReminder: false }),
        kindLabel: m.notification_kind_availability_opened(),
        actionLabel: m.email_availability_action(),
      };
    case 'availability_reminder':
      return {
        title: m.notification_availability_reminder_title(item.data),
        body: availabilityBody({ data: item.data, isReminder: true }),
        kindLabel: m.notification_kind_availability_reminder(),
        actionLabel: m.email_availability_action(),
      };
    case 'schedule_published': {
      const { data } = item;
      const timeZone = data.churchTimezone;
      const shifts = data.shifts.map((shift) => {
        const startsAt = parseInstant({ value: shift.startsAt });
        const endsAt = parseInstant({ value: shift.endsAt });
        const day = formatDayLabel({
          day: today({ instant: startsAt, timeZone }),
          locale: getLocale(),
        });
        const start = formatTimeOfDay({
          time: toTimeOfDay({ instant: startsAt, timeZone }),
        });
        const end = formatTimeOfDay({
          time: toTimeOfDay({ instant: endsAt, timeZone }),
        });
        return [
          day,
          `${start}–${end}`,
          shift.eventTitle,
          shift.roleName,
          shift.sectorName,
        ].join(' · ');
      });
      return {
        title: m.notification_schedule_published_title({
          ministryName: data.ministryName,
        }),
        body: [
          m.notification_schedule_published_body({
            cycleName: data.cycleName,
            ministryName: data.ministryName,
          }),
          ...shifts,
        ].join('\n'),
        kindLabel: m.notification_kind_schedule_published(),
        actionLabel: m.email_schedule_published_action(),
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
  shiftCount?: number;
  answerBy?: string;
  deadlinePassed?: boolean;
}

interface AvailabilityBodyInput {
  data: AvailabilityData;
  isReminder: boolean;
}

/**
 * The email's fact lines; rows frozen before the count and Deadline lack them.
 * Only N4 says the Deadline was missed; N3 always says Answer by. Cycle bounds
 * and the Deadline name days, so no timezone applies.
 */
function availabilityBody({ data, isReminder }: AvailabilityBodyInput) {
  const { shiftCount, answerBy, deadlinePassed } = data;
  const days = {
    startDate: formatCalendarDateOnly({ value: data.cycleStartDate }),
    endDate: formatCalendarDateOnly({ value: data.cycleEndDate }),
  };
  const body = (shifts: string) =>
    isReminder
      ? m.notification_availability_reminder_body({ shifts, ...days })
      : m.notification_availability_opened_body({ shifts, ...days });
  const shifts =
    shiftCount === undefined
      ? m.notification_availability_span(days)
      : body(
          pluralMessage({
            count: shiftCount,
            one: () => m.notification_availability_shifts_one(),
            other: () =>
              m.notification_availability_shifts_other({ count: shiftCount }),
          }),
        );
  const markOnly = m.notification_availability_mark_only();
  if (answerBy === undefined) return `${shifts}\n${markOnly}`;
  const deadline = formatCalendarDateOnly({ value: answerBy });
  const answerLine =
    isReminder && deadlinePassed
      ? m.notification_availability_deadline_passed({ deadline })
      : m.notification_availability_answer_by({ deadline });
  return `${shifts}\n${answerLine}\n${markOnly}`;
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
