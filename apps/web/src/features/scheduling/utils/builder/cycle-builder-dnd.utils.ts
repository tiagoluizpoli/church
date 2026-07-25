import type { Active, Over } from '@dnd-kit/core';

/** Payload `VolunteerCard` puts on its dnd-kit draggable. */
export interface VolunteerDragData {
  volunteerId?: string;
}

/** Payload a board cell puts on its dnd-kit droppable. */
export interface CycleDropTargetData {
  shiftId?: string;
  roleId?: string;
  assignmentId?: string;
}

interface DraggedVolunteerIdInput {
  active: Active | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Who is currently being dragged, if anyone. The id lives in the draggable's
 * `data`, not its `id` — a volunteer can be registered several times under
 * different drag ids (once per rail group), so `active.id` is not the person.
 */
export function draggedVolunteerId({
  active,
}: DraggedVolunteerIdInput): string | undefined {
  const data: unknown = active?.data.current;
  if (!isRecord(data)) return undefined;
  const volunteerId = data.volunteerId;
  return typeof volunteerId === 'string' ? volunteerId : undefined;
}

interface DropTargetDataInput {
  over: Over | null;
}

export function dropTargetData({
  over,
}: DropTargetDataInput): CycleDropTargetData | undefined {
  const data: unknown = over?.data.current;
  if (!isRecord(data)) return undefined;
  const candidate = data;
  return {
    shiftId:
      typeof candidate.shiftId === 'string' ? candidate.shiftId : undefined,
    roleId: typeof candidate.roleId === 'string' ? candidate.roleId : undefined,
    assignmentId:
      typeof candidate.assignmentId === 'string'
        ? candidate.assignmentId
        : undefined,
  };
}
