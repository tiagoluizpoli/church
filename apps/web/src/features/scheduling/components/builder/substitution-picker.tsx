import { Badge } from '@church/ui/components/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { Input } from '@church/ui/components/input';
import { useMemo, useState } from 'react';
import type { PickerVolunteer } from './assignment-picker';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface SubstitutionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  declinedVolunteerName: string;
  declinedVolunteerId: string;
  volunteers: PickerVolunteer[];
  onSelect: (newVolunteerId: string) => void;
}

export function SubstitutionPicker({
  open,
  onOpenChange,
  declinedVolunteerName,
  declinedVolunteerId,
  volunteers,
  onSelect,
}: SubstitutionPickerProps) {
  const [search, setSearch] = useState('');

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return volunteers
      .filter(
        (v) =>
          v.id !== declinedVolunteerId &&
          v.availabilityStatus === 'available' &&
          (!q || v.name.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [volunteers, declinedVolunteerId, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Find replacement for {formatVolunteerName(declinedVolunteerName)}
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex items-center justify-between rounded border border-red-300 bg-red-50 px-2 py-1 text-xs"
          data-testid="declined-pinned"
        >
          <span>{formatVolunteerName(declinedVolunteerName)}</span>
          <Badge className="bg-red-600 text-white">
            Declined — find replacement
          </Badge>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search available volunteers…"
          className="h-7 text-xs"
        />

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {available.length === 0 && (
            <li className="px-1 py-2 text-muted-foreground text-xs">
              No available volunteers
            </li>
          )}
          {available.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-xs hover:bg-muted/60"
                onClick={() => {
                  onSelect(v.id);
                  onOpenChange(false);
                }}
              >
                <span>{formatVolunteerName(v.name)}</span>
                <Badge className="bg-green-700 text-white">available</Badge>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
