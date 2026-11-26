import { parseTimeOfDay } from '@church/time';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateCreateDialog } from '@/features/scheduling/components/planning-admin/template-create-dialog';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const createEventTemplate = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();
const blocker = { status: 'idle', reset: vi.fn(), proceed: vi.fn() };
let shouldBlock: () => boolean = () => false;

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    createEventTemplate: (...args: unknown[]) => createEventTemplate(...args),
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
  useBlocker: (options: { shouldBlockFn: () => boolean }) => {
    shouldBlock = options.shouldBlockFn;
    return blocker;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  blocker.status = 'idle';
});

function refusal({ data }: { data: unknown }) {
  return new AxiosError('refused', '422', undefined, undefined, {
    status: 422,
    data,
  } as AxiosResponse);
}

async function fillValidForm({
  user,
}: {
  user: ReturnType<typeof userEvent.setup>;
}) {
  await user.type(screen.getByTestId('template-name-input'), '  Vigil ');
  await user.type(
    screen.getByTestId('template-time-block-label-input'),
    'Watch',
  );
  await fillTimeOfDayField({
    user,
    field: screen.getByTestId('template-time-block-start-time-input'),
    time: '22:15',
  });
  await fillTimeOfDayField({
    user,
    field: screen.getByTestId('template-time-block-end-time-input'),
    time: '02:00',
  });
}

describe('TemplateCreateDialog', () => {
  it('opens as a titled dialog with one block row, a disabled Save that says why, and Cancel back to the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    const dialog = screen.getByRole('dialog', { name: 'Novo modelo' });
    expect(
      within(dialog).getByRole('heading', { level: 2, name: 'Novo modelo' }),
    ).toBeVisible();
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(1);
    const save = screen.getByTestId('create-template-button');
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(
      'Preencha o nome do modelo e o nome, o início e o término de cada bloco.',
    );
    expect(
      within(dialog).queryByTestId('delete-template-button'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('cancel-template-button'));
    expect(navigate).toHaveBeenCalledWith({
      to: '/app/event-templates',
      replace: true,
    });
    expect(createEventTemplate).not.toHaveBeenCalled();
  });

  it('drops the blocked-save hint once the form is complete', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });

    expect(screen.getByTestId('create-template-button')).toBeEnabled();
    expect(
      screen.queryByTestId('template-save-blocked-hint'),
    ).not.toBeInTheDocument();
  });

  it('keeps the lone picked weekday enabled and explains why it stays picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    const sunday = screen.getByTestId('template-weekday-toggle-0');
    expect(sunday).toBeEnabled();
    expect(sunday).toHaveAttribute('aria-pressed', 'true');

    await user.click(sunday);

    expect(sunday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('template-weekdays-hint')).toHaveTextContent(
      'Escolha ao menos um dia.',
    );
    expect(sunday).toHaveAccessibleDescription('Escolha ao menos um dia.');

    await user.click(screen.getByTestId('template-weekday-toggle-1'));
    expect(screen.getByTestId('template-weekdays-hint')).toBeEmptyDOMElement();
    await user.click(sunday);
    expect(sunday).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds and removes block rows', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await user.click(screen.getByTestId('add-template-time-block-button'));
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', { name: 'Remover' })[0] as HTMLElement,
    );
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(1);
  });

  it('flags equal endpoints and duplicate labels inline and keeps Save disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await user.type(screen.getByTestId('template-name-input'), 'Vigil');
    await user.type(
      screen.getByTestId('template-time-block-label-input'),
      'Watch',
    );
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('template-time-block-start-time-input'),
      time: '09:00',
    });
    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('template-time-block-end-time-input'),
      time: '09:00',
    });

    expect(
      screen.getByTestId('template-time-block-time-error'),
    ).toHaveTextContent(
      'Os horários de início e término devem ser diferentes.',
    );
    expect(screen.getByTestId('create-template-button')).toBeDisabled();

    await user.click(screen.getByTestId('add-template-time-block-button'));
    const labels = screen.getAllByTestId('template-time-block-label-input');
    await user.type(labels[1] as HTMLElement, ' watch ');
    expect(
      screen.getAllByTestId('template-time-block-label-error'),
    ).toHaveLength(2);
  });

  it('creates an overnight template without persisted ids or order, then toasts and returns to the list', async () => {
    createEventTemplate.mockResolvedValue({ id: 'new-1' });
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    expect(screen.getByTestId('template-time-block-span')).toHaveTextContent(
      'termina no dia seguinte',
    );
    await user.click(screen.getByTestId('create-template-button'));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/app/event-templates',
        replace: true,
      }),
    );
    expect(createEventTemplate).toHaveBeenCalledTimes(1);
    expect(createEventTemplate).toHaveBeenCalledWith({
      name: 'Vigil',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        {
          label: 'Watch',
          startTime: parseTimeOfDay({ value: '22:15' }),
          endTime: parseTimeOfDay({ value: '02:00' }),
          isPublic: false,
          place: '',
          placeAddressId: null,
        },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith('Modelo criado');
  });

  it('prevents repeat submission while a save is pending', async () => {
    createEventTemplate.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));
    await waitFor(() =>
      expect(screen.getByTestId('create-template-button')).toBeDisabled(),
    );
    await user.click(screen.getByTestId('create-template-button'));

    expect(createEventTemplate).toHaveBeenCalledTimes(1);
  });

  it('keeps entered values and shows a duplicate name beside the field when the save is refused', async () => {
    createEventTemplate.mockRejectedValue(
      refusal({
        data: {
          error: 'VALIDATION_ERROR',
          reason: 'DUPLICATE_TEMPLATE_NAME',
          message: 'x',
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));

    expect(await screen.findByTestId('template-name-error')).toHaveTextContent(
      'Já existe outro modelo de evento nesta igreja com este nome.',
    );
    expect(screen.getByTestId('template-name-input')).toHaveValue('  Vigil ');
    expect(screen.getByTestId('template-time-block-label-input')).toHaveValue(
      'Watch',
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-template-button')).toBeEnabled();
  });

  it('shows any other refusal as a form-level alert and keeps the values', async () => {
    createEventTemplate.mockRejectedValue(
      refusal({
        data: { error: 'INTERNAL_SERVER_ERROR', message: 'Algo deu errado.' },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));

    expect(await screen.findByTestId('template-form-error')).toHaveTextContent(
      'Algo deu errado.',
    );
    expect(screen.getByTestId('template-time-block-label-input')).toHaveValue(
      'Watch',
    );
  });

  it('asks once per unanswered pair, then resubmits with the answers', async () => {
    createEventTemplate
      .mockRejectedValueOnce(
        new AxiosError('conflict', '409', undefined, undefined, {
          status: 409,
          data: {
            error: 'UNANSWERED_TEMPLATE_COLLISIONS',
            message: 'x',
            collisions: [
              { templateId: 'other-1', name: 'Culto' },
              { templateId: 'other-2', name: 'Jovens' },
            ],
          },
        } as AxiosResponse),
      )
      .mockResolvedValueOnce({ id: 'new-1' });
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));

    const dialog = await screen.findByTestId('template-collision-dialog');
    const pairs = within(dialog).getAllByTestId('template-collision-pair');
    expect(pairs).toHaveLength(2);
    const confirm = within(dialog).getByTestId(
      'confirm-template-collision-button',
    );
    expect(confirm).toBeDisabled();

    await user.click(
      within(pairs[0]).getByRole('radio', { name: 'Este vence' }),
    );
    expect(confirm).toBeDisabled();
    await user.click(
      within(pairs[1]).getByRole('radio', { name: 'O outro vence' }),
    );
    await user.click(confirm);

    await waitFor(() => expect(createEventTemplate).toHaveBeenCalledTimes(2));
    expect(createEventTemplate.mock.calls[1][0].precedences).toEqual([
      { otherTemplateId: 'other-1', answer: 'thisWins' },
      { otherTemplateId: 'other-2', answer: 'otherWins' },
    ]);
    expect(createEventTemplate.mock.calls[0][0]).not.toHaveProperty(
      'precedences',
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/app/event-templates',
        replace: true,
      }),
    );
  });

  it('offers Manter os dois and Cancel keeps the draft without resubmitting', async () => {
    createEventTemplate.mockRejectedValue(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: {
          error: 'UNANSWERED_TEMPLATE_COLLISIONS',
          message: 'x',
          collisions: [{ templateId: 'other-1', name: 'Culto' }],
        },
      } as AxiosResponse),
    );
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));

    const dialog = await screen.findByTestId('template-collision-dialog');
    expect(
      within(dialog).getByRole('radio', { name: 'Manter os dois' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(
        screen.queryByTestId('template-collision-dialog'),
      ).not.toBeInTheDocument(),
    );
    expect(createEventTemplate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('template-name-input')).toHaveValue('  Vigil ');
    expect(screen.queryByTestId('template-form-error')).not.toBeInTheDocument();
  });

  it('holds navigation only once the draft is dirty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);
    expect(shouldBlock()).toBe(false);

    await user.type(screen.getByTestId('template-name-input'), 'V');
    expect(shouldBlock()).toBe(true);
  });

  it('asks before discarding: Keep editing resets, Discard proceeds', async () => {
    blocker.status = 'blocked';
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    const leave = await screen.findByTestId('template-leave-dialog');
    await user.click(
      within(leave).getByRole('button', { name: 'Continuar editando' }),
    );
    expect(blocker.reset).toHaveBeenCalledTimes(1);
    await user.click(
      within(leave).getByRole('button', { name: 'Descartar e sair' }),
    );
    expect(blocker.proceed).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while saving and holds navigation', async () => {
    createEventTemplate.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreateDialog />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));
    await waitFor(() => expect(createEventTemplate).toHaveBeenCalled());
    await user.keyboard('{Escape}');

    expect(navigate).not.toHaveBeenCalled();
    expect(shouldBlock()).toBe(true);
    expect(screen.getByTestId('template-create-dialog')).toBeInTheDocument();
  });
});
