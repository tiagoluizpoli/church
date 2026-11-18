# Event Template Generation Flow

> **New for Spec 017 (2026-07-02).** How a ChurchAdmin's `EventTemplate` (weekday + ordered `TimeBlock`s) materialises a cycle's recurring Events. Each generated `TimeSlot` records `sourceTemplateBlockId`, which is the hinge a `MinistryServingProfile` matches on to auto-seed inclusions. See [`CONTEXT.md`](../../../CONTEXT.md), [ADR 0001](../../../docs/adr/0001-church-owned-events-and-planning-cycles.md).

```mermaid
graph TD
    A[ChurchAdmin selects a locked-target PlanningCycle] --> B[Choose EventTemplate<br>e.g. Sunday: 08:00, 10:30, 18:30]
    B --> C[Find every date in cycle range<br>matching the template weekday]
    C --> D[For each matching date:<br>create one church-owned Event<br>eventType = hourly]
    D --> E[For each TimeBlock:<br>create one TimeSlot with sourceTemplateBlockId]
    E --> F{More templates?<br>e.g. Wednesday}
    F -->|Yes| B
    F -->|No| G[Add dynamic / multi-day Events manually<br>no template, no seed]
    G --> H[Cycle draft populated → ready to lock]

    E -.->|sourceTemplateBlockId| I[[MinistryServingProfile seeding<br>see ministry-tailoring-flow]]
```
