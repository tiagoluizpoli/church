import type { APIRequestContext } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveActiveChurch } from './persona-session';

const SERVER_URL = 'http://localhost:4100';
const CHURCH_A = 'church-a';

interface FakeResponseInput {
  status: number;
  body: unknown;
}

function fakeResponse({ status, body }: FakeResponseInput) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

interface FakeRequestInput {
  status: FakeResponseInput;
  select?: FakeResponseInput;
}

/** A controlled Playwright request context: one status reply, one selection reply. */
function fakeRequest({ status, select }: FakeRequestInput) {
  const get = vi.fn(async () => fakeResponse(status));
  const post = vi.fn(async () => {
    if (!select) throw new Error('selection was not expected');
    return fakeResponse(select);
  });
  return {
    get,
    post,
    request: { get, post } as unknown as APIRequestContext,
  };
}

const RESOLVED_A = {
  status: 200,
  body: { status: 'resolved', churchId: CHURCH_A, timezone: 'UTC' },
};

describe('resolveActiveChurch', () => {
  const original = process.env.VITE_SERVER_URL;

  beforeEach(() => {
    process.env.VITE_SERVER_URL = SERVER_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VITE_SERVER_URL;
    } else {
      process.env.VITE_SERVER_URL = original;
    }
  });

  it('explicitly selects the resolved Church and succeeds when the selection names it', async () => {
    const { request, post } = fakeRequest({
      status: RESOLVED_A,
      select: RESOLVED_A,
    });

    await expect(
      resolveActiveChurch({ request, name: 'Admin' }),
    ).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith(
      `${SERVER_URL}/api/v1/active-church/select`,
      { data: { churchId: CHURCH_A } },
    );
  });

  it('fails when the status resolves but saving the selection fails', async () => {
    const { request } = fakeRequest({
      status: RESOLVED_A,
      select: {
        status: 500,
        body: { error: 'INTERNAL_SERVER_ERROR', message: 'Erro' },
      },
    });

    await expect(
      resolveActiveChurch({ request, name: 'Admin' }),
    ).rejects.toThrow(
      /select failed for Admin for Church church-a \(HTTP 500\)/,
    );
  });

  it('fails when the selection names a different Church', async () => {
    const { request } = fakeRequest({
      status: RESOLVED_A,
      select: {
        status: 200,
        body: { status: 'resolved', churchId: 'church-b', timezone: 'UTC' },
      },
    });

    await expect(
      resolveActiveChurch({ request, name: 'Admin' }),
    ).rejects.toThrow(/select failed for Admin for Church church-a/);
  });

  it('fails when the selection answers without a resolved status', async () => {
    const { request } = fakeRequest({
      status: RESOLVED_A,
      select: { status: 200, body: { status: 'selection_required' } },
    });

    await expect(
      resolveActiveChurch({ request, name: 'Admin' }),
    ).rejects.toThrow(/select failed for Admin for Church church-a/);
  });

  it.each([
    [
      'an unresolved status',
      { status: 200, body: { status: 'no_membership' } },
    ],
    [
      'a resolved status without a Church id',
      { status: 200, body: { status: 'resolved', churchId: '' } },
    ],
    [
      'a failed status request',
      { status: 401, body: { error: 'UNAUTHORIZED' } },
    ],
  ])('fails on %s without attempting a selection', async (_case, status) => {
    const { request, post } = fakeRequest({ status });

    await expect(
      resolveActiveChurch({ request, name: 'Volunteer' }),
    ).rejects.toThrow(/status failed for Volunteer \(HTTP/);
    expect(post).not.toHaveBeenCalled();
  });
});
