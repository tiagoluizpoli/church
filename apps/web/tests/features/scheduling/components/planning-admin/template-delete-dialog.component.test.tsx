import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateDeleteDialog } from '@/features/scheduling/components/planning-admin/template-delete-dialog';
import {
  TEMPLATE_LIST_QUERY_KEY,
  templateDetailQueryKey,
  templateUsageQueryKey,
  USUAL_SETUP_QUERY_KEY,
} from '@/features/scheduling/components/planning-admin/template-query-keys';
import { renderWithProviders } from '@/tests/setup/render';

const getEventTemplateUsage = vi.fn();
const deleteEventTemplate = vi.fn();
const toastSuccess = vi.fn();
const onClose = vi.fn();
const onDeleted = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getEventTemplateUsage: (...args: unknown[]) =>
      getEventTemplateUsage(...args),
    deleteEventTemplate: (...args: unknown[]) => deleteEventTemplate(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

function usage(ministryCount: number) {
  return { templateId: 'template-1', ministryCount, blocks: [] };
}

function renderDialog(queryClient?: QueryClient) {
  renderWithProviders(
    <TemplateDeleteDialog
      templateId="template-1"
      onClose={onClose}
      onDeleted={onDeleted}
    />,
    { queryClient },
  );
  return userEvent.setup();
}

const confirmButton = () =>
  screen.findByTestId('confirm-template-delete-button');

beforeEach(() => {
  vi.clearAllMocks();
  getEventTemplateUsage.mockResolvedValue(usage(0));
  deleteEventTemplate.mockResolvedValue(undefined);
});

describe('TemplateDeleteDialog', () => {
  it.each([
    [0, null],
    [1, 'A configuração padrão de 1 ministério será removida.'],
    [3, 'A configuração padrão de 3 ministérios será removida.'],
  ])('shows the count line only when positive (%i ministries)', async (count, line) => {
    getEventTemplateUsage.mockResolvedValue(usage(count));
    renderDialog();

    await waitFor(() => expect(confirmButton()).resolves.toBeEnabled());
    if (line) {
      expect(screen.getByText(line)).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('template-delete-count')).toBeNull();
    }
    expect(deleteEventTemplate).not.toHaveBeenCalled();
  });

  it('cancel sends no mutation', async () => {
    const user = renderDialog();
    await confirmButton();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
    expect(deleteEventTemplate).not.toHaveBeenCalled();
  });

  it('keeps delete disabled on a usage failure until retry succeeds', async () => {
    getEventTemplateUsage.mockRejectedValueOnce(new Error('boom'));
    const user = renderDialog();

    await screen.findByTestId('template-delete-usage-error');
    expect(screen.getByTestId('confirm-template-delete-button')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(async () => expect(await confirmButton()).toBeEnabled());
    expect(screen.queryByTestId('template-delete-usage-error')).toBeNull();
    expect(getEventTemplateUsage).toHaveBeenCalledTimes(2);
  });

  it('disables repeat submission while pending, then reports success', async () => {
    let finish: () => void = () => undefined;
    deleteEventTemplate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = renderDialog();
    await waitFor(async () => expect(await confirmButton()).toBeEnabled());

    await user.click(screen.getByTestId('confirm-template-delete-button'));

    await waitFor(() =>
      expect(
        screen.getByTestId('confirm-template-delete-button'),
      ).toBeDisabled(),
    );
    expect(deleteEventTemplate).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith('Modelo excluído');
  });

  it('drops the deleted template detail and usage and refreshes the list and Usual setup reads', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const removeQueries = vi.spyOn(queryClient, 'removeQueries');
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const user = renderDialog(queryClient);
    await waitFor(async () => expect(await confirmButton()).toBeEnabled());

    await user.click(screen.getByTestId('confirm-template-delete-button'));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    for (const queryKey of [
      templateDetailQueryKey({ templateId: 'template-1' }),
      templateUsageQueryKey({ templateId: 'template-1' }),
    ]) {
      expect(removeQueries).toHaveBeenCalledWith({ queryKey });
    }
    for (const queryKey of [TEMPLATE_LIST_QUERY_KEY, USUAL_SETUP_QUERY_KEY]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('shows recoverable feedback when the delete fails and allows another attempt', async () => {
    deleteEventTemplate.mockRejectedValueOnce(new Error('boom'));
    const user = renderDialog();
    await waitFor(async () => expect(await confirmButton()).toBeEnabled());

    await user.click(screen.getByTestId('confirm-template-delete-button'));
    await screen.findByTestId('template-delete-error');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('confirm-template-delete-button'));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(deleteEventTemplate).toHaveBeenCalledTimes(2);
  });
});
