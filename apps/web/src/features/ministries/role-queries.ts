import { type QueryClient, useQuery } from '@tanstack/react-query';
import { MINISTRIES_QUERY_KEY } from '@/features/ministries/ministry-queries';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

interface MinistryRolesScopeInput {
  churchId: string | undefined;
  ministryId: string;
}

export function ministryRolesQueryKey({
  churchId,
  ministryId,
}: MinistryRolesScopeInput) {
  return [...MINISTRIES_QUERY_KEY, churchId, 'roles', ministryId] as const;
}

interface UseMinistryRolesInput {
  ministryId: string;
}

/** The Ministry's active Roles: the active-choice read for new use. */
export function useMinistryRoles({ ministryId }: UseMinistryRolesInput) {
  const churchId = useCallerCapabilitiesScope()?.churchId;
  return useQuery({
    queryKey: ministryRolesQueryKey({ churchId, ministryId }),
    queryFn: () => adminApi.listMinistryRoles(ministryId),
    retry: false,
  });
}

/** Planning reads whose Role choices or names change with the registry. */
const ROLE_READERS = [['prepare-role-catalog'], ['cycle-builder']] as const;

interface InvalidateRoleReadsInput extends MinistryRolesScopeInput {
  queryClient: QueryClient;
}

export async function invalidateRoleReads({
  queryClient,
  churchId,
  ministryId,
}: InvalidateRoleReadsInput): Promise<void> {
  await Promise.all(
    [ministryRolesQueryKey({ churchId, ministryId }), ...ROLE_READERS].map(
      (queryKey) => queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
