import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';

/**
 * The server's translated envelope message, else the translated generic error;
 * axios' own English text (network failure, status line) is never shown.
 */
export function requestErrorMessage(error: unknown): string {
  const message = isAxiosError<{ message?: unknown }>(error)
    ? error.response?.data?.message
    : undefined;
  return typeof message === 'string' && message
    ? message
    : m.common_generic_error();
}
