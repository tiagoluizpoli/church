import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import { Input } from '@church/ui/components/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@church/ui/components/popover';
import { cn } from '@church/ui/lib/utils';
import { type ReactNode, useMemo, useState } from 'react';
import type { AvailabilityStatus } from '../../hooks/use-volunteer-pool';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

export interface PickerVolunteer {
  id: string;
  name: string;
  availabilityStatus: AvailabilityStatus;
  alreadyAssignedCount: number;
}

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 0,
  partial: 1,
  unavailable: 2,
  no_response: 3,
};

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available: 'bg-green-700 text-white',
  partial: 'bg-yellow-500 text-black',
  unavailable: 'bg-red-600 text-white',
  no_response: 'bg-gray-600 text-white',
};

interface AssignmentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  mode?: 'assign' | 'substitution';
  declinedVolunteerName?: string;
  volunteers: PickerVolunteer[];
  hasAssignment?: boolean;
  onSelect: (volunteerId: string) => void;
  onRemove?: () => void;
}

export function AssignmentPicker({
  open,
  onOpenChange,
  trigger,
  mode = 'assign',
  declinedVolunteerName,
  volunteers,
  hasAssignment,
  onSelect,
  onRemove,
}: AssignmentPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return volunteers
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          STATUS_RANK[a.availabilityStatus] - STATUS_RANK[b.availabilityStatus],
      );
  }, [volunteers, search]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent className="w-64 p-2" data-testid="assignment-picker">
        {mode === 'substitution' && declinedVolunteerName && (
          <p className="mb-2 font-medium text-xs">
            Find replacement for {formatVolunteerName(declinedVolunteerName)}
          </p>
        )}

        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search volunteers…"
          className="mb-2 h-7 text-xs"
        />

        {hasAssignment && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-1 w-full justify-start text-destructive text-xs"
            onClick={() => {
              onRemove();
              onOpenChange(false);
            }}
          >
            Remove
          </Button>
        )}

        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-1 py-2 text-muted-foreground text-xs">
              No volunteers match
            </li>
          )}
          {filtered.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                data-testid="picker-option"
                className={cn(
                  'flex w-full items-center justify-between gap-1 rounded px-1 py-1 text-left text-xs hover:bg-muted/60',
                )}
                onClick={() => {
                  onSelect(v.id);
                  onOpenChange(false);
                }}
              >
                <span className="truncate">{formatVolunteerName(v.name)}</span>
                <span className="flex items-center gap-1">
                  {v.alreadyAssignedCount > 0 && (
                    <Badge className="bg-muted text-muted-foreground">
                      Already assigned ({v.alreadyAssignedCount})
                    </Badge>
                  )}
                  <Badge className={STATUS_STYLE[v.availabilityStatus]}>
                    {v.availabilityStatus}
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
