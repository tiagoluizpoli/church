import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateRecurrence } from '@/features/scheduling/components/planning-admin/planning-admin.types';
import { RecurrenceEditor } from '@/features/scheduling/components/planning-admin/recurrence-editor';
import { renderWithProviders } from '@/tests/setup/render';

function Harness({
  initial,
  onChange,
}: {
  initial: TemplateRecurrence;
  onChange: (recurrence: TemplateRecurrence) => void;
}) {
  const [recurrence, setRecurrence] = useState(initial);
  return (
    <RecurrenceEditor
      recurrence={recurrence}
      onChange={({ recurrence: next }) => {
        setRecurrence(next);
        onChange(next);
      }}
    />
  );
}

function setup(initial: TemplateRecurrence) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<Harness initial={initial} onChange={onChange} />);
  return { user, onChange };
}

const lastCall = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0];

describe('RecurrenceEditor weekly', () => {
  it('toggles several weekdays and keeps at least one', async () => {
    const { user, onChange } = setup({ kind: 'weekly', weekdays: [0] });

    expect(screen.getByTestId('template-weekday-toggle-0')).toBeDisabled();
    await user.click(screen.getByTestId('template-weekday-toggle-3'));
    expect(lastCall(onChange)).toEqual({ kind: 'weekly', weekdays: [0, 3] });

    await user.click(screen.getByTestId('template-weekday-toggle-0'));
    expect(lastCall(onChange)).toEqual({ kind: 'weekly', weekdays: [3] });
    expect(screen.getByTestId('template-weekday-toggle-3')).toBeDisabled();
  });

  it('switches to monthly with one starting entry', async () => {
    const { user, onChange } = setup({ kind: 'weekly', weekdays: [0] });

    await user.click(screen.getByTestId('template-recurrence-kind'));
    await user.click(screen.getByTestId('template-recurrence-kind-monthly'));

    expect(lastCall(onChange)).toEqual({
      kind: 'monthly',
      entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
    });
  });
});

describe('RecurrenceEditor monthly', () => {
  const monthly: TemplateRecurrence = {
    kind: 'monthly',
    entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
  };

  it('adds and removes entries, never removing the last one', async () => {
    const { user, onChange } = setup(monthly);

    expect(
      screen.getByTestId('template-recurrence-entry-0-remove'),
    ).toBeDisabled();
    await user.click(screen.getByTestId('template-recurrence-add-entry'));
    expect(lastCall(onChange).entries).toHaveLength(2);

    await user.click(screen.getByTestId('template-recurrence-entry-0-remove'));
    expect(lastCall(onChange)).toEqual({
      kind: 'monthly',
      entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
    });
    expect(
      screen.getByTestId('template-recurrence-entry-0-remove'),
    ).toBeDisabled();
  });

  it('edits the ordinal and weekday of an nth weekday', async () => {
    const { user, onChange } = setup(monthly);

    await user.click(screen.getByTestId('template-recurrence-entry-0-ordinal'));
    await user.click(
      screen.getByTestId('template-recurrence-entry-0-ordinal-last'),
    );
    await user.click(screen.getByTestId('template-recurrence-entry-0-weekday'));
    await user.click(
      screen.getByTestId('template-recurrence-entry-0-weekday-6'),
    );

    expect(lastCall(onChange)).toEqual({
      kind: 'monthly',
      entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
    });
  });

  it('turns an entry into a day of the month and clamps the day', async () => {
    const { user, onChange } = setup(monthly);

    await user.click(screen.getByTestId('template-recurrence-entry-0-type'));
    await user.click(
      screen.getByTestId('template-recurrence-entry-0-type-dayOfMonth'),
    );
    const day = screen.getByTestId('template-recurrence-entry-0-day');
    await user.clear(day);
    await user.type(day, '45');

    expect(lastCall(onChange)).toEqual({
      kind: 'monthly',
      entries: [{ kind: 'dayOfMonth', day: 31 }],
    });
  });

  it('turns an entry into the last day of the month', async () => {
    const { user, onChange } = setup(monthly);

    await user.click(screen.getByTestId('template-recurrence-entry-0-type'));
    await user.click(
      screen.getByTestId('template-recurrence-entry-0-type-lastDayOfMonth'),
    );

    expect(lastCall(onChange)).toEqual({
      kind: 'monthly',
      entries: [{ kind: 'lastDayOfMonth' }],
    });
    expect(
      within(screen.getByTestId('template-recurrence-entry-0')).queryByTestId(
        'template-recurrence-entry-0-day',
      ),
    ).toBeNull();
  });
});
