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
