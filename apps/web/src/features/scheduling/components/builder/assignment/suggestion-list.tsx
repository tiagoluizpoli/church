import type { SuggestedVolunteer } from '../../../utils/builder/cycle-builder-candidate.types';
import { AssigneeRoleBadge } from './assignee-role-badge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SuggestedVolunteerStatus = SuggestedVolunteer['status'];

interface SuggestionStatusPresentation {
  label: string;
  className: string;
}

const MAX_VISIBLE_RECOMMENDATIONS = 5;

const AVAILABLE_STATUS: SuggestionStatusPresentation = {
  label: 'Available',
  className:
    'border border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
};

const PARTIAL_STATUS: SuggestionStatusPresentation = {
  label: 'Partial availability',
  className:
    'border border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
};

const NEEDS_RESPONSE_STATUS: SuggestionStatusPresentation = {
  label: 'Needs response',
  className:
    'border border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
};

const CONFLICT_STATUS: SuggestionStatusPresentation = {
  label: 'Override required',
  className: 'border border-destructive/35 bg-destructive/10 text-destructive',
};

function getSuggestionStatus(
  status: SuggestedVolunteerStatus,
): SuggestionStatusPresentation {
  if (status === 'available') {
    return AVAILABLE_STATUS;
  }

  if (status === 'partial') {
    return PARTIAL_STATUS;
  }

  if (status === 'needs_response') {
    return NEEDS_RESPONSE_STATUS;
  }

  return CONFLICT_STATUS;
}

interface SuggestionListProps {
  suggestions: SuggestedVolunteer[];
  onAssign: (suggestion: SuggestedVolunteer) => void;
  title?: string;
  highlightTop?: boolean;
  collapsible?: boolean;
  /**
   * The team the shift×role behind this list belongs to, if any. A suggestion
   * only badges as "Team Leader" when they lead this specific team (FR-013).
   */
  contextTeamId?: string;
}

export function SuggestionList({
  suggestions,
  onAssign,
  title,
  highlightTop = false,
  collapsible = false,
  contextTeamId,
}: SuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <span className="text-muted-foreground text-xs italic">
        No suggestions
      </span>
    );
  }

  const visibleSuggestions = suggestions.slice(0, MAX_VISIBLE_RECOMMENDATIONS);
  const additionalSuggestions = highlightTop
    ? suggestions.slice(MAX_VISIBLE_RECOMMENDATIONS)
    : [];

  const list = (items: SuggestedVolunteer[]) => (
    <ul className="space-y-1" data-testid="suggestion-list">
      {items.map((suggestion, index) => {
        const status = getSuggestionStatus(suggestion.status);
        return (
          <li key={suggestion.id}>
            <button
              type="button"
              data-testid="suggestion-option"
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60',
                highlightTop && index === 0 && 'bg-primary/5',
              )}
              onClick={() => onAssign(suggestion)}
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-medium">
                    {suggestion.name}
                  </span>
                  <AssigneeRoleBadge
                    membership={suggestion.membership}
                    contextTeamId={contextTeamId}
                    fullNameOnExpand={suggestion.name}
                  />
                </span>
                <span className="mt-0.5 text-muted-foreground text-xs">
                  Serving {suggestion.workloadCount} time
                  {suggestion.workloadCount === 1 ? '' : 's'} this cycle
                  {suggestion.alreadyServingAssignments?.[0]
                    ? ` · ${suggestion.alreadyServingAssignments[0].detail}`
                    : ''}
                </span>
              </span>
              <Badge
                className={cn('shrink-0', status.className)}
                data-testid={`suggestion-status-${suggestion.status}`}
              >
                {status.label}
              </Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (collapsible) {
    return (
      <details className="group border-t pt-1">
        <summary className="cursor-pointer list-none text-muted-foreground text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {title} ({suggestions.length})
        </summary>
        <div className="pt-2">{list(visibleSuggestions)}</div>
      </details>
    );
  }

  return (
    <div className="space-y-1">
      {title ? <p className="text-muted-foreground text-xs">{title}</p> : null}
      {list(visibleSuggestions)}
      {additionalSuggestions.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-muted-foreground text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            More candidates ({additionalSuggestions.length})
          </summary>
          <div className="pt-2">{list(additionalSuggestions)}</div>
        </details>
      ) : null}
    </div>
  );
}
