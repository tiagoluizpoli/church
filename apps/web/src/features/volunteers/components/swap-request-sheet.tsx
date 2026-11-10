import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { toast } from 'sonner';
import { isStaleRaise } from '../lib/http-status';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { volunteerApi } from '@/utils/api-instances';

export interface SwapRequestSheetProps {
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RefusalBody {
  message?: unknown;
}

/** The server's localized message for a refusal, else the generic one. */
function refusalMessage(error: unknown): string {
  const message = isAxiosError(error)
    ? (error.response?.data as RefusalBody | undefined)?.message
    : undefined;
  return typeof message === 'string' ? message : m.swap_send_error();
}

export function SwapRequestSheet({
  assignmentId,
  open,
  onOpenChange,
}: SwapRequestSheetProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const { noteMaxLength: max } = appConfig.swapRequest;
  const mutation = useMutation({
    mutationFn: () =>
      volunteerApi.raiseSwapRequest(assignmentId, { note: note || undefined }),
    onSuccess: () => onOpenChange(false),
    onError: (error) => {
      // The page is stale: say why, then close; the refetch below shows the real state.
      if (!isStaleRaise(error)) return;
      toast.error(refusalMessage(error));
      onOpenChange(false);
    },
    // A refusal means the page is stale (Shift started, Assignment gone, already open).
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ['assignment-detail', assignmentId],
      }),
  });
  return (
    <ResponsiveFormSurface
      open={open}
      onOpenChange={onOpenChange}
      title={m.swap_sheet_title()}
      description={m.swap_sheet_hint()}
      footer={
        <>
          <Button
            variant="outline"
            size="touch"
            onClick={() => onOpenChange(false)}
          >
            {m.swap_cancel()}
          </Button>
          <Button
            size="touch"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? m.swap_sending() : m.swap_send()}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Label htmlFor="swap-note">{m.swap_note_label()}</Label>
        <Textarea
          id="swap-note"
          value={note}
          maxLength={max}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby="swap-note-limit"
        />
        <p id="swap-note-limit" className="text-muted-foreground text-sm">
          {m.swap_note_limit({ count: note.length, max })}
        </p>
        <p className="text-sm">{m.swap_stays_line()}</p>
        {mutation.isError && !isStaleRaise(mutation.error) ? (
          <p role="alert" className="text-destructive text-sm">
            {refusalMessage(mutation.error)}
          </p>
        ) : null}
      </div>
    </ResponsiveFormSurface>
  );
}
