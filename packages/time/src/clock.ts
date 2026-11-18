import type { TimeOfDay } from './brands';
import { toTimeOfDay } from './conversion';
import { now } from './now';

export {
  now,
  nowAsDate,
  resetClock,
  type SetTestClockInput,
  setTestClock,
} from './now';

export interface CurrentTimeOfDayInput {
  timeZone: string;
}

export function currentTimeOfDay({
  timeZone,
}: CurrentTimeOfDayInput): TimeOfDay {
  return toTimeOfDay({ instant: now(), timeZone });
}
