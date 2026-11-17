import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CyclePreparePicker } from '@/features/scheduling/components/prepare/cycle-prepare-picker';
import { startHangingRefetch } from '@/tests/setup/refetch';
import { renderWithProviders } from '@/tests/setup/render';

const listMinistries = vi.fn();
vi.mock('@/utils/api-instances', () => ({
  adminApi: { listMinistries: (...args: unknown[]) => listMinistries(...args) },
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/x">{children}</a>,
}));

function renderPicker(queryClient = new QueryClient()) {
  renderWithProviders(
    <CyclePreparePicker cycleId="cycle-1" ministryIds={['ministry-1']} />,
    { queryClient },
  );
  return queryClient;
}

beforeEach(() => vi.clearAllMocks());

describe('CyclePreparePicker loading', () => {
  it('shows a busy skeleton on first load', async () => {
    listMinistries.mockReturnValue(new Promise(() => undefined));
    renderPicker();
    const loading = await screen.findByTestId('cycle-picker-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
    expect(
      screen.getByText(m.prepare_cycle_picker_loading()),
    ).toBeInTheDocument();
  });

  it('keeps the Ministries on screen while a refetch is in flight', async () => {
    listMinistries.mockResolvedValue({
      ministries: [{ id: 'ministry-1', name: 'Kids' }],
    });
    const queryClient = renderPicker();
    expect(await screen.findByText('Kids')).toBeInTheDocument();

    await startHangingRefetch({ queryClient, read: listMinistries });

    expect(screen.getByText('Kids')).toBeInTheDocument();
    expect(screen.queryByTestId('cycle-picker-loading')).toBeNull();
  });
});
