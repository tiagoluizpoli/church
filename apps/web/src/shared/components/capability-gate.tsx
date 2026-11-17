import { m } from '@church/i18n/messages';
import type { ReactNode } from 'react';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type CallerCapabilities,
  useCallerCapabilities,
} from '@/shared/hooks/use-caller-capabilities';

interface CapabilityGateProps {
  allow: (capabilities: CallerCapabilities) => boolean;
  refusal: 'no-access' | 'not-serving';
  children?: ReactNode;
}

/**
 * UX gate only: server authorization stays the authority (ADR-0009). Fails
 * closed — the refusal shows once capabilities are known, never while they load.
 */
export function CapabilityGate({
  allow,
  refusal,
  children,
}: CapabilityGateProps) {
  const capabilities = useCallerCapabilities();

  if (capabilities.isResolving) {
    return (
      <Pending className="space-y-3" data-testid="capability-gate-skeleton">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </Pending>
    );
  }

  if (!allow(capabilities)) {
    return (
      <p className="text-muted-foreground" role="status">
        {refusal === 'no-access' ? m.shell_no_access() : m.shell_not_serving()}
      </p>
    );
  }

  return children;
}
