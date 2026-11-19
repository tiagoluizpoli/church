import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';
import { type ExternalToast, toast } from 'sonner';
import { REFERENCE_CODE_LENGTH } from '@/shared/utils/error-reporting';
import { requestErrorMessage } from '@/shared/utils/request-error-message';

/** The API's error body, as far as the toast reads it. */
interface ErrorResponseBody {
  error?: unknown;
}

interface ToastRequestErrorInput {
  error: unknown;
  action?: ExternalToast['action'];
}

/**
 * The request-failure toast. The generic 500 adds a reference code, the first
 * 8 characters of the response's `x-request-id`, which support finds in the
 * logs; a domain error needs none, its message already says what happened.
 */
export function toastRequestError({ error, action }: ToastRequestErrorInput) {
  const response = isAxiosError<ErrorResponseBody>(error)
    ? error.response
    : undefined;
  const requestId = response?.headers?.['x-request-id'];
  const generic =
    response?.data?.error === 'INTERNAL_SERVER_ERROR' &&
    typeof requestId === 'string';
  const message = requestErrorMessage(error);
  toast.error(message, {
    action,
    description: generic
      ? m.common_reference_code({
          code: requestId.slice(0, REFERENCE_CODE_LENGTH),
        })
      : undefined,
  });
}
