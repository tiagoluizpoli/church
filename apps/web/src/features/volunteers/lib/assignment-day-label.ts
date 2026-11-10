import { getLocale } from '@church/i18n/runtime';
import { formatDayLabel } from '@church/time';
import { dayOf } from '@/shared/utils/church-time';

interface AssignmentDayLabelInput {
  startTime: string;
  timeZone: string;
}

/** `Sun 12 Oct`, the day in the Church Timezone (ADR-0003), never the viewer's. */
export function assignmentDayLabel({
  startTime,
  timeZone,
}: AssignmentDayLabelInput): string {
  return formatDayLabel({
    day: dayOf({ value: startTime, timeZone }),
    locale: getLocale(),
  });
}
