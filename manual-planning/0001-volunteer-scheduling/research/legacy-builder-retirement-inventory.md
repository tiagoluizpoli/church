# Legacy Builder Retirement Inventory

> Research asset for the **Event Builder (cycle-centric)** wayfinder map ([#1](https://github.com/tiagoluizpoli/church/issues/1)),
> resolving [Legacy builder retirement inventory (#5)](https://github.com/tiagoluizpoli/church/issues/5).
>
> The retire-vs-reuse **call is already locked** in the map's Notes: reuse the non-event-shaped
> presentational components, rebuild what's structurally tied to the per-event grid, retire the
> legacy entry points. This document is the concrete inventory + cutover ordering that the eventual
> `spec.md` → `plan.md` → `tasks.md` pipeline will reference. It changes no app code.

All paths are under `apps/web/`.

---

## 1. Component inventory — `src/features/scheduling/components/builder/`

Classification per the map's locked component-reuse decision:

- **reuse-as-is** — presentational, not event-shaped; drops into the new canvas unchanged.
- **reuse-with-rewiring** — keep the component, but its data source / props change (pool is now cycle-wide, not per-event).
- **rebuild** — structurally tied to the per-event grid; rebuilt for the whole-cycle canvas.
- **delete** — F1 slot-management / auto-generation surface; that job now lives entirely in the tailoring workspace, never ported.

### reuse-as-is (7 source + 5 test)

| File | Note |
|---|---|
| `assignee-identity-badge.tsx` | Pure identity badge. |
| `assignment-chip.tsx` + `assignment-chip.component.test.tsx` | Presentational assignment chip (`ConfirmationStatus`/`ConflictStatus`). |
| `audit-log-panel.tsx` | `AuditLogPanel`. **Fog:** map's "Not yet specified" flags whether it needs a real audit-trail read endpoint or keeps consuming already-fetched assignment data. Reuse the shell either way. |
| `override-dialog.tsx` + `override-dialog.component.test.tsx` | `ConflictOverrideDialog` — override-reason capture. |
| `staffing-meter.tsx` + `staffing-meter.component.test.tsx` | `StaffingMeter` — assigned/required progress. |
| `suggestion-list.tsx` + `suggestion-list.component.test.tsx` | `SuggestionList` — ranked-volunteer suggestions. |
| `volunteer-card.tsx` + `volunteer-card.component.test.tsx` | Presentational volunteer card. |

### reuse-with-rewiring (3 source + 1 test)

| File | Rewiring needed |
|---|---|
| `assignment-picker.tsx` | `PickerVolunteer` picker for a cell. Pool source becomes the cycle-wide eligible-per-shift list from the new batched endpoint ([#2](https://github.com/tiagoluizpoli/church/issues/2)) instead of a per-event `listEligibleVolunteers` fan-out. |
| `substitution-picker.tsx` + `substitution-picker.component.test.tsx` | Reassign/substitution picker. Same cycle-wide pool rewiring. |
| `role-count-control.tsx` + `role-count-control.component.test.tsx` | Widget is the reusable "RoleCountControl-style bits" the map names. **But** its only current use-site is inline headcount *editing* in `slot-row.tsx`, and the builder no longer edits headcounts (that's tailoring). Keep it only if reused read-only as a staffing stepper display; otherwise it goes with `slot-row`. Flagged tension — decide in the canvas-layout ticket. |

### rebuild (10 source + 3 test)

Everything below references `eventId` and/or the per-event grid structure directly.

| File | Note |
|---|---|
| `schedule-builder.tsx` | Root; takes an `eventId` prop, calls `useScheduleBuilder(eventId)`. Becomes the cycle canvas root (`ministryId` + `cycleId`). |
| `schedule-builder-ready.tsx` | Event-scoped composition wiring all sub-components + controller. |
| `builder-grid.tsx` + `builder-grid.component.test.tsx` | `BuilderGrid` — named in the map's rebuild list. Emits `data-testid="builder-grid"` (asserted by e2e — see §3). |
| `slot-row.tsx` | Per-slot grid row (imports `RoleCountControl`). Rebuilt as an assignment row; inline-edit path dropped. |
| `builder-header.tsx` | Event header (`eventId`). |
| `empty-builder-state.tsx` + `empty-builder-state.component.test.tsx` | Event empty state (`eventId`); rebuild for cycle-empty. |
| `requirement-cell.tsx` + `requirement-cell.component.test.tsx` | Grid requirement cell (`eventId`). |
| `builder-types.ts` | Grid view types; re-derive for the cycle shape. |
| `use-schedule-builder-controller.ts` + `use-schedule-builder-controller.types.ts` | `use-schedule-builder-controller` — named in the map's rebuild list. Drop the `useSlotManagement` dependency (§delete). |
| `use-schedule-builder-derived-data.ts` | Event-grid derived data; re-derive for cycle. |
| `volunteer-pool-sidebar.tsx` + `volunteer-pool-sidebar.component.test.tsx` | `VolunteerPoolSidebar` — named in the map's rebuild list. **Fog:** map flags whether cross-event/cross-slot search+filter changes now the pool spans a cycle. |

### delete (5 source + 2 test)

F1 slot-management / auto-generation — not ported (out of scope; tailoring owns slots/shifts/headcounts). Plus the mobile interstitial, superseded by real mobile parity.

| File | Note |
|---|---|
| `slot-edit-modal.tsx` + `slot-edit-modal.component.test.tsx` | Slot editing modal. |
| `slot-generate-wizard.tsx` + `slot-generate-wizard.component.test.tsx` | Auto-generation wizard. |
| `use-slot-management.ts` + `use-slot-management.unit.test.ts` | Slot-management hook (imported by `use-schedule-builder-controller` — sever that import on rebuild). |
| `time-segment-input.tsx` | Time input; sole use-site is `slot-edit-modal.tsx`. Dies with it. |
| `mobile-interstitial.tsx` | **Decided:** the new canvas is genuinely responsive, so the desktop-first "continue anyway" interstitial (currently rendered by `schedule-builder.tsx`) is deleted, not reused. Overrides the stale `MobileInterstitial` mention in the map's reuse list. The canvas-layout prototype ticket must cover mobile. |

---

## 2. Route inventory

### Legacy routes to delete

| Route file | Route | Fate |
|---|---|---|
| `src/routes/scheduling/events/$eventId/builder.tsx` | `/scheduling/events/$eventId/builder` | Delete. Renders `<ScheduleBuilder eventId={…} />`. Directory `events/$eventId/` likely empties — remove if so. |
| `src/routes/scheduling/builder-events.tsx` | `/scheduling/builder-events` | Delete. Renders `<EventList>` (the legacy "which event to roster" list). |
| `src/routes/scheduling/rostering/$cycleId/$ministryId/$participationId.tsx` | `/scheduling/rostering/$cycleId/$ministryId/$participationId` | Delete. The orphaned per-`participationId` `RosterBuilderPage`, superseded by the new ministry-first `/scheduling/rostering/$ministryId/$cycleId`. Still fans out `getScheduleBuilderData` per-event + `listEligibleVolunteers` per-shift + single-participation `publishParticipation` — exactly what the new batched endpoints replace. |

### Feature component to delete (backing the legacy route)

| File | Note |
|---|---|
| `src/features/scheduling/components/event-list.tsx` + `event-list.component.test.tsx` | `EventList` — only consumer is `builder-events.tsx`; links each row to `/scheduling/events/$eventId/builder`. Dies with both. |

### Entry points / redirects that currently target `/scheduling/builder-events` (must repoint, else they 404 after deletion)

| Location | Current | Change |
|---|---|---|
| `src/features/scheduling/components/tailoring/ministry-cycle-list.tsx:301` | `<Link to="/scheduling/builder-events" search={{ ministryId }}>` "Builder Events" | **The real entry point.** Repoint to `/scheduling/rostering/$ministryId/$cycleId`. Keep today's gating: link only when `cycle.availabilityFiredForAll`, else disabled button with `BUILDER_EVENTS_LOCKED_REASON`. **Fog:** map flags exact copy/label + whether gating stays. |
| `src/routes/scheduling/index.tsx:5` | `throw redirect({ to: '/scheduling/builder-events' })` | Repoint the scheduling-index default landing. |
| `src/routes/scheduling/planning-cycles.tsx:22` | `redirect({ to: '/scheduling/builder-events', throw: true })` | Repoint. |
| `src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx:616` | `<Link to="/scheduling/builder-events">` | Repoint (or drop if the new canvas is reached only via the cycle list). |

---

## 3. Tests exercising the legacy flow

CI-breakers if the routes/components/endpoint vanish without migrating these.

### E2E (`apps/web/tests/scheduling/`)

| Spec | What it hits | Action |
|---|---|---|
| `a11y-builder.spec.ts` | Opens `/scheduling/events/<seed>/builder`; asserts `data-testid="builder-grid"` visible; runs axe. | Rewrite to open the new cycle route; preserve/rename the grid testid. |
| `smoke.spec.ts` | Same legacy builder URL ("grid, pool, slot row, publish"); second test "event list lets a leader reach the builder" navigates via `EventList`. | Rewrite both: new route + new entry-point navigation via the cycle list. |
| `planning-role-guards.spec.ts:37-44` | Leader can `goto('/scheduling/builder-events')` and stay. | Repoint assertion to the new route. |
| `planning-role-guard-matrix.spec.ts:14-29` | Volunteer denied at `/scheduling/builder-events`. | Repoint assertion to the new route. |
| `us2-leader-tailor.spec.ts:66-76` | `GET ${SERVER_URL}/api/v1/admin/schedule-builder` (legacy endpoint). | Migrate to the new batched cycle-builder endpoint ([#2](https://github.com/tiagoluizpoli/church/issues/2)). |

### Component/unit tests

All `*.component.test.tsx` / `*.unit.test.ts` siblings in the builder dir follow their component's fate (see §1): reuse tests survive, rebuild tests are rewritten, delete tests are removed (`slot-edit-modal`, `slot-generate-wizard`, `use-slot-management`). `event-list.component.test.tsx` is deleted with `EventList`.

> **Note (likely a follow-on backend ticket, flagged not owned here):** the legacy `GET /admin/schedule-builder` endpoint and single-participation `publishParticipation` path stay reachable until nothing calls them. Retiring them server-side is downstream of this frontend cutover and of the new batched read ([#2](https://github.com/tiagoluizpoli/church/issues/2)) + the not-yet-ticketed cycle-wide publish endpoint.

---

## 4. Recommended cutover / retirement ordering

Ship additively behind the new route, repoint entry points, then delete — CI stays green throughout.

1. **Land the new backend surface first** — batched cycle-builder read ([#2](https://github.com/tiagoluizpoli/church/issues/2)) and the cycle-wide batched Publish endpoint (still fog on the map). No UI depends on legacy removal yet.
2. **Build the new canvas at the new route** `/scheduling/rostering/$ministryId/$cycleId`: rebuild `BuilderGrid` / `VolunteerPoolSidebar` / `use-schedule-builder-controller` for the whole-cycle shape; compose in the reuse-as-is presentational bits; rewire the pickers to the cycle-wide pool. Legacy routes stay live and untouched — new route is purely additive.
3. **Repoint the entry point:** `ministry-cycle-list.tsx` "Builder Events" link → new route, preserving `availabilityFiredForAll` gating (resolve the copy/gating fog first).
4. **Repoint the stragglers:** `scheduling/index.tsx`, `planning-cycles.tsx`, and `tailoring/$ministryId/$cycleId.tsx` redirects/links off `/scheduling/builder-events`.
5. **Migrate the e2e specs** (§3) to the new route + entry point + endpoint — do this *with* step 3/4 so CI never asserts a dead route.
6. **Delete legacy routes + backing component:** `events/$eventId/builder.tsx`, `builder-events.tsx`, the orphaned `$participationId` route, and `event-list.tsx` (+ its test). Remove now-empty route dirs.
7. **Delete the unported builder files** (§1 delete): `slot-edit-modal`, `slot-generate-wizard`, `use-slot-management`, `time-segment-input` (+ tests); sever the `useSlotManagement` import during the step-2 rebuild.
8. **(Downstream, likely its own ticket)** retire the server-side `/admin/schedule-builder` read and single-participation publish once no client references remain.

The map is planning-only: this ordering is the input to `tasks.md`, not a change to execute now.
