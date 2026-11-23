import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type {
  GetChurchSettings200,
  RestoreChurchLogoBody,
  UpdateChurchSettings422,
  UpdateChurchSettingsBody,
  UploadChurchLogoBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { churchSettingsApi } from '@/utils/api-instances';

const HTTP_UNPROCESSABLE = 422;
const HTTP_CLIENT_ERROR = 400;
const HTTP_SERVER_ERROR = 500;

/** The shell and select-church read the Church's name and logo from here. */
const ACTIVE_CHURCH_OPTIONS_KEY = ['active-church', 'options'] as const;

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
      queryClient.invalidateQueries({ queryKey: ACTIVE_CHURCH_OPTIONS_KEY });
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
  if (error.response?.status !== HTTP_UNPROCESSABLE || !fieldErrors)
    return null;
  return Object.fromEntries(
    fieldErrors.map(({ field, message }) => [field, message]),
  );
}

interface CheckChurchSlugInput {
  slug: string;
}

export function checkChurchSlug({ slug }: CheckChurchSlugInput) {
  return churchSettingsApi.getChurchSlugAvailability({ slug });
}

/**
 * Logo changes apply at once and touch only the logo in the cached read, so
 * unsaved edits in the form survive an upload.
 */
function useApplyLogo() {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const queryClient = useQueryClient();
  return ({ logoKey, logoUrl }: GetChurchSettings200) => {
    queryClient.setQueryData<GetChurchSettings200>(
      churchSettingsQueryKey({ churchId }),
      (current) => current && { ...current, logoKey, logoUrl },
    );
    queryClient.invalidateQueries({ queryKey: ACTIVE_CHURCH_OPTIONS_KEY });
  };
}

export function useUploadChurchLogo() {
  return useMutation({
    mutationFn: (body: UploadChurchLogoBody) =>
      churchSettingsApi.uploadChurchLogo(body),
    onSuccess: useApplyLogo(),
  });
}

export function useRemoveChurchLogo() {
  return useMutation({
    mutationFn: () => churchSettingsApi.removeChurchLogo(),
    onSuccess: useApplyLogo(),
  });
}

export function useRestoreChurchLogo() {
  return useMutation({
    mutationFn: (body: RestoreChurchLogoBody) =>
      churchSettingsApi.restoreChurchLogo(body),
    onSuccess: useApplyLogo(),
  });
}

/** The worded body of a refused logo request. */
interface LogoRefusalBody {
  message?: string;
}

interface LogoErrorOfInput {
  error: unknown;
}

/** The server's worded refusal of a logo (too big, too small, wrong type, ratio), if it gave one. */
export function logoErrorOf({ error }: LogoErrorOfInput): string | null {
  if (!isAxiosError<LogoRefusalBody>(error)) return null;
  const status = error.response?.status ?? 0;
  const message = error.response?.data?.message;
  const refused = status >= HTTP_CLIENT_ERROR && status < HTTP_SERVER_ERROR;
  return refused && message ? message : null;
}
