import {
  type Instant,
  parseInstant,
  resetClock,
  setTestClock,
} from '@church/time';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstantField } from './instant-field';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';
import { renderWithProviders } from '@/__tests__/setup/render';

interface HarnessProps {
  initialValue: Instant;
  timeZone: string;
  onCommit: (value: Instant) => void;
}

function Harness({ initialValue, timeZone, onCommit }: HarnessProps) {
  const [value, setValue] = useState<Instant>(initialValue);
  return (
    <InstantField
      idPrefix="event-start"
      value={value}
      timeZone={timeZone}
      data-testid="event-start"
      onChange={(next) => {
        setValue(next);
        onCommit(next);
      }}
    />
  );
}

describe('InstantField', () => {
  afterEach(() => resetClock());

  it('pre-fills day and time in the Church Timezone', () => {
    setTestClock({ instant: parseInstant({ value: '2026-01-04T13:30:00Z' }) });
    renderWithProviders(
      <Harness
        initialValue={parseInstant({ value: '2026-01-04T13:30:00Z' })}
        timeZone="America/Sao_Paulo"
        onCommit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('event-start-date')).toHaveTextContent(
      '04/01/2026',
    );
    expect(screen.getByTestId('event-start-time')).toHaveTextContent('10:30');
  });

  it('combines an edited day with the held time via the Church Timezone, independent of the ambient TZ', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        initialValue={parseInstant({ value: '2026-01-04T13:30:00Z' })}
        timeZone="America/Sao_Paulo"
        onCommit={onCommit}
      />,
    );

    await pickCalendarDate({
      user,
      trigger: screen.getByTestId('event-start-date'),
      date: '2026-01-10',
    });

    // 10:30 America/Sao_Paulo (UTC-3) on the newly picked day.
    expect(onCommit).toHaveBeenLastCalledWith('2026-01-10T13:30:00.000Z');
  });

  it('combines a typed time with the held day via the Church Timezone', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        initialValue={parseInstant({ value: '2026-01-04T13:30:00Z' })}
        timeZone="America/Sao_Paulo"
        onCommit={onCommit}
      />,
    );

    const [hour] = within(screen.getByTestId('event-start-time')).getAllByRole(
      'spinbutton',
    );
    hour?.focus();
    await user.keyboard('1800');

    expect(onCommit).toHaveBeenLastCalledWith('2026-01-04T21:00:00.000Z');
  });
});
