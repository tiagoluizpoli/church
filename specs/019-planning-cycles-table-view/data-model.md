# Phase 1 Data Model: Planning Cycles Table View

No new domain entities or persisted data. This feature reshapes the *presentation* of data already fetched by `planning-admin-context.tsx`'s existing selector hooks (`useCycleListCard`, `useTemplateManagerCard`, `useCycleReviewCard`) — see `research.md` R5.

Per Constitution Principle VII (Explicit Parameter Contracts), each new render-facing helper introduced by this feature uses a single named object parameter/type rather than inline object typing.

## View-model types (new, presentation-only)

### `PlanningCyclesTableRow`
One row of the flat Planning cycles index table. Maps 1:1 from an existing `PlanningCycleSummary` (`ListPlanningCycles200CyclesItem`) — no new fields, just the type alias consumed by the new table-rendering path in `cycle-list-card.tsx`.

- `id: string`
- `name: string`
- `window: string` — pre-formatted via the existing `formatCycleDate` util (start → end)
- `state: PlanningCycleSummary['state']`

### `TemplateLibraryTableRow`
One row of the flat Template library table. Maps 1:1 from `PlanningTemplateSummary` (`ListEventTemplates200TemplatesItem`).

- `id: string`
- `name: string`
- `weekday: string`
- `blockCount: number`

### `CycleCalendarTableRow`
One top-level (parent/weekday) row of the expandable Calendar review table. Maps 1:1 from `PlanningCycleEventGroup` (`GetPlanningCycle200EventsItem`).

- `eventId: string`
- `title: string`
- `window: string` — pre-formatted via existing `formatEventDateTime` util
- `eventType: string`
- `status: PlanningCycleEventGroup['event']['status']`
- `slots: CycleCalendarSlotRow[]` — child rows, rendered only when the parent row is expanded

### `CycleCalendarSlotRow`
One child (slot) row nested under a `CycleCalendarTableRow`. Maps 1:1 from a `PlanningCycleEventGroup['slots'][number]` entry.

- `slotId: string`
- `label: string` — falls back to `'Slot'` when the API's `label` is null, matching today's `planning-event-card.tsx` behavior
- `window: string` — pre-formatted start → end

## State (new, local component state only)

### `ExpandedCalendarRowsState`
Tracks which `CycleCalendarTableRow`s are currently expanded in the Calendar review table. Local `useState` in `cycle-review-card.tsx` (or a small extracted hook if the Intent UI table's actual expand/collapse API — resolved during implementation per `research.md` R1 — requires controlled state rather than owning it internally).

- `expandedEventIds: ReadonlySet<string>`

No new persisted field — this state resets on remount/navigation, matching `spec.md`'s Edge Cases note that expand/collapse state is not required to persist across the desktop/mobile breakpoint switch.
