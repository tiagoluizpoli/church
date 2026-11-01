import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { BreadcrumbSegmentOverride } from './use-cycle-breadcrumb';
import { templateDetailQueryKey } from '@/features/scheduling/components/planning-admin/template-query-keys';
import { adminApi } from '@/utils/api-instances';

/** Labels the `/event-templates/$templateId` segment with the saved template name. */
export function useTemplateBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { templateId } = useParams({ strict: false });
  const templateQuery = useQuery({
    queryKey: templateDetailQueryKey({ templateId: templateId ?? '' }),
    queryFn: () => adminApi.getEventTemplate(templateId ?? ''),
    enabled: templateId !== undefined,
    retry: false,
  });

  if (templateId === undefined || !templateQuery.data) {
    return null;
  }

  return { segment: templateId, label: templateQuery.data.name };
}
