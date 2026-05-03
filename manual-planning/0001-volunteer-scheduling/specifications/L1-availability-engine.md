# Spec L1: Availability Engine

## Purpose
Define the core business logic for calculating if a volunteer is available for a specific time slot.

## 1. Input Data
- `volunteerId`: The user being checked.
- `churchId`: Isolation context.
- `targetRange`: { start: Timestamp, end: Timestamp }.

## 2. Logic Flow
1. **Fetch Blockouts**: Get all `Availability` records for the volunteer where `type = 'unavailable'` and times overlap with `targetRange`.
2. **Fetch Existing Assignments**: Get all `Assignment` records for the volunteer in *any* ministry that overlap with `targetRange`.
3. **Analyze Multi-Day**: If the `targetRange` is an `all_day` slot, any blockout on that date triggers a conflict.
4. **Output Status**:
    - `AVAILABLE`: No blockouts, no assignments.
    - `UNAVAILABLE`: Overlaps with a blockout.
    - `DOUBLE_BOOKED`: Overlaps with another assignment.

## 3. Workload Balance (Fairness)
- Calculate `assignmentsInLast30Days`.
- If > `threshold` (from ministry settings), return a `WORKLOAD_WARNING` flag.

## 4. Testing Requirements (Mandatory)
- **Unit**: Test with various overlapping scenarios (Full overlap, Partial overlap, Back-to-back).
- **Unit**: Verify that `all_day` blockouts block the entire 24-hour period.
- **Edge Case**: Verify behavior for shifts that cross midnight.

## 🔗 References
- [Spec 06: Availability Engine](./06-availability-engine.md)
