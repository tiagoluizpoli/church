import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleDeleteDialog } from '@/features/scheduling/components/planning-admin/cycle-delete-dialog';
import { renderWithProviders } from '@/tests/setup/render';

const deleteCycle = vi.fn();
const toastSuccess = vi.fn();
const onClose = vi.fn();
const onDeleted = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: { deleteCycle: (...args: unknown[]) => deleteCycle(...args) },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

interface RenderDialogInput {
  eventCount?: number;
  queryClient?: QueryClient;
}

function renderDialog({ eventCount = 0, queryClient }: RenderDialogInput = {}) {
  renderWithProviders(
    <CycleDeleteDialog
      cycleId="cycle-1"
      cycleName="Outubro"
      eventCount={eventCount}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
    { queryClient },
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteCycle.mockResolvedValue(undefined);
});

describe('CycleDeleteDialog', () => {
  it.each([
    [0, 'Este ciclo não tem eventos.'],
    [
      1,
      '1 evento será excluído, com seus blocos de horário e a participação dos ministérios.',
    ],
    [
      4,
      '4 eventos serão excluídos, com seus blocos de horário e a participação dos ministérios.',
    ],
  ])('states the owned-Event count (%i) and deletes nothing yet', async (count, line) => {
    renderDialog({ eventCount: count });

    expect(
      await screen.findByRole('alertdialog', { name: 'Excluir Outubro?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(deleteCycle).not.toHaveBeenCalled();
  });

  it('cancel sends no mutation', async () => {
    const user = renderDialog();

    await user.click(
      await screen.findByRole('button', { name: 'Manter rascunho' }),
    );

    expect(onClose).toHaveBeenCalled();
    expect(deleteCycle).not.toHaveBeenCalled();
  });

  it('blocks repeat submission while pending, then invalidates, toasts and reports success', async () => {
    let finish: () => void = () => undefined;
    deleteCycle.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const remove = vi.spyOn(queryClient, 'removeQueries');
    const user = renderDialog({ queryClient });

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    const pending = await screen.findByRole('button', { name: 'Excluindo…' });
    expect(pending).toBeDisabled();
    expect(deleteCycle).toHaveBeenCalledTimes(1);
    expect(deleteCycle).toHaveBeenCalledWith('cycle-1');
    finish();
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cycles'] });
    expect(remove).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-1'],
    });
    expect(toastSuccess).toHaveBeenCalledWith('Ciclo excluído');
  });

  it('keeps a retryable confirmation after a failure', async () => {
    deleteCycle.mockRejectedValueOnce(new Error('boom'));
    const user = renderDialog();

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível excluir o ciclo. Nada foi alterado. Tente novamente.',
    );
    expect(onDeleted).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Excluir ciclo' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(deleteCycle).toHaveBeenCalledTimes(2);
  });

  it('refetches the Cycle and shows the server refusal after a stale-state 409', async () => {
    const refusal = new AxiosError('conflict');
    refusal.response = {
      status: 409,
      data: { message: 'Only a Draft Cycle can be deleted.' },
    } as AxiosResponse;
    deleteCycle.mockRejectedValueOnce(refusal);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = renderDialog({ queryClient });

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only a Draft Cycle can be deleted.',
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cycles'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-details', 'cycle-1'],
    });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('keeps the generic message for a failure with no server response', async () => {
    deleteCycle.mockRejectedValueOnce(new AxiosError('Network Error'));
    const user = renderDialog();

    await user.click(
      await screen.findByRole('button', { name: 'Excluir ciclo' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível excluir o ciclo.',
    );
  });
});
