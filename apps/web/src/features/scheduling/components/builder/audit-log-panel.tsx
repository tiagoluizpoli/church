import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { useQuery } from '@tanstack/react-query';
import { useTimezone } from '../../../../shared/hooks/use-timezone';
import { formatVolunteerName } from '@/utils/format-volunteer-name';
import { trpc } from '@/utils/trpc';

interface AuditLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

export function AuditLogPanel({
  open,
  onOpenChange,
  eventId,
}: AuditLogPanelProps) {
  const { format } = useTimezone();
  const query = useQuery({
    ...trpc.adminLeader.listAuditLog.queryOptions({ eventId }),
    enabled: open,
  });

  const entries = query.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Log</DialogTitle>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No overrides recorded</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Volunteer</th>
                  <th className="py-1 pr-2">Slot</th>
                  <th className="py-1 pr-2">Role</th>
                  <th className="py-1 pr-2">Reason</th>
                  <th className="py-1 pr-2">Actor</th>
                  <th className="py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="py-1 pr-2">
                      {formatVolunteerName(e.volunteerName)}
                    </td>
                    <td className="py-1 pr-2">{e.slotLabel}</td>
                    <td className="py-1 pr-2">{e.roleName}</td>
                    <td className="py-1 pr-2">{e.reason}</td>
                    <td className="py-1 pr-2">{e.actorName}</td>
                    <td className="py-1">{format(e.timestamp, 'PPp')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
