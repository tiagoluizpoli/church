import type { Locator } from '@playwright/test';

interface FillTimeOfDayFieldInput {
  /** The `TimeOfDayField` root (its `data-testid`/`aria-label` locator) —
   * not a native input, so this can't be `.fill()`-ed directly. */
  field: Locator;
  /** `HH:mm`, matching the field's own `TimeOfDay` storage format. */
  time: string;
}

/** Drives the segmented `TimeOfDayField` (`src/components/time-of-day-field.tsx`)
 * like a user: click the hour segment, then type both halves. Two digits settle
 * a segment and auto-advance react-aria's caret to the next one, so typing the
 * hour then the minute in sequence fills the whole field. Escape afterwards
 * closes the quick-pick list the field opens while typing, so it doesn't
 * intercept a later click on an unrelated element. */
export async function fillTimeOfDayField({
  field,
  time,
}: FillTimeOfDayFieldInput): Promise<void> {
  const [hours, minutes] = time.split(':');
  const hourSegment = field.getByRole('spinbutton').first();

  await hourSegment.click();
  await field.page().keyboard.type(hours ?? '');
  await field.page().keyboard.type(minutes ?? '');
  await field.page().keyboard.press('Escape');
}
