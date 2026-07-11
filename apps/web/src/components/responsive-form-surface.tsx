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
  children,
}: ResponsiveFormSurfaceProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {children}
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerClose
          aria-label="Close"
          className="radius-icon absolute top-2 right-2 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-5 w-5" />
        </DrawerClose>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description ? (
            <DrawerDescription>{description}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <FormControlSizeProvider size="touch">
          <div className="overflow-auto px-4 pb-4">{children}</div>
          {footer ? <DrawerFooter>{footer}</DrawerFooter> : null}
        </FormControlSizeProvider>
      </DrawerContent>
    </Drawer>
  );
}
