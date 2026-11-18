import { m } from '@church/i18n/messages';
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
          <AlertDialogTitle>{m.church_switch_sync_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingSwitch
              ? m.church_switch_sync_body({
                  churchName: pendingSwitch.churchName,
                })
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            data-testid="active-church-tab-sync-continue"
            onClick={continueSwitch}
          >
            {m.church_switch_sync_continue()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
