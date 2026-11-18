# HTTP API Contract: Scheduling Reshape

REST endpoints under `/api/v1`, served by raw Fastify controllers (016 pattern), Zod-validated DTOs, mapped to manager methods (single named-object inputs). Three surfaces: **ChurchAdmin** (`/admin/*` church-level), **Leader** (`/leader/*` participation-scoped), **Volunteer** (`/volunteer/*`). `churchId` and actor identity come from the authenticated session + RBAC middleware, not the path body. All list/read queries are church-isolated.

Conventions: `201` on create, `200` on read/update, `204` on state-only mutations, `409` on invariant conflicts (overlapping cycle, shift out of bounds, double-book), `403` on RBAC/scope violations, `422` on Zod failures.

## ChurchAdmin surface — Planning Cycles

| Method + Path | Manager method | Notes |
|---|---|---|
| `POST /admin/planning-cycles` | `IPlanningCycleManager.createCycle` | body `{ name, startDate, endDate }`; presets (week/month/quarter) computed client-side. `409` if range overlaps existing (FR-002). |
| `GET /admin/planning-cycles` | `IPlanningCycleManager.listCycles` | `?state=draft|locked|archived`. Drafts visible to admin only (FR-004). |
| `GET /admin/planning-cycles/:cycleId` | `IPlanningCycleManager.getCycle` | includes events + slots. |
| `POST /admin/planning-cycles/:cycleId/lock` | `IPlanningCycleManager.lockCycle` | `draft → locked`; events `draft → scheduled`; reveals to leaders (FR-005). `204`. |
| `POST /admin/planning-cycles/:cycleId/events/:eventId/reopen` | `IPlanningCycleManager.reopenEvent` | explicit reopen of a locked event; re-notifies fired participations (edge case). `204`. |

## ChurchAdmin surface — Event Templates & manual events

| Method + Path | Manager method | Notes |
|---|---|---|
| `POST /admin/event-templates` | `IEventTemplateManager.createTemplate` | body `{ name, weekday, blocks: [{ label, startTime, endTime, order }] }`. |
| `GET /admin/event-templates` | `IEventTemplateManager.listTemplates` | church-scoped. |
| `PATCH /admin/event-templates/:templateId` | `IEventTemplateManager.updateTemplate` | edit blocks/weekday. |
| `DELETE /admin/event-templates/:templateId` | `IEventTemplateManager.deleteTemplate` | |
| `POST /admin/planning-cycles/:cycleId/apply-templates` | `IEventManager.generateFromTemplates` | body `{ templateIds }` → one Event per matching date, one TimeSlot per block, seeds ministry participations from serving profiles (FR-008, FR-013). `201`. |
| `POST /admin/planning-cycles/:cycleId/events` | `IEventManager.createEvent` | manual dynamic/multi-day event (no template); linked to cycle of start date (FR-009). |
| `PATCH /admin/planning-cycles/:cycleId/events/:eventId` | `IEventManager.updateEvent` | draft only, or after reopen. |
| `POST /admin/events/:eventId/cancel` | `IEventManager.cancelEvent` | `→ cancelled`. `204`. |

## ChurchAdmin surface — Ministry Serving Profiles

> **Ownership (CL-PROFILE)**: the standing `MinistryServingProfile` is authored at the church-admin surface below; the ministry leader does **not** edit the standing profile — they confirm/tweak the *seeded participation* (leader surface) after cycle-lock.

| Method + Path | Manager method | Notes |
|---|---|---|
| `GET /admin/ministries/:ministryId/serving-profile` | `IParticipationManager.getServingProfile` | matrix of template blocks. |
| `PUT /admin/ministries/:ministryId/serving-profile` | `IParticipationManager.upsertServingProfile` | body: per-`sourceTemplateBlockId` `{ serves, shiftSplit, headcounts }` (BL-008 MVP matrix). |
| `PATCH /admin/ministries/:ministryId/default-direction` | `IMinistryManager.setDefaultDirection` | `{ defaultDirection: 'all_in' | 'all_out' }` (FR-013). |

## Leader surface — Participation tailoring

| Method + Path | Manager method | Notes |
|---|---|---|
| `GET /leader/cycles/:cycleId/participation` | `IParticipationManager.getParticipation` | leader's ministry slice of the locked cycle; pre-seeded inclusions/shifts/requirements. Creates lazily. |
| `PUT /leader/participations/:participationId/inclusions` | `IParticipationManager.setInclusions` | opt slots in/out (FR-012). |
| `POST /leader/participations/:participationId/slots/:timeSlotId/shifts` | `IParticipationManager.splitShifts` | body `{ strategy: {kind:'equal-n', n} | {kind:'manual', spans:[{startTime,endTime,label?}]} }`; bounds-enforced (FR-014). `409` if out of bounds. |
| `PATCH /leader/shifts/:shiftId` | `IParticipationManager.updateShift` | adjust bounds/label. |
| `DELETE /leader/shifts/:shiftId` | `IParticipationManager.deleteShift` | |
| `PUT /leader/shifts/:shiftId/requirements` | `IParticipationManager.upsertRequirement` | `{ roleId, teamId?, requiredCount, notes? }` per shift (FR-016). |
| `POST /leader/participations/:participationId/fire-availability` | `IAvailabilityCheckManager.fireAvailability` | `tailoring → availability_fired`; spawns one check per active membership; notifies once per cycle (FR-017, FR-027). `202`. |

## Leader surface — Rostering & publishing

| Method + Path | Manager method | Notes |
|---|---|---|
| `GET /leader/shifts/:shiftId/eligible-volunteers` | `IParticipationManager.listEligibleVolunteers` | ranked by availability then least-recent serving (FR-021). |
| `POST /leader/shifts/:shiftId/assignments` | `IAssignmentManager.createAssignment` | `{ volunteerId, roleId, teamId? }`; evaluates overlap via ministry `enforcementType` soft/hard (FR-023). `409` on hard conflict without override; `{ override: { reason } }` audits + proceeds. |
| `DELETE /leader/assignments/:assignmentId` | `IAssignmentManager.deleteAssignment` | reopens slot. |
| `GET /leader/participations/:participationId/completion` | `IParticipationManager.getCompletion` | assigned ÷ required (FR-022). |
| `POST /leader/participations/:participationId/publish` | `IParticipationManager.publish` | `rostering → published`; `{ confirmBelowFull?: true }` required if <100% (FR-024). Reveals slice to this ministry's volunteers only (FR-025). `204`. |
| `POST /leader/participations/:participationId/resend-availability` | `IAvailabilityCheckManager.resendReminder` | leader-resendable per-cycle reminder (FR-027). |
| `PATCH /leader/assignments/:assignmentId/reassign` | `IAssignmentManager.reassign` | mid-cycle change; notifies affected volunteers (FR-029). |

## Volunteer surface

| Method + Path | Manager method | Notes |
|---|---|---|
| `GET /volunteer/availability-checks` | `IVolunteerManager.listAvailabilityChecks` | one item per ministry/team membership for open cycles (FR-018). |
| `GET /volunteer/availability-checks/:checkId` | `IVolunteerManager.getAvailabilityCheck` | shifts shown available-by-default. |
| `PUT /volunteer/availability-checks/:checkId/marks` | `IVolunteerManager.setUnavailability` | body `{ shiftIds }` or `{ dates }` (whole-day helper); records only unavailability (FR-018). |
| `POST /volunteer/availability-checks/:checkId/confirm` | `IVolunteerManager.confirmAvailability` | `pending → confirmed` + `confirmedAt` even with zero marks; overlap policy per `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` — `409` block or confirm-and-flag (FR-019/020). |
| `GET /volunteer/schedule` | `IVolunteerManager.getPublishedSchedule` | assignments from **published** participations only (FR-025). |
| `POST /volunteer/assignments/:assignmentId/cancel` | `IVolunteerManager.cancelOwnAssignment` | own shifts only; `403` otherwise; notifies leader + reopens slot (FR-028). `204`. |
| `GET /volunteer/notifications` | `IVolunteerManager.getNotifications` | per-cycle (FR-027). |
| `PATCH /volunteer/notifications/:notificationId` | `IVolunteerManager.markNotificationRead` | |

## Removed endpoints (from 016)

- `GET/PUT/DELETE /admin/role-templates/*` and `POST /admin/events/:eventId/apply-template` — `RoleTemplate` deleted (R9 / BL-009).
- `POST /admin/events/:eventId/publish` — event-level publish removed; publish is per participation (R7).
- `PUT /volunteer/availability` free-span upsert — replaced by availability-check marks (R5).

## RBAC (FR-030, FR-031)

- **ChurchAdmin**: `/admin/planning-cycles/*`, `/admin/event-templates/*`, `/admin/ministries/*/serving-profile`, `default-direction`. Church-level.
- **Leader / sub-leader**: `/leader/*`, restricted to their own ministry's participation after cycle-lock (FR-031). Resolver maps `participationId`/`shiftId` → ministry via `MinistryParticipation`.
- **Volunteer**: `/volunteer/*`, own memberships/assignments only.
- One person may hold both ChurchAdmin and leader roles.
