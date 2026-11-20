import { m } from '@church/i18n/messages';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { useMediaQuery } from '@/hooks/use-media-query';

export interface ResponsiveFormSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Save/Cancel-style buttons. Rendered by the surface itself, outside the
   * mobile scroll region, so the primary action stays in thumb reach. */
  footer?: ReactNode;
  /** Optional bounded review layout with a fixed summary and actions. */
  reviewSummary?: ReactNode;
  reviewBodyLabel?: string;
  wide?: boolean;
  closeDisabled?: boolean;
  children: ReactNode;
}

/** Desktop-`Dialog`/mobile-`Drawer` shell swap, per shadcn's own
 * `drawer-dialog` example (research.md R1) — `md:` breakpoint mirrors the
 * project's existing convention. Owns footer placement and mobile control
 * sizing so consumers don't each have to re-adapt for the `Drawer` branch. */
export function ResponsiveFormSurface({
  open,
  onOpenChange,
  title,
  description,
  footer,
  reviewSummary,
  reviewBodyLabel,
  wide = false,
  closeDisabled = false,
  children,
}: ResponsiveFormSurfaceProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          closeDisabled={closeDisabled}
          className={
            reviewSummary
              ? wide
                ? 'flex h-[90dvh] max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-[min(96vw,1600px)]'
                : 'flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-4xl'
              : undefined
          }
        >
          <DialogHeader
            className={
              reviewSummary ? 'shrink-0 px-6 pt-5 pr-14 pb-0' : undefined
            }
          >
            <DialogTitle
              className={reviewSummary ? 'font-semibold text-base' : undefined}
            >
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
            {reviewSummary}
          </DialogHeader>
          {reviewSummary ? (
            <section
              data-testid="proposal-scroll-body"
              aria-label={reviewBodyLabel}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll region must be keyboard scrollable.
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto border-y px-6 pb-4"
            >
              {children}
            </section>
          ) : (
            children
          )}
          {footer ? (
            <DialogFooter
              className={reviewSummary ? 'shrink-0 px-6 py-4' : undefined}
            >
              {footer}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerClose
          disabled={closeDisabled}
          aria-label={m.shell_close()}
          className="radius-icon absolute top-2 right-2 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-5 w-5" />
        </DrawerClose>
        <DrawerHeader
          className={
            reviewSummary
              ? 'pr-14 text-left group-data-[swipe-axis=y]/drawer-popup:text-left'
              : 'text-left'
          }
        >
          <DrawerTitle
            className={reviewSummary ? 'font-semibold text-base' : undefined}
          >
            {title}
          </DrawerTitle>
          {description ? (
            <DrawerDescription>{description}</DrawerDescription>
          ) : null}
          {reviewSummary}
        </DrawerHeader>
        <FormControlSizeProvider size="touch">
          {reviewSummary ? (
            <section
              data-testid="proposal-scroll-body"
              aria-label={reviewBodyLabel}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll region must be keyboard scrollable.
              tabIndex={0}
              className="min-h-0 overflow-y-auto border-t px-4 pb-4"
            >
              {children}
            </section>
          ) : (
            <div className="overflow-auto px-4 pb-4">{children}</div>
          )}
          {footer ? <DrawerFooter>{footer}</DrawerFooter> : null}
        </FormControlSizeProvider>
      </DrawerContent>
    </Drawer>
  );
}
