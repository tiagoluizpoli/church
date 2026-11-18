import { describe, expect, it } from 'vitest';
import {
  allowedHeaders,
  redactUrl,
  serializeRequest,
} from '@/infrastructure/privacy/privacy';

describe('redactUrl', () => {
  it.each([
    ['/api/v1/events?cursor=abc&email=a@b.c', '/api/v1/events'],
    [
      '/api/auth/reset-password/SECRET?callbackURL=/x',
      '/api/auth/reset-password/:redacted',
    ],
    [
      '/api/v1/redemption/church/11111111-1111-4111-8111-111111111111',
      '/api/v1/redemption/church/:redacted',
    ],
    [
      '/api/v1/redemption/ministry/SECRET/accept?x=1',
      '/api/v1/redemption/ministry/:redacted/accept',
    ],
    [
      '/api/v1/redemption/transfer/SECRET/confirm#frag',
      '/api/v1/redemption/transfer/:redacted/confirm',
    ],
    [
      '/api/v1/ministries/abc/invitations',
      '/api/v1/ministries/abc/invitations',
    ],
  ])('%s -> %s', (url, expected) => {
    expect(redactUrl({ url })).toBe(expected);
  });
});

describe('allowedHeaders', () => {
  it('keeps allowlisted headers and drops cookie, authorization and the rest', () => {
    expect(
      allowedHeaders({
        headers: {
          'User-Agent': 'x',
          cookie: 'session=1',
          authorization: 'Bearer t',
          referer: 'http://a/?token=1',
          'x-forwarded-for': '1.2.3.4',
          'content-type': 'application/json',
        },
      }),
    ).toEqual({ 'User-Agent': 'x', 'content-type': 'application/json' });
  });
});

describe('serializeRequest', () => {
  it('has only method, masked url and allowed headers', () => {
    expect(
      serializeRequest({
        method: 'GET',
        url: '/api/auth/reset-password/T?x=1',
        headers: { cookie: 'c' },
      }),
    ).toEqual({
      method: 'GET',
      url: '/api/auth/reset-password/:redacted',
      headers: {},
    });
  });
});
