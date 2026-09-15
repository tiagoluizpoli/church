import { act, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

interface FillTimeOfDayFieldInput {
  user: UserEvent;
  /** The `TimeOfDayField` root (its `data-testid` locator) — its two
   * segments are React Aria spinbuttons, not a fillable native input. */
  field: HTMLElement;
  /** `HH:mm`, matching the field's own `TimeOfDay` storage format. */
  time: string;
}

/** React Aria syncs the pending-digit buffer a frame after the keystroke it
 * reacts to (`requestAnimationFrame` in `time-of-day-field.tsx`), so typing
 * the second half of a segment before that frame lands fights a stale read of
 * what the first half already committed. */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

/** Drives the segmented `TimeOfDayField` (`src/components/time-of-day-field.tsx`)
 * like a user: click the hour segment, then type both halves. A fresh
 * keystroke right after focus replaces whatever the segment already held
 * (react-aria's own behaviour), so this works whether the field started
 * empty or with a value. */
export async function fillTimeOfDayField({
  user,
  field,
  time,
}: FillTimeOfDayFieldInput): Promise<void> {
  const [hours, minutes] = time.split(':');
  const [hour] = within(field).getAllByRole('spinbutton');
  if (!hour) {
    throw new Error('TimeOfDayField has no hour segment');
  }

  await user.click(hour);
  await user.keyboard(hours ?? '');
  await flushFrame();
  await user.keyboard(minutes ?? '');
  await flushFrame();
}
