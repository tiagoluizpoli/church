import { parseInstant } from '@church/time';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  EventTimeBlockFormFields,
  type EventTimeBlockFormFieldsProps,
  type EventTimeBlockFormValues,
} from '@/features/scheduling/components/planning-admin/event-time-block-form-fields';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const TIME_ZONE = 'America/Sao_Paulo';

// 09:00–10:00 America/Sao_Paulo (UTC-3).
const initialSingleDayValues: EventTimeBlockFormValues = {
  label: 'Worship',
  start: parseInstant({ value: '2025-01-05T12:00:00.000Z' }),
  end: parseInstant({ value: '2025-01-05T13:00:00.000Z' }),
  isMultiDayEvent: false,
};

const multiDayValues: EventTimeBlockFormValues = {
  label: 'Overnight watch',
  start: parseInstant({ value: '2025-01-06T01:00:00.000Z' }),
  end: parseInstant({ value: '2025-01-06T09:00:00.000Z' }),
  isMultiDayEvent: true,
};

interface HarnessProps {
  onChange: EventTimeBlockFormFieldsProps['onChange'];
}

/** A real consumer feeds `onChange` back into `values` — the segmented
 * `TimeOfDayField` commits provisionally per keystroke, so a static prop
 * fights later keystrokes with a stale controlled value. */
function Harness({ onChange }: HarnessProps) {
  const [values, setValues] = useState(initialSingleDayValues);
  return (
    <EventTimeBlockFormFields
      idPrefix="create-event-time-block"
      values={values}
      timeZone={TIME_ZONE}
      onChange={(next) => {
        setValues(next);
        onChange(next);
      }}
    />
  );
}

describe('EventTimeBlockFormFields', () => {
  it('single-day: drives the start TimeOfDay field through the Church Timezone, preserving the underlying date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('create-event-time-block-start-time-field'),
      time: '08:30',
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSingleDayValues,
      start: parseInstant({ value: '2025-01-05T11:30:00.000Z' }),
    });
  });

  it('single-day: drives the end TimeOfDay field independently of start', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('create-event-time-block-end-time-field'),
      time: '11:15',
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSingleDayValues,
      end: parseInstant({ value: '2025-01-05T14:15:00.000Z' }),
    });
  });

  it('single-day: renders no native time input', () => {
    renderWithProviders(
      <EventTimeBlockFormFields
        idPrefix="create-event-time-block"
        values={initialSingleDayValues}
        timeZone={TIME_ZONE}
        onChange={vi.fn()}
      />,
    );

    expect(
      document.querySelector('input[type="time"]'),
    ).not.toBeInTheDocument();
  });

  it('multi-day: renders CalendarDay + TimeOfDay InstantFields, not the TimeOfDay-only field', () => {
    renderWithProviders(
      <EventTimeBlockFormFields
        idPrefix="create-event-time-block"
        values={multiDayValues}
        timeZone={TIME_ZONE}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('create-event-time-block-start-date'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('create-event-time-block-start-time'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('create-event-time-block-end-date'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('create-event-time-block-end-time'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('create-event-time-block-start-time-field'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('input[type="datetime-local"]'),
    ).not.toBeInTheDocument();
  });

  it('renders the computed-span confirmation for a span crossing midnight', () => {
    renderWithProviders(
      <EventTimeBlockFormFields
        idPrefix="create-event-time-block"
        values={multiDayValues}
        timeZone={TIME_ZONE}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('create-event-time-block-span'),
    ).toHaveTextContent(/Dura \d+ h/);
  });
});
