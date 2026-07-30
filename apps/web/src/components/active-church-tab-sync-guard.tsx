import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useActiveChurchTabSync } from '@/shared/hooks/use-active-church-tab-sync';

// Non-dismissible on purpose: Active Church changed in another tab, so this
// tab must not keep operating under the former Church. `onOpenChange` is a
// no-op so outside clicks and Escape cannot close it — Continue is the only
// exit.
export function ActiveChurchTabSyncGuard() {
  const { pendingSwitch, continueSwitch } = useActiveChurchTabSync();

  return (
    <AlertDialog open={pendingSwitch !== null} onOpenChange={() => {}}>
      <AlertDialogContent data-testid="active-church-tab-sync-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Active Church changed</AlertDialogTitle>
          <AlertDialogDescription>
            Another tab switched the Active Church to{' '}
            <strong>{pendingSwitch?.churchName}</strong>. This tab paused to
            avoid acting on stale data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            data-testid="active-church-tab-sync-continue"
            onClick={continueSwitch}
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
