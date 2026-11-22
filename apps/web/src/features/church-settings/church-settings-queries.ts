import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type {
  UpdateChurchSettings422,
  UpdateChurchSettingsBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { churchSettingsApi } from '@/utils/api-instances';

interface ChurchKeyInput {
  churchId: string | undefined;
}

export function churchSettingsQueryKey({ churchId }: ChurchKeyInput) {
  return ['church-settings', churchId] as const;
}

export function useChurchSettings() {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: churchSettingsQueryKey({ churchId }),
    queryFn: () => churchSettingsApi.getChurchSettings(),
  });
}

/** Saves the whole set; on success the read is replaced by the server's normalised answer. */
export function useSaveChurchSettings() {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateChurchSettingsBody) =>
      churchSettingsApi.updateChurchSettings(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(churchSettingsQueryKey({ churchId }), saved);
    },
  });
}

interface FieldErrorsOfInput {
  error: unknown;
}

/** The server's per-field refusals (`field` → message), or `null` when the save failed otherwise. */
export function fieldErrorsOf({
  error,
}: FieldErrorsOfInput): Record<string, string> | null {
  if (!isAxiosError<UpdateChurchSettings422>(error)) return null;
  const fieldErrors = error.response?.data?.fieldErrors;
  if (error.response?.status !== 422 || !fieldErrors) return null;
  return Object.fromEntries(
    fieldErrors.map(({ field, message }) => [field, message]),
  );
}
