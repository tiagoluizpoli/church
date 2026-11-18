import { AxiosError, AxiosHeaders } from 'axios';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { createQueryClient, shouldRetry } from '@/utils/api';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function serverError(status: number) {
  const headers = new AxiosHeaders();
  return new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: {},
  });
}

describe('query error policy', () => {
  it('retries a server error once for a query that shows its own error', () => {
    const once = { serverErrorRetries: 1 };
    expect(
      shouldRetry({ ...once, failureCount: 0, error: serverError(500) }),
    ).toBe(true);
    expect(
      shouldRetry({ ...once, failureCount: 1, error: serverError(500) }),
    ).toBe(false);
    expect(
      shouldRetry({ ...once, failureCount: 0, error: serverError(404) }),
    ).toBe(false);
  });

  it('toasts a failed query unless it shows its own error', async () => {
    const client = createQueryClient();
    const fail = () => Promise.reject(serverError(404));
    await client
      .fetchQuery({ queryKey: ['toasted'], queryFn: fail })
      .catch(() => {});
    expect(toast.error).toHaveBeenCalledTimes(1);
    await client
      .fetchQuery({
        queryKey: ['own-error'],
        queryFn: fail,
        meta: { showsOwnError: true },
      })
      .catch(() => {});
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
