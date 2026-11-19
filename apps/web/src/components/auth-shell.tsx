import { m } from '@church/i18n/messages';
import { CalendarClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { SanctuaryLightScene } from '@/components/auth-scenes/sanctuary-light-scene';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { cn } from '@/lib/utils';

function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center gap-3', className)}>
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
 * The signed-out frame: the sanctuary light scene in a dark brand panel (a
 * band above the form on phones) beside a narrow form column. Controls are
 * touch-sized.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_28rem] xl:grid-cols-[minmax(0,1fr)_32rem]">
      <div className="auth-panel dark relative isolate flex h-44 flex-col justify-between overflow-hidden border-sidebar-border border-b bg-[oklch(0.17_0.03_258)] p-6 text-sidebar-foreground md:h-auto md:min-h-dvh md:border-r md:border-b-0 md:p-10 lg:p-14">
        <SanctuaryLightScene />
        <BrandMark />
        <p className="relative hidden max-w-xs text-pretty text-sidebar-foreground/75 text-sm leading-relaxed md:block">
          {m.auth_panel_tagline()}
        </p>
      </div>
      <main className="flex flex-col px-4 py-8 sm:px-8 md:items-center md:justify-center md:py-12">
        <div className="w-full max-w-sm">
          <FormControlSizeProvider size="touch">
            {children}
          </FormControlSizeProvider>
        </div>
      </main>
    </div>
  );
}
