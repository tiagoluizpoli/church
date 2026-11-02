import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';

const MAX_NAME_LENGTH = 255;
const NAME_IN_USE = 'MINISTRY_NAME_IN_USE';

export interface NameRefusal {
  nameError?: string;
  formError?: string;
}

interface NameInput {
  name: string;
}

/** The server's trim and length rules, checked before sending. */
export function validateMinistryName({ name }: NameInput): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return m.ministries_name_required();
  if (trimmed.length > MAX_NAME_LENGTH) return m.ministries_name_too_long();
  return undefined;
}

interface SaveErrorInput {
  error: unknown;
}

interface ErrorBody {
  error?: string;
}

/** A name conflict belongs beside the field; anything else is form-level. */
export function toNameRefusal({ error }: SaveErrorInput): NameRefusal {
  const code = isAxiosError<ErrorBody>(error)
    ? error.response?.data?.error
    : undefined;
  if (code === NAME_IN_USE)
    return { nameError: m.error_ministry_name_in_use() };
  return { formError: m.ministries_save_failed() };
}

type RefusalStatus = 'forbidden' | 'not-found' | 'failed';

/** 403 and 404 render the shell's refusal states; other failures can retry. */
export function classifyMinistryReadError({
  error,
}: SaveErrorInput): RefusalStatus {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  return 'failed';
}
