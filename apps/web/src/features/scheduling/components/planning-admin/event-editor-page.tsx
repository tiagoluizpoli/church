import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { isNotFoundError } from './planning-admin.utils';
import { RetryAlert } from './retry-alert';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GetCycle200 } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export interface EventEditorPageProps {
  cycleId: string;
  /** Prefixes the page's test ids, e.g. `event-create`. */
  testId: string;
  title: string;
  description: string;
  children: (details: GetCycle200) => ReactNode;
}

interface BackToCycleProps {
  cycleId: string;
}

export function BackToCycle({ cycleId }: BackToCycleProps) {
  return (
    <Link
      to="/cycles/$cycleId"
      params={{ cycleId }}
      className={buttonVariants()}
    >
      {m.event_editor_back_to_cycle()}
    </Link>
  );
}

interface CancelToCycleProps {
  cycleId: string;
}

/** Leaves the editor without a write. */
export function CancelToCycle({ cycleId }: CancelToCycleProps) {
  return (
    <Link
      to="/cycles/$cycleId"
      params={{ cycleId }}
      className={buttonVariants({ variant: 'outline' })}
    >
      {m.event_editor_cancel()}
    </Link>
  );
}

/**
 * A nested Event page that reads its own Cycle by route id, so a direct visit
 * or refresh works without a prior list selection.
 */
export function EventEditorPage({
  cycleId,
  testId,
  title,
  description,
  children,
}: EventEditorPageProps) {
  const cycleQuery = useQuery({
    queryKey: ['cycle-details', cycleId],
    queryFn: () => adminApi.getCycle(cycleId),
    retry: false,
  });

  return (
    <Card className="surface-panel" data-testid={`${testId}-page`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {cycleQuery.data ? (
          children(cycleQuery.data)
        ) : cycleQuery.isError ? (
          isNotFoundError({ error: cycleQuery.error }) ? (
            <div
              className="flex flex-col items-start gap-3"
              data-testid={`${testId}-cycle-not-found`}
            >
              <p className="text-muted-foreground text-sm">
                {m.cycle_review_not_found()}
              </p>
              <Link to="/cycles" className={buttonVariants()}>
                {m.nav_cycles()}
              </Link>
            </div>
          ) : (
            <RetryAlert
              message={m.cycle_review_error()}
              testId={`${testId}-load-error`}
              onRetry={() => cycleQuery.refetch()}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm" role="status">
            {m.cycle_review_loading()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
