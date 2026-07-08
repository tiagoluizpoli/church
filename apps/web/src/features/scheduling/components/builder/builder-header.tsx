import { Link } from '@tanstack/react-router';
import { Bell, MoreHorizontal, RefreshCw } from 'lucide-react';
import { useTimezone } from '../../../../shared/hooks/use-timezone';
import type { SaveStatus } from '../../hooks/use-auto-save';
import { StaffingMeter } from './staffing-meter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BuilderHeaderProps {
  event: {
    id: string;
    title: string;
    startDate: string | Date;
    endDate: string | Date;
    status: string;
  };
  ministryName?: string;
  fillPercentage: number;
  saveStatus: SaveStatus;
  canPublish: boolean;
  isPublishing: boolean;
  onPublish: () => void;
  onSendReminder: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onOpenAuditLog: () => void;
  onOpenPrintExport: () => void;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Auto-saving…',
  saved: 'Saved',
  error: 'Changes not saved',
};

export function BuilderHeader({
  event,
  ministryName,
  fillPercentage,
  saveStatus,
  canPublish,
  isPublishing,
  onPublish,
  onSendReminder,
  onRetry,
  onRefresh,
  onOpenAuditLog,
  onOpenPrintExport,
}: BuilderHeaderProps) {
  const { format } = useTimezone();
  const isPublished = event.status === 'scheduled';

  return (
    <header className="flex flex-col gap-2 border-b pb-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-xl">
            <Link
              to="/scheduling/events/$eventId/builder"
              params={{ eventId: event.id }}
              className="hover:underline"
            >
              {event.title}
            </Link>
          </h1>
          <p className="text-muted-foreground text-sm">
            {format(event.startDate, 'PP')} – {format(event.endDate, 'PP')}
            {ministryName ? ` · ${ministryName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            className={
              isPublished
                ? 'bg-green-600 text-white'
                : 'bg-muted text-foreground'
            }
          >
            {isPublished ? 'Published' : 'Draft'}
          </Badge>
          {saveStatus !== 'idle' && (
            <span
              data-testid="save-status"
              data-status={saveStatus}
              className="text-muted-foreground text-xs"
            >
              {SAVE_LABEL[saveStatus]}
            </span>
          )}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRefresh}
            aria-label="Refresh availability data"
          >
            <RefreshCw className="size-4" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSendReminder}
          >
            <Bell className="mr-1 size-3" /> Send Reminder
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!canPublish || isPublished || isPublishing}
            onClick={onPublish}
          >
            Publish
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenPrintExport}>
                Print / Export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenAuditLog}>
                View Audit Log
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <StaffingMeter fillRatio={fillPercentage} variant="event" />
      </div>

      {saveStatus === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Changes not saved</AlertTitle>
          <AlertDescription>
            Something went wrong saving your changes.
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={onRetry}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </header>
  );
}
