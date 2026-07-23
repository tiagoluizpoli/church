import { useDraggable } from '@dnd-kit/core';
import { ClockIcon, GripVerticalIcon, StarIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type {
  AvailabilityStatus,
  VolunteerPoolItem,
} from '../../hooks/use-volunteer-pool';
import { AssigneeIdentityBadge } from './assignee-identity-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatAssigneeRoleLabel } from '@/utils/format-assignee-role-label';
import { formatLastServed } from '@/utils/format-last-served';
import { formatVolunteerInitials } from '@/utils/format-volunteer-initials';
import { formatVolunteerName } from '@/utils/format-volunteer-name';

interface StatusPresentation {
  label: string;
  tone: string;
}

/**
 * Tones follow the builder's existing status vocabulary (see
 * `suggestion-list.tsx` / `assignment-picker.tsx`): green reads "go", yellow
 * "we don't know yet", destructive "you'd be overriding something". Status is
 * plain text rather than a `Badge` — it sits flush on the card's top padding,
 * and a badge's own box would break that corner.
 */
const STATUS_PRESENTATION: Record<AvailabilityStatus, StatusPresentation> = {
  available: { label: 'Available', tone: 'text-green-700 dark:text-green-400' },
  partial: {
    label: 'Partial',
    tone: 'text-yellow-700 dark:text-yellow-300',
  },
  unavailable: { label: 'Unavailable', tone: 'text-destructive' },
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: {
    label: 'Needs response',
    tone: 'text-yellow-700 dark:text-yellow-300',
  },
};

interface UseIsTruncatedResult {
  /** Attach to the element whose text may clip. */
  measureRef: (element: HTMLElement | null) => void;
  truncated: boolean;
}

/**
 * True only when the element's text is actually clipped — measured, not
 * guessed, so the roles tooltip appears for someone whose roles overflow and
 * stays out of the way for everyone whose roles already fit.
 *
 * The measurement lives on a callback ref rather than an effect because
 * flipping `truncated` remounts the line inside a `TooltipTrigger`. An effect
 * with empty deps would keep observing the detached node and the tooltip could
 * never retract; a callback ref re-attaches to whichever node is live.
 */
function useIsTruncated(): UseIsTruncatedResult {
  const [truncated, setTruncated] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((element: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    const check = () => setTruncated(element.scrollWidth > element.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  return { measureRef, truncated };
}

interface RolesLineProps {
  roleNames: string[];
}

/**
 * Roles the volunteer is qualified for. The card body is inert — not clickable,
 * not draggable — so hovering a clipped line is how a leader reads the full set
 * without leaving the page.
 */
function RolesLine({ roleNames }: RolesLineProps) {
  const { measureRef, truncated } = useIsTruncated();
  const label = roleNames.join(' · ');
  const line = (
    <p
      ref={measureRef}
      className="truncate text-[11px] text-muted-foreground"
      data-testid="volunteer-qualified-roles"
    >
      {label}
    </p>
  );
  if (!truncated) return line;
  return (
    <Tooltip>
      <TooltipTrigger render={line} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface WorkloadLineProps {
  workloadCount: number;
}

/** "N this cycle" — cycle-wide, not per-event; the tooltip says so explicitly. */
function WorkloadLine({ workloadCount }: WorkloadLineProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="truncate">{workloadCount} this cycle</span>}
      />
      <TooltipContent>
        {workloadCount === 1
          ? 'Already serving 1 slot in this cycle'
          : `Already serving ${workloadCount} slots in this cycle`}
      </TooltipContent>
    </Tooltip>
  );
}

interface VolunteerCardProps {
  volunteer: VolunteerPoolItem;
  dragId?: string;
  isSelected?: boolean;
  isIdeal?: boolean;
  isOverlay?: boolean;
  onSelect?: (volunteerId: string) => void;
}

export function VolunteerCard({
  volunteer,
  dragId,
  isSelected = false,
  isIdeal = false,
  isOverlay = false,
  onSelect,
}: VolunteerCardProps) {
  const isTouch = useFormControlSize() === 'touch';
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: dragId ?? `volunteer-${volunteer.volunteerId}`,
    data: {
      volunteerId: volunteer.volunteerId,
      volunteerName: volunteer.volunteerName,
      systemRole: volunteer.systemRole,
      status: volunteer.status,
      workloadCount: volunteer.workloadCount,
      conflictReason: volunteer.conflictReason,
    },
    disabled: isOverlay,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const roleLabel = formatAssigneeRoleLabel(volunteer.systemRole);
  const status = STATUS_PRESENTATION[volunteer.status];
  const statusLine = (
    <span className={cn('shrink-0 text-[11px]', status.tone)}>
      {status.label}
    </span>
  );

  return (
    <div
      // The card is the drag *node* so dnd-kit measures the whole card, but the
      // grip below is the sole activator — the body stays inert.
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={cn(
        // No root font-size: every line here sets its own, and a `text-xs`
        // here would also clamp the inherited line-height, tightening the
        // three text rows below what the approved layout uses.
        'flex items-stretch gap-3 rounded-lg border bg-card p-3',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary',
        isDragging && 'opacity-50',
        isOverlay && 'shadow-lg',
      )}
      data-testid="volunteer-card"
    >
      {/* Avatar top-left, grip bottom-left — the grip fills the dead space under
          the avatar instead of pushing every column to the right. */}
      <div className="flex shrink-0 flex-col items-start justify-between gap-2">
        {/* 40px at every size: the initials are the only thing identifying a
            person at a glance, and the rail's audience skews older. */}
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/12 font-semibold text-[11px] text-primary">
            {formatVolunteerInitials({
              volunteerName: volunteer.volunteerName,
            })}
          </AvatarFallback>
        </Avatar>
        {/* The grip is the ONLY drag affordance. Its aria-label carries the full
            name plus role so two people who truncate identically stay
            distinguishable (FR-013). The negative margin cancels the button's
            own box so the icon — not the hit area — sits on the card's 12px
            padding corner, matching the other three. */}
        {isOverlay ? null : (
          <Button
            type="button"
            variant="ghost"
            size={isTouch ? 'icon-touch' : 'icon-sm'}
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            aria-label={
              roleLabel
                ? `${volunteer.volunteerName}, ${roleLabel}`
                : formatVolunteerName(volunteer.volunteerName)
            }
            data-testid="volunteer-card-grip"
            className={cn(
              'cursor-grab text-muted-foreground active:cursor-grabbing',
              isTouch ? '-m-3.5' : '-m-1.5',
            )}
          >
            <GripVerticalIcon className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-sm">
            {formatVolunteerName(volunteer.volunteerName)}
          </span>
          {isIdeal ? (
            <Badge
              variant="secondary"
              className="rounded-full bg-primary/15 px-2 text-[10px] text-primary"
              data-testid="volunteer-ideal-badge"
            >
              <StarIcon /> Ideal
            </Badge>
          ) : null}
          <AssigneeIdentityBadge
            roleLabel={roleLabel}
            fullNameOnExpand={volunteer.volunteerName}
          />
        </div>

        {volunteer.qualifiedRoleNames?.length ? (
          <RolesLine roleNames={volunteer.qualifiedRoleNames} />
        ) : null}

        {/* Two separate facts, never side by side: the clock pins to the first
            line and `mt-auto` bottom-anchors the block so it lines up with the
            grip and the Select-slot button. */}
        <span className="mt-auto flex items-start gap-1.5 pt-1.5 text-[11px] text-muted-foreground">
          <ClockIcon className="mt-0.5 size-3 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">
              {formatLastServed({ lastServedAt: volunteer.lastServedAt })}
            </span>
            <WorkloadLine workloadCount={volunteer.workloadCount} />
          </span>
        </span>
      </div>

      {/* Status top, action bottom — the column spans the card height, so the
          button lands on the last content line instead of adding a row. */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {/* Flush to the card's top padding, matching its side padding — the
            11px status and 14px name carry near-identical half-leading, so
            flush already reads as aligned. No nudge. */}
        {volunteer.conflictReason ? (
          <Tooltip>
            <TooltipTrigger render={statusLine} />
            <TooltipContent>{volunteer.conflictReason}</TooltipContent>
          </Tooltip>
        ) : (
          statusLine
        )}
        {onSelect ? (
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant={isSelected ? 'secondary' : 'ghost'}
            aria-pressed={isSelected}
            /* The negative inline-end margin cancels the button's own inline
               padding so its *label* shares the status's right edge, and -mb-1
               cancels the leftover box space below the label so it sits on the
               last text line rather than above it. Both track the size variant:
               `touch` pads px-3, `sm` pads px-2. */
            className={cn(
              '-mb-1 shrink-0',
              isTouch ? '-mr-3 text-sm' : '-mr-2 h-6 px-2 text-[11px]',
            )}
            onClick={() => onSelect(volunteer.volunteerId)}
          >
            {isSelected ? 'Selected' : 'Select slot'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
