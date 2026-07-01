import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotGenerateWizard } from './slot-generate-wizard';
import { renderWithProviders } from '@/__tests__/setup/render';

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    generateSlots: vi.fn().mockResolvedValue({ slots: [] }),
    listRoleTemplates: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  eventId: 'event-1',
  onComplete: vi.fn(),
};

function render() {
  return renderWithProviders(<SlotGenerateWizard {...baseProps} />);
}

describe('SlotGenerateWizard (T114)', () => {
  it('opens on step 1 with duration input', () => {
    render();
    expect(screen.getByText(/step 1 of 2/i)).toBeVisible();
    expect(screen.getByText(/split event into turns/i)).toBeVisible();
    expect(screen.getByText(/minutes per slot/i)).toBeVisible();
    expect(screen.getByText(/stays inside the event window/i)).toBeVisible();
  });

  it('disables Next when the value is below 1', async () => {
    const user = userEvent.setup();
    render();
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '0');
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('advances to template selection on Next', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 2 of 2/i)).toBeVisible();
    expect(screen.getByText(/role template/i)).toBeVisible();
  });
});
