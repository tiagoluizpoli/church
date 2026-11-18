# Availability Check Flow

> **New for Spec 017 (2026-07-02).** How a volunteer answers an `AvailabilityCheck` (one per `(PlanningCycle, MinistryVolunteer membership)`). Available by default; marks are per-`Shift` exceptions; a confirm gate is mandatory. Cross-ministry overlap is governed by a global flag. See [`CONTEXT.md`](../../../CONTEXT.md), [ADR 0002](../../../docs/adr/0002-church-timeslots-ministry-shifts.md).

```mermaid
graph TD
    A[Notification per cycle: availability needed] --> B[Open list: one item per ministry/team membership]
    B --> C[Open a check → calendar + Shifts for the cycle]
    C --> D{Can serve everything?}
    D -->|Yes| E[Leave all as available default]
    D -->|No| F[Mark unavailable per Shift<br>whole-day helper = mark all Shifts that date]
    E --> G[Tap Confirm]
    F --> G

    G --> H{Overlap across my other<br>ministries' checks, same date?}
    H -->|No overlap| K[pending → confirmed + confirmedAt]
    H -->|Overlap + FLAG_ALLOW_OVERLAP off| I[Block: choose one commitment]
    H -->|Overlap + FLAG on| J[Warn + attach conflict for leaders]
    I --> F
    J --> K
    K --> L[Leader sees me as available to roster]

    L --> M[[After publish: I can cancel my own<br>assigned Shift in an emergency → notify leader]]
```
