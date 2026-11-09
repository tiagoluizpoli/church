import { isAxiosError } from 'axios';
import { z } from 'zod';

interface BuilderErrorMessageInput {
  error: unknown;
  fallback: string;
}

const refusalSchema = z.object({ message: z.string().min(1) });

/** Server refusals are localized from the request locale; transport errors are not. */
export function builderErrorMessage({
  error,
  fallback,
}: BuilderErrorMessageInput): string {
  const refusal = refusalSchema.safeParse(
    isAxiosError<unknown>(error) ? error.response?.data : undefined,
  );
  return refusal.success ? refusal.data.message : fallback;
}
