import { m } from '@church/i18n/messages';
import type { useTemplateLeaveGuard } from './use-template-leave-guard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface TemplateLeaveDialogProps {
  blocker: ReturnType<typeof useTemplateLeaveGuard>['blocker'];
  pending: boolean;
}

/** Asks before a dirty template draft is discarded; while saving it only says to wait. */
export function TemplateLeaveDialog({
  blocker,
  pending,
}: TemplateLeaveDialogProps) {
  return (
    <AlertDialog open={blocker.status === 'blocked'}>
      <AlertDialogContent data-testid="template-leave-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{m.event_templates_leave_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? m.event_templates_leave_saving()
              : m.event_templates_leave_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>
            {m.event_templates_leave_stay()}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => blocker.proceed?.()}
          >
            {m.event_templates_leave_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
