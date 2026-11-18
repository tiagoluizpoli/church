// biome-ignore-all lint/style/useNamingConvention: Sentry event fields are snake_case on the wire
import { describe, expect, it } from 'vitest';
import {
  allowedHeaders,
  redactUrl,
  scrubEvent,
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
      'https://church.test/invitations/church/SECRET?lang=en',
      'https://church.test/invitations/church/:redacted',
    ],
    [
      'https://church.test/invitations/ministry/SECRET',
      'https://church.test/invitations/ministry/:redacted',
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

describe('scrubEvent', () => {
  const frame = {
    filename: '/app/src/x.ts',
    abs_path: 'https://church.test/assets/index-abc.js?v=SECRET',
    function: 'handler',
    lineno: 3,
    colno: 7,
    in_app: true,
    vars: { email: 'a@b.test' },
  };
  const event = {
    event_id: 'e1',
    timestamp: 1,
    level: 'error',
    platform: 'javascript',
    environment: 'staging',
    release: 'rev-1',
    server_name: 'host-1',
    message: 'Hello a@b.test',
    tags: { trace_id: 't1', revision: 'rev-1', person: 'Ana' },
    user: {
      id: 'user_1',
      email: 'a@b.test',
      ip_address: '203.0.113.9',
      username: 'Ana',
    },
    request: {
      method: 'POST',
      url: 'https://api.test/api/auth/reset-password/TOKEN?email=a@b.test',
      query_string: 'email=a@b.test',
      cookies: { session: 'SESSION' },
      data: { password: 'BODY' },
      headers: {
        'user-agent': 'ua',
        cookie: 'SESSION',
        authorization: 'Bearer X',
      },
      env: { REMOTE_ADDR: '203.0.113.9' },
    },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'failed for a@b.test',
          mechanism: { type: 'generic', handled: true },
          stacktrace: { frames: [frame] },
        },
      ],
    },
    breadcrumbs: [{ message: 'a@b.test' }],
    extra: { body: 'BODY' },
    contexts: {
      trace: { trace_id: 't1', span_id: 's1' },
      os: { name: 'linux' },
    },
  };

  it('keeps ids, error type, stack and allowed request facts only', () => {
    expect(scrubEvent({ event })).toEqual({
      event_id: 'e1',
      timestamp: 1,
      level: 'error',
      platform: 'javascript',
      environment: 'staging',
      release: 'rev-1',
      tags: { trace_id: 't1', revision: 'rev-1' },
      user: { id: 'user_1' },
      request: {
        method: 'POST',
        url: 'https://api.test/api/auth/reset-password/:redacted',
        headers: { 'user-agent': 'ua' },
      },
      exception: {
        values: [
          {
            type: 'TypeError',
            mechanism: { type: 'generic', handled: true },
            stacktrace: {
              frames: [
                {
                  filename: '/app/src/x.ts',
                  abs_path: 'https://church.test/assets/index-abc.js',
                  function: 'handler',
                  lineno: 3,
                  colno: 7,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
      contexts: { trace: { trace_id: 't1', span_id: 's1' } },
    });
  });

  it('drops an event that is not an object', () => {
    expect(scrubEvent({ event: 'nope' })).toBeNull();
  });
});
