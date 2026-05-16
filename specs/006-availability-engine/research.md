# Research: Availability Engine

## Algorithm: Time Interval Overlap

**Context**: The engine must evaluate if a given `time_range` (start A, end A) conflicts with multiple existing blocks (start B, end B).

**Decision**: Native TypeScript mathematical comparison using UNIX epoch timestamps (milliseconds).
**Rationale**: `Math.max(A.start, B.start) < Math.min(A.end, B.end)` is the standard, O(1) mathematical formulation to detect overlapping intervals. Using `Date.getTime()` ensures pure, dependency-free overlap detection.
**Alternatives considered**: 
- `date-fns` `areIntervalsOverlapping`: Good, but adds an external dependency to a pure domain service. Native math is faster and simpler.

## Handling `is_all_day` Blockouts

**Context**: Blockouts can be flagged as `is_all_day`. The engine receives UTC dates, but an all-day blockout means 00:00 to 23:59 in the *user's local timezone*.

**Decision**: The engine assumes `is_all_day` records have ALREADY been normalized to strict UTC `[start, end]` ranges by the persistence/infrastructure layer before reaching the engine, OR the domain entities pass explicit ISO strings. Since this is a pure domain service, it should NOT know about timezones.
**Rationale**: Timezone rules (Spec S4) belong at the edge (infrastructure or API). The `AvailabilityEngine` will treat all inputs as strict UNIX timestamps. If `is_all_day` is true, the `start` and `end` on the `Blockout` entity passed into the engine *must already represent the exact bounds*.
**Alternatives considered**: Passing a timezone string to the engine and using `date-fns-tz`. Rejected because it violates the pure DDD approach (timezone manipulation is an infrastructure concern).

## Adjacency vs Overlap

**Context**: Does a shift starting exactly at 9:00 AM conflict with a blockout ending exactly at 9:00 AM?

**Decision**: Strict inequality (`<` and `>`) will be used, not `<=`. Adjacency is NOT an overlap.
**Rationale**: It is physically possible for a volunteer to finish a blockout at 9:00 AM and start a shift at 9:00 AM.
