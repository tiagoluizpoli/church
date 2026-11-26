import { m } from '@church/i18n/messages';
import { CalendarClock } from 'lucide-react';
import { type ReactNode, useLayoutEffect } from 'react';
import { SanctuaryLightBackdrop } from '@/components/auth-scenes/sanctuary-light-backdrop';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';

function BrandMark() {
  return (
    <div className="relative flex items-center gap-3">
      <div className="radius-icon flex size-10 items-center justify-center bg-primary text-primary-foreground shadow-sm">
        <CalendarClock aria-hidden="true" className="size-5" />
      </div>
      <p className="font-semibold text-[1.05rem] text-foreground tracking-tight">
        {m.select_church_app_name()}
      </p>
    </div>
  );
}

/**
 * The signed-out frame: the sanctuary light scene in a dark brand panel beside
 * a narrow form column on wide landscape screens; otherwise the scene above
 * the form, filling the height the form leaves.
 * Controls are touch-sized.
 */
export interface AuthShellProps {
  children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  // Same commit that paints this frame, so the hand-over from index.html's boot shell never shows a gap.
  useLayoutEffect(() => {
    document.getElementById('boot-shell')?.remove();
  }, []);

  return (
    // Its geometry is in first-paint.css, which index.html's boot shell shares.
    <div className="auth-shell">
      {/* Stacked, the scene takes whatever height the form leaves, so there is no dead space. */}
      <div className="auth-shell-panel auth-panel dark isolate flex flex-col justify-between gap-6 text-sidebar-foreground">
        <SanctuaryLightBackdrop />
        <BrandMark />
        <p className="relative max-w-xs text-pretty text-sidebar-foreground/75 text-sm leading-relaxed">
          {m.auth_panel_tagline()}
        </p>
      </div>
      <main className="auth-shell-form">
        <div className="auth-shell-form-body">
          <FormControlSizeProvider size="touch">
            {children}
          </FormControlSizeProvider>
        </div>
      </main>
    </div>
  );
}
