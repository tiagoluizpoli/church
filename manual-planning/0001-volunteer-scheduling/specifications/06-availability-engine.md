# Spec 06: Domain Service — Availability Engine

## Purpose
The heart of the scheduling logic. Calculates if a volunteer is available for a given time window based on blockouts, existing assignments, and ministry rules.

---

## 1. Input Context
- `church_id`: Isolation context.
- `volunteer_id`: The person to check.
- `time_range`: { start, end }.
- `exclude_assignment_id`: (Optional) Ignore a specific assignment (useful for editing existing ones).

## 2. Calculation Logic
1. **Check Blockouts**: Search the `Availability` table for overlapping `unavailable` records.
2. **Check Assignments**: Search the `Assignment` table for overlapping `confirmed` or `pending` records.
3. **Analyze Preferences**: (Future) Check if the volunteer has preferred service times.
4. **Determine Status**:
    - `AVAILABLE`: No conflicts.
    - `UNAVAILABLE`: Overlaps with a blockout.
    - `DOUBLE_BOOKED`: Overlaps with another assignment.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Test with various overlap scenarios (Full overlap, partial start, partial end, back-to-back).
- **Unit**: Verify that `is_all_day` blockouts cover the entire 00:00-23:59 period.
- **Unit**: Verify `exclude_assignment_id` correctly prevents a self-conflict during an update.
- **Edge Case**: Verify logic for shifts crossing midnight.
