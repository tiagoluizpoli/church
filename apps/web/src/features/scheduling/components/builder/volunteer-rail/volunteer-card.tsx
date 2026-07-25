import { useDraggable } from '@dnd-kit/core';
import { ClockIcon, StarIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type {
  AvailabilityStatus,
  VolunteerPoolItem,
} from '../../../hooks/use-volunteer-pool';
import type { AssignableFitTier } from '../../../utils/builder/cycle-builder-fit.utils';
import { AssigneeIdentityBadge } from '../assignment/assignee-identity-badge';
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

interface SquareGripIconProps {
  className?: string;
}

/**
 * A 2×2 dot grip — squarer than lucide's 2×3 `GripVertical`, matching the
 * compact square avatar/grip stack the leader reads down the card's left edge.
 */
function SquareGripIcon({ className }: SquareGripIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="5.5" cy="5.5" r="1.5" />
      <circle cx="10.5" cy="5.5" r="1.5" />
      <circle cx="5.5" cy="10.5" r="1.5" />
      <circle cx="10.5" cy="10.5" r="1.5" />
    </svg>
  );
}

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
  if (!truncated) {
    return (
      <p
        ref={measureRef}
        className="truncate text-muted-foreground text-xs"
        data-testid="volunteer-qualified-roles"
      >
        {label}
      </p>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // base-ui's TooltipTrigger defaults to a <button> and only injects
          // its focus/hover handlers onto whatever `render` target it is
          // given — a non-interactive <p> never becomes keyboard-reachable,
          // so the tooltip content it opens is unreachable without a pointer.
          <button
            type="button"
            ref={measureRef}
            className="truncate text-left text-muted-foreground text-xs"
            data-testid="volunteer-qualified-roles"
          >
            {label}
          </button>
        }
      />
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
        // A <span> render target is never keyboard-focusable (see RolesLine);
        // a <button> is, for free.
        render={
          <button type="button" className="truncate text-left">
            {workloadCount} this cycle
          </button>
        }
      />
      <TooltipContent>
        {workloadCount === 1
          ? 'Already serving 1 slot in this cycle'
          : `Already serving ${workloadCount} slots in this cycle`}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * What a non-`ready` pick will be asked to justify. Spoken on the button's
 * accessible name, since the icon alone says only "something is off".
 */
const ASSIGN_FIT_WARNING: Record<AssignableFitTier, string> = {
  ready: '',
  override: 'not available for this shift, needs an override reason',
  unqualified: 'not qualified for this role, needs an override reason',
};

interface VolunteerCardProps {
  volunteer: VolunteerPoolItem;
  dragId?: string;
  isSelected?: boolean;
  isIdeal?: boolean;
  isOverlay?: boolean;
  onSelect?: (volunteerId: string) => void;
  /**
   * Set while a shift×role is focused and this volunteer may be committed to
   * it, to the tier that pick would land in. The card's action swaps from
   * "Select slot" to "Pick me": focus-then-pick is the builder's primary assign
   * path (B-2), so it is the filled primary button here while "Select slot"
   * stays quiet. `override` and `unqualified` render it as a warning instead —
   * a pick that will demand a reason must not look like a free one.
   */
  assignFit?: AssignableFitTier;
  onAssignToFocused?: (volunteerId: string) => void;
}

export function VolunteerCard({
  volunteer,
  dragId,
  isSelected = false,
  isIdeal = false,
  isOverlay = false,
  onSelect,
  assignFit,
  onAssignToFocused,
}: VolunteerCardProps) {
  const isTouch = useFormControlSize() === 'touch';
  // `attributes` is deliberately dropped below: it announces dnd-kit's keyboard
  // instructions, and no `KeyboardSensor` is registered.
  const { listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
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

  const roleLabel = formatAssigneeRoleLabel(volunteer.systemRole);
  // What the card's actions call this person. The visible name truncates to
  // "First L." and two people can share that, so the accessible name carries
  // the full name plus the system role (FR-013) — this is the disambiguation
  // the grip's aria-label used to hold, before the grip went aria-hidden.
  const accessibleName = roleLabel
    ? `${volunteer.volunteerName}, ${roleLabel}`
    : volunteer.volunteerName;
  const status = STATUS_PRESENTATION[volunteer.status];
  const statusLine = (
    <span className={cn('shrink-0 text-xs', status.tone)}>{status.label}</span>
  );
  // Shared by both bottom-right actions (Select slot / Pick me). The
  // negative inline-end margin cancels the button's own inline padding so its
  // *label* shares the status's right edge, and -mb-1.5 cancels the leftover
  // box space below the label so it sits on the last text line rather than
  // above it. Both track the size variant: `sm` pads px-2.5, `touch` pads px-4
  // (its -mr-3 deliberately leaves 4px, keeping the 44px target off the card
  // edge). The desktop size is left to `sm` — h-7 + the button's own `text-xs`
  // — rather than the h-6/11px it used to force: a 24px target at the bare
  // WCAG 2.2 floor, in the smallest type on the card, for the rail's primary
  // action (B-5). h-7 with a 16px line box also leaves exactly the 6px
  // -mb-1.5 cancels.
  const cornerActionClassName = cn(
    '-mb-1.5 shrink-0',
    isTouch ? '-mr-3 text-sm' : '-mr-2.5',
  );

  return (
    <div
      // The card is the drag *node* so dnd-kit measures the whole card, but the
      // grip below is the sole activator — the body stays inert. The dragged
      // copy rides a DragOverlay portal, so the source is not translated here;
      // it only dims.
      ref={isOverlay ? undefined : setNodeRef}
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
          <AvatarFallback className="bg-primary/12 font-semibold text-primary text-xs">
            {formatVolunteerInitials({
              volunteerName: volunteer.volunteerName,
            })}
          </AvatarFallback>
        </Avatar>
        {/* The grip is the ONLY drag affordance, and it is pointer-only: dnd-kit
            registers no `KeyboardSensor`, so spreading its `{...attributes}`
            here made the accessibility layer itself announce "press the space
            bar to pick up" for a gesture that never fires. It is hidden from
            assistive tech instead; the card's own label carries the FR-013
            name+role disambiguation the grip used to, and Select slot / Pick me
            are the real keyboard paths (B-3). The negative margin cancels the
            button's own box so the icon — not the hit area — sits on the card's
            12px padding corner, matching the other three. */}
        {isOverlay ? null : (
          <Button
            type="button"
            variant="ghost"
            size={isTouch ? 'icon-touch' : 'icon-sm'}
            ref={setActivatorNodeRef}
            {...listeners}
            aria-hidden="true"
            tabIndex={-1}
            data-testid="volunteer-card-grip"
            className={cn(
              'cursor-grab text-muted-foreground active:cursor-grabbing',
              isTouch ? '-m-3.5' : '-m-1.5',
            )}
          >
            <SquareGripIcon className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-sm">
            {formatVolunteerName(volunteer.volunteerName)}
          </span>
          {isIdeal ? (
            // The strongest recommendation signal on the card, badged with
            // no explanation anywhere else in the product (B-9) — the
            // tooltip is the only place a leader can learn what it means.
            // Badge render target matches AssigneeIdentityBadge's pattern:
            // a <span> is never keyboard-focusable, a <button> is, for free.
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-primary/15 px-2 text-primary text-xs"
                    data-testid="volunteer-ideal-badge"
                    render={<button type="button" />}
                  >
                    <StarIcon /> Ideal
                  </Badge>
                }
              />
              <TooltipContent>
                Qualified, available, and not already serving this cycle
              </TooltipContent>
            </Tooltip>
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
        <span className="mt-auto flex items-start gap-1.5 pt-1.5 text-muted-foreground text-xs">
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
            <TooltipTrigger
              // A plain <span> is never keyboard-focusable, so the reason it
              // opens would be pointer-only; a <button> is focusable natively.
              render={
                <button
                  type="button"
                  className={cn('shrink-0 text-left text-xs', status.tone)}
                >
                  {status.label}
                </button>
              }
            />
            <TooltipContent>{volunteer.conflictReason}</TooltipContent>
          </Tooltip>
        ) : (
          statusLine
        )}
        {assignFit && onAssignToFocused ? (
          // While a slot is focused the select affordance is redundant — the
          // rail is already scoped to one place — so the same corner commits
          // the pick instead. Conflict capture happens downstream, identical
          // to a board assignment; what the tier changes here is only whether
          // the button admits, before the click, that a reason is coming.
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant={assignFit === 'ready' ? 'default' : 'outline'}
            aria-label={
              assignFit === 'ready'
                ? `Assign ${accessibleName} to this role`
                : `Assign ${accessibleName} to this role — ${ASSIGN_FIT_WARNING[assignFit]}`
            }
            data-testid="volunteer-pick-me"
            data-assign-fit={assignFit}
            className={cn(
              cornerActionClassName,
              // Dashed = needs an availability override, dotted = needs a
              // qualification override — same amber, different border style,
              // so the two risk types read apart without hovering (B-9).
              assignFit === 'override' &&
                'border-yellow-600/50 border-dashed text-yellow-700 dark:text-yellow-300',
              assignFit === 'unqualified' &&
                'border-yellow-600/50 border-dotted text-yellow-700 dark:text-yellow-300',
            )}
            onClick={() => onAssignToFocused(volunteer.volunteerId)}
          >
            {assignFit === 'ready' ? null : (
              <TriangleAlertIcon className="size-3 shrink-0" />
            )}
            Pick me
          </Button>
        ) : onSelect ? (
          <Button
            type="button"
            size={isTouch ? 'touch' : 'sm'}
            variant={isSelected ? 'secondary' : 'ghost'}
            aria-pressed={isSelected}
            // "Select slot" is one of the two keyboard paths that replace the
            // grip's phantom keyboard drag, so it has to say whose slot it
            // selects — 200 identically-named buttons name nobody (B-3).
            aria-label={`Select ${accessibleName} to place on a slot`}
            data-testid="volunteer-select-slot"
            className={cornerActionClassName}
            onClick={() => onSelect(volunteer.volunteerId)}
          >
            {isSelected ? 'Selected' : 'Select slot'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
