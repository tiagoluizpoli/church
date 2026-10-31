import { m } from '@church/i18n/messages';
import type { GetNotifications200ItemsItem } from '@/infrastructure/api/churchAPI.schemas';
import {
  formatCalendarDateOnly,
  formatInstantOf,
} from '@/shared/utils/church-time';

export interface RenderedNotification {
  title: string;
  body: string;
  kindLabel: string;
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
        title: m.notification_ministry_invitation_title({
          ministryName: item.data.ministryName,
        }),
        body: m.notification_ministry_invitation_body({
          ministryName: item.data.ministryName,
        }),
        kindLabel: m.notification_kind_ministry_invitation(),
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
    default:
      return {
        title: m.notification_unknown_title(),
        body: m.notification_unknown_body(),
        kindLabel: m.notification_unknown_kind(),
      };
  }
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
