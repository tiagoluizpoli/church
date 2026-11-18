# Research: Timezone & Date Policy

## Decision: UTC-Aware Storage & Contextual Presentation

### 1. Persistence Layer (Drizzle/PostgreSQL)
- **Decision**: All `timestamp` columns will be migrated to `timestamp(3, { withTimezone: true })` (stored as `timestamptz` in Postgres).
- **Rationale**: `timestamptz` stores absolute UTC time but is aware of the session offset. This is the gold standard for avoiding DST bugs.
- **Affected Files**:
  - `packages/db/src/schema/auth.ts`
  - `packages/db/src/schema/scheduling.ts`
  - `packages/db/src/schema/core.ts`
  - `packages/db/src/schema/assignments.ts`
  - `packages/db/src/schema/church.ts`
  - `packages/db/src/schema/onboarding.ts`

### 2. Backend Layer (tRPC/Zod)
- **Decision**: Use a global tRPC middleware to enforce `Zod.date()` validation that coerces ISO strings to UTC `Date` objects.
- **Rationale**: Ensures the domain logic always receives absolute time.
- **Library**: `date-fns` for internal calculations.

### 3. Presentation Layer (Vite/React CSR)
- **Decision**: Centralize timezone logic in a `TimezoneProvider` using `date-fns-tz`.
- **Display Modes**:
  - `Church Time`: Formatted using the `church.timezone` IANA string.
  - `User Time`: Formatted using `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Toggle**: Transient state managed by a `useTimezone` hook.

### 4. IANA Timezone Management
- **Decision**: Add an explicit `timezone` field (text) to the `Church` table.
- **Default**: `UTC` (for existing records during migration).
- **Validation**: Use Zod to validate that the string is a valid IANA timezone name.

## Alternatives Considered
- **Keeping `timestamp` (without timezone)**: Rejected because it relies on the database's configured local time, which is error-prone in distributed or multi-tenant environments.
- **Storing offsets instead of IANA names**: Rejected because offsets change with DST; IANA names (e.g., `America/New_York`) handle transitions automatically.
