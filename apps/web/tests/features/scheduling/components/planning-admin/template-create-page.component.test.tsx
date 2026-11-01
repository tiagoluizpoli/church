import { parseTimeOfDay } from '@church/time';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateCreatePage } from '@/features/scheduling/components/planning-admin/template-create-page';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const createEventTemplate = vi.fn();
const navigate = vi.fn();
const toastSuccess = vi.fn();

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
}));

beforeEach(() => {
  vi.clearAllMocks();
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

describe('TemplateCreatePage', () => {
  it('starts with one block row and a disabled Save, with Cancel back to the list', () => {
    renderWithProviders(<TemplateCreatePage />);

    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(1);
    expect(screen.getByTestId('create-template-button')).toBeDisabled();
    expect(screen.getByTestId('cancel-template-button')).toHaveAttribute(
      'href',
      '/event-templates',
    );
    expect(createEventTemplate).not.toHaveBeenCalled();
  });

  it('adds and removes block rows', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreatePage />);

    await user.click(screen.getByTestId('add-template-time-block-button'));
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', { name: 'Remover' })[0] as HTMLElement,
    );
    expect(screen.getAllByTestId('template-time-block-row')).toHaveLength(1);
  });

  it('flags equal endpoints and duplicate labels inline and keeps Save disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreatePage />);

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
    renderWithProviders(<TemplateCreatePage />);

    await fillValidForm({ user });
    expect(screen.getByTestId('template-time-block-span')).toHaveTextContent(
      'termina no dia seguinte',
    );
    await user.click(screen.getByTestId('create-template-button'));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/event-templates' }),
    );
    expect(createEventTemplate).toHaveBeenCalledTimes(1);
    expect(createEventTemplate).toHaveBeenCalledWith({
      name: 'Vigil',
      weekday: 0,
      blocks: [
        {
          label: 'Watch',
          startTime: parseTimeOfDay({ value: '22:15' }),
          endTime: parseTimeOfDay({ value: '02:00' }),
        },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith('Modelo criado');
  });

  it('prevents repeat submission while a save is pending', async () => {
    createEventTemplate.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<TemplateCreatePage />);

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
    renderWithProviders(<TemplateCreatePage />);

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
    renderWithProviders(<TemplateCreatePage />);

    await fillValidForm({ user });
    await user.click(screen.getByTestId('create-template-button'));

    expect(await screen.findByTestId('template-form-error')).toHaveTextContent(
      'Algo deu errado.',
    );
    expect(screen.getByTestId('template-time-block-label-input')).toHaveValue(
      'Watch',
    );
  });
});
