import type { TimeOfDay } from '@church/time';
import type { Recurrence } from '../recurrence';

/** A public TemplateTimeBlock as the Church Programme shows it. */
export interface RegularActivity {
  /** The template's Recurrence. */
  recurrence: Recurrence;
  startTime: TimeOfDay;
  label: string;
  place: string | null;
}
