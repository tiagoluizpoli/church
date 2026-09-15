import { parseTimeOfDay, type TimeOfDay } from '@church/time';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TimeOfDayField } from './time-of-day-field';
import { renderWithProviders } from '@/__tests__/setup/render';

interface HarnessProps {
  initialValue?: TimeOfDay | null;
  onCommit: (value: TimeOfDay) => void;
}

/** A real consumer holds state and feeds `onChange` back into `value` — a
 * segmented field commits provisionally as soon as one digit reads as
 * unambiguous, so a static `value` prop makes later keystrokes fight a stale
 * controlled value. This harness is that round trip. */
function Harness({ initialValue = null, onCommit }: HarnessProps) {
  const [value, setValue] = useState<TimeOfDay | null>(initialValue);
  return (
    <TimeOfDayField
      aria-label="Start time"
      value={value}
      onChange={(next) => {
        setValue(next);
        onCommit(next);
      }}
      data-testid="time-field"
    />
  );
}

function renderField(initialValue: TimeOfDay | null = null) {
  const onCommit = vi.fn();
  renderWithProviders(
    <Harness initialValue={initialValue} onCommit={onCommit} />,
  );
  return { onCommit };
}

function segments() {
  const [hour, minute] = screen.getAllByRole('spinbutton');
  return { hour, minute };
}

/** Lets the pending-digit sync effect (`requestAnimationFrame`) settle —
 * mirrors the real frame gap between a keystroke and the next repaint. */
async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe('TimeOfDayField', () => {
  it('renders HH:mm, never AM/PM', () => {
    renderField(parseTimeOfDay({ value: '18:21' }));

    expect(screen.getByTestId('time-field')).toHaveTextContent('18:21');
    expect(screen.queryByText(/am|pm/i)).not.toBeInTheDocument();
  });

  it('cannot be driven to an impossible hour by typing 99', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    await user.keyboard('99');

    const value = Number(hour.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(23);
  });

  it('18:21 is enterable and commits as a TimeOfDay-branded value', async () => {
    const user = userEvent.setup();
    const { onCommit } = renderField();
    const { hour } = segments();

    await user.click(hour);
    await user.keyboard('18');
    await flushFrame();
    await user.keyboard('21');

    expect(onCommit).toHaveBeenLastCalledWith('18:21');
  });

  it('narrows the quick list to the four quarters of the typed hour', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    await user.keyboard('18');
    await flushFrame();

    const listbox = await screen.findByRole('listbox');
    await waitFor(() => {
      const options = within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options).toEqual(['18:00', '18:15', '18:30', '18:45']);
    });
  });

  it('narrows the minute list once the hour is settled and the caret moves on', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    // "10" settles the hour and auto-advances the caret to the minute segment.
    await user.keyboard('10');
    await flushFrame();
    await user.keyboard('1');
    await flushFrame();

    const listbox = await screen.findByRole('listbox');
    await waitFor(() => {
      const options = within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options).toEqual(['10:15']);
    });
  });

  it('opens the list scrolled to the row nearest the current value', async () => {
    renderField(parseTimeOfDay({ value: '14:32' }));
    const user = userEvent.setup();

    // The chevron opens the list as-is, without typing over the held value —
    // the mouse path to the same list a keyboard user reaches by typing.
    await user.click(
      screen.getByRole('button', { name: 'Pick a common time' }),
    );

    const listbox = await screen.findByRole('listbox');
    // 14:32 is nearest to 14:30.
    const nearest = listbox.querySelector('[data-nearest="true"]');
    expect(nearest).toHaveTextContent('14:30');
  });

  it('Up/Down move the highlighted row without moving focus off the segment', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    // "1" alone is still ambiguous (could become 10-19), so the caret stays.
    await user.keyboard('1');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}');

    expect(hour).toHaveFocus();
  });

  it('reports the highlighted row via aria-activedescendant on the segment', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    const listbox = await screen.findByRole('listbox');
    const [first, second] = within(listbox).getAllByRole('option');

    expect(hour).toHaveAttribute('aria-activedescendant', first?.id);

    await user.keyboard('{ArrowDown}');

    expect(hour).toHaveAttribute('aria-activedescendant', second?.id);
  });

  it('Home/End jump the highlight to either end of the option list', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    await user.keyboard('{End}');
    expect(hour).toHaveAttribute('aria-activedescendant', options.at(-1)?.id);

    await user.keyboard('{Home}');
    expect(hour).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('PageDown/PageUp move the highlight by an hour', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');

    await user.keyboard('{PageDown}');
    // Four quarter-hour rows make up one hour.
    expect(hour).toHaveAttribute('aria-activedescendant', options[4]?.id);

    await user.keyboard('{PageUp}');
    expect(hour).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('Enter commits the highlighted row', async () => {
    const user = userEvent.setup();
    const { onCommit } = renderField();
    const { hour } = segments();

    await user.click(hour);
    await user.keyboard('18');
    await flushFrame();
    await screen.findByRole('listbox');

    await user.keyboard('{Enter}');

    expect(onCommit).toHaveBeenLastCalledWith('18:00');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape closes the list and leaves the segment focused', async () => {
    const user = userEvent.setup();
    renderField();
    const { hour } = segments();

    await user.click(hour);
    await user.keyboard('1');
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(hour).toHaveFocus();
  });

  it('a value in the first hour of the day still reads as its own two-digit hour', () => {
    renderField(parseTimeOfDay({ value: '00:05' }));

    expect(screen.getByTestId('time-field')).toHaveTextContent('00:05');
  });
});
