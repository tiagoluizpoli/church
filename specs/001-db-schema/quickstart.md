# Quickstart: Database Schema (Phase 1)

This guide provides the steps to implement and apply the Phase 1 Database Schema using Drizzle ORM.

## 1. Schema Definitions
The schema will be defined in `packages/database/src/schema/`. 
To maintain organization, divide the schema into logical files:
- `core.ts` (Church, Ministry, Team, Role, Volunteer, MinistryVolunteer)
- `scheduling.ts` (Event, TimeSlot, SlotRequirement)
- `assignments.ts` (Availability, Assignment, AssignmentAudit)
- `onboarding.ts` (MinistryInvitation)

## 2. Generate and Apply Migrations
Once the schema is defined, use the Drizzle CLI to generate migrations:
```bash
pnpm --filter database db:generate
```

Apply the migrations to your local development database:
```bash
pnpm --filter database db:migrate
```

## 3. Base Seeding
To satisfy the multi-tenancy requirement without a Church management UI, run the seeder script to insert a base `Church` record:
```bash
pnpm --filter database db:seed
```

All scheduling-related records created during development should use the `church_id` of this seeded base church.
