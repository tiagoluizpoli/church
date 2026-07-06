import { Link } from '@tanstack/react-router';
import {
  CalendarClock,
  Clock,
  Home,
  LayoutDashboard,
  Search,
} from 'lucide-react';
import * as React from 'react';
import { MobileDrawer } from './mobile-drawer';
import { useCallerRoles } from '@/shared/hooks/use-caller-roles';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_COMMANDS: CommandItem[] = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Availability', to: '/availability', icon: Clock },
];

const SCHEDULING_COMMAND: CommandItem = {
  label: 'Scheduling',
  to: '/scheduling',
  icon: CalendarClock,
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [isMobile, setIsMobile] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { canSeeScheduling } = useCallerRoles();
  const commands: CommandItem[] = canSeeScheduling
    ? [...BASE_COMMANDS, SCHEDULING_COMMAND]
    : BASE_COMMANDS;

  // Check viewport responsiveness
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    setIsMobile(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // Handle global escape key to close command palette
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setQuery('');
      // Use setTimeout to ensure dialog is rendered/mounted in DOM
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const content = (
    <div className="flex h-full flex-col bg-card text-foreground">
      {/* Search Input Header */}
      <div className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Type a command or search..."
          className="w-full border-0 bg-transparent text-base placeholder-muted-foreground outline-hidden focus:ring-0"
        />
      </div>

      {/* Commands List */}
      <div className="max-h-[300px] flex-1 space-y-1 overflow-y-auto p-2 md:max-h-[400px]">
        {filteredCommands.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No results found.
          </div>
        ) : (
          filteredCommands.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <Link
                key={cmd.to}
                to={cmd.to}
                onClick={handleClose}
                className="group flex items-center gap-3 rounded-sm px-3 py-2.5 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                <div className="flex flex-col text-left align-start">
                  <span className="font-medium">{cmd.label}</span>
                  <span className="font-normal text-muted-foreground text-xs">
                    Go to {cmd.label}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileDrawer open={open} onOpenChange={onOpenChange}>
        <div data-testid="command-palette" className="h-full">
          {content}
        </div>
      </MobileDrawer>
    );
  }

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
        aria-label="Close search"
      />

      {/* Centered Modal Dialog */}
      <div className="fade-in zoom-in-95 relative flex w-full max-w-lg animate-in flex-col overflow-hidden rounded-sm border border-border bg-card shadow-xl duration-150">
        {content}
      </div>
    </div>
  );
}
