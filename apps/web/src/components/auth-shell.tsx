import { m } from '@church/i18n/messages';
import { CalendarClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { SanctuaryLightScene } from '@/components/auth-scenes/sanctuary-light-scene';
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
  return (
    <div className="grid min-h-dvh auth-split:grid-cols-[minmax(0,1fr)_28rem] auth-split:grid-rows-1 grid-rows-[minmax(12rem,1fr)_auto] auth-split:xl:grid-cols-[minmax(0,1fr)_32rem]">
      {/* Stacked, the scene takes whatever height the form leaves, so there is no dead space. */}
      <div className="auth-panel dark relative isolate flex auth-split:min-h-dvh flex-col justify-between gap-6 overflow-hidden border-sidebar-border auth-split:border-r border-b auth-split:border-b-0 bg-[oklch(0.17_0.03_258)] auth-split:p-14 p-5 text-sidebar-foreground sm:p-8">
        <SanctuaryLightScene />
        <BrandMark />
        <p className="relative max-w-xs text-pretty text-sidebar-foreground/75 text-sm leading-relaxed">
          {m.auth_panel_tagline()}
        </p>
      </div>
      <main className="flex flex-col auth-split:justify-center px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:items-center sm:px-8 sm:pt-12 sm:pb-[max(3rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm sm:max-w-md">
          <FormControlSizeProvider size="touch">
            {children}
          </FormControlSizeProvider>
        </div>
      </main>
    </div>
  );
}
