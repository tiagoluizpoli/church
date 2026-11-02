import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { USUAL_SETUP_QUERY_KEY } from '@/features/scheduling/components/planning-admin/template-query-keys';
import type { BreadcrumbSegmentOverride } from '@/features/scheduling/hooks/use-cycle-breadcrumb';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

interface UsualSetupScopeInput {
  churchId: string | undefined;
  ministryId: string;
}

/** Below the `['usual-setup']` root that template edits and deletes invalidate. */
export function usualSetupQueryKey({
  churchId,
  ministryId,
}: UsualSetupScopeInput) {
  return [...USUAL_SETUP_QUERY_KEY, churchId, ministryId] as const;
}

interface UseUsualSetupInput {
  ministryId: string;
}

/** Every current Time block with the Ministry's saved entry; refetched on focus. */
export function useUsualSetup({ ministryId }: UseUsualSetupInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: usualSetupQueryKey({ churchId, ministryId }),
    queryFn: () => adminApi.listUsualSetup(ministryId),
    retry: false,
  });
}

interface UseUsualSetupBlockBreadcrumbInput {
  churchId: string;
}

/** Labels `/ministries/$ministryId/usual-setup/$blockId` with its template and block. */
export function useUsualSetupBlockBreadcrumb({
  churchId,
}: UseUsualSetupBlockBreadcrumbInput): BreadcrumbSegmentOverride | null {
  const { ministryId, blockId } = useParams({ strict: false });
  const setup = useQuery({
    queryKey: usualSetupQueryKey({ churchId, ministryId: ministryId ?? '' }),
    queryFn: () => adminApi.listUsualSetup(ministryId ?? ''),
    enabled: ministryId !== undefined && blockId !== undefined,
    retry: false,
  });
  const block = setup.data?.blocks.find(
    (candidate) => candidate.sourceTemplateTimeBlockId === blockId,
  );
  if (!blockId || !block) return null;
  return { segment: blockId, label: `${block.templateName} · ${block.label}` };
}
