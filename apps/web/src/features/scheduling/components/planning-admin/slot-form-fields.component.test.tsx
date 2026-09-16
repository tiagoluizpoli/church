import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  SlotFormFields,
  type SlotFormFieldsProps,
  type SlotFormValues,
} from './slot-form-fields';
import { renderWithProviders } from '@/__tests__/setup/render';
import { fillTimeOfDayField } from '@/__tests__/setup/time-of-day';

const initialSingleDayValues: SlotFormValues = {
  label: 'Worship',
  startTimeLocal: '2025-01-05T09:00',
  endTimeLocal: '2025-01-05T10:00',
  isMultiDayEvent: false,
};

const multiDayValues: SlotFormValues = {
  label: 'Overnight watch',
  startTimeLocal: '2025-01-05T22:00',
  endTimeLocal: '2025-01-06T06:00',
  isMultiDayEvent: true,
};

interface HarnessProps {
  onChange: SlotFormFieldsProps['onChange'];
}

/** A real consumer feeds `onChange` back into `values` — the segmented
 * `TimeOfDayField` commits provisionally per keystroke, so a static prop
 * fights later keystrokes with a stale controlled value. */
function Harness({ onChange }: HarnessProps) {
  const [values, setValues] = useState(initialSingleDayValues);
  return (
    <SlotFormFields
      idPrefix="create-slot"
      values={values}
      onChange={(next) => {
        setValues(next);
        onChange(next);
      }}
    />
  );
}

describe('SlotFormFields', () => {
  it('single-day: drives the start TimeOfDay field, preserving the underlying date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('create-slot-start-time-field'),
      time: '08:30',
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSingleDayValues,
      startTimeLocal: '2025-01-05T08:30',
    });
  });

  it('single-day: drives the end TimeOfDay field independently of start', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onChange={onChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('create-slot-end-time-field'),
      time: '11:15',
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...initialSingleDayValues,
      endTimeLocal: '2025-01-05T11:15',
    });
  });

  it('single-day: renders no native time input', () => {
    renderWithProviders(
      <SlotFormFields
        idPrefix="create-slot"
        values={initialSingleDayValues}
        onChange={vi.fn()}
      />,
    );

    expect(
      document.querySelector('input[type="time"]'),
    ).not.toBeInTheDocument();
  });

  it('multi-day: keeps datetime-local inputs, not the TimeOfDay field', () => {
    renderWithProviders(
      <SlotFormFields
        idPrefix="create-slot"
        values={multiDayValues}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Start')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(screen.getByLabelText('End')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(
      screen.queryByTestId('create-slot-start-time-field'),
    ).not.toBeInTheDocument();
  });
});
