# Planning Cycle Lifecycle

> **New for Spec 017 (2026-07-02).** The `PlanningCycle` is the church-scoped planning window (arbitrary non-overlapping date range, dates-only in church tz). Owned by the `ChurchAdmin`. See [`CONTEXT.md`](../../../CONTEXT.md), [ADR 0001](../../../docs/adr/0001-church-owned-events-and-planning-cycles.md).

```mermaid
stateDiagram-v2
    [*] --> draft: ChurchAdmin creates cycle (date range)

    draft --> draft: Apply EventTemplates / add dynamic Events / edit
    note right of draft
        Hidden from leaders & volunteers.
        Cycle ranges must not overlap (gaps OK).
        Events belong to the cycle of their start date.
    end note

    draft --> locked: ChurchAdmin locks (calendar complete)
    note right of locked
        Dates/times frozen and visible to Ministry Leaders.
        Append-only: admin may ADD Events after lock,
        editing/removing a locked Event needs an explicit reopen.
        Publishing is NOT here — it is per MinistryParticipation.
    end note

    locked --> archived: endDate passes (auto, church tz)
    archived --> [*]: read-only history
```
