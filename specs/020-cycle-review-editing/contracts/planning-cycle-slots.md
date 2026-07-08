# Contract: Planning-Cycle Event Slot Mutation Routes

Two new routes on `ChurchAdminController` (`apps/server/src/api/controllers/church-admin-controller.ts`), registered under the controller's existing `/admin` prefix alongside the other `/planning-cycles/*` routes.

## `PATCH /planning-cycles/:cycleId/events/:eventId/slots/:slotId`

- **operationId**: `updatePlanningEventSlot`
- **Auth**: existing preValidation hook (church-admin session required) — unchanged.
- **Path params**: `cycleId` (uuid), `eventId` (uuid), `slotId` (uuid).
- **Body** (`updateSlotBodySchema`, reused from `time-slot.dto.ts`):
  ```ts
  { startTime?: string /* ISO datetime */, endTime?: string /* ISO datetime */, label?: string }
  ```
- **Response 200** (`timeSlotResponseSchema`, reused): the updated slot.
- **Errors**:
  - `404` — cycle, event, or slot not found, or slot does not belong to the given event/cycle.
  - `409` — cycle is archived, or cycle is locked and the event is not `draft` (mirrors `updateEvent`'s existing `IllegalStateTransitionError` mapping).
  - `422` — `startTime >= endTime` (reuse existing slot-duration validation from `time-slot.dto.ts`/`invalid-slot-duration` error, already enforced for the sibling Builder-events route).

## `DELETE /planning-cycles/:cycleId/events/:eventId/slots/:slotId`

- **operationId**: `deletePlanningEventSlot`
- **Auth**: same as above.
- **Path params**: same as above.
- **Response**: `204` on success, no body.
- **Errors**:
  - `404` — cycle, event, or slot not found, or slot does not belong to the given event/cycle.
  - `409` — cycle is archived, or cycle is locked and the event is not `draft`.
  - `409` — target slot is the event's only remaining slot (FR-008) — new `LastRemainingSlotError`, distinct from the lock-state `IllegalStateTransitionError` so the frontend can show a different message ("delete the whole day instead" vs. "this cycle is locked").

## Frontend consumption

After orval regeneration, `adminApi.updatePlanningEventSlot(cycleId, eventId, slotId, body)` and `adminApi.deletePlanningEventSlot(cycleId, eventId, slotId)` become available, consumed by two new mutations in `use-planning-admin-mutations.ts` following the existing `deleteTemplate`-mutation shape (React Query `useMutation`, `toast.success`/`toast.error` on settle, cache invalidation of the selected cycle's details query).
