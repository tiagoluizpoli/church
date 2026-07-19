// PROTOTYPE ONLY — shared drag-and-drop harness for the volunteer-rail variants.
// Throwaway. When a rail variant wins, rebuild this properly against the live
// builder (this file dies with the prototype).
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import type {
  PrototypeRole,
  PrototypeShift,
  PrototypeVolunteer,
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
  onAssign: (role: PrototypeRole, shift: PrototypeShift) => void;
}

// Two-tier rule (per user): while dragging, EVERY empty requirement cell reads
// as droppable (the leader can place anywhere), but cells recommended for the
// dragged volunteer get a stronger, unmistakable emphasis.
export function DroppableRole({
  shift,
  role,
  activeVolunteer,
  onAssign,
}: DroppableRoleProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: roleDroppableId(shift, role),
    data: { role, shift },
  });
  const dragging = activeVolunteer !== null;
  const recommended = dragging && role.recommendation === activeVolunteer?.name;

  // Rest state mirrors the real CycleBuilderCell shell. While dragging we layer
  // the two-tier highlight on top: every empty cell reads as droppable, the
  // recommended ones stronger, the hovered one strongest.
  const shellClass = !dragging
    ? 'border-border/70 bg-background/40'
    : recommended
      ? 'border-primary bg-primary/10 ring-1 ring-primary'
      : 'border-primary/40 border-dashed bg-primary/[0.04]';
  const overClass = isOver
    ? recommended
      ? 'ring-2 ring-primary bg-primary/20'
      : 'ring-2 ring-primary/70 bg-primary/10'
    : '';

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAssign(role, shift)}
      className={`w-full min-w-0 rounded-md border p-2 text-left transition-colors ${shellClass} ${overClass}`}
    >
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
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2 text-muted-foreground text-xs">
            <PlusIcon className="size-3" /> Add
          </span>
        )}
      </div>
    </button>
  );
}
