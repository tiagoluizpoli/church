import { m } from '@church/i18n/messages';
import { parseTimeOfDay } from '@church/time';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ShiftSplitEditor } from '@/features/scheduling/components/shift-split-editor/shift-split-editor';
import { renderWithProviders } from '@/tests/setup/render';

const BLOCK = {
  startTime: parseTimeOfDay({ value: '09:00' }),
  endTime: parseTimeOfDay({ value: '12:00' }),
};

it('keeps every control inert while read-only', async () => {
  const onChange = vi.fn();
  renderWithProviders(
    <ShiftSplitEditor
      draft={{
        mode: 'manual',
        equalCount: '2',
        spans: [
          {
            key: 'first',
            label: 'Morning',
            startTime: BLOCK.startTime,
            endTime: BLOCK.endTime,
          },
        ],
      }}
      block={BLOCK}
      problems={{ count: false, noSpans: false, spans: [null] }}
      onChange={onChange}
      disabled
    />,
  );
  const user = userEvent.setup();
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio).toHaveAttribute('aria-disabled', 'true');
    await user.click(radio);
  }
  await user.click(screen.getByText(m.shift_split_mode_whole()));
  for (const spinbutton of screen.getAllByRole('spinbutton'))
    expect(spinbutton).toHaveAttribute('aria-disabled', 'true');
  expect(onChange).not.toHaveBeenCalled();
});
