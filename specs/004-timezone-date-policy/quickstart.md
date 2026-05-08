# Quickstart: Timezone & Date Policy

## Summary
Implement a strict UTC-first policy for storage and calculation, with contextual local-time rendering on the frontend.

## Key Files to Create/Modify

### Backend
1. **DB Schema**: Update `packages/db/src/schema/*.ts` to use `timestamp(3, { withTimezone: true })`.
2. **Migration**: Run `bun run db:generate` and `bun run db:migrate`.
3. **Middleware**: Add UTC enforcement to `packages/api/src/trpc.ts`.

### Frontend
1. **Provider**: Create `apps/web/src/shared/components/TimezoneProvider.tsx`.
2. **Hook**: Create `apps/web/src/shared/hooks/useTimezone.ts`.
3. **Utility**: Update `apps/web/src/shared/utils/date.ts` to use `date-fns-tz`.

## Verification Steps
1. Create an event at 9:00 AM Church Time.
2. Verify it shows as 9:00 AM for all users regardless of their physical location (by default).
3. Toggle "User Time" and verify it shifts according to the browser's timezone.
4. Verify database contains `Z` indicator in timestamp strings.
