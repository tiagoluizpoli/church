import { m } from '@church/i18n/messages';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogPanel } from '@/features/scheduling/components/builder/audit-log-panel';
import { startHangingRefetch } from '@/tests/setup/refetch';
import { renderWithProviders } from '@/tests/setup/render';

const getCycleAuditLog = vi.fn();
vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getCycleAuditLog: (...args: unknown[]) => getCycleAuditLog(...args),
  },
}));

const LOG = {
  items: [
    {
      id: 'audit-1',
      assignmentId: 'assignment-1',
      action: 'created',
      reason: null,
      timestamp: '2030-08-01T10:00:00.000Z',
      actorId: 'actor-1',
    },
  ],
};

function renderPanel(queryClient = new QueryClient()) {
  renderWithProviders(
    <AuditLogPanel
      open
      onOpenChange={vi.fn()}
      assignments={[]}
      cycleId="cycle-1"
      ministryId="ministry-1"
    />,
    { queryClient },
  );
  return queryClient;
}

beforeEach(() => vi.clearAllMocks());

describe('AuditLogPanel loading', () => {
  it('shows a busy skeleton on first load', async () => {
    getCycleAuditLog.mockReturnValue(new Promise(() => undefined));
    renderPanel();
    const loading = await screen.findByRole('status', {
      name: m.builder_ui_audit_loading(),
    });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(loading.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
    );
  });

  it('keeps the entries on screen while a refetch is in flight', async () => {
    getCycleAuditLog.mockResolvedValue(LOG);
    const queryClient = renderPanel();
    expect(await screen.findByText('assignment-1')).toBeInTheDocument();

    await startHangingRefetch({ queryClient, read: getCycleAuditLog });

    expect(screen.getByText('assignment-1')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: m.builder_ui_audit_loading() }),
    ).toBeNull();
  });
});
