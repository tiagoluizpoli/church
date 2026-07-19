import { useQuery } from '@tanstack/react-query';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { adminApi } from '@/utils/api-instances';

interface AuditLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: CycleBuilderData['assignments'];
  cycleId?: string;
  ministryId?: string;
}

export function AuditLogPanel({
  open,
  onOpenChange,
  assignments,
  cycleId,
  ministryId,
}: AuditLogPanelProps) {
  const auditQuery = useQuery({
    queryKey: ['cycle-audit', cycleId, ministryId],
    queryFn: () =>
      adminApi.getCycleAuditLog(cycleId ?? '', {
        ministryId: ministryId ?? '',
      }),
    enabled: open && cycleId !== undefined && ministryId !== undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Log</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {auditQuery.isLoading ? (
            <p className="text-muted-foreground">Loading cycle activity…</p>
          ) : null}
          {auditQuery.isError ? (
            <div className="space-y-2">
              <p className="text-destructive">Could not load cycle activity.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => auditQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {!auditQuery.isLoading &&
          !auditQuery.isError &&
          auditQuery.data?.items.length === 0 ? (
            <p className="text-muted-foreground">
              No assignment changes in this cycle yet.
            </p>
          ) : null}
          {auditQuery.data?.items.map((item) => {
            const volunteerName =
              assignments.find(
                (assignment) => assignment.id === item.assignmentId,
              )?.volunteerName ?? item.assignmentId;

            return (
              <div key={item.id} className="rounded border p-2">
                <div className="font-medium">{volunteerName}</div>
                <div className="text-muted-foreground">
                  {item.action}
                  {item.reason ? ` — ${item.reason}` : ''}
                </div>
                <div className="text-muted-foreground text-xs">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.timestamp))}{' '}
                  · by {item.actorId}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
