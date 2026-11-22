import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicEventsSection } from '@/features/public-church/components/public-events-section';
import { renderWithProviders } from '@/tests/setup/render';

const listPublicChurchEvents = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  publicChurchProfileApi: {
    listPublicChurchEvents: (...args: unknown[]) =>
      listPublicChurchEvents(...args),
  },
}));

const TIMEZONE = 'America/Sao_Paulo';
const step = (hour: number) => ({
  start: `2099-03-01T${String(hour).padStart(2, '0')}:00:00.000Z`,
  end: `2099-03-01T${String(hour + 1).padStart(2, '0')}:00:00.000Z`,
});

function block(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Culto',
    ...step(13),
    place: 'Templo',
    cancelled: false,
    movePath: [],
    ...overrides,
  };
}

function event(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    cancelled: false,
    start: step(13).start,
    blocks: [block()],
    ...overrides,
  };
}

function page(items: unknown[], nextCursor?: string) {
  return { timezone: TIMEZONE, items, nextCursor };
}

describe('PublicEventsSection', () => {
  beforeEach(() => {
    listPublicChurchEvents.mockReset();
  });

  it('hides the section when there are no upcoming Public Events', async () => {
    listPublicChurchEvents.mockResolvedValue(page([]));

    const { container } = renderWithProviders(
      <PublicEventsSection slug="ib" />,
    );

    await vi.waitFor(() => expect(listPublicChurchEvents).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('loads the next page on Carregar mais and drops the button at the end', async () => {
    listPublicChurchEvents
      .mockResolvedValueOnce(page([event('Culto A')], 'cursor-2'))
      .mockResolvedValueOnce(page([event('Culto B')]));
    renderWithProviders(<PublicEventsSection slug="ib" />);

    await screen.findByRole('heading', { name: 'Culto A' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Carregar mais' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Culto B' }),
    ).toBeInTheDocument();
    expect(listPublicChurchEvents).toHaveBeenLastCalledWith('ib', {
      cursor: 'cursor-2',
    });
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('marks cancelled events and blocks', async () => {
    listPublicChurchEvents.mockResolvedValue(
      page([
        event('Culto cancelado', {
          cancelled: true,
          blocks: [block({ cancelled: true })],
        }),
        event('Culto ativo', {
          blocks: [block({ label: 'Cancelada', cancelled: true }), block()],
        }),
      ]),
    );
    renderWithProviders(<PublicEventsSection slug="ib" />);

    await screen.findByRole('heading', { name: 'Culto cancelado' });

    // event + its block, then only the cancelled block of the active event
    expect(screen.getAllByText('Cancelado')).toHaveLength(3);
  });

  it('shows nothing for a block that was moved back or never moved', async () => {
    listPublicChurchEvents.mockResolvedValue(page([event('Culto')]));
    renderWithProviders(<PublicEventsSection slug="ib" />);

    await screen.findByRole('heading', { name: 'Culto' });

    expect(document.querySelector('s')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver histórico' })).toBeNull();
  });

  it('shows the original struck through and the current time after one move', async () => {
    listPublicChurchEvents.mockResolvedValue(
      page([
        event('Culto', {
          blocks: [block({ ...step(14), movePath: [step(13), step(14)] })],
        }),
      ]),
    );
    renderWithProviders(<PublicEventsSection slug="ib" />);

    await screen.findByRole('heading', { name: 'Culto' });

    expect(document.querySelector('s')).toHaveTextContent('01/03/2099 10:00');
    expect(screen.getByText('01/03/2099 11:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver histórico' })).toBeNull();
  });

  it('keeps several moves behind a keyboard accessible Ver histórico button', async () => {
    listPublicChurchEvents.mockResolvedValue(
      page([
        event('Culto', {
          blocks: [
            block({ ...step(15), movePath: [step(13), step(14), step(15)] }),
          ],
        }),
      ]),
    );
    renderWithProviders(<PublicEventsSection slug="ib" />);
    await screen.findByRole('heading', { name: 'Culto' });
    expect(document.querySelector('s')).toBeNull();

    await userEvent.tab();
    const button = screen.getByRole('button', { name: 'Ver histórico' });
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(document.querySelectorAll('s')).toHaveLength(2);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
