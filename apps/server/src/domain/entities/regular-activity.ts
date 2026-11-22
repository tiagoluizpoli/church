import type { TimeOfDay } from '@church/time';

/** Weekly on the template's weekday; monthly recurrence can extend this union. */
export type RegularActivityRecurrence = { kind: 'weekly'; weekday: number };

/** A public TemplateTimeBlock as the Church Programme shows it. */
export interface RegularActivity {
  recurrence: RegularActivityRecurrence;
  startTime: TimeOfDay;
  label: string;
  place: string | null;
}
