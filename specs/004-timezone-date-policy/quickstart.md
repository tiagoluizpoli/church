# Quickstart: Timezone & Date Policy

## Summary
The system now follows a strict UTC-first policy for storage and calculation, with contextual local-time rendering on the frontend.

## Implementation Details

### Backend (Completed)
- **DB Schema**: All `timestamp` columns in `packages/db/src/schema/*.ts` have been migrated to `timestamp(3, { withTimezone: true })` (PostgreSQL `timestamptz`).
- **Middleware**: UTC enforcement is active in `packages/api/src/trpc.ts`, coercing all incoming date strings to UTC `Date` objects.

### Frontend (Completed)
- **Provider**: `apps/web/src/shared/components/TimezoneProvider.tsx` manages the current timezone context.
- **Hook**: `apps/web/src/shared/hooks/useTimezone.ts` provides access to the current timezone and toggle logic.
- **Utility**: `apps/web/src/shared/utils/date.ts` uses `date-fns-tz` for accurate conversions.
- **Toggle**: `apps/web/src/shared/components/TimezoneToggle.tsx` allows users to switch between "Church Time" and "User Time".

## Verification Steps
1. **Church Time**: Verify that events are displayed in the church's local timezone (e.g., "America/New_York").
2. **User Time**: Toggle to "User Time" and verify events shift to match your browser's local timezone.
3. **Database**: Inspect the database to ensure all timestamps are stored in UTC (e.g., `2024-05-08 23:45:00+00`).
4. **Consistency**: Run `bun run test` to ensure all availability matching logic passes its integration tests.
