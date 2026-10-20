import { appConfig } from '@church/app-config';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { REFUSAL_STATUS, refuse } from '@/api/utils/refuse';
import { ERROR_MESSAGES } from '@/main/fastify/error-messages';

const app = Fastify();
app.get('/:code', (request, reply) =>
  refuse(reply, request, (request.params as { code: string }).code as never),
);

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

  it.each(Object.keys(REFUSAL_STATUS))('%s has a catalog entry', (code) => {
    expect(ERROR_MESSAGES[code]).toBeDefined();
  });
});
