import { m } from '@church/i18n/messages';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { AvailabilityAnswer } from '@/features/volunteers/hooks/use-availability-answer';
import { cn } from '@/lib/utils';

export interface AvailabilityAnswerActionsProps {
  answer: AvailabilityAnswer;
  /** `row` for the bottom bar, `stack` for the desktop side panel. */
  layout: 'row' | 'stack';
}

export function sendLabel(answer: AvailabilityAnswer): string {
  return answer.confirmed
    ? m.availability_detail_save_changes()
    : m.availability_detail_confirm();
}

/** Send, plus the resets beside it: back to the sent answer, and "Disponível para tudo" (or its undo). */
export function AvailabilityAnswerActions({
  answer,
  layout,
}: AvailabilityAnswerActionsProps) {
  const stack = layout === 'stack';
  const secondary = cn('shrink-0', stack && 'w-full');
  const send = answer.done ? (
    <p className="flex items-center gap-1.5 font-medium text-green-700 text-sm dark:text-green-400">
      <CircleCheck aria-hidden className="size-4 shrink-0" />
      <span>{m.availability_detail_done()}</span>
    </p>
  ) : (
    <Button
      className={cn(
        stack
          ? 'w-full'
          : 'max-md:h-auto max-md:min-h-11 max-md:flex-1 max-md:whitespace-normal',
      )}
      disabled={answer.pending}
      onClick={() => answer.send.mutate()}
    >
      {answer.pending ? <Spinner /> : null}
      {answer.pending
        ? answer.confirmed
          ? m.availability_detail_saving()
          : m.availability_detail_pending()
        : sendLabel(answer)}
    </Button>
  );
  return (
    <div
      className={cn(
        'flex gap-2',
        stack
          ? 'flex-col'
          : 'flex-wrap items-center max-md:min-h-11 md:shrink-0',
      )}
    >
      {stack ? send : null}
      {answer.canDiscardChanges ? (
        <Button
          variant="outline"
          className={secondary}
          disabled={answer.pending}
          onClick={answer.discardChanges}
        >
          {m.availability_detail_discard_changes()}
        </Button>
      ) : null}
      {answer.canUndo ? (
        <Button variant="outline" className={secondary} onClick={answer.undo}>
          {m.availability_detail_undo()}
        </Button>
      ) : answer.canMarkAllAvailable ? (
        // A draft reset, never a submit: the main button still sends the answer.
        <Button
          variant="outline"
          className={secondary}
          onClick={answer.markAllAvailable}
        >
          {m.availability_detail_confirm_all()}
        </Button>
      ) : null}
      {stack ? null : send}
    </div>
  );
}

export interface AvailabilityAnswerStatusProps {
  answer: AvailabilityAnswer;
}

/** Screen-reader confirmation of the shortcut, and the send error. */
export function AvailabilityAnswerStatus({
  answer,
}: AvailabilityAnswerStatusProps) {
  return (
    <>
      {answer.canUndo ? (
        <p role="status" className="sr-only">
          {m.availability_detail_all_marked_available()}
        </p>
      ) : null}
      {answer.send.isError ? (
        <p role="alert" className="pt-1 text-destructive text-sm">
          {answer.publishedRefusal
            ? m.availability_detail_published_retry()
            : m.availability_detail_send_error()}
        </p>
      ) : null}
    </>
  );
}
