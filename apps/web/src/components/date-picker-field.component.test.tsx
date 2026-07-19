import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatePickerField } from './date-picker-field';
import { pickCalendarDate } from '@/__tests__/setup/date-picker';
import { renderWithProviders } from '@/__tests__/setup/render';

describe('DatePickerField', () => {
  it('shows the placeholder when empty, and calls onChange when a date is picked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DatePickerField
        value=""
        onChange={onChange}
        placeholder="Pick a date"
        data-testid="date-field"
      />,
    );

    const trigger = screen.getByTestId('date-field');
    expect(trigger).toHaveTextContent('Pick a date');

    await pickCalendarDate({ user, trigger, date: '2026-08-15' });

    expect(onChange).toHaveBeenCalledWith('2026-08-15');
  });

  it('displays a selected value as a compact dd/MM/yyyy date, not a written-out date', () => {
    renderWithProviders(
      <DatePickerField
        value="2026-09-01"
        onChange={vi.fn()}
        data-testid="date-field"
      />,
    );

    const trigger = screen.getByTestId('date-field');
    expect(trigger).toHaveTextContent('01/09/2026');
    expect(trigger).not.toHaveTextContent(/September/);
  });

  describe('minDate/maxDate bounds', () => {
    it('disables days outside [minDate, maxDate] and leaves days inside it pickable', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DatePickerField
          value="2026-08-12"
          onChange={onChange}
          minDate="2026-08-10"
          maxDate="2026-08-20"
          data-testid="date-field"
        />,
      );

      await user.click(screen.getByTestId('date-field'));

      // Aug 5th is before minDate (Aug 10th) — must be disabled and unpickable.
      const outOfRangeDay = screen.getByRole('button', {
        name: /August 5th, 2026$/,
      });
      expect(outOfRangeDay).toBeDisabled();
      await user.click(outOfRangeDay);
      expect(onChange).not.toHaveBeenCalled();

      // Aug 15th is inside [Aug 10th, Aug 20th] — must stay pickable.
      const inRangeDay = screen.getByRole('button', {
        name: /August 15th, 2026$/,
      });
      expect(inRangeDay).not.toBeDisabled();
    });

    it('does not disable anything when minDate/maxDate are omitted', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <DatePickerField
          value="2026-08-15"
          onChange={vi.fn()}
          data-testid="date-field"
        />,
      );

      await user.click(screen.getByTestId('date-field'));

      expect(
        screen.getByRole('button', { name: /August 5th, 2026$/ }),
      ).not.toBeDisabled();
    });
  });

  describe('clear control (design-critique follow-up)', () => {
    it('does not render when onClear is omitted, even with a value', () => {
      renderWithProviders(
        <DatePickerField
          value="2026-08-15"
          onChange={vi.fn()}
          data-testid="date-field"
        />,
      );

      expect(screen.queryByTestId('date-field-clear')).not.toBeInTheDocument();
    });

    it('does not render when onClear is provided but the field is empty', () => {
      renderWithProviders(
        <DatePickerField
          value=""
          onChange={vi.fn()}
          onClear={vi.fn()}
          data-testid="date-field"
        />,
      );

      expect(screen.queryByTestId('date-field-clear')).not.toBeInTheDocument();
    });

    it('renders once a value is set and onClear is provided, and resets that field alone without opening the calendar', async () => {
      const onClear = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <DatePickerField
          value="2026-08-15"
          onChange={vi.fn()}
          onClear={onClear}
          data-testid="date-field"
        />,
      );

      const clearButton = screen.getByTestId('date-field-clear');
      await user.click(clearButton);

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('combobox', { name: 'Choose the Month' }),
      ).not.toBeInTheDocument();
    });
  });
});
