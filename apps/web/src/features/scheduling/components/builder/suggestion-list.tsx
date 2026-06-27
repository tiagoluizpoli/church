import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import { cn } from '@church/ui/lib/utils';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

export interface SuggestedVolunteer {
  id: string;
  name: string;
  status: 'available' | 'partial';
  workloadCount: number;
}

interface SuggestionListProps {
  suggestions: SuggestedVolunteer[];
  onAssign: (volunteerId: string) => void;
}

export function SuggestionList({ suggestions, onAssign }: SuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <span className="text-muted-foreground text-xs italic">
        No suggestions
      </span>
    );
  }

  return (
    <ul className="space-y-1" data-testid="suggestion-list">
      {suggestions.slice(0, 3).map((s) => (
        <li
          key={s.id}
          className={cn(
            'flex items-center justify-between gap-1 text-xs',
            s.status === 'partial' && 'italic opacity-60',
          )}
        >
          <span className="flex items-center gap-1 truncate">
            {formatVolunteerName(s.name)}
            <Badge
              className={
                s.status === 'available'
                  ? 'bg-green-700 text-white'
                  : 'bg-yellow-500 text-black'
              }
            >
              {s.workloadCount}
            </Badge>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1 text-xs"
            onClick={() => onAssign(s.id)}
          >
            Accept
          </Button>
        </li>
      ))}
    </ul>
  );
}
