import { m } from '@church/i18n/messages';
import { sendLabel } from './availability-answer-actions';
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
import { Button } from '@/components/ui/button';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';

export interface AvailabilityLeaveDialogProps {
  answer: AvailabilityAnswer;
}

/** Leaving with unsent changes: stay, leave without sending, or send now. */
export function AvailabilityLeaveDialog({
  answer,
}: AvailabilityLeaveDialogProps) {
  const { blocker } = answer;
  return (
    <AlertDialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
    >
      <AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {m.availability_leave_title()}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {answer.confirmed
              ? m.availability_leave_body_changes()
              : m.availability_leave_body()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.availability_leave_stay()}</AlertDialogCancel>
          <Button
            variant="outline"
            size="touch"
            onClick={() => blocker.proceed?.()}
          >
            {m.availability_leave_exit()}
          </Button>
          <AlertDialogAction
            disabled={answer.pending}
            onClick={() => {
              // Sending ends on the list, like the main button.
              blocker.reset?.();
              answer.send.mutate();
            }}
          >
            {sendLabel(answer)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
