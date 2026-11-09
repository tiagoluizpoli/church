import { m } from '@church/i18n/messages';
import { useQuery } from '@tanstack/react-query';
import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

interface AuditLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: CycleBuilderData['assignments'];
  cycleId?: string;
  ministryId?: string;
}

function auditActionLabel(action: string): string {
  switch (action) {
    case 'created':
      return m.builder_ui_audit_created();
    case 'updated':
      return m.builder_ui_audit_updated();
    case 'deleted':
      return m.builder_ui_audit_deleted();
    case 'status_change':
      return m.builder_ui_audit_status_change();
    case 'event_published':
      return m.builder_ui_audit_event_published();
    case 'event_cancelled':
      return m.builder_ui_audit_event_cancelled();
    default:
      return action;
  }
}

export function AuditLogPanel({
  open,
  onOpenChange,
  assignments,
  cycleId,
  ministryId,
}: AuditLogPanelProps) {
  const { churchTimezone } = useTimezone();
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
          <DialogTitle>{m.builder_ui_audit_title()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {auditQuery.isLoading ? (
            <p className="text-muted-foreground">
              {m.builder_ui_audit_loading()}
            </p>
          ) : null}
          {auditQuery.isError ? (
            <div className="space-y-2">
              <p className="text-destructive">{m.builder_ui_audit_error()}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => auditQuery.refetch()}
              >
                {m.builder_ui_retry()}
              </Button>
            </div>
          ) : null}
          {!auditQuery.isLoading &&
          !auditQuery.isError &&
          auditQuery.data?.items.length === 0 ? (
            <p className="text-muted-foreground">
              {m.builder_ui_audit_empty()}
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
                  {auditActionLabel(item.action)}
                  {item.reason ? ` — ${item.reason}` : ''}
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatInstantOf({
                    value: item.timestamp,
                    timeZone: churchTimezone,
                  })}{' '}
                  · {m.builder_ui_audit_by({ actor: item.actorId })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
