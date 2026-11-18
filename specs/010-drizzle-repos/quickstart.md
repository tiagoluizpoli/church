# Quickstart: Drizzle Repository Layer (Spec R2)

This document provides a guide to instantiation, local development, and execution of the Drizzle repository layer for the Church scheduling application.

## 1. Quickstart Instantiation

To instantiate and consume the repository layer, inject the Drizzle database client (`PgDatabase`) into the repository constructors:

```typescript
import { db } from '@church/db';
import { DrizzleVolunteerRepository } from './infrastructure/repositories/drizzle-volunteer.repository';

// Initialize the concrete repository
const volunteerRepository = new DrizzleVolunteerRepository(db);

// Use within a service or tRPC router
const volunteer = await volunteerRepository.getById(churchId, volunteerId);
```

## 2. Using DrizzleUnitOfWork

For atomic write operations, run database modifications inside the unit of work transaction context:

```typescript
import { db } from '@church/db';
import { DrizzleUnitOfWork } from './infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleEventRepository } from './infrastructure/repositories/drizzle-event.repository';
import { DrizzleTimeSlotRepository } from './infrastructure/repositories/drizzle-time-slot.repository';

const unitOfWork = new DrizzleUnitOfWork(db);
const eventRepo = new DrizzleEventRepository(db);
const slotRepo = new DrizzleTimeSlotRepository(db);

const result = await unitOfWork.run(async (tx) => {
  // Pass the opaque TransactionContext to repository calls
  const event = await eventRepo.create(churchId, eventData, tx);
  const slots = await slotRepo.createMany(churchId, event.id, slotsData, tx);
  
  return { event, slots };
});
```

## 3. Running Integration Tests

Local integration tests execute against the PostgreSQL instance defined in the docker-compose file.

### Step 1: Start the Local PostgreSQL Database
Ensure the local development database container is running:
```bash
docker compose up -d postgres
```

### Step 2: Run Repository Integration Tests
From the root of the workspace, execute the Vitest test runner targeting the server integration tests:
```bash
bun --filter @church/server test apps/server/tests/integration/repositories/
```

*Note: The test runner will automatically trigger table truncations between test runs via the integration testing setup script.*
