import { m } from '@church/i18n/messages';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressActions } from '@/shared/components/address-actions';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const ADDRESS = {
  label: 'Templo',
  street: 'Rua das Flores',
  number: '120',
  complement: null,
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
  cep: '13010000',
  latitude: null,
  longitude: null,
  placeId: null,
};
const FORMATTED = 'Rua das Flores, 120, Centro, Campinas - SP, 13010-000';

afterEach(() => vi.clearAllMocks());

describe('AddressActions', () => {
  it('copies the formatted address', async () => {
    const user = userEvent.setup();
    render(<AddressActions address={ADDRESS} />);

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_preview_copy_address(),
      }),
    );

    expect(await navigator.clipboard.readText()).toBe(FORMATTED);
    expect(toastSuccess).toHaveBeenCalledWith(
      m.church_settings_preview_address_copied(),
    );
  });

  it('shows the address to copy by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('denied', 'NotAllowedError'),
    );
    render(<AddressActions address={ADDRESS} />);

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_preview_copy_address(),
      }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        m.address_copy_failed({ address: FORMATTED }),
      ),
    );
  });
});
