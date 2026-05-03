# Spec Q2: Performance Audit

## Purpose
Ensure the scheduling system remains fast even with thousands of volunteers and assignments.

## 1. DB Indexing
- Ensure composite indexes on `(church_id, ministry_id)` and `(church_id, volunteer_id)`.
- Index the `start_time` and `end_time` columns for efficient range queries in the `AvailabilityEngine`.

## 2. API Optimization
- Use tRPC batching for dashboard loads.
- Ensure the `getScheduleBuilderData` endpoint doesn't perform "N+1" queries by using proper Drizzle joins.

## 3. Frontend Optimization
- Virtualize the volunteer list in the Sidebar if it exceeds 100 items.
- Ensure the drag-and-drop interactions don't trigger layout thrashing.

## 4. Testing Requirements (Mandatory)
- **Benchmark**: Verify that `AvailabilityEngine` can check 100 volunteers in < 100ms.
- **Lighthouse**: Verify a score of 90+ for the Volunteer Dashboard (Mobile).
