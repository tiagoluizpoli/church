import { screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getPublicChurchProfile = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
  publicChurchProfileApi: {
    getPublicChurchProfile: (...args: unknown[]) =>
      getPublicChurchProfile(...args),
    listPublicChurchEvents: () =>
      Promise.resolve({ timezone: 'UTC', items: [] }),
  },
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

const PROFILE = {
  slug: 'ib-esperanca',
  name: 'Igreja Batista Esperança',
  logoUrl: 'https://storage.test/public/churches/a/logo/x.png',
  accentColor: '#1D4ED8',
  programme: [],
};

function notFound(): AxiosError {
  return new AxiosError('Not Found', '404', undefined, undefined, {
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: 'NOT_FOUND', message: 'Não encontramos o que você pediu.' },
  });
}

describe('/$slug', () => {
  beforeEach(() => {
    getPublicChurchProfile.mockReset();
  });

  it('shows the Church name, logo and credit signed out', async () => {
    getPublicChurchProfile.mockResolvedValue(PROFILE);

    renderRoute({ initialPath: '/ib-esperanca' });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Igreja Batista Esperança',
      }),
    ).toBeInTheDocument();
    expect(getPublicChurchProfile).toHaveBeenCalledWith('ib-esperanca');
    expect(
      screen.getByRole('img', { name: 'Logo de Igreja Batista Esperança' }),
    ).toHaveAttribute('src', PROFILE.logoUrl);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Desenvolvido com Church',
    );
  });

  it('moves an old slug to the current URL', async () => {
    getPublicChurchProfile.mockResolvedValue(PROFILE);

    const { router } = renderRoute({ initialPath: '/esperanca-antiga' });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/ib-esperanca'),
    );
    expect(router.history.length).toBe(1);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Igreja Batista Esperança',
      }),
    ).toBeInTheDocument();
  });

  it('shows a friendly not-found page for an unknown slug', async () => {
    getPublicChurchProfile.mockRejectedValue(notFound());

    renderRoute({ initialPath: '/nao-existe' });

    expect(
      await screen.findByRole('heading', { name: 'Igreja não encontrada' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Confira o endereço. O link pode estar errado ou desatualizado.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the not-found page for a slug no Church can hold, without a read', async () => {
    renderRoute({ initialPath: '/login-' });

    expect(
      await screen.findByRole('heading', { name: 'Igreja não encontrada' }),
    ).toBeInTheDocument();
    expect(getPublicChurchProfile).not.toHaveBeenCalled();
  });
});
