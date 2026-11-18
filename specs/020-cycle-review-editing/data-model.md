# Phase 1 Data Model: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

No new domain entities. This section documents view-model type changes (frontend) and new manager/repository input types (backend) needed by FR-001–FR-013.

## Frontend view-model changes (`planning-admin.types.ts`)

### `CycleCalendarTableRow` (existing — field meaning changes, no new fields)

```ts
export interface CycleCalendarTableRow {
  eventId: string;
  title: string;
  window: string;      // BEFORE: pre-formatted "2026-07-05 11:00Z → 2026-07-05 22:40Z"
                        // AFTER: raw ISO `startDate` string only (rename candidate: `startDate`).
                        //        The component formats it via useTimezone().format(startDate, 'PP')
                        //        at render time — this field stops being a display string.
  eventType: string;
  status: PlanningCycleEventGroup['event']['status'];
  slots: CycleCalendarSlotRow[];
}
```

**Decision**: Rename `window: string` → `startDate: string` (raw ISO) on `CycleCalendarTableRow`, since FR-003 removes the day row's window entirely (date-only). Keep `endDate` unused/omitted — a day row never displays an end date per FR-003.

### `CycleCalendarSlotRow` (existing — field meaning changes)

```ts
export interface CycleCalendarSlotRow {
  slotId: string;
  label: string;
  window: string;       // BEFORE: pre-formatted "start → end"
                         // AFTER: split into raw ISO startTime/endTime; component formats each via
                         //        useTimezone().format(startTime, 'p') / format(endTime, 'p') (FR-004).
  startTime: string;     // NEW — raw ISO
  endTime: string;       // NEW — raw ISO
  isOnlySlotInEvent: boolean;  // NEW — true when this is the day's last remaining slot (drives FR-008's
                               //        disabled/hidden delete control); computed once in
                               //        toCycleCalendarTableRow from `eventGroup.slots.length === 1`.
}
```

**Decision**: Remove the pre-joined `window` field, replace with raw `startTime`/`endTime` (both already available on the source `PlanningCycleEventGroup['slots'][number]`). Add `isOnlySlotInEvent` so the row-mapper (not the component) owns the "last slot" rule from FR-008 — keeps the component a pure renderer.

### `PlanningCycleHeaderModel` (existing, in `planning-admin-context.tsx` — extend)

```ts
export interface PlanningCycleHeaderModel {
  nameAndStatus: { name: string; status: SelectedPlanningCycle['state'] } | null;
  period: { startDate: string; endDate: string } | null;
  counts: { eventCount: number; slotCount: number } | null;  // NEW (FR-001)
}
```

**Decision**: Add a `counts` object (not two bare fields) to keep one named shape per Constitution VII, mirroring the existing `nameAndStatus`/`period` grouping style already in this interface. `usePlanningCycleHeader()` populates it from the same `cycleEvents.length`/`totalSlots` values `useCycleReviewCard()` already reads from context (R3).

## Backend input types (new)

### `apps/server/src/domain/contracts/application/planning-event-manager.ts`

```ts
export interface UpdatePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
  slotId: TimeSlotId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface DeletePlanningEventSlotManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
  slotId: TimeSlotId;
}
```

Added to `IPlanningEventManager`:

```ts
updateSlot(input: UpdatePlanningEventSlotManagerInput): Promise<TimeSlot>;
deleteSlot(input: DeletePlanningEventSlotManagerInput): Promise<void>;
```

**Validation rules** (enforced in `DbPlanningEventManager`, per R4):
- Cycle must exist and pass `ensurePlanningCycleWritable` (not archived; not locked unless the underlying event is still `draft` — same rule already applied to `updateEvent`/`cancelEvent`).
- The target event must belong to the given cycle; the target slot must belong to the given event (cross-check via `eventRepository.getEvent` + `timeSlotRepository.getById`, per R4's guard detail) — otherwise throw the existing `NotFoundError`.
- `deleteSlot` MUST reject (throw a new domain error, e.g. `LastRemainingSlotError`) when the target slot is the event's only slot (FR-008) — the frontend also disables the control, but the backend is the authoritative guard.

### `apps/server/src/api/dtos/time-slot.dto.ts` (reused, not modified)

`updateSlotBodySchema` and `timeSlotResponseSchema`/`timeSlotMapper` are reused as-is from the existing Builder-events DTO file — no schema change needed since the slot's shape (`startTime`/`endTime`/`label`) is identical across both features.

### `UpdatePlanningEventManagerInput` (existing — new cascade behavior, no field change)

No new fields are added to this existing type (`planning-event-manager.ts`, already has optional `startDate`/`endDate`). What changes is `DbPlanningEventManager.updateEvent`'s implementation (per R6): when `startDate` is provided and differs from the current event's `startDate`, it now also shifts every slot belonging to that event by the same delta (`newStartDate.getTime() - oldStartDate.getTime()`), applied to each slot's `startTime` and `endTime`, inside the same transaction as the event update. This is FR-007a's cascade — implemented as a side effect of the existing `updateEvent` method, not a new manager method or route.

## State transitions

No new state machine. `TimeSlot` has no status field on its DB row (confirmed this session); "deleting" a slot is a hard row delete (`ITimeSlotRepository.deleteById`), consistent with how the sibling Builder-events feature already deletes slots — this differs from event-level "delete" (FR-006), which is a soft delete via `cancelPlanningEvent`'s existing `status: 'cancelled'` transition (per spec.md Assumptions). This asymmetry (hard slot delete, soft event delete) already exists in the shipped system and is preserved, not introduced, by this feature.
