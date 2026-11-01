import { appConfig } from '@church/app-config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RefusalCode } from '@/api/utils/error-table';
import { refuse } from '@/api/utils/refuse';
import { createFastify } from '@/main/fastify/setup';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

let app: Awaited<ReturnType<typeof createFastify>>;
beforeAll(async () => {
  app = await createFastify({ locale: testLocale });
  app.get<{ Params: { code: RefusalCode } }>('/:code', (request, reply) =>
    refuse({ reply, request, code: request.params.code }),
  );
  await app.ready();
});

const cookie = (locale: string) => `${appConfig.localeCookieName}=${locale}`;

describe('refuse', () => {
  it.each([
    [
      'UNAUTHORIZED',
      401,
      'Autenticação necessária.',
      'Authentication required.',
    ],
    [
      'FORBIDDEN',
      403,
      'Você não tem permissão para fazer isso.',
      'You do not have permission to do that.',
    ],
    [
      'NOT_FOUND',
      404,
      'Não encontramos o que você pediu.',
      'We could not find what you asked for.',
    ],
    [
      'ACTIVE_CHURCH_SELECTION_REQUIRED',
      409,
      'Escolha uma Igreja ativa para continuar.',
      'Select an active Church to continue.',
    ],
    [
      'RATE_LIMITED',
      429,
      'Muitas tentativas. Tente novamente em instantes.',
      'Too many attempts. Try again in a moment.',
    ],
    [
      'INVITATION_UNAVAILABLE',
      404,
      'Este convite não está disponível.',
      'This invitation is not available.',
    ],
  ])('%s sends %i with a message in both locales', async (code, status, pt, en) => {
    const ptRes = await app.inject({ url: `/${code}` });
    const enRes = await app.inject({
      url: `/${code}`,
      headers: { cookie: cookie('en') },
    });
    expect(ptRes.statusCode).toBe(status);
    expect(ptRes.json()).toEqual({ error: code, message: pt });
    expect(enRes.json()).toEqual({ error: code, message: en });
  });
});
