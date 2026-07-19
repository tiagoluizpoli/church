# API Contracts: Event Builder (Cycle-Centric)

**Feature**: `023-event-builder` | **Date**: 2026-07-14

Three new endpoints on `LeaderRosteringController` (`apps/server/src/api/controllers/leader-rostering-controller.ts`), plus one derived-field addition to the existing tailoring cycle-summary read. All follow the controller's established Fastify + Zod-DTO + RBAC-guard pattern; all responses/bodies use named Zod schemas (constitution II & VII). RBAC: `rbacGuard.canManageMinistry({ churchId, ministryId, userId })` — identical to `getCycleParticipation`. The `apps/web` client consumes them via **orval-regenerated** typed functions (do not hand-edit generated files).

Base path: `/api/v1`.

---

## 1. `GET /leader/cycles/:cycleId/builder` — getCycleBuilderData (R1)

Single batched read that replaces the three legacy builder load calls.

**Query**: `ministryId` (required)
**Path**: `cycleId`
**RBAC**: `canManageMinistry`

**Response 200** — `cycleBuilderResponseSchema`:

```jsonc
{
  "events": [
    {
      "participation": { /* participationResponseSchema — includes state: "rostering" | "published" */ },
      "event": { /* eventResponseSchema */ },
      "slots": [
        {
          "slot": { /* timeSlotResponseSchema */ },
          "included": true,
          "shifts": [
            {
              "shift": { /* shiftResponseSchema */ },
              "requirements": [ /* shiftRequirementResponseSchema[] */ ],
              "assignments": [ /* assignmentResponseSchema[] — [] when none */ ],
              "eligibleVolunteers": [ /* eligibleVolunteerResponseSchema[] */ ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Notes**: uniform shape for every shift (no special-casing zero-assignment shifts); published participations retain eligible volunteers so reassignments remain available. `eligibleVolunteerResponseSchema` already carries `isAvailable`/`hasConflict`/`lastServedAt` used by the ranking (R4).

**Errors**: `403` (RBAC), `404` (`NotFoundError` — cycle/ministry not in caller's church).

---

## 2. `GET /leader/cycles/:cycleId/audit` — getCycleAuditLog (R5)

Batched cycle-wide audit read; replaces the client's per-assignment `Promise.all` N+1.

**Query**: `ministryId` (required)
**Path**: `cycleId`
**RBAC**: `canManageMinistry`

**Response 200** — existing `auditListResponseSchema` (no new DTO):

```jsonc
{
  "items": [
    { "id": "…", "assignmentId": "…", "actorId": "…", "action": "…", "reason": "…?", "timestamp": "…" }
  ]
}
```

**Notes**: `volunteerName` is NOT returned — the client joins `assignmentId` against already-loaded builder assignments. Lazy: called only when the audit panel opens. The existing per-assignment `GET /admin/assignments/:assignmentId/audit` stays and is untouched.

**Errors**: `403`, `404`.

---

## 3. `POST /leader/cycles/:cycleId/publish` — publishCycle (R7)

Batched, atomic publish of every `MinistryParticipation` in `(cycleId, ministryId)`.

**Query**: `ministryId` (required)
**Path**: `cycleId`
**RBAC**: `canManageMinistry`

**Body** — `publishCycleBodySchema` (mirrors existing `publishParticipationBodySchema`):

```jsonc
{ "confirmBelowFull": false }
```

**Response 200** — `publishCycleResponseSchema` (per-participation outcome + below-full signal):

```jsonc
{
  "published": true,
  "belowFull": false,
  "participations": [
    { "participationId": "…", "state": "published", "requiredCount": 12, "assignedCount": 12 }
  ]
}
```

**Below-full flow**: if any shift is below required headcount and `confirmBelowFull !== true`, respond with `published: false, belowFull: true` (and the shortfall summary) — **no state change**. The client shows the below-full confirmation and re-calls with `confirmBelowFull: true`.

**Atomicity**: single `db.transaction()` over all participations — all-or-nothing (R2). Publish does not lock the cycle: reassignment endpoints remain usable afterward.

**Errors**: `403`, `404`, `409` (below-full without confirmation is a `200` with `belowFull: true`, not an error — matches existing publish ergonomics).

---

## 4. Derived-field addition — `availabilityFiredForAny` (R6)

**Not a new endpoint.** Adds one computed boolean to the **existing** tailoring cycle-summary response the ministry-cycle list already fetches (`participation.dto.ts` schema at `:123`, mapper at `:205`), sourced from `aggregateCycleTailoringStatus`'s already-computed `firedOrLaterCount` (`> 0`, with `eventCount === 0 ⇒ false`). Sibling to the existing `availabilityFiredForAll`. Surfaces on `apps/web`'s `TailoringCycleSummary` after orval regen; consumed by `ministry-cycle-list.tsx` to gate the **Assign** button.

**Contract delta** (additive, non-breaking):

```diff
  {
    "availabilityFiredForAll": false,
+   "availabilityFiredForAny": true
  }
```
