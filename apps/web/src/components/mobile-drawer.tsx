import { X } from 'lucide-react';
import type * as React from 'react';
import { Drawer } from 'vaul';

export interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function MobileDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: MobileDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          data-testid="mobile-drawer-content"
          className="radius-sheet-top fixed right-0 bottom-0 left-0 z-50 flex h-(80%) flex-col border-border border-t bg-card outline-hidden"
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">
            {description}
          </Drawer.Description>
          {/* Grab Handle */}
          <div className="radius-pill mx-auto my-4 h-1.5 w-12 shrink-0 bg-muted" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="radius-icon absolute top-2 right-2 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 overflow-auto p-4 pb-8">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
