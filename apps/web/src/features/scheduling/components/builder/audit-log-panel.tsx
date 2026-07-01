import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';

interface AuditLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogPanel({ open, onOpenChange }: AuditLogPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Log</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          Audit logging is now available per assignment.
        </p>
      </DialogContent>
    </Dialog>
  );
}
