# Church TimeSlots vs Ministry Shifts

## Status

accepted

## Context

A single church Event (e.g. a long all-day event) is staffed differently by different ministries — projection might split it into two 4-hour blocks, kids into four 2-hour blocks. If the staffing unit were the shared, church-owned `TimeSlot`, two ministries could not subdivide the same slot independently.

## Decision

- **`TimeSlot` is church-level** — the shared service block or overall span that ministries opt into or out of. It is identical for every ministry.
- **`Shift` is the per-ministry subdivision** of a `TimeSlot`, living inside a `MinistryParticipation`. Each ministry splits a slot into the pieces it actually staffs; the default is a single `Shift` equal to the whole `TimeSlot` (no split).
- **`SlotRequirement`, `Assignment`, and `Availability` marks all attach to a `Shift`, not the `TimeSlot`.** Availability's atomic unit is therefore the `Shift`, which is also what expresses partial availability (serve the first block, not the second).
- **A `Shift` must lie entirely within its parent `TimeSlot`** — a domain invariant, also guarded by the creation form. Shifts are created either by equal division into N parts or by manual (possibly unequal) times. The manual-entry UX (timeline drag, granular picker) is left as an open 017 design question.

## Consequences

- Two ministries can split the same Event differently without collision.
- A future reader seeing assignments/requirements/availability keyed to `Shift` rather than the shared `TimeSlot` should look here: the church defines the coarse shared slot, each ministry owns the fine subdivision.
- Kept deliberately minimal for MVP — the standalone `RoleTemplate` count-preset was dropped; per-Shift counts come from the `MinistryServingProfile` (recurring) or manual entry (dynamic events).
