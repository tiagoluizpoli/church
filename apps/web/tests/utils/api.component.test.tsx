import { m } from '@church/i18n/messages';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Toaster } from 'sonner';
import { describe, expect, it } from 'vitest';
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

function Thing() {
  useQuery({
    queryKey: ['thing'],
    queryFn: () => apiClient({ url: '/api/v1/thing', method: 'GET' }),
    retry: false,
  });
  return null;
}

function renderThing() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Thing />
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
          { status: 409, headers: HEADERS },
        ),
      ),
    );

    renderThing();

    expect(await screen.findByText('Ciclo sobreposto.')).toBeVisible();
    expect(
      screen.queryByText(m.common_reference_code({ code: '4bf92f35' })),
    ).toBeNull();
  });
});
