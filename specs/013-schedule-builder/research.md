# Research: Schedule Builder (Desktop)

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26

---

## 1. Existing Backend Inventory

### What is already implemented (DO NOT re-implement)

**tRPC procedures in `adminLeaderRouter`:**
| Procedure | File | Notes |
|-----------|------|-------|
| `getScheduleBuilderData` | `routers/admin-leader/get-schedule-builder-data.ts` | Returns event, slots, requirements, assignments, volunteer availability in one call. Cross-event conflict detection already performed here. |
| `createAssignment` | `routers/admin-leader/create-assignment.ts` | Full conflict validation + override + audit trail. Accepts `allowOverride`, `overrideReason`, `asDraft`. |
| `deleteAssignment` | `routers/admin-leader/delete-assignment.ts` | Status-aware: deletes `draft`, cancels `pending/confirmed`. |
| `upsertSlotRequirement` | `routers/admin-leader/upsert-slot-requirement.ts` | Creates or updates role requirement (slotId + roleId + count). |
| `publishEvent` | `routers/admin-leader/publish-event.ts` | Hard constraint check + notification trigger. |
| `cancelEvent` | `routers/admin-leader/cancel-event.ts` | Cancels event and all pending assignments. |

**Domain services (server-side only, not exposed via tRPC directly):**
- `AvailabilityEngine.checkAvailability` — computes volunteer status for a time range
- `ConflictValidationService.validate` — evaluates all conflict types
- `ConflictValidationService.validateHardConstraints` — hard blocks (not qualified, not in ministry, duplicate)
- `ConflictValidationService.authorizeOverride` — creates audit entity for override

**Repositories implemented:**
- `EventRepository` (getById, getWithSlots, listByMinistry, create, updateStatus)
- `TimeSlotRepository` (getById, listByEvent, bulkCreate, deleteByEvent, upsertRequirement, countActiveAssignments)
- `AssignmentRepository` (create, getById, listByEvent, listByVolunteer, updateStatus, deleteById)
- `AssignmentAuditRepository` (create)
- `AvailabilityRepository` (listByVolunteers, listByVolunteerInRange)
- `VolunteerRepository` (getById, findByUserIdGlobally, listByMinistry, listMemberMinistryIds)
- `RoleRepository` (getById, listGlobalAndMinistryRoleIds)

---

## 2. Missing Backend Procedures

The following tRPC procedures need to be created under `apps/server/src/routers/admin-leader/`:

| Procedure | Priority | Notes |
|-----------|----------|-------|
| `createEvent` | P1 | Uses existing `EventRepository.create`. Input: title, startDate, endDate, ministryId, eventType. |
| `listEvents` | P1 | Uses existing `EventRepository.listByMinistry`. Sorted by startDate desc. |
| `createSlot` | P1 | Single slot creation. `TimeSlotRepository` has `bulkCreate` but no single-create — implement as `bulkCreate` with one item or add `create` method. |
| `updateSlot` | P1 | Update startTime, endTime, and/or label on an existing slot. No repo method exists — needs `DrizzleTimeSlotRepository.update`. |
| `deleteSlot` | P1 | Delete a single slot (not all slots for event). Needs `DrizzleTimeSlotRepository.deleteById`. Must check for active assignments first and return count for UI confirmation. |
| `generateSlots` | P2 | Auto-generation wizard: input (eventId, strategy: 'duration' \| 'count', value: number). Computes slot ranges from event startDate/endDate, returns preview array. On confirm=true, bulk-creates slots. |
| `sendReminder` | P2 | Notify all ministry volunteers who have no `availability` record for this event's time range. Uses existing `notificationService`. |
| `listAuditLog` | P2 | List `AssignmentAudit` entries for all assignments in an event. Needs `DrizzleAssignmentAuditRepository.listByEvent` (new repo method). |
| `listRoleTemplates` | P3 | List role templates for a ministry. New table required (see data-model.md). |
| `upsertRoleTemplate` | P3 | Create or update a role template. |
| `applyRoleTemplate` | P3 | Apply a template's role items to all slots of an event. |
| `deleteRoleTemplate` | P3 | Delete a role template and its items. |

---

## 3. Missing Frontend Dependencies

### dnd-kit (drag-and-drop)
- **Decision**: `@dnd-kit/core` + `@dnd-kit/utilities`
- **Rationale**: Accessible, React-first, no global event listener pollution. Already referenced in original F1 spec.
- **Install**: `bun add @dnd-kit/core @dnd-kit/utilities` in `apps/web`
- **Usage**: `DndContext` wraps builder grid; `useDraggable` on volunteer cards in sidebar; `useDroppable` on requirement cells.
- **Alternative considered**: `react-beautiful-dnd` — deprecated. `pragmatic-drag-and-drop` — Atlassian-specific, less community support.

### shadcn/ui components missing from `@church/ui`
Current `packages/ui/src/components/`: button, card, checkbox, dropdown-menu, input, label, skeleton, sonner

**Need to add via `shadcn add` in `packages/ui`:**
| Component | Used for |
|-----------|---------|
| `dialog` | Slot edit modal, override dialog, slot generation wizard |
| `popover` | On-demand assignment picker |
| `badge` | Availability status badge, conflict badge, confirmation status (✓/×/clock) |
| `tooltip` | Hover detail on availability badge |
| `progress` | Staffing meter bar |
| `separator` | Grid day headers, sidebar sections |
| `scroll-area` | Volunteer pool sidebar scroll |
| `alert` | Auto-save failure banner |
| `context-menu` | Right-click actions on cells (future; not needed for MVP) |
| `avatar` | Volunteer chip display (optional; badge may suffice) |

**Already in AppShell (from 012-global-ui-framework):** `command`, `sheet` (vaul drawer)

---

## 4. Schema Extensions Required

### 4a. `event` table — add `eventType` column
```sql
ALTER TABLE event ADD COLUMN event_type VARCHAR(20) NOT NULL DEFAULT 'hourly'
  CHECK (event_type IN ('hourly', 'day_based'));
```
- Drives grid row rendering: hourly → time ranges; day_based → "Day N" labels.
- Default `'hourly'` ensures no migration impact on existing data.

### 4b. New `role_template` + `role_template_item` tables
See data-model.md for full schema definition.

### 4c. `time_slot` table — optional non-overlap index
The existing `timeslot_duration_check` constraint ensures `startTime < endTime`.
Cross-slot overlap prevention is enforced at the application layer in `generateSlots` and `createSlot`/`updateSlot` procedures (query existing slots before saving).
No additional DB constraint needed — application-layer validation is sufficient and avoids complex exclusion constraint syntax.

---

## 5. Frontend Architecture Decisions

### State Management
- **Builder data**: Loaded once via `trpc.adminLeader.getScheduleBuilderData.useQuery`. Invalidated on every mutation.
- **Optimistic updates**: `onMutate` + `onError` rollback for `createAssignment` and `deleteAssignment` — high-frequency actions need immediate UI feedback.
- **Auto-save**: Driven by mutation `isPending` state; no separate debounce. Each action is atomic.
- **Filter/sort state**: Local component state in `VolunteerPoolSidebar` (`useState`). Does not need React Query or global state.

### Route Structure (TanStack Router)
```
/scheduling                          → EventListPage (scheduling.tsx layout)
/scheduling/events/$eventId/builder  → ScheduleBuilderPage
```
- Builder route uses `$eventId` path param for deep-linking (spec FR-004, FR-012).
- Non-leader access guard: redirect + toast handled at route level via `beforeLoad` guard.
- Mobile guard: checked in `ScheduleBuilderPage` component via `useMediaQuery`.

### Grid Data Shape (client-side derived)
The builder grid is derived from `getScheduleBuilderData` response:
```typescript
// Client-side derived structure for grid rendering
type GridCell = {
  slotId: string;
  requirementId: string;
  roleId: string;
  fillIndex: number;       // 0..requiredCount-1 for stacked multi-fill
  assignment?: Assignment;
  conflictStatus?: 'double_booked' | 'unavailable';
  suggestions: VolunteerAvailability[]; // top 3
};
```

### Auto-Save Status Display
```
"Auto-saving..."  → mutation isPending === true
"Saved"           → mutation isSuccess, shown for 2s then hidden
"Changes not saved — [Retry]" → mutation isError, persistent until dismissed
```

### Staffing Meter Calculation
```typescript
// Per-slot: count assignments / count requirements (including multi-fill)
const slotFill = assignments.filter(a => a.slotId === slot.id).length /
  requirements.filter(r => r.slotId === slot.id)
    .reduce((sum, r) => sum + r.requiredCount, 0);

// Event-level: aggregate across all slots
const eventFill = totalAssignments / totalRequiredCount;

// Color: < 0.5 → red, 0.5–0.99 → yellow, 1.0 → green
```

---

## 6. Alternatives Considered and Rejected

| Decision | Rejected Alternative | Reason |
|----------|---------------------|--------|
| dnd-kit | react-beautiful-dnd | Deprecated by Atlassian |
| Single `getScheduleBuilderData` query | Separate queries per entity | Avoids waterfall; reduces round trips; already implemented and working |
| TanStack Query for optimistic updates | Local useState + manual rollback | TQ's `onMutate`/`onError` is the established pattern in this codebase |
| Ministry timezone display | Browser timezone | Spec S4 decision; ministry timezone already accessible in event context |
| Route-level mobile guard | CSS-only responsive hiding | Must redirect non-leaders too; route `beforeLoad` handles both guards cleanly |
