# Church-owned Events and Planning Cycles

## Status

accepted

## Context

The original model made every `Event` belong to exactly one `Ministry` (`Event.ministryId`), and scheduling was driven one event at a time. In practice a church plans a whole period at once, a single dated gathering (a Sunday service) is served by *many* ministries simultaneously, and each ministry needs different slots and headcounts on that same shared date. The per-ministry, singular-event model could not represent "one locked church date, many ministries tailoring it" as an invariant.

## Decision

- **Events are owned by the Church, not by a Ministry.** `Event.ministryId` is removed. A shared, church-owned Event carries the canonical dates/times.
- **A `PlanningCycle` aggregate** (church-scoped, arbitrary non-overlapping date range, boundaries evaluated as dates-only in the church timezone) is the planning unit and the parent of a period's Events. Its `draft → locked` transition is the church-level publish that hands the calendar to ministry leaders. An Event belongs to the cycle of its start date and may leak past that cycle's end.
- **All per-ministry state moves to a new `MinistryParticipation` aggregate** — one per `(Ministry, Event)` — which holds that ministry's opted-in TimeSlots (stored as inclusions), its `SlotRequirement`s, its `AvailabilityCheck`/roster lifecycle, and its own publish state. `Assignment` and `SlotRequirement` are scoped to a participation.

## Consequences

- "Published" leaves the Event entirely; publishing is per `MinistryParticipation`, so different ministries on the same Sunday go live independently.
- Existing entities take breaking changes (`Event` loses `ministryId`; `Availability`, `Assignment`, `SlotRequirement` reshape). This is landed as a new spec (017) on top of the completed 016 clean-architecture refactor, not folded into it.
- Future readers seeing a church-owned `Event` with no ministry link should look here and at `MinistryParticipation` — the ministry relationship is deliberately indirect.
