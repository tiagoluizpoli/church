import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

describe('SelectTrigger focus treatment and accessibility', () => {
  it('uses full-alpha focus-visible ring classes to match form controls', () => {
    render(
      <Select defaultValue="option-1">
        <SelectTrigger aria-label="Escolha uma opção">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option-1">Opção 1</SelectItem>
          <SelectItem value="option-2">Opção 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Escolha uma opção' });
    expect(trigger).toHaveClass('focus-visible:border-ring');
    expect(trigger).toHaveClass('focus-visible:ring-1');
    expect(trigger).toHaveClass('focus-visible:ring-ring');
    expect(trigger).not.toHaveClass('focus-visible:ring-ring/50');
  });

  it('grows to a 44px touch target under a touch-size provider', () => {
    render(
      <FormControlSizeProvider size="touch">
        <Select defaultValue="option-1">
          <SelectTrigger aria-label="Escolha uma opção">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option-1">Opção 1</SelectItem>
          </SelectContent>
        </Select>
      </FormControlSizeProvider>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Escolha uma opção' });
    expect(trigger).toHaveClass('h-11');
  });

  it('supports keyboard navigation to focus and select items', async () => {
    const user = userEvent.setup();

    render(
      <Select defaultValue="option-1">
        <SelectTrigger aria-label="Escolha uma opção">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option-1">Opção 1</SelectItem>
          <SelectItem value="option-2">Opção 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Escolha uma opção' });
    await user.tab();
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    const option2 = await screen.findByRole('option', { name: 'Opção 2' });
    await user.click(option2);

    expect(trigger).toHaveTextContent('option-2');
  });
});
