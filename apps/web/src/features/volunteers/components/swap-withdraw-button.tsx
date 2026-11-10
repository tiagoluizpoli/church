import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { volunteerApi } from '@/utils/api-instances';

export interface SwapWithdrawButtonProps {
  assignmentId: string;
}

/** Withdraw behind one confirm. A 409 means the leader already acted: refetch and show the current state. */
export function SwapWithdrawButton({ assignmentId }: SwapWithdrawButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => volunteerApi.withdrawSwapRequest(assignmentId),
    onSettled: (_data, error) => {
      if (!error || (isAxiosError(error) && error.response?.status === 409)) {
        setOpen(false);
      }
      return queryClient.invalidateQueries({
        queryKey: ['assignment-detail', assignmentId],
      });
    },
  });
  const failed =
    mutation.isError &&
    !(isAxiosError(mutation.error) && mutation.error.response?.status === 409);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="touch">
            {m.swap_withdraw()}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.swap_withdraw_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.swap_withdraw_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <p role="alert" className="text-destructive text-sm">
            {m.swap_withdraw_error()}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {m.swap_withdraw_keep()}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              // Stay open until the request settles.
              event.preventDefault();
              mutation.mutate();
            }}
          >
            {m.swap_withdraw_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
