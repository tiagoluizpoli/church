# Spec Q2: Performance Audit

## Purpose
Ensure the scheduling system remains fast even with thousands of volunteers and assignments.

## 1. Performance Targets
- **Bundle Size**: Main application JS bundle must be **< 250kb (gzipped)**.
- **LCP (Largest Contentful Paint)**: **< 2.0s** on a standard 4G connection.
- **TBT (Total Blocking Time)**: **< 100ms** for a high-utility, snappy feel.

## 2. DB & API Optimization
- **Indexing**: Composite indexes on `(church_id, ministry_id)` and `(church_id, volunteer_id)`.
- **API**: Use tRPC batching for dashboard loads.
- **Efficiency**: Verify that `AvailabilityEngine` can check 100 volunteers in **< 100ms**.

## 3. Frontend Optimization
- **Virtualization**: Use virtualization for lists exceeding 100 items (e.g., Volunteer Sidebar).
- **Layout**: Prevent layout thrashing during drag-and-drop operations in the Schedule Builder.
- **Offline**: Ensure immediate rendering of cached "Upcoming Shifts" via `localStorage`.

## 4. Mandatory Monitoring
- **Lighthouse**: Maintain a score of **90+** for the Volunteer Dashboard (Mobile).
- **CI Check**: Automated bundle size check on every PR.
