# Quickstart: Schedule Builder (Desktop)

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26

---

## Prerequisites

1. Docker running with DB: `docker compose up -d`
2. Dependencies installed: `bun install` from repo root
3. DB migrations up to date: `bun run db:migrate` from `packages/db`
4. Seed data available: `bun run db:seed` from `packages/db` (local seeding covers ministries, roles, volunteers, events)

---

## Install New Dependencies

```bash
# From apps/web — drag-and-drop library
cd apps/web && bun add @dnd-kit/core @dnd-kit/utilities

# From packages/ui — add missing shadcn components
cd packages/ui
bunx shadcn add dialog popover badge tooltip progress separator scroll-area alert
```

---

## DB Schema Migration

```bash
# After updating packages/db/src/schema/scheduling.ts and role-templates.ts:
cd packages/db
bun run db:generate   # generates new migration file
bun run db:migrate    # applies migration to local DB
```

Expected new migration adds:
- `event_type` column on `event` table (default `'hourly'`)
- `role_template` table
- `role_template_item` table

---

## Development Server

```bash
# From repo root — starts all apps in watch mode via Turborepo
bun run dev

# Or individually:
cd apps/server && bun run dev   # Fastify on :3000
cd apps/web && bun run dev      # Vite on :5173
```

---

## Key URLs (dev)

| URL | Description |
|-----|-------------|
| `http://localhost:5173/scheduling` | Event list page |
| `http://localhost:5173/scheduling/events/{eventId}/builder` | Schedule builder |
| `http://localhost:3000/trpc` | tRPC endpoint |

---

## Implementation Order

Work in this sequence to minimize blocking dependencies:

### Step 1 — Schema & migrations (packages/db)
1. Add `event_type` enum and column to `scheduling.ts`
2. Create `role-templates.ts` with `roleTemplate` + `roleTemplateItem` tables
3. Export new tables from `packages/db/src/schema/index.ts`
4. Generate and run migration

### Step 2 — Domain entities & repository contracts (apps/server)
1. Add `EventType` + update `Event` interface in `domain/entities/event.ts`
2. Create `domain/entities/role-template.ts`
3. Extend `domain/repositories/time-slot.repository.ts` with new methods
4. Extend `domain/repositories/event.repository.ts` with new methods
5. Extend `domain/repositories/assignment-audit.repository.ts` with `listByEvent`
6. Create `domain/repositories/role-template.repository.ts`

### Step 3 — Repository implementations (apps/server)
1. Extend `DrizzleTimeSlotRepository` with `create`, `update`, `deleteById`, `findOverlapping`
2. Extend `DrizzleEventRepository` with `update`
3. Extend `DrizzleAssignmentAuditRepository` with `listByEvent`
4. Create `DrizzleRoleTemplateRepository`
5. Register new repository in `infrastructure/repositories/registry.ts`

### Step 4 — tRPC procedures (apps/server)
1. `create-event.ts`, `list-events.ts` *(no `update-event` procedure in MVP — event metadata editing lives on the separate Event Detail page, out of this spec's scope per FR-058; the `EventRepository.update()` method is still scaffolded for internal/future use)*
2. `create-slot.ts`, `update-slot.ts`, `delete-slot.ts`
3. `generate-slots.ts`
4. `send-reminder.ts`
5. `list-audit-log.ts`
6. `list-role-templates.ts`, `upsert-role-template.ts`, `apply-role-template.ts`, `delete-role-template.ts`
7. Register all in `routers/admin-leader.ts`

### Step 5 — Frontend routing (apps/web)
1. Create `routes/scheduling.tsx` (layout route with outlet)
2. Create `routes/scheduling/index.tsx` (event list)
3. Create `routes/scheduling/events/$eventId/builder.tsx` (builder page)
4. Add route guards in `beforeLoad` (auth + role check)
5. Run `bun run generate:routes` to update `routeTree.gen.ts`

### Step 6 — Event list page
1. Connect `EventList` component to `trpc.adminLeader.listEvents`
2. Add "New Event" button → `QuickCreateEventModal`
3. Event cards link to builder route

### Step 7 — Builder: data layer & hooks
1. `use-schedule-builder.ts` — wraps `getScheduleBuilderData` query + all mutations
2. `use-volunteer-pool.ts` — filter/sort logic for sidebar
3. `use-auto-save.ts` — mutation status → save indicator

### Step 8 — Builder: core grid
1. `ScheduleBuilder` container (data fetching, DndContext)
2. `BuilderHeader` (event info, actions, save indicator, staffing meter)
3. `BuilderGrid` (slot rows, role columns derived from requirements)
4. `SlotRow` + `RequirementCell` (empty + assigned states)
5. `AssignmentChip` (name + last initial + conflict badge + confirmation badge)

### Step 9 — Builder: interactions
1. `VolunteerPoolSidebar` (useDraggable on volunteer cards, filter/sort)
2. `AssignmentPicker` (popover, search box, assign + remove actions)
3. `OverrideDialog` (min-10-char textarea, conflict type display)
4. `SubstitutionPicker` (picker variant with declined volunteer pinned)
5. `SuggestionList` (top 3 passive suggestions in empty cells)

### Step 10 — Builder: slot management
1. `SlotEditModal` (time pickers + label field)
2. `RoleCountControl` (inline +/− buttons)
3. `SlotGenerateWizard` (multi-step: strategy → preview → template)
4. `EmptyBuilderState` (no slots prompt)

### Step 11 — Builder: secondary features
1. `StaffingMeter` (event-level + per-slot variant)
2. `AuditLogPanel` (modal/panel via overflow menu)
3. `MobileInterstitial` (media query check + localStorage bypass)
4. Manual refresh button

### Step 12 — Styling & polish
1. Fully-filled row green tint
2. Day-based event row labels ("Day N")
3. Sticky day-header rows for multi-day events
4. 3-state meter color coding

---

## Testing Approach

| Layer | Tool | Focus |
|-------|------|-------|
| Unit | Vitest | `StaffingMeter` fill calculation, slot overlap detection in repo layer |
| Integration | Vitest + real DB | New tRPC procedures: create event, create slot (overlap rejection), delete slot (active assignment check) |
| Component | Vitest + @testing-library/react | `RequirementCell` renders conflict badge on assignment; `OverrideDialog` disables button under 10 chars |
| E2E | Playwright (Spec Q1) | Full journey: create event → auto-generate slots → assign volunteer → override conflict → publish |
