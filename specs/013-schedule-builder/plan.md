# Implementation Plan: Schedule Builder (Desktop)

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-schedule-builder/spec.md`

---

## Summary

Build the desktop-first schedule builder UI for ministry leaders. The backend domain layer (Availability Engine, Conflict Validation Service, Assignment Manager, repositories) is **fully implemented**. Most required tRPC procedures exist. The work is primarily **frontend** — the builder canvas, volunteer pool sidebar, grid, pickers, and all interaction flows — plus a handful of missing backend procedures (event CRUD, slot CRUD, role templates, send-reminder, audit log fetch).

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Bun runtime

**Primary Dependencies**:
- Frontend: React 19, Vite, TanStack Router v1, TanStack Query v5, tRPC client, Tailwind CSS v4, shadcn/ui (strict adherence), framer-motion, vaul, dnd-kit *(not yet installed — see research.md)*
- Backend: Fastify, tRPC server, Drizzle ORM, Zod, Better Auth

**Storage**: PostgreSQL via Drizzle ORM (`@church/db`). Schema partially needs extension — see data-model.md.

**Testing**: Vitest (unit/integration), Playwright (E2E, defined in Spec Q1)

**Target Platform**: Web browser (desktop-first). PWA-capable.

**Project Type**: Monorepo web application — `apps/web` (React frontend) + `apps/server` (Fastify/tRPC backend)

**Performance Goals**:
- Conflict badges render within 1 second of assignment (SC-002)
- Auto-save completes within 2 seconds (SC-006)
- Full assignment cycle for 4-slot / 10-volunteer event under 10 minutes (SC-001)

**Constraints**:
- All UI via standard shadcn/ui — no custom components from scratch (spec FR-007, tech-stack mandate)
- Church isolation on every query (`churchId` filter)
- All timestamps UTC in DB, displayed in ministry timezone (Spec S4)
- No WebSockets / SSE for MVP — standard tRPC HTTP only
- Monorepo boundaries: shared packages (`packages/*`) = generic only; all application-specific logic in `apps/server` or `apps/web`

**Scale/Scope**: ~5–50 volunteers per ministry per event; no pagination required for MVP

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Domain-First Architecture | ✅ PASS | Spec fully grilled; domain entities + services already implemented (L1/L2/L3) |
| II. Full-Stack Type Safety | ✅ PASS | tRPC end-to-end; Zod validation on all new procedures; no `any` |
| III. Container-Ready Infrastructure | ✅ PASS | No new infrastructure — existing docker-compose covers DB |
| IV. Environment Discipline | ✅ PASS | No new env vars needed |
| V. Automated Code Standards | ✅ PASS | Biome + Lefthook already configured |
| VI. Maximum Context Specification | ✅ PASS | All docs in specifications-list.md traversed; grilling session completed (70 decisions) |

**No violations. Proceeding.**

---

## Project Structure

### Documentation (this feature)

```text
specs/013-schedule-builder/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   ├── trpc-procedures.md   ← tRPC procedure contracts
│   └── component-api.md     ← key component prop contracts
├── checklists/
│   └── requirements.md
└── tasks.md             ← Phase 2 output (via /speckit-tasks)
```

### Source Code

```text
# Backend — apps/server (new files only; existing structure unchanged)
apps/server/src/
├── routers/
│   ├── admin-leader/
│   │   ├── create-event.ts          [NEW] event creation procedure
│   │   ├── list-events.ts           [NEW] list events by ministry
│   │   ├── create-slot.ts           [NEW] single slot creation
│   │   ├── update-slot.ts           [NEW] slot time/label update
│   │   ├── delete-slot.ts           [NEW] single slot deletion
│   │   ├── generate-slots.ts        [NEW] auto-generation wizard
│   │   ├── send-reminder.ts         [NEW] reminder notifications
│   │   ├── list-audit-log.ts        [NEW] fetch audit entries for event
│   │   ├── list-role-templates.ts   [NEW] list ministry role templates
│   │   ├── upsert-role-template.ts  [NEW] create/update role template
│   │   ├── apply-role-template.ts   [NEW] apply template to all slots
│   │   └── delete-role-template.ts  [NEW] delete role template
│   └── admin-leader.ts              [MODIFY] register new procedures

# Schema — packages/db (new additions only)
packages/db/src/schema/
├── scheduling.ts         [MODIFY] add eventType enum + column, slot index
└── role-templates.ts     [NEW] roleTemplate table

# Frontend — apps/web (new files only; existing structure unchanged)
apps/web/src/
├── routes/
│   ├── scheduling.tsx                    [NEW] /scheduling layout route
│   ├── scheduling/
│   │   ├── index.tsx                     [NEW] event list page
│   │   └── events/
│   │       └── $eventId/
│   │           └── builder.tsx           [NEW] schedule builder page
├── features/
│   └── scheduling/
│       ├── components/
│       │   ├── event-list.tsx            [MODIFY] connect real data, add create modal
│       │   ├── quick-create-event-modal.tsx    [NEW]
│       │   ├── builder/
│       │   │   ├── schedule-builder.tsx        [NEW] top-level builder container
│       │   │   ├── builder-header.tsx          [NEW] header with actions
│       │   │   ├── builder-grid.tsx            [NEW] main assignment grid
│       │   │   ├── slot-row.tsx                [NEW] single slot row in grid
│       │   │   ├── requirement-cell.tsx        [NEW] single role/count cell
│       │   │   ├── assignment-chip.tsx         [NEW] assigned volunteer display
│       │   │   ├── suggestion-list.tsx         [NEW] passive suggestions in cell
│       │   │   ├── volunteer-pool-sidebar.tsx  [NEW] persistent sidebar
│       │   │   ├── volunteer-card.tsx          [NEW] single volunteer in sidebar
│       │   │   ├── assignment-picker.tsx       [NEW] on-demand picker popover
│       │   │   ├── override-dialog.tsx         [NEW] conflict override dialog
│       │   │   ├── substitution-picker.tsx     [NEW] declined-cell picker variant
│       │   │   ├── staffing-meter.tsx          [NEW] event-level + per-slot meter
│       │   │   ├── slot-edit-modal.tsx         [NEW] time/label edit modal
│       │   │   ├── slot-generate-wizard.tsx    [NEW] auto-generation wizard
│       │   │   ├── role-count-control.tsx      [NEW] inline +/- count buttons
│       │   │   ├── audit-log-panel.tsx         [NEW] audit log modal/panel
│       │   │   ├── mobile-interstitial.tsx     [NEW] mobile warning page
│       │   │   └── empty-builder-state.tsx     [NEW] no-slots empty state
│       └── hooks/
│           ├── use-schedule-builder.ts         [NEW] builder state + mutations
│           ├── use-volunteer-pool.ts           [NEW] sidebar filter + sort logic
│           └── use-auto-save.ts               [NEW] debounced auto-save + status
```

**Structure Decision**: Option 2 (Web + Server split). All builder UI under `apps/web/src/features/scheduling/components/builder/`. All new tRPC procedures under `apps/server/src/routers/admin-leader/`. No new packages — this feature is app-specific.

---

## Complexity Tracking

No constitution violations. No complexity justification needed.

---

## Phase 0: Research

See [research.md](./research.md) for full findings.

### Key Decisions Resolved

| Unknown | Decision | Rationale |
|---------|----------|-----------|
| Drag-and-drop library | **@dnd-kit/core + @dnd-kit/utilities** | Not yet installed. Spec F1 originally named it. Accessible, modular, React-first. No global event listener pollution. |
| Multi-fill cell (count > 1) | **N stacked chips per cell, single column** | Grilling Q53 decision: one column per role, stacked assignment slots within. Keeps grid width bounded. |
| Conflict badge coloring | **orange = double-booked, red = unavailable** | Matches existing `createAssignment` API response: `conflictReport.conflicts[].type`. |
| Auto-save strategy | **React Query `useMutation` + `onMutate` optimistic update; no extra debounce layer** | Each assignment action is already atomic. Status indicator driven by mutation `isPending` state. |
| Volunteer name format | **`vol.name ?? vol.userId` already returned by `getScheduleBuilderData`** | Backend already joins name. Frontend formats as `firstName + lastInitial` from the string. |
| shadcn components needed | **dialog, popover, badge, tooltip, progress, separator, scroll-area, command (already in AppShell), alert, context-menu** | @church/ui only has 8 components. Need to add ~9 more via `shadcn add`. |
| Role templates storage | **New `role_template` + `role_template_item` DB tables** | No existing infrastructure. Ministry-scoped (ministryId FK). |
| Event type (hourly vs day-based) | **New `event_type` enum + column on `event` table** | `'hourly' \| 'day_based'`. Drives slot row rendering in grid. Default: `'hourly'`. |
| Override reason validation | **Frontend: disabled button + char counter. Backend: existing `overrideReason` check already throws if empty** | Backend already validates non-empty. Frontend enforces 10-char minimum. |
| Mobile detection | **`useMediaQuery('(max-width: 1023px)')` + `navigator.maxTouchPoints`** | CSS media query for viewport; touch points to distinguish "forced desktop view" from true mobile. With "Continue anyway" button, never hard-blocks. |
