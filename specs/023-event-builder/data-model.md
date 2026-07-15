# Phase 1 Data Model: Event Builder (Cycle-Centric)

**Feature**: `023-event-builder` | **Date**: 2026-07-14

This feature introduces **no new persisted entities and no schema migration**. It reads and mutates entities that already exist (Spec 017 reshape domain) and adds one derived boolean to an existing read view. All changes are new *read shapes*, one new *derived field*, new *manager/repository methods*, and one new *batched write path* over the existing publish rule.

## Existing entities used (read-only structure)

Per `CONTEXT.md` glossary and Spec 017. The builder treats slots/shifts/requirements as **fixed by tailoring** — it never writes them.

| Entity | Role in this feature | Written? |
|---|---|---|
| `PlanningCycle` | The unit the builder + publish operate over | No |
| `Ministry` | The team being staffed (one per builder session) | No |
| `Event` | Dated occasion in the cycle; a lane in the canvas | No |
| `MinistryParticipation` | Ministry's involvement in one event; carries `state` (`rostering`/`published`) + availability-fired status; the unit batched publish commits | **state only**, via publish |
| `TimeSlot` | Time window in an event; `included` per tailoring | No |
| `Shift` | Staffable block within an included slot | No |
| `SlotRequirement` | Roles × headcount a shift needs; read-only to builder | No |
| `Assignment` | Volunteer placed in a role on a shift; `status` ∈ draft/pending/confirmed/declined/cancelled | **Yes** (create / delete / reassign) |
| `AvailabilityCheck` | Volunteer's response for a shift (confirmed/pending/unavailable) | No (read for ranking) |
| `AssignmentAudit` | Record of an assignment change (actor/action/timestamp/reason) | Written as a side effect of assignment mutations (existing behavior) |

**Assignment mutations reuse the existing endpoints unchanged** (`createParticipationAssignment`, `deleteParticipationAssignment`, `reassignParticipationAssignment` on `LeaderRosteringController`) — this feature does not alter the write path for a single assignment, only the batched **read** and batched **publish**.

## Derived field addition (no migration)

### `availabilityFiredForAny` (R6)

A new **computed** boolean on the cycle tailoring status roll-up — not a stored column.

- **Source**: `aggregateCycleTailoringStatus` (`apps/server/src/domain/entities/ministry-participation.ts:80`) already computes `firedOrLaterCount`. Add `availabilityFiredForAny: eventCount === 0 ? false : firedOrLaterCount > 0` to `CycleTailoringStatusResult`.
- **Propagation chain** (each layer already carries `availabilityFiredForAll`; add the sibling field beside it):
  1. `CycleTailoringStatusResult` (`ministry-participation.ts:68`)
  2. `IMinistryParticipationRepository` cycle-summary view (`ministry-participation.repository.ts:105`)
  3. `IParticipationManager` view (`participation-manager.ts:141`)
  4. `participation.dto.ts` (`:123` schema, `:205` mapper)
  5. `apps/web` `TailoringCycleSummary` (`churchAPI.schemas.ts:1222`, orval-regenerated — do not hand-edit)
  6. `cycle-list.utils.ts:23`/`:95` view-model
- **Consumer**: `ministry-cycle-list.tsx` gates the new **Assign** button on `availabilityFiredForAny` instead of `availabilityFiredForAll`.

No other field changes. `touchedAt`, `state`, and `availabilityFiredForAll` are untouched.

## New read shape — cycle builder data (R1)

New DTO composing existing atomic schemas (new file `apps/server/src/api/dtos/cycle-builder.dto.ts`, or appended to `rostering.dto.ts`). Nesting: cycle → events → slots → shifts.

```ts
// each references existing schemas — no new leaf shapes
cycleBuilderShiftViewSchema = z.object({
  shift: shiftResponseSchema,                                   // participation.dto.ts
  requirements: z.array(shiftRequirementResponseSchema),        // participation.dto.ts
  assignments: z.array(assignmentResponseSchema),               // assignment.dto.ts — [] when none
  eligibleVolunteers: z.array(eligibleVolunteerResponseSchema), // rostering.dto.ts:14 — [] when published
});

cycleBuilderSlotViewSchema = z.object({
  slot: timeSlotResponseSchema,
  included: z.boolean(),
  shifts: z.array(cycleBuilderShiftViewSchema),
});

cycleBuilderEventViewSchema = z.object({
  participation: participationResponseSchema,  // carries state (rostering/published)
  event: eventResponseSchema,
  slots: z.array(cycleBuilderSlotViewSchema),
});

cycleBuilderResponseSchema = z.object({
  events: z.array(cycleBuilderEventViewSchema),
});
```

**Manager**: new `getCycleBuilderData({ churchId, cycleId, ministryId, userId })` on `IParticipationManager`.

**Repository**: two internal reads stitched in the handler/manager —
- **Query A** — church-isolated aggregation events → slots → shifts → requirements → existing assignments for `(ministryId, cycleId)`. Drizzle relational query API where it fits (R2).
- **Query B** — a **single batched** eligible-volunteers read over **all shifts at once** (not N+1), reusing the eligibility/availability logic behind `listEligibleVolunteers`; **skipped for published participations' shifts** (their `eligibleVolunteers: []`).

Both church-isolated per R2.

## New read shape — cycle audit (R5)

Reuses existing `auditListResponseSchema` (`{ items: assignmentAuditResponseSchema[] }`, fields `id, assignmentId, actorId, action, reason?, timestamp`). **No new DTO.**

- **Manager**: new `listAuditLogForCycle({ churchId, cycleId, ministryId })` on `IAssignmentManager`, beside existing `listAuditLog`.
- **Repository**: new `IAssignmentAuditRepository` method (`listByCycle(churchId, cycleId, ministryId)` or `listByAssignmentIds(...)`); today only `listByAssignment` exists. Church-isolated per R2.
- **Client**: `audit.assignmentId` joined against already-loaded builder assignments for `volunteerName` — no per-item name lookup.

## New write path — batched cycle publish (R7)

Applies the **existing** per-participation publish rule (below-full confirmation) atomically across every `MinistryParticipation` in `(cycleId, ministryId)`.

- **Body**: `{ confirmBelowFull?: boolean }` — same shape as existing `publishParticipationBodySchema`.
- **Manager**: new `publishCycle({ churchId, cycleId, ministryId, userId, confirmBelowFull })` on `IParticipationManager`, looping the existing publish domain logic over each participation.
- **Repository/transaction**: single `db.transaction()` over all participations (R2 mandates transactions for complex writes; publish is **all-or-nothing** — a half-published cycle is a worse state than a retryable failure).
- **Below-full semantics**: if any shift across the cycle is below required headcount and `confirmBelowFull` is not `true`, reject with the same below-full signal the per-participation publish returns, so the client shows the confirmation and re-calls with `confirmBelowFull: true`.
- **State**: each participation's `state` → `published`; assignment reassignment remains permitted afterward (FR-023).

## State transitions (unchanged domain rules)

```
MinistryParticipation.state:  rostering ──publish──▶ published
                                   ▲                     │
                                   └──(reassign allowed)──┘   (publish is not a lock)

Assignment.status: draft ─┬─▶ pending ─▶ confirmed
                          ├─▶ declined        (inactive — excluded from fairness/workload)
                          └─▶ cancelled       (inactive — excluded from fairness/workload)
```

Only `draft`/`pending`/`confirmed` count toward fairness/workload (R4/FR-017).

## Multi-tenant isolation (R2 / R8)

Every new query (builder read A+B, cycle audit, batched publish) filters by `churchId`. Mandatory integration coverage: a two-church (A/B) test proving each new repository method cannot read/write across `church_id`.
