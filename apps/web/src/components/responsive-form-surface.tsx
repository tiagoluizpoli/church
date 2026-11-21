import { m } from '@church/i18n/messages';
import { X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
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
  // A review opens on its title, not with a focus ring on its first control.
  const titleRef = useRef<HTMLHeadingElement>(null);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          initialFocus={reviewSummary ? titleRef : undefined}
          closeDisabled={closeDisabled}
          className={
            reviewSummary
              ? wide
                ? // Top-anchored with a lane below for toasts (bottom-right).
                  'top-6 flex h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] translate-y-0 flex-col gap-0 p-0 sm:max-w-[min(96vw,1600px)]'
                : 'flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-4xl'
              : undefined
          }
        >
          <DialogHeader
            className={
              reviewSummary ? 'shrink-0 px-6 pt-5 pr-14 pb-0' : undefined
            }
          >
            {/* A review shares one line between title and description. */}
            <div
              className={
                reviewSummary
                  ? 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5'
                  : 'contents'
              }
            >
              <DialogTitle
                ref={titleRef}
                tabIndex={reviewSummary ? -1 : undefined}
                className={
                  reviewSummary
                    ? 'font-semibold text-base outline-none'
                    : undefined
                }
              >
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription
                  className={reviewSummary ? 'text-sm' : undefined}
                >
                  {description}
                </DialogDescription>
              ) : null}
            </div>
            {reviewSummary}
          </DialogHeader>
          {reviewSummary ? (
            <section
              data-testid="proposal-scroll-body"
              aria-label={reviewBodyLabel}
              // Not a tab stop of its own: its controls scroll it into view.
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
      <DrawerContent
        className={
          reviewSummary
            ? // Stops below the toast band (top: 80px), so toasts never cover it.
              'data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-9.5rem)]'
            : undefined
        }
      >
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
              ? 'pb-0 text-left group-data-[swipe-axis=y]/drawer-popup:text-left'
              : 'text-left'
          }
        >
          <DrawerTitle
            className={
              reviewSummary ? 'pr-12 font-semibold text-base' : undefined
            }
          >
            {title}
          </DrawerTitle>
          {description ? (
            <DrawerDescription
              className={reviewSummary ? 'sr-only' : undefined}
            >
              {description}
            </DrawerDescription>
          ) : null}
          {reviewSummary}
        </DrawerHeader>
        <FormControlSizeProvider size="touch">
          {reviewSummary ? (
            <section
              data-testid="proposal-scroll-body"
              aria-label={reviewBodyLabel}
              // Not a tab stop of its own: its controls scroll it into view.
              className="min-h-0 overflow-y-auto border-t px-4 pb-4"
            >
              {children}
            </section>
          ) : (
            <div className="overflow-auto px-4 pb-4">{children}</div>
          )}
          {footer ? (
            <DrawerFooter
              className={
                reviewSummary ? 'flex-row flex-wrap py-3 pb-4' : undefined
              }
            >
              {footer}
            </DrawerFooter>
          ) : null}
        </FormControlSizeProvider>
      </DrawerContent>
    </Drawer>
  );
}
