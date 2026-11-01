import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateEditPage } from '@/features/scheduling/components/planning-admin/template-edit-page';
import { renderWithProviders } from '@/tests/setup/render';

const getEventTemplate = vi.fn();
const getEventTemplateUsage = vi.fn();
const updateEventTemplate = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    getEventTemplate: (...args: unknown[]) => getEventTemplate(...args),
    getEventTemplateUsage: (...args: unknown[]) =>
      getEventTemplateUsage(...args),
    updateEventTemplate: (...args: unknown[]) => updateEventTemplate(...args),
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode;
    to: string;
    'data-testid'?: string;
  }) => (
    <a href={to} data-testid={props['data-testid']}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));

const template = {
  id: 'template-1',
  churchId: 'church-1',
  name: 'Sunday',
  weekday: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  blocks: [
    {
      id: 'block-welcome',
      churchId: 'church-1',
      templateId: 'template-1',
      label: 'Welcome',
      startTime: '09:00',
      endTime: '10:00',
      order: 0,
    },
    {
      id: 'block-vigil',
      churchId: 'church-1',
      templateId: 'template-1',
      label: 'Vigil',
      startTime: '22:00',
      endTime: '01:00',
      order: 1,
    },
  ],
};

function httpError(status: number) {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    data: { error: 'X', message: 'Falhou no servidor' },
  } as AxiosResponse);
}

beforeEach(() => {
  vi.clearAllMocks();
  getEventTemplate.mockResolvedValue(template);
  updateEventTemplate.mockResolvedValue(template);
});

async function renderLoaded() {
  const user = userEvent.setup();
  renderWithProviders(<TemplateEditPage templateId="template-1" />);
  await screen.findByDisplayValue('Sunday');
  return user;
}

async function removeVigil(user: ReturnType<typeof userEvent.setup>) {
  const vigilRow = screen.getAllByTestId('template-time-block-row')[1];
  await user.click(
    within(vigilRow as HTMLElement).getByRole('button', { name: 'Remover' }),
  );
}

describe('TemplateEditPage', () => {
  it('prefills from its own detail read and saves a rename without a usage read, keeping block ids', async () => {
    const user = await renderLoaded();

    expect(getEventTemplate).toHaveBeenCalledWith('template-1');
    expect(
      screen.getAllByTestId('template-time-block-label-input'),
    ).toHaveLength(2);
    await user.clear(screen.getByTestId('template-name-input'));
    await user.type(screen.getByTestId('template-name-input'), 'Domingo');
    await user.click(screen.getByTestId('create-template-button'));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/event-templates' }),
    );
    expect(getEventTemplateUsage).not.toHaveBeenCalled();
    expect(updateEventTemplate).toHaveBeenCalledWith('template-1', {
      name: 'Domingo',
      weekday: 0,
      blocks: [
        {
          id: 'block-welcome',
          label: 'Welcome',
          startTime: '09:00',
          endTime: '10:00',
        },
        {
          id: 'block-vigil',
          label: 'Vigil',
          startTime: '22:00',
          endTime: '01:00',
        },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith('Modelo atualizado');
  });

  it('shows not found for a missing or foreign template', async () => {
    getEventTemplate.mockRejectedValue(httpError(404));

    renderWithProviders(<TemplateEditPage templateId="missing" />);

    expect(await screen.findByTestId('template-not-found')).toHaveTextContent(
      'Este modelo de evento não existe ou não está mais disponível.',
    );
  });

  it('offers retry when the detail read fails', async () => {
    getEventTemplate.mockRejectedValueOnce(httpError(500));
    const user = userEvent.setup();
    renderWithProviders(<TemplateEditPage templateId="template-1" />);

    const alert = await screen.findByTestId('template-load-error');
    await user.click(
      within(alert).getByRole('button', { name: 'Tentar novamente' }),
    );

    expect(await screen.findByDisplayValue('Sunday')).toBeInTheDocument();
  });

  it('confirms removing a used block with its Ministry count; Cancel keeps the draft and sends nothing', async () => {
    getEventTemplateUsage.mockResolvedValue({
      templateId: 'template-1',
      ministryCount: 2,
      blocks: [
        { blockId: 'block-welcome', ministryCount: 1 },
        { blockId: 'block-vigil', ministryCount: 2 },
      ],
    });
    const user = await renderLoaded();
    await removeVigil(user);

    await user.click(screen.getByTestId('create-template-button'));
    const dialog = await screen.findByTestId('template-block-removal-dialog');
    expect(dialog).toHaveTextContent(
      'Vigil: a configuração padrão de 2 ministérios será removida',
    );
    expect(dialog).not.toHaveTextContent('Welcome');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(
        screen.queryByTestId('template-block-removal-dialog'),
      ).not.toBeInTheDocument(),
    );
    expect(updateEventTemplate).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(1);

    await user.click(screen.getByTestId('create-template-button'));
    await user.click(await screen.findByTestId('confirm-block-removal-button'));

    await waitFor(() => expect(updateEventTemplate).toHaveBeenCalledTimes(1));
    expect(getEventTemplateUsage).toHaveBeenCalledTimes(2);
    expect(updateEventTemplate.mock.calls[0]?.[1].blocks).toEqual([
      {
        id: 'block-welcome',
        label: 'Welcome',
        startTime: '09:00',
        endTime: '10:00',
      },
    ]);
  });

  it('uses the singular count line for one Ministry', async () => {
    getEventTemplateUsage.mockResolvedValue({
      templateId: 'template-1',
      ministryCount: 1,
      blocks: [{ blockId: 'block-vigil', ministryCount: 1 }],
    });
    const user = await renderLoaded();
    await removeVigil(user);

    await user.click(screen.getByTestId('create-template-button'));

    expect(
      await screen.findByTestId('template-block-removal-dialog'),
    ).toHaveTextContent(
      'Vigil: a configuração padrão de 1 ministério será removida',
    );
  });

  it('saves without a dialog when every removed block is unused', async () => {
    getEventTemplateUsage.mockResolvedValue({
      templateId: 'template-1',
      ministryCount: 1,
      blocks: [
        { blockId: 'block-welcome', ministryCount: 1 },
        { blockId: 'block-vigil', ministryCount: 0 },
      ],
    });
    const user = await renderLoaded();
    await removeVigil(user);

    await user.click(screen.getByTestId('create-template-button'));

    await waitFor(() => expect(updateEventTemplate).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByTestId('template-block-removal-dialog'),
    ).not.toBeInTheDocument();
  });

  it('never assumes zero when the usage read fails, and retries it', async () => {
    getEventTemplateUsage
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValueOnce({
        templateId: 'template-1',
        ministryCount: 2,
        blocks: [{ blockId: 'block-vigil', ministryCount: 2 }],
      });
    const user = await renderLoaded();
    await removeVigil(user);

    await user.click(screen.getByTestId('create-template-button'));
    const alert = await screen.findByTestId('template-usage-error');
    expect(updateEventTemplate).not.toHaveBeenCalled();
    await user.click(
      within(alert).getByRole('button', { name: 'Tentar novamente' }),
    );

    expect(
      await screen.findByTestId('template-block-removal-dialog'),
    ).toBeInTheDocument();
    expect(updateEventTemplate).not.toHaveBeenCalled();
  });

  it('keeps the draft and shows the refusal when the save fails', async () => {
    updateEventTemplate.mockRejectedValue(httpError(404));
    const user = await renderLoaded();
    await user.clear(screen.getByTestId('template-name-input'));
    await user.type(screen.getByTestId('template-name-input'), 'Domingo');

    await user.click(screen.getByTestId('create-template-button'));

    expect(await screen.findByTestId('template-form-error')).toHaveTextContent(
      'Falhou no servidor',
    );
    expect(screen.getByTestId('template-name-input')).toHaveValue('Domingo');
    expect(navigate).not.toHaveBeenCalled();
  });
});
