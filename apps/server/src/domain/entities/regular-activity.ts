import type { TimeOfDay } from '@church/time';
import type { Recurrence } from '../recurrence';

/** A public TemplateTimeBlock as the Church Programme shows it. */
export interface RegularActivity {
  /** The template's Recurrence. */
  recurrence: Recurrence;
  /** Ordinals of the nth weekdays on which a template that won over this one replaces it ("exceto o 1º"). */
  exceptOrdinals: (1 | 2 | 3 | 4 | 5 | 'last')[];
  startTime: TimeOfDay;
  label: string;
  place: string | null;
  /** The place is the Main Address, which the page already shows. */
  atMainAddress: boolean;
}
