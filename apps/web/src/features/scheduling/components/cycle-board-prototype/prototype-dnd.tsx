// PROTOTYPE ONLY — shared drag-and-drop harness for the volunteer-rail variants.
// Throwaway. When a rail variant wins, rebuild this properly against the live
// builder (this file dies with the prototype).
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import {
  type PrototypeRole,
  type PrototypeShift,
  type PrototypeVolunteer,
  slotFitFor,
} from './prototype-data';

// --- draggable volunteer -----------------------------------------------------

export function useVolunteerDraggable(volunteer: PrototypeVolunteer) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: volunteer.id,
    data: { volunteer },
  });
  // Source stays put (DragOverlay renders the moving ghost); we only dim it.
  return { setNodeRef, listeners, attributes, isDragging };
}

// --- droppable requirement cell (two-tier highlight) -------------------------

export function roleDroppableId(shift: PrototypeShift, role: PrototypeRole) {
  return `${shift.id}::${role.id}`;
}

interface DroppableRoleProps {
  shift: PrototypeShift;
  role: PrototypeRole;
  activeVolunteer: PrototypeVolunteer | null;
  // The volunteer selected in the rail — drives the reverse highlight (person →
  // every cell they fit). Strong for available+eligible, faint for
  // eligible-but-unavailable.
  selectedVolunteer: PrototypeVolunteer | null;
  // The slot currently in focus (forward axis) — gets a persistent ring.
  selectedSlotId: string | null;
  onAssign: (role: PrototypeRole, shift: PrototypeShift) => void;
  onSelectSlot: (role: PrototypeRole, shift: PrototypeShift) => void;
}

// Two orthogonal axes coexist on the cell:
//  • background click → SELECT this slot (rail recomputes for it);
//  • the inner Add pill / a dropped drag → ASSIGN the active volunteer.
// While dragging, the two-tier drop highlight wins. Otherwise a selected
// volunteer paints the reverse highlight, and the focused slot keeps a ring.
export function DroppableRole({
  shift,
  role,
  activeVolunteer,
  selectedVolunteer,
  selectedSlotId,
  onAssign,
  onSelectSlot,
}: DroppableRoleProps) {
  const slotId = roleDroppableId(shift, role);
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { role, shift },
  });
  const dragging = activeVolunteer !== null;
  const recommended = dragging && role.recommendation === activeVolunteer?.name;

  const isSelectedSlot = selectedSlotId === slotId;
  const fit = selectedVolunteer
    ? slotFitFor({ slotId, roleName: role.name, volunteer: selectedVolunteer })
    : null;
  const reverseStrong =
    !dragging && Boolean(fit?.isAvailable && !fit.hasConflict);
  const reverseFaint = !dragging && fit !== null && !reverseStrong;

  // Rest state mirrors the real CycleBuilderCell shell. Priority: drag two-tier
  // → focused slot ring → reverse highlight → rest.
  let shellClass = 'border-border/70 bg-background/40';
  if (dragging) {
    shellClass = recommended
      ? 'border-primary bg-primary/10 ring-1 ring-primary'
      : 'border-primary/40 border-dashed bg-primary/[0.04]';
  } else if (isSelectedSlot) {
    shellClass = 'border-primary bg-primary/10 ring-2 ring-primary';
  } else if (reverseStrong) {
    shellClass = 'border-primary bg-primary/10 ring-1 ring-primary';
  } else if (reverseFaint) {
    shellClass = 'border-primary/40 border-dashed bg-primary/[0.04]';
  }
  const overClass = isOver
    ? recommended
      ? 'ring-2 ring-primary bg-primary/20'
      : 'ring-2 ring-primary/70 bg-primary/10'
    : '';

  return (
    <div
      ref={setNodeRef}
      className={`relative w-full min-w-0 rounded-md border p-2 transition-colors ${shellClass} ${overClass}`}
    >
      {/* Background hit target = select this slot. Sits under the content so the
          Add pill (pointer-events re-enabled) still assigns. */}
      <button
        type="button"
        aria-label={`Select ${role.name} slot`}
        onClick={() => onSelectSlot(role, shift)}
        className="absolute inset-0 z-0 cursor-pointer rounded-md"
      />
      <div className="pointer-events-none relative z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-xs">{role.name}</span>
          <span className="shrink-0 text-muted-foreground text-xs">0/1</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {dragging ? (
            recommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-[10px] text-primary">
                <SparklesIcon className="size-3" /> Recommended
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-primary/40 border-dashed px-2 py-0.5 text-[10px] text-primary/70">
                Drop here
              </span>
            )
          ) : (
            <button
              type="button"
              onClick={() => onAssign(role, shift)}
              className="pointer-events-auto inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2 text-muted-foreground text-xs hover:border-primary hover:text-primary"
            >
              <PlusIcon className="size-3" />
              {selectedVolunteer
                ? `Assign ${selectedVolunteer.name.split(' ')[0]}`
                : 'Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
