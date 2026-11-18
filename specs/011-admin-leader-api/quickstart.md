# Quickstart Guide: Admin & Leader API

## API Integration Overview

The `adminLeaderRouter` is part of the server app. It interacts with the client via a type-safe tRPC client definition.

### Initializing the tRPC client (Frontend context)

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@church/server'; // Import type-only

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      async headers() {
        return {
          // Better Auth session cookie is automatically handled by the browser
        };
      },
    }),
  ],
});
```

---

## Endpoint Usage Examples

### 1. Fetch Schedule Grid Data

```typescript
const data = await client.adminLeader.getScheduleBuilderData.query({
  eventId: '66666666-6666-6666-6666-666666666661',
});
```

### 2. Create Assignment with Conflict Bypassing

```typescript
const result = await client.adminLeader.createAssignment.mutate({
  timeSlotId: '77777777-7777-7777-7777-777777777771',
  volunteerId: '44444444-4444-4444-4444-444444444441',
  roleId: '55555555-5555-5555-5555-555555555551',
  allowOverride: true,
  overrideReason: 'Required for special event coverage',
});
```

### 3. Publish Event Schedule

```typescript
await client.adminLeader.publishEvent.mutate({
  eventId: '66666666-6666-6666-6666-666666666661',
});
```

---

## Running Verification Tests

To run the integration tests for this router:

```bash
bun test apps/server/tests/integration/routers/admin-leader.test.ts
```
