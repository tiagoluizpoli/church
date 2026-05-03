# Spec S4: Timezone & Date Policy

## Purpose
Ensure all dates and times across the scheduling platform are managed consistently, preventing timezone-related bugs.

## Core Rules
1. **Persistence (Database)**: All timestamps must be stored exclusively in `UTC` (`timestamp with time zone` in PostgreSQL).
2. **Backend Services (tRPC/Fastify)**: Must handle all internal calculations in UTC.
3. **Presentation Layer (Frontend)**: Must convert UTC to the user's local timezone (or the Church's specified timezone) *only* at the presentation layer using standard browser APIs or a lightweight library (e.g., `date-fns-tz`).
4. **Availability Matching**: When checking volunteer availability against event slots, the system must perform intersection logic exclusively in UTC to avoid daylight saving or cross-timezone edge cases.
