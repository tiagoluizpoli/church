import { m } from '@church/i18n/messages';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'ministry-setup-guide-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // private browsing — ignore
  }
}

interface MinistrySetupGuideProps {
  /** Renders nothing when true; parent controls visibility via this prop + onDismiss */
  open: boolean;
  onDismiss: () => void;
}

export function MinistrySetupGuide({
  open,
  onDismiss,
}: MinistrySetupGuideProps) {
  if (!open) return null;

  return (
    <div className="surface-panel flex gap-4 p-4 text-sm">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{m.ministry_setup_guide_title()}</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>{m.ministry_setup_guide_step_sectors()}</li>
          <li>{m.ministry_setup_guide_step_roles()}</li>
          <li>{m.ministry_setup_guide_step_usual_setup()}</li>
        </ol>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-0.5 min-h-11 min-w-11 shrink-0 text-muted-foreground"
        aria-label={m.ministry_setup_guide_dismiss()}
        onClick={onDismiss}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}

/** Returns [open, open setter, dismiss handler] — read once from localStorage on mount. */
export function useMinistrySetupGuide(): [
  boolean,
  (open: boolean) => void,
  () => void,
] {
  const [open, setOpen] = useState(() => !readDismissed());

  function dismiss() {
    writeDismissed();
    setOpen(false);
  }

  return [open, setOpen, dismiss];
}
