import { useQuery } from '@tanstack/react-query';
import type { ScheduleBuilderData } from '../../hooks/use-schedule-builder';
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
  assignments: ScheduleBuilderData['assignments'];
}

export function AuditLogPanel({
  open,
  onOpenChange,
  assignments,
}: AuditLogPanelProps) {
  const auditQuery = useQuery({
    queryKey: ['assignment-audits', assignments.map((item) => item.id)],
    queryFn: async () =>
      Promise.all(
        assignments.map(async (assignment) => ({
          assignment,
          audit: await adminApi.getAssignmentAudit(assignment.id),
        })),
      ),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Log</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {auditQuery.data?.flatMap(({ assignment, audit }) =>
            audit.items.map((item) => (
              <div key={item.id} className="rounded border p-2">
                <div className="font-medium">{assignment.volunteerName}</div>
                <div className="text-muted-foreground">
                  {item.action}
                  {item.reason ? ` — ${item.reason}` : ''}
                </div>
              </div>
            )),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
