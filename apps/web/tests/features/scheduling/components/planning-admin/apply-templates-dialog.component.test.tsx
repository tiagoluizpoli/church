import { overwriteGetLocale } from '@church/i18n/runtime';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplyTemplatesDialog } from '@/features/scheduling/components/planning-admin/apply-templates-dialog';
import { TEMPLATE_LIST_QUERY_KEY } from '@/features/scheduling/components/planning-admin/template-query-keys';
import { renderWithProviders } from '@/tests/setup/render';

const listEventTemplates = vi.fn();
const applyPlanningTemplates = vi.fn();
const toastSuccess = vi.fn();
const onOpenChange = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listEventTemplates: (...args: unknown[]) => listEventTemplates(...args),
    applyPlanningTemplates: (...args: unknown[]) =>
      applyPlanningTemplates(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

function template(id: string, name: string, blockCount = 1) {
  return {
    id,
    name,
    weekday: 0,
    blocks: Array.from({ length: blockCount }, (_, order) => ({
      id: `${id}-block-${order}`,
      label: `Block ${order}`,
      startTime: '09:00',
      endTime: '10:00',
      order,
    })),
  };
}

const SUNDAY = template('template-1', 'Sunday', 2);
const MIDWEEK = template('template-2', 'Midweek');

function renderDialog(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWithProviders(
    <ApplyTemplatesDialog
      open={true}
      onOpenChange={onOpenChange}
      cycleId="cycle-1"
      selectedCycleName="Outubro"
    />,
    { queryClient: client },
  );
  return { user: userEvent.setup(), client };
}

const checkboxes = () => screen.findAllByTestId('template-select-checkbox');
const submit = () => screen.getByTestId('apply-templates-button');

beforeEach(() => {
  vi.clearAllMocks();
  listEventTemplates.mockResolvedValue({ templates: [SUNDAY, MIDWEEK] });
  applyPlanningTemplates.mockResolvedValue({
    generatedEventCount: 2,
    generatedEventTimeBlockCount: 3,
  });
});

afterEach(() => overwriteGetLocale(() => 'pt-BR'));

describe('ApplyTemplatesDialog', () => {
  it('checks every template on entry and describes weekday and block count', async () => {
    renderDialog();

    const boxes = await checkboxes();

    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeChecked();
    expect(screen.getByText(/2 blocos/)).toBeVisible();
    expect(screen.getByText(/1 bloco$/)).toBeVisible();
    expect(
      screen.getByText(/Adiciona os eventos e horários que faltam em Outubro/),
    ).toBeVisible();
  });

  it('applies only the selected templates and reports localized counts', async () => {
    const { user } = renderDialog();
    const [, midweek] = await checkboxes();
    if (!midweek) throw new Error('missing checkbox');

    await user.click(midweek);
    await user.click(submit());

    await waitFor(() =>
      expect(applyPlanningTemplates).toHaveBeenCalledWith('cycle-1', {
        templateIds: ['template-1'],
      }),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Adicionado: 2 eventos, 3 horários',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses English singular and plural counts', async () => {
    overwriteGetLocale(() => 'en');
    applyPlanningTemplates.mockResolvedValue({
      generatedEventCount: 1,
      generatedEventTimeBlockCount: 1,
    });
    const { user } = renderDialog();
    await checkboxes();

    await user.click(submit());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Added 1 Event, 1 time block'),
    );
  });

  it('says Nothing new to add on a successful no-op', async () => {
    overwriteGetLocale(() => 'en');
    applyPlanningTemplates.mockResolvedValue({
      generatedEventCount: 0,
      generatedEventTimeBlockCount: 0,
    });
    const { user } = renderDialog();
    await checkboxes();

    await user.click(submit());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Nothing new to add'),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables submission with no selection', async () => {
    const { user } = renderDialog();

    for (const box of await checkboxes()) await user.click(box);

    expect(submit()).toBeDisabled();
  });

  it('keeps the selection after a failure and blocks a duplicate pending submit', async () => {
    let reject: (reason: Error) => void = () => undefined;
    applyPlanningTemplates.mockReturnValue(
      new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    const { user } = renderDialog();
    const [sunday, midweek] = await checkboxes();
    if (!sunday || !midweek) throw new Error('missing checkbox');
    await user.click(midweek);

    await user.click(submit());

    await waitFor(() => expect(submit()).toBeDisabled());
    await user.click(submit());
    expect(applyPlanningTemplates).toHaveBeenCalledTimes(1);

    await act(async () => reject(new Error('Conflict')));

    expect(
      await screen.findByTestId('apply-templates-error'),
    ).toHaveTextContent('Conflict');
    expect(sunday).toBeChecked();
    expect(midweek).not.toBeChecked();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled();
  });

  it('preserves choices on refetch, drops vanished ids and offers new templates', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { user, client } = renderDialog(queryClient);
    const [, midweek] = await checkboxes();
    if (!midweek) throw new Error('missing checkbox');
    await user.click(midweek);
    const vigil = template('template-3', 'Vigil');
    listEventTemplates.mockResolvedValue({ templates: [MIDWEEK, vigil] });

    await act(async () => {
      await client.invalidateQueries({ queryKey: TEMPLATE_LIST_QUERY_KEY });
    });

    await waitFor(async () =>
      expect(
        await screen.findAllByTestId('template-select-checkbox'),
      ).toHaveLength(2),
    );
    const [keptMidweek, newVigil] = await checkboxes();
    expect(screen.queryByText('Sunday')).not.toBeInTheDocument();
    expect(keptMidweek).not.toBeChecked();
    expect(newVigil).not.toBeChecked();
    await user.click(newVigil as HTMLElement);
    await user.click(submit());
    await waitFor(() =>
      expect(applyPlanningTemplates).toHaveBeenCalledWith('cycle-1', {
        templateIds: ['template-3'],
      }),
    );
  });

  it('offers a new-tab setup link when there are no templates', async () => {
    listEventTemplates.mockResolvedValue({ templates: [] });
    renderDialog();

    const link = await screen.findByTestId('apply-templates-setup-link');

    expect(link).toHaveAttribute('href', '/event-templates');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(submit()).toBeDisabled();
  });

  it('refetches templates when the window regains focus', async () => {
    listEventTemplates.mockResolvedValue({ templates: [] });
    renderDialog();
    await screen.findByTestId('apply-templates-setup-link');
    listEventTemplates.mockResolvedValue({ templates: [SUNDAY] });

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await checkboxes()).toHaveLength(1);
    expect(screen.queryByTestId('apply-templates-setup-link')).toBeNull();
  });

  it('shows a load failure instead of an empty setup message', async () => {
    listEventTemplates.mockRejectedValue(new Error('down'));
    renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os modelos de evento',
    );
    expect(screen.queryByTestId('apply-templates-setup-link')).toBeNull();
  });

  it('checks every current template on entry even when the cached list is stale', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(TEMPLATE_LIST_QUERY_KEY, { templates: [SUNDAY] });
    renderDialog(queryClient);

    await waitFor(async () => expect(await checkboxes()).toHaveLength(2));

    for (const box of await checkboxes()) expect(box).toBeChecked();
  });

  it('retries a failed entry fetch and then checks every template', async () => {
    listEventTemplates.mockRejectedValueOnce(new Error('down'));
    const { user } = renderDialog();

    await user.click(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    );

    const boxes = await checkboxes();
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeChecked();
  });

  it('keeps the choices when a later refetch fails', async () => {
    const { user, client } = renderDialog();
    const [, midweek] = await checkboxes();
    await user.click(midweek as HTMLElement);
    listEventTemplates.mockRejectedValue(new Error('down'));

    await act(async () => {
      await client.invalidateQueries({ queryKey: TEMPLATE_LIST_QUERY_KEY });
    });

    const [sunday, stillMidweek] = await checkboxes();
    expect(sunday).toBeChecked();
    expect(stillMidweek).not.toBeChecked();
  });
});
