# Scheduling Process Flow

> **Reshaped for Spec 017 (2026-07-02).** The end-to-end flow now runs church → cycle → ministry → volunteer. See [`CONTEXT.md`](../../../CONTEXT.md), [ADR 0001](../../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../../docs/adr/0002-church-timeslots-ministry-shifts.md), [refinement-02](../refinement-02-scheduling-reshape.md). The pre-017 single-event, ministry-owned flow is retired.

```mermaid
sequenceDiagram
    autonumber
    actor A as Church Admin
    actor L as Ministry Leader
    participant UI as Frontend App
    participant API as Fastify Backend
    actor V as Volunteer

    %% Phase 1 — Church Admin builds the cycle
    A->>UI: Create PlanningCycle (date range)
    UI->>API: POST /admin/planning-cycles
    A->>UI: Apply EventTemplate(s) (Sunday, Wednesday, …)
    UI->>API: Generate Events + TimeSlots for matching dates
    A->>UI: Add dynamic / multi-day Events manually
    A->>UI: Lock cycle (draft → locked)
    UI->>API: POST /admin/planning-cycles/:id/lock
    Note over API,L: Locked calendar becomes visible to Ministry Leaders

    %% Phase 2 — Ministry Leader tailors participation
    L->>UI: Open locked cycle for my ministry
    API-->>UI: Seed MinistryParticipation from MinistryServingProfile
    L->>UI: Confirm/adjust slot inclusions, then split TimeSlots into Shifts
    L->>UI: Set headcount per Shift (SlotRequirements)
    L->>UI: Fire availability checks (tailoring → availability_fired)
    UI->>API: Spawn AvailabilityChecks for memberships (pending)
    API->>V: Notification (per cycle): availability needed

    %% Phase 3 — Volunteer availability
    V->>UI: Open availability check (available by default)
    V->>UI: Mark unavailable per Shift (exceptions only)
    alt Overlap across ministries + FLAG off
        UI-->>V: Block confirm, force choose one
    else FLAG on
        UI-->>V: Warn, attach conflict for leaders
    end
    V->>UI: Confirm (pending → confirmed)
    UI->>API: Persist marks + confirmedAt

    %% Phase 4 — Leader rosters + publishes
    L->>UI: Open Schedule Builder (this participation)
    API-->>UI: Confirmed availability + recency-ranked suggestions
    L->>UI: Assign volunteers to Shifts (Drag/Click)
    alt Assignment conflict (per-ministry enforcement)
        API-->>UI: Warning (soft) or block (hard)
        L->>UI: Override with reason (audited)
    end
    Note over UI: Completion % rises toward 100%
    L->>UI: Publish roster (rostering → published)
    UI->>API: Flip this ministry's assignments → pending, notify its volunteers

    %% Phase 5 — Live execution
    V->>UI: (Emergency) Cancel my assignment on a Shift
    UI->>API: Reopen slot, notify leader ASAP
    L->>UI: Reassign / adjust mid-cycle
```
