import { m } from '@church/i18n/messages';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Toaster } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { mswServer } from '@/tests/setup/msw';
import { createQueryClient } from '@/utils/api';
import { apiClient } from '@/utils/api-client';

const URL = 'http://localhost:3000/api/v1/thing';
const REQUEST_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
// The server exposes x-request-id to the cross-origin web app.
const HEADERS = {
  'x-request-id': REQUEST_ID,
  'access-control-expose-headers': 'x-request-id',
};

interface ThingProps {
  path?: string;
}

function Thing({ path = 'thing' }: ThingProps) {
  useQuery({
    queryKey: [path],
    queryFn: () => apiClient({ url: `/api/v1/${path}`, method: 'GET' }),
    retry: false,
  });
  return null;
}

function renderThing(client = createQueryClient(), paths = ['thing']) {
  render(
    <QueryClientProvider client={client}>
      {paths.map((path) => (
        <Thing key={path} path={path} />
      ))}
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('request error toast', () => {
  it('shows the reference code on the generic 500 toast', async () => {
    mswServer.use(
      http.get(URL, () =>
        HttpResponse.json(
          {
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Algo deu errado.',
            requestId: REQUEST_ID,
          },
          { status: 500, headers: HEADERS },
        ),
      ),
    );

    renderThing();

    expect(await screen.findByText('Algo deu errado.')).toBeVisible();
    expect(
      screen.getByText(m.common_reference_code({ code: '4bf92f35' })),
    ).toBeVisible();
  });

  it('shows no reference code on a domain-error toast', async () => {
    mswServer.use(
      http.get(URL, () =>
        HttpResponse.json(
          { error: 'OVERLAPPING_CYCLE', message: 'Ciclo sobreposto.' },
          { status: 422, headers: HEADERS },
        ),
      ),
    );

    renderThing();

    expect(await screen.findByText('Ciclo sobreposto.')).toBeVisible();
    expect(
      screen.queryByText(m.common_reference_code({ code: '4bf92f35' })),
    ).toBeNull();
  });

  it('retries the query from the toast Retry button', async () => {
    let calls = 0;
    mswServer.use(
      http.get(URL, () => {
        calls += 1;
        return HttpResponse.json(
          { error: 'BOOM', message: 'Falhou.' },
          { status: 422, headers: HEADERS },
        );
      }),
    );

    renderThing();
    await userEvent.click(
      await screen.findByRole('button', { name: m.common_retry() }),
    );

    await waitFor(() => expect(calls).toBe(2));
  });

  it('retries every failed query from the one toast Retry button', async () => {
    const calls = { thing: 0, other: 0 };
    mswServer.use(
      http.get('http://localhost:3000/api/v1/:path', ({ params }) => {
        calls[params.path as keyof typeof calls] += 1;
        return HttpResponse.json(
          { error: 'BOOM', message: 'Falhou.' },
          { status: 422, headers: HEADERS },
        );
      }),
    );

    renderThing(createQueryClient(), ['thing', 'other']);
    await waitFor(() => expect(calls).toEqual({ thing: 1, other: 1 }));
    await userEvent.click(
      await screen.findByRole('button', { name: m.common_retry() }),
    );

    await waitFor(() => expect(calls).toEqual({ thing: 2, other: 2 }));
  });

  it('shows one toast for repeated failures', async () => {
    mswServer.use(
      http.get(URL, () =>
        HttpResponse.json(
          { error: 'BOOM', message: 'Falhou.' },
          { status: 422, headers: HEADERS },
        ),
      ),
    );
    const client = createQueryClient();

    renderThing(client);
    await screen.findByText('Falhou.');
    await client.refetchQueries({ queryKey: ['thing'] });

    expect(screen.getAllByText('Falhou.')).toHaveLength(1);
  });

  it.each([404, 409, 410])('does not toast an expected %i', async (status) => {
    let calls = 0;
    mswServer.use(
      http.get(URL, () => {
        calls += 1;
        return HttpResponse.json(
          { error: 'EXPECTED', message: 'Esperado.' },
          { status, headers: HEADERS },
        );
      }),
    );

    renderThing();

    await waitFor(() => expect(calls).toBe(1));
    expect(screen.queryByText('Esperado.')).toBeNull();
  });

  it('redirects once on 401 and does not toast', async () => {
    mswServer.use(
      http.get(URL, () =>
        HttpResponse.json(
          { error: 'UNAUTHORIZED', message: 'Sessão expirada.' },
          { status: 401, headers: HEADERS },
        ),
      ),
    );
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    renderThing(client);
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    await client.refetchQueries({ queryKey: ['thing'] });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sessão expirada.')).toBeNull();
  });

  it('redirects again on a 401 after a successful answer', async () => {
    let status = 401;
    mswServer.use(
      http.get(URL, () =>
        status === 200
          ? HttpResponse.json({}, { headers: HEADERS })
          : HttpResponse.json(
              { error: 'UNAUTHORIZED', message: 'Sessão expirada.' },
              { status, headers: HEADERS },
            ),
      ),
    );
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    renderThing(client);
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    // Signed in again: the session answers.
    status = 200;
    await client.refetchQueries({ queryKey: ['thing'] });
    status = 401;
    await client.refetchQueries({ queryKey: ['thing'] });

    expect(onSessionExpired).toHaveBeenCalledTimes(2);
  });

  it('keeps the session on an auth-backend 503: no redirect and no toast', async () => {
    let calls = 0;
    mswServer.use(
      http.get(URL, () => {
        calls += 1;
        return HttpResponse.json(
          { error: 'SERVICE_UNAVAILABLE', message: 'Indisponível.' },
          { status: 503, headers: { ...HEADERS, 'retry-after': '5' } },
        );
      }),
    );
    const onSessionExpired = vi.fn();
    const client = createQueryClient({ onSessionExpired });

    renderThing(client);
    await waitFor(() =>
      expect(client.getQueryState(['thing'])?.status).toBe('error'),
    );

    expect(calls).toBe(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(screen.queryByText('Indisponível.')).toBeNull();
  });
});
