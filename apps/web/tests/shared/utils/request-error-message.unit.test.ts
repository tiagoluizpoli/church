import { m } from '@church/i18n/messages';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

function axiosFailure(data?: unknown) {
  const error = new AxiosError('Request failed with status code 500');
  if (data !== undefined) {
    error.response = { data } as AxiosError['response'];
  }
  return error;
}

describe('requestErrorMessage', () => {
  it('shows the server-translated message from the response envelope', () => {
    expect(
      requestErrorMessage(axiosFailure({ message: 'Não encontrado.' })),
    ).toBe('Não encontrado.');
  });

  it('falls back to the generic error on a network failure', () => {
    expect(requestErrorMessage(axiosFailure())).toBe(m.common_generic_error());
  });

  it('falls back to the generic error for a non-request error', () => {
    expect(requestErrorMessage(new Error('boom'))).toBe(
      m.common_generic_error(),
    );
  });
});
