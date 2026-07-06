import type * as React from 'react';
import { Drawer } from 'vaul';

export interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function MobileDrawer({
  open,
  onOpenChange,
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
          {/* Grab Handle */}
          <div className="radius-pill mx-auto my-4 h-1.5 w-12 flex-shrink-0 bg-muted" />
          <div className="flex-1 overflow-auto p-4 pb-8">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
