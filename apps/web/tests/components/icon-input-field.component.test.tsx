import { render, screen } from '@testing-library/react';
import { Globe } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { IconInputField } from '@/components/icon-input-field';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';

describe('IconInputField', () => {
  it('labels its input, shows the icon inside the box and describes it with the hint', () => {
    const { container } = render(
      <IconInputField
        icon={Globe}
        label="Site"
        hint="Opcional."
        value=""
        readOnly
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Site' });
    expect(input).toHaveAccessibleDescription('Opcional.');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input.parentElement?.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('input')).toHaveLength(1);
  });

  it('marks the input invalid and describes it with the error instead of the hint', () => {
    render(
      <IconInputField
        icon={Globe}
        label="Site"
        hint="Opcional."
        error="Informe um endereço de site válido."
        value=""
        readOnly
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Site' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Informe um endereço de site válido.',
    );
    expect(screen.queryByText('Opcional.')).not.toBeInTheDocument();
  });

  it('grows to a 44 px touch target under a touch-size provider', () => {
    render(
      <FormControlSizeProvider size="touch">
        <IconInputField icon={Globe} label="Site" value="" readOnly />
      </FormControlSizeProvider>,
    );

    expect(screen.getByRole('textbox', { name: 'Site' })).toHaveClass('h-11');
  });
});
