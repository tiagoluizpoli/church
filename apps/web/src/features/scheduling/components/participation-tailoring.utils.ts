import type {
  GetCycleParticipation200,
  GetCycleParticipation200EventsItem,
  GetCycleParticipation200EventsItemSlotsItem,
  GetScheduleBuilderData200RolesItem,
} from '@/infrastructure/api/churchAPI.schemas';

export interface TailoringCycleOption {
  id: string;
  label: string;
  eventCount: number;
}

export interface SplitFormState {
  mode: 'equal' | 'manual';
  equalCount: string;
  manualSpans: ManualSpanDraft[];
}

export interface ManualSpanDraft {
  startTime: string;
  endTime: string;
  label: string;
}

export function buildCycleOptions(
  events: {
    planningCycleId: string;
    title: string;
    startDate: string;
    endDate: string;
  }[],
): TailoringCycleOption[] {
  const grouped = new Map<
    string,
    { title: string; startDate: string; endDate: string; eventCount: number }
  >();

  for (const event of events) {
    const current = grouped.get(event.planningCycleId);
    if (current) {
      current.eventCount += 1;
      if (event.startDate < current.startDate)
        current.startDate = event.startDate;
      if (event.endDate > current.endDate) current.endDate = event.endDate;
      continue;
    }

    grouped.set(event.planningCycleId, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      eventCount: 1,
    });
  }

  return [...grouped.entries()]
    .map(([id, value]) => ({
      id,
      label: `${formatDate(value.startDate)} - ${formatDate(value.endDate)} · ${value.title}`,
      eventCount: value.eventCount,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatTimeRange({
  start,
  end,
}: {
  start: string;
  end: string;
}): string {
  return `${formatDateTime(start)} - ${new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(end))}`;
}

export function createInitialInclusions(
  events: GetCycleParticipation200['events'],
): Record<string, string[]> {
  return Object.fromEntries(
    events.map((eventView) => [
      eventView.participation.id,
      eventView.slots
        .filter((slotView) => slotView.included)
        .map((slotView) => slotView.slot.id),
    ]),
  );
}

export function createInitialSplitForms(
  events: GetCycleParticipation200['events'],
): Record<string, SplitFormState> {
  const entries: Record<string, SplitFormState> = {};

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      entries[slotView.slot.id] = {
        mode: 'equal',
        equalCount: String(Math.max(2, slotView.shifts.length || 2)),
        manualSpans:
          slotView.shifts.length > 0
            ? slotView.shifts.map((shift) => ({
                startTime: toLocalDateTimeValue(shift.startTime),
                endTime: toLocalDateTimeValue(shift.endTime),
                label: shift.label ?? '',
              }))
            : [
                {
                  startTime: toLocalDateTimeValue(slotView.slot.startTime),
                  endTime: toLocalDateTimeValue(slotView.slot.endTime),
                  label: slotView.slot.label ?? '',
                },
              ],
      };
    }
  }

  return entries;
}

export function createInitialHeadcountDrafts(
  events: GetCycleParticipation200['events'],
): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const eventView of events) {
    for (const slotView of eventView.slots) {
      for (const requirement of slotView.requirements) {
        entries[toHeadcountKey(requirement.shiftId, requirement.roleId)] =
          String(requirement.requiredCount);
      }
    }
  }

  return entries;
}

export function toHeadcountKey(shiftId: string, roleId: string): string {
  return `${shiftId}:${roleId}`;
}

export function getSlotRoleOptions({
  roles,
  slotView,
}: {
  roles: GetScheduleBuilderData200RolesItem[];
  slotView: GetCycleParticipation200EventsItemSlotsItem;
}): GetScheduleBuilderData200RolesItem[] {
  if (roles.length > 0) return roles;

  return slotView.requirements.map((requirement) => ({
    id: requirement.roleId,
    name: requirement.roleId,
  }));
}

export function toLocalDateTimeValue(isoValue: string): string {
  const date = new Date(isoValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoString(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function validateManualSpans({
  slotView,
  spans,
}: {
  slotView: GetCycleParticipation200EventsItemSlotsItem;
  spans: ManualSpanDraft[];
}): string | null {
  const slotStart = new Date(slotView.slot.startTime);
  const slotEnd = new Date(slotView.slot.endTime);
  const parsed = spans.map((span) => ({
    ...span,
    start: new Date(span.startTime),
    end: new Date(span.endTime),
  }));

  if (
    parsed.some(
      (span) =>
        Number.isNaN(span.start.getTime()) || Number.isNaN(span.end.getTime()),
    )
  ) {
    return 'Fill every manual shift time before saving.';
  }

  if (parsed.some((span) => span.start >= span.end)) {
    return 'Each manual shift must end after it starts.';
  }

  if (parsed.some((span) => span.start < slotStart || span.end > slotEnd)) {
    return 'Manual shifts must stay within the parent slot bounds.';
  }

  const ordered = [...parsed].sort(
    (left, right) => left.start.getTime() - right.start.getTime(),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous && current && previous.end > current.start) {
      return 'Manual shifts cannot overlap.';
    }
  }

  return null;
}

export function countIncludedSlots(
  events: GetCycleParticipation200EventsItem[],
): number {
  return events.reduce(
    (total, eventView) =>
      total + eventView.slots.filter((slotView) => slotView.included).length,
    0,
  );
}

export function countShifts(
  events: GetCycleParticipation200EventsItem[],
): number {
  return events.reduce(
    (total, eventView) =>
      total +
      eventView.slots.reduce(
        (slotTotal, slotView) => slotTotal + slotView.shifts.length,
        0,
      ),
    0,
  );
}
