import { TriangleAlertIcon, UnlinkIcon } from 'lucide-react';
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AvailabilityStatus } from '../../hooks/use-volunteer-pool';
import { type SuggestedVolunteer, SuggestionList } from './suggestion-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AssigneeSystemRole } from '@/utils/format-assignee-role-label';

export interface PickerVolunteer {
  id: string;
  name: string;
  systemRole?: AssigneeSystemRole;
  availabilityStatus: AvailabilityStatus;
  alreadyAssignedCount: number;
  alreadyServingAssignments?: ServingAssignmentContext[];
}

export interface ServingAssignmentContext {
  summary: string;
  detail: string;
}

interface SuggestionGroups {
  safe: SuggestedVolunteer[];
  needsResponse: SuggestedVolunteer[];
  conflicts: SuggestedVolunteer[];
}

interface DeduplicateSuggestionGroupsInput {
  suggestions: SuggestionGroups;
}

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 0,
  partial: 1,
  unavailable: 2,
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 3,
};

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available:
    'border border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  partial:
    'border border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  unavailable:
    'border border-destructive/35 bg-destructive/10 text-destructive',
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 'border border-muted bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Available',
  partial: 'Partial availability',
  unavailable: 'Unavailable',
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 'No response',
};

interface AssignmentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  mode?: 'assign' | 'substitution';
  declinedVolunteerName?: string;
  volunteers: PickerVolunteer[];
  suggestions?: SuggestionGroups;
  hasAssignment?: boolean;
  onSelect: (volunteerId: string) => void;
  onSelectSuggestion?: (suggestion: SuggestedVolunteer) => void;
  onRemove?: () => void;
}

export function AssignmentPicker({
  open,
  onOpenChange,
  trigger,
  mode = 'assign',
  declinedVolunteerName,
  volunteers,
  suggestions,
  hasAssignment,
  onSelect,
  onSelectSuggestion,
  onRemove,
}: AssignmentPickerProps) {
  const isTouch = useFormControlSize() === 'touch';
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const displayedSuggestions = useMemo(
    () =>
      suggestions ? deduplicateSuggestionGroups({ suggestions }) : undefined,
    [suggestions],
  );
  const suggestedVolunteerIds = useMemo(
    () =>
      new Set(
        displayedSuggestions
          ? [
              ...displayedSuggestions.safe,
              ...displayedSuggestions.needsResponse,
              ...displayedSuggestions.conflicts,
            ].map((suggestion) => suggestion.id)
          : [],
      ),
    [displayedSuggestions],
  );
  const shouldExcludeSuggestedVolunteers = Boolean(
    displayedSuggestions && onSelectSuggestion,
  );
  const hasSelectableSuggestions = Boolean(
    onSelectSuggestion &&
      displayedSuggestions &&
      (displayedSuggestions.safe.length > 0 ||
        displayedSuggestions.needsResponse.length > 0 ||
        displayedSuggestions.conflicts.length > 0),
  );

  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      searchInputRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return volunteers
      .filter(
        (volunteer) =>
          (!shouldExcludeSuggestedVolunteers ||
            !suggestedVolunteerIds.has(volunteer.id)) &&
          (!q || volunteer.name.toLowerCase().includes(q)),
      )
      .sort(
        (a, b) =>
          STATUS_RANK[a.availabilityStatus] - STATUS_RANK[b.availabilityStatus],
      );
  }, [
    volunteers,
    search,
    shouldExcludeSuggestedVolunteers,
    suggestedVolunteerIds,
  ]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent
        className="w-80 max-w-[calc(100vw-2rem)] p-3"
        data-testid="assignment-picker"
        initialFocus={false}
      >
        {mode === 'substitution' && declinedVolunteerName && (
          <p className="mb-2 font-medium text-xs">
            Find replacement for {declinedVolunteerName}
          </p>
        )}

        <Input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search volunteers…"
          aria-label="Search volunteers"
          className={isTouch ? 'mb-3 text-sm' : 'mb-3 h-8 text-xs'}
        />

        {hasAssignment && onRemove && (
          <div className="mb-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size={isTouch ? 'touch' : 'sm'}
              className={
                isTouch
                  ? 'border-destructive/40 bg-destructive/5 text-destructive text-sm hover:bg-destructive/10'
                  : 'border-destructive/40 bg-destructive/5 text-destructive text-xs hover:bg-destructive/10'
              }
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              <UnlinkIcon className="size-3.5" />
              Unassign
            </Button>
          </div>
        )}

        {displayedSuggestions && onSelectSuggestion && (
          <div className="mb-3 space-y-2 border-b pb-3">
            {displayedSuggestions.safe.length > 0 ? (
              <SuggestionList
                suggestions={displayedSuggestions.safe}
                title="Recommended"
                highlightTop
                onAssign={(suggestion) => {
                  onSelectSuggestion(suggestion);
                  onOpenChange(false);
                }}
              />
            ) : null}
            {displayedSuggestions.needsResponse.length > 0 ? (
              <SuggestionList
                suggestions={displayedSuggestions.needsResponse}
                title="Needs response"
                collapsible
                onAssign={(suggestion) => {
                  onSelectSuggestion(suggestion);
                  onOpenChange(false);
                }}
              />
            ) : null}
            {displayedSuggestions.conflicts.length > 0 ? (
              <SuggestionList
                suggestions={displayedSuggestions.conflicts}
                title="Conflict options — override required"
                collapsible
                onAssign={(suggestion) => {
                  onSelectSuggestion(suggestion);
                  onOpenChange(false);
                }}
              />
            ) : null}
          </div>
        )}

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 && !hasSelectableSuggestions && (
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
                  'flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-xs hover:bg-muted/60',
                  isTouch && 'min-h-11 px-3 text-sm',
                )}
                onClick={() => {
                  onSelect(v.id);
                  onOpenChange(false);
                }}
              >
                <span className="min-w-0">
                  <span
                    className="block truncate font-medium"
                    data-testid="picker-option-name"
                  >
                    {v.name}
                  </span>
                  {v.alreadyServingAssignments?.length ? (
                    v.alreadyServingAssignments.length === 1 ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-yellow-700 dark:text-yellow-300">
                        <TriangleAlertIcon className="size-3 shrink-0" />
                        Serving {v.alreadyServingAssignments[0]?.summary}
                      </span>
                    ) : (
                      <details className="mt-0.5 text-[11px] text-yellow-700 dark:text-yellow-300">
                        <summary className="flex cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                          <TriangleAlertIcon className="size-3 shrink-0" />
                          Serving in {v.alreadyServingAssignments.length} other
                          assignments
                        </summary>
                        <ul className="mt-1 space-y-1 pl-4 text-muted-foreground">
                          {v.alreadyServingAssignments.map((assignment) => (
                            <li key={assignment.detail}>{assignment.detail}</li>
                          ))}
                        </ul>
                      </details>
                    )
                  ) : v.alreadyAssignedCount > 0 ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Already assigned {v.alreadyAssignedCount} time
                      {v.alreadyAssignedCount === 1 ? '' : 's'} this cycle
                    </span>
                  ) : null}
                </span>
                <Badge
                  className={cn('shrink-0', STATUS_STYLE[v.availabilityStatus])}
                  data-testid={`picker-status-${v.id}`}
                >
                  {STATUS_LABEL[v.availabilityStatus]}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function deduplicateSuggestionGroups({
  suggestions,
}: DeduplicateSuggestionGroupsInput): SuggestionGroups {
  const seenVolunteerIds = new Set<string>();
  const deduplicate = (candidates: SuggestedVolunteer[]) =>
    candidates.filter((candidate) => {
      if (seenVolunteerIds.has(candidate.id)) return false;
      seenVolunteerIds.add(candidate.id);
      return true;
    });

  return {
    safe: deduplicate(suggestions.safe),
    needsResponse: deduplicate(suggestions.needsResponse),
    conflicts: deduplicate(suggestions.conflicts),
  };
}
