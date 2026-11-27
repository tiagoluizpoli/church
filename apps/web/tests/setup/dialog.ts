import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/** base-ui moves focus into a dialog that just opened a frame later
 * (`enqueueFocus` → `requestAnimationFrame` in its `FloatingFocusManager`), so
 * a test that types before that frame loses keystrokes to the move. Wait for
 * focus to land inside an open dialog before driving it. */
export async function waitForDialogFocus(): Promise<void> {
  await waitFor(() =>
    expect(
      document.activeElement?.closest('[role="dialog"], [role="alertdialog"]'),
    ).toBeInstanceOf(HTMLElement),
  );
}
