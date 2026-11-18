# Shift Generation Flow

> **Reshaped for Spec 017 (2026-07-02).** "Slot generation" split in two: (1) church-level **Event/TimeSlot** generation from `EventTemplate`s — see [template-generation-flow.md](./template-generation-flow.md); (2) per-ministry **`Shift`** creation inside a `MinistryParticipation`, shown here. `RoleTemplate` is removed; per-Shift counts seed from the `MinistryServingProfile` or are set manually. See [ADR 0002](../../../docs/adr/0002-church-timeslots-ministry-shifts.md).

```mermaid
graph TD
    A[Leader opens an included TimeSlot<br>in their MinistryParticipation] --> B{Split the TimeSlot into Shifts?}
    B -->|No split| C[One Shift = whole TimeSlot]
    B -->|Equal by count| D[Enter N → divide span into N equal Shifts]
    B -->|Manual| E[Set Shift start/end by hand<br>unequal allowed]

    D --> F{Each Shift within TimeSlot bounds?}
    E --> F
    F -->|No| E
    F -->|Yes| G[Shifts created]
    C --> G

    G --> H[Set headcount per Shift per Role/Team<br>SlotRequirements]
    H --> I{Counts from MinistryServingProfile?}
    I -->|Recurring event| J[Seeded automatically → confirm/tweak]
    I -->|Dynamic event| K[Copy from a profile block or enter manually]
    J --> L[Requirements saved under this participation]
    K --> L
```
