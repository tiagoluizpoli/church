import { m } from '@church/i18n/messages';
import { TriangleAlertIcon, UnlinkIcon } from 'lucide-react';
import {
  type ReactElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AvailabilityStatus } from '../../../hooks/use-volunteer-pool';
import type {
  PickerVolunteer,
  SuggestedVolunteer,
} from '../../../utils/builder/cycle-builder-candidate.types';
import { SuggestionList } from './suggestion-list';
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

interface SuggestionGroups {
  safe: SuggestedVolunteer[];
  needsResponse: SuggestedVolunteer[];
}

interface DeduplicateSuggestionGroupsInput {
  suggestions: SuggestionGroups;
}

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 0,
  partial: 1,
  unanswered: 1,
  // biome-ignore lint/style/useNamingConvention: API state uses snake_case
  not_asked: 2,
  unavailable: 3,
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 1,
};

const STATUS_STYLE: Record<AvailabilityStatus, string> = {
  available:
    'border border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  unanswered: 'border border-muted bg-muted text-muted-foreground',
  // biome-ignore lint/style/useNamingConvention: API state uses snake_case
  not_asked: 'border border-muted bg-muted text-muted-foreground',
  partial:
    'border border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  unavailable:
    'border border-destructive/35 bg-destructive/10 text-destructive',
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 'border border-muted bg-muted text-muted-foreground',
};

const statusLabels = (): Record<AvailabilityStatus, string> => ({
  available: m.builder_state_available(),
  partial: 'Partial availability',
  unanswered: m.builder_state_unanswered(),
  // biome-ignore lint/style/useNamingConvention: API state uses snake_case
  not_asked: m.builder_state_not_asked(),
  unavailable: m.builder_state_unavailable(),
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 'No response',
});

interface AssignmentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
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
  const labels = statusLabels();
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
        displayedSuggestions.needsResponse.length > 0),
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
          volunteer.isQualified !== false &&
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
      <PopoverTrigger render={trigger} />
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

        {filtered.length === 0 && !hasSelectableSuggestions && (
          <p className="px-1 py-2 text-muted-foreground text-xs">
            No volunteers match
          </p>
        )}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {[0, 1, 2, 3].map((rank) => {
            const matches = filtered.filter(
              (v) => STATUS_RANK[v.availabilityStatus] === rank,
            );
            const suggested =
              displayedSuggestions && onSelectSuggestion
                ? [
                    ...displayedSuggestions.safe,
                    ...displayedSuggestions.needsResponse,
                  ].filter((suggestion) => {
                    const candidate = volunteers.find(
                      (v) => v.id === suggestion.id,
                    );
                    return (
                      candidate &&
                      !candidate.conflictReason &&
                      candidate.isQualified !== false &&
                      STATUS_RANK[candidate.availabilityStatus] === rank &&
                      candidate.name
                        .toLowerCase()
                        .includes(search.trim().toLowerCase())
                    );
                  })
                : [];
            if (!matches.length && !suggested.length) return null;
            return (
              <div key={rank}>
                {suggested.length > 0 && onSelectSuggestion ? (
                  <SuggestionList
                    suggestions={suggested}
                    title={rank === 0 ? 'Recommended' : undefined}
                    highlightTop={rank === 0}
                    onAssign={(suggestion) => {
                      onSelectSuggestion(suggestion);
                      onOpenChange(false);
                    }}
                  />
                ) : null}
                <ul className="flex flex-col gap-1">
                  {matches.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        data-testid="picker-option"
                        disabled={Boolean(v.conflictReason)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-xs hover:bg-muted/60',
                          isTouch && 'min-h-11 px-3 text-sm',
                          v.conflictReason && 'opacity-50',
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
                          {v.conflictReason ? (
                            <span className="block text-muted-foreground">
                              {v.conflictReason}
                            </span>
                          ) : null}
                          {v.alreadyServingAssignments?.length ? (
                            v.alreadyServingAssignments.length === 1 ? (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-300">
                                <TriangleAlertIcon className="size-3 shrink-0" />
                                Serving{' '}
                                {v.alreadyServingAssignments[0]?.summary}
                              </span>
                            ) : (
                              <details className="mt-0.5 text-xs text-yellow-700 dark:text-yellow-300">
                                <summary className="flex cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                  <TriangleAlertIcon className="size-3 shrink-0" />
                                  Serving in{' '}
                                  {v.alreadyServingAssignments.length} other
                                  assignments
                                </summary>
                                <ul className="mt-1 flex flex-col gap-1 pl-4 text-muted-foreground">
                                  {v.alreadyServingAssignments.map(
                                    (assignment) => (
                                      <li key={assignment.detail}>
                                        {assignment.detail}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </details>
                            )
                          ) : v.alreadyAssignedCount > 0 ? (
                            <span className="mt-0.5 block text-muted-foreground text-xs">
                              Already assigned {v.alreadyAssignedCount} time
                              {v.alreadyAssignedCount === 1 ? '' : 's'} this
                              cycle
                            </span>
                          ) : null}
                        </span>
                        <Badge
                          className={cn(
                            'shrink-0',
                            STATUS_STYLE[v.availabilityStatus],
                          )}
                          data-testid={`picker-status-${v.id}`}
                        >
                          {labels[v.availabilityStatus]}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
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
  };
}
