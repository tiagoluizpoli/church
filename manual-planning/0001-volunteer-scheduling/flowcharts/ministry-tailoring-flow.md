# Ministry Tailoring & Participation Flow

> **New for Spec 017 (2026-07-02).** After a cycle is locked, each ministry leader tailors their `MinistryParticipation` and fires availability. State machine: `tailoring → availability_fired → rostering → published`. See [`CONTEXT.md`](../../../CONTEXT.md), [ADR 0001](../../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../../docs/adr/0002-church-timeslots-ministry-shifts.md).

```mermaid
graph TD
    A[Cycle locked → visible to leader] --> B[Seed MinistryParticipation]
    B --> C{Ministry defaultDirection}
    C -->|all-in| D[Every slot pre-included<br>leader opts OUT of the few not needed]
    C -->|all-out| E[Nothing included<br>MinistryServingProfile force-ON standing blocks]
    D --> F[Confirm/adjust slot inclusions]
    E --> F
    F --> G[Split included TimeSlots into Shifts<br>equal-by-N or manual, within bounds]
    G --> H[Set headcount per Shift per Role/Team<br>SlotRequirements]
    H --> I[Fire availability checks<br>tailoring → availability_fired]
    I --> J[Spawn AvailabilityCheck per membership<br>notify volunteers - per cycle]

    J --> K[As confirmations arrive:<br>rostering]
    K --> L[Assign volunteers to Shifts<br>recency-ranked suggestions]
    L --> M{Completion % }
    M -->|below 100%| N[Publish anyway? confirm]
    M -->|100%| O[Publish roster]
    N --> O
    O --> P[published → volunteers see their slice<br>assignments flipped to pending]
```
