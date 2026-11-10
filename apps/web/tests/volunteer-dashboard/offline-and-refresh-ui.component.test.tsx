import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundRefreshIndicator } from '@/features/volunteers/components/background-refresh-indicator';
import { renderWithProviders } from '@/tests/setup/render';

describe('Volunteer offline + refresh UI', () => {
  it('renders background refresh indicator when visible', async () => {
    overwriteGetLocale(() => 'en');
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    renderWithProviders(
      <BackgroundRefreshIndicator visible={true} onDismiss={onDismiss} />,
    );

    expect(screen.getByText('Updated in background')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('translates the background refresh indicator in pt-BR', () => {
    overwriteGetLocale(() => 'pt-BR');
    renderWithProviders(
      <BackgroundRefreshIndicator visible={true} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText('Atualizado em segundo plano')).toBeInTheDocument();
    overwriteGetLocale(() => 'en');
  });
});
