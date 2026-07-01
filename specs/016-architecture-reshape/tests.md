# Test Catalog: Monorepo Architecture Reshape

**Feature**: [plan.md](plan.md) | **Date**: 2026-07-01

Maps every test file, its test cases, the task that makes it GREEN, and the correct file path.

All tests start RED. They become GREEN when the linked implementation task completes.

---

## Test Location Convention

Tests live in `apps/server/tests/` (NOT `apps/server/src/tests/`).

New directories to create alongside implementation:
- `tests/domain/` — already exists; extend with new files
- `tests/unit/` — NEW: pure logic tests, no DB, no HTTP (error handler, DI, DTOs, mappers)
- `tests/unit/dtos/` — NEW: per-aggregate DTO schema + mapper unit tests
- `tests/unit/infrastructure/` — NEW: UoW, Unleash service, mapper round-trips
- `tests/behavior/` — NEW: transport-agnostic DB integration tests per manager
- `tests/http/` — NEW: Fastify `app.inject()` HTTP contract tests

Existing directories kept as-is:
- `tests/domain/entities/` — entity tests, no changes needed
- `tests/contract/repositories/` — repo contract tests, no changes needed
- `tests/integration/repositories/` — setup.ts + drizzle-repos + overlap tests, reused by behavior tests
- `tests/integration/routers/` — tRPC router tests; DELETED during Batch 1 (T028)

---

## Shared Seed Constants

All DB-touching tests reuse the stable IDs from `tests/integration/repositories/setup.ts`:

```
church:              11111111-1111-1111-1111-111111111111
ministryAdult:       33333333-3333-3333-3333-333333333331
ministryYouth:       33333333-3333-3333-3333-333333333332
userAlice:           22222222-2222-2222-2222-222222222221
userBob:             22222222-2222-2222-2222-222222222222
volunteerAlice:      44444444-4444-4444-4444-444444444441
volunteerBob:        44444444-4444-4444-4444-444444444442
roleUsher:           55555555-5555-5555-5555-555555555551
roleGreeter:         55555555-5555-5555-5555-555555555552
eventDraft:          66666666-6666-6666-6666-666666666661   (status: draft, June 5 2024)
eventPublished:      66666666-6666-6666-6666-666666666662   (status: published, June 4 2024)
slotDraft:           77777777-7777-7777-7777-777777777771   (event: draft, label: Morning Service)
slotPublished:       77777777-7777-7777-7777-777777777772   (event: published, label: Afternoon Service)
requirementUsher:    88888888-8888-8888-8888-888888888881   (slotDraft, roleUsher, count=2)
assignmentConfirmed: 99999999-9999-9999-9999-999999999991   (slotDraft, Alice, confirmed)
assignmentDeclined:  99999999-9999-9999-9999-999999999992   (slotDraft, Bob, declined)
assignmentAliceSlot2: 99999999-9999-9999-9999-999999999993  (slotPublished, Alice, confirmed)
```

---

## Domain Unit Tests

### `tests/domain/branded-ids.test.ts`

**GREEN when**: T008 (create `domain/branded-ids/` — all 9 files)

Runtime behavior tests. Compile-time type-safety is implicitly tested by TypeScript compilation failing when mismatched IDs are passed.

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `EventId.from('some-uuid')` returns a string equal to `'some-uuid'` | `true` |
| 2 | `ChurchId.from('some-uuid')` returns same string value | `true` |
| 3 | `MinistryId.from('some-uuid')` returns same string value | `true` |
| 4 | `VolunteerId.from('some-uuid')` returns same string value | `true` |
| 5 | `AssignmentId.from('some-uuid')` returns same string value | `true` |
| 6 | `TimeSlotId.from('some-uuid')` returns same string value | `true` |
| 7 | `RoleId.from('some-uuid')` returns same string value | `true` |
| 8 | `TeamId.from('some-uuid')` returns same string value | `true` |
| 9 | `AvailabilityId.from('some-uuid')` returns same string value | `true` |
| 10 | `EventId.from('')` — empty string — no throw (no invariant at ID layer) | returns `''` |
| 11 | Type-level test: `EventId` and `ChurchId` from same raw string are NOT assignable to each other — compile-time catch (document as `@ts-expect-error` annotation) | compilation error without `@ts-expect-error` |

---

### `tests/domain/date-range.test.ts`

**GREEN when**: T009 (create `domain/value-objects/date-range.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `DateRange.create(yesterday, tomorrow)` | returns `DateRange` instance |
| 2 | `DateRange.create(tomorrow, yesterday)` | throws `InvalidDateRangeError` |
| 3 | `DateRange.create(same, same)` | throws `InvalidDateRangeError` (end must be after start, not equal) |
| 4 | `range.contains(date)` — date within range | returns `true` |
| 5 | `range.contains(date)` — date equals start | returns `true` (inclusive) |
| 6 | `range.contains(date)` — date equals end | returns `true` (inclusive) |
| 7 | `range.contains(date)` — date before range | returns `false` |
| 8 | `range.contains(date)` — date after range | returns `false` |
| 9 | `rangeA.overlaps(rangeB)` — partial overlap | returns `true` |
| 10 | `rangeA.overlaps(rangeB)` — adjacent (touching endpoints) | returns `false` (open interval: `start < other.end && end > other.start`) |
| 11 | `rangeA.overlaps(rangeB)` — no overlap | returns `false` |
| 12 | `rangeA.overlaps(rangeB)` — one contains the other | returns `true` |
| 13 | thrown error is `instanceof DomainError` | true |
| 14 | thrown error `.code` === `'INVALID_DATE_RANGE'` | true (RED until T002+T009) |

---

### `tests/domain/error-codes.test.ts`

**GREEN when**: T002 (`DomainError` gains `abstract code`) + T010 (all 14 subclasses add codes)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `new InvalidDateRangeError().code` | `'INVALID_DATE_RANGE'` |
| 2 | `new InvalidRequiredCountError().code` | `'INVALID_REQUIRED_COUNT'` |
| 3 | `new IsolationBreachError().code` | `'ISOLATION_BREACH'` |
| 4 | `new DuplicateSlotsError().code` | `'DUPLICATE_SLOTS'` |
| 5 | `new EmptyScheduleError().code` | `'EMPTY_SCHEDULE'` |
| 6 | `new InvalidEventDurationError().code` | `'INVALID_EVENT_DURATION'` |
| 7 | `new InvalidSlotDurationError().code` | `'INVALID_SLOT_DURATION'` |
| 8 | `new InvalidStateTransitionError('draft','cancel').code` | `'INVALID_STATE_TRANSITION'` |
| 9 | `new PastEventError().code` | `'PAST_EVENT'` |
| 10 | `new PublishValidationError([]).code` | `'PUBLISH_VALIDATION'` |
| 11 | `new HardConstraintError(...).code` | `'HARD_CONSTRAINT_VIOLATION'` |
| 12 | `new InvalidOverrideReasonError().code` | `'INVALID_OVERRIDE_REASON'` |
| 13 | `new UnauthorizedOverrideError().code` | `'UNAUTHORIZED_OVERRIDE'` |
| 14 | `new NotFoundError('x').code` | `'NOT_FOUND'` |
| 15 | All 14 codes are unique (Set size equals array length) | true |
| 16 | All codes are non-empty SCREAMING_SNAKE_CASE strings | true |

---

## Unit Tests (no DB, no HTTP)

### `tests/unit/error-handler.test.ts`

**GREEN when**: T021 (`main/fastify/setup.ts` with `setErrorHandler`)

Tests use a minimal Fastify instance with one route that throws a given error, then `app.inject()` to verify the response.

| # | Error thrown | Expected HTTP status | Expected body |
|---|---|---|---|
| 1 | `InvalidDateRangeError` | 400 | `{ error: 'INVALID_DATE_RANGE', message: '...' }` |
| 2 | `InvalidRequiredCountError` | 400 | `{ error: 'INVALID_REQUIRED_COUNT', message: '...' }` |
| 3 | `IsolationBreachError` | 409 | `{ error: 'ISOLATION_BREACH', message: '...' }` |
| 4 | `DuplicateSlotsError` | 409 | `{ error: 'DUPLICATE_SLOTS', message: '...' }` |
| 5 | `EmptyScheduleError` | 422 | `{ error: 'EMPTY_SCHEDULE', message: '...' }` |
| 6 | `InvalidEventDurationError` | 400 | `{ error: 'INVALID_EVENT_DURATION', message: '...' }` |
| 7 | `InvalidSlotDurationError` | 400 | `{ error: 'INVALID_SLOT_DURATION', message: '...' }` |
| 8 | `InvalidStateTransitionError` | 409 | `{ error: 'INVALID_STATE_TRANSITION', message: '...' }` |
| 9 | `PastEventError` | 422 | `{ error: 'PAST_EVENT', message: '...' }` |
| 10 | `PublishValidationError` | 422 | `{ error: 'PUBLISH_VALIDATION', message: '...' }` |
| 11 | `HardConstraintError` | 409 | `{ error: 'HARD_CONSTRAINT_VIOLATION', message: '...' }` |
| 12 | `InvalidOverrideReasonError` | 400 | `{ error: 'INVALID_OVERRIDE_REASON', message: '...' }` |
| 13 | `UnauthorizedOverrideError` | 403 | `{ error: 'UNAUTHORIZED_OVERRIDE', message: '...' }` |
| 14 | `NotFoundError` | 404 | `{ error: 'NOT_FOUND', message: '...' }` |
| 15 | Unknown `DomainError` subclass (unmapped code) | 500 | `{ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }` |
| 16 | Raw `Error` (non-domain) | 500 | `{ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }` |
| 17 | Response body has no stack trace fields | true |

---

### `tests/unit/di-container.test.ts`

**GREEN when**: T023 (`main/di/injections.ts` fully wired)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | After `registerInjections()`, resolve `injection.infra.eventRepository` | non-null, implements `IEventRepository` |
| 2 | After `registerInjections()`, resolve `injection.infra.volunteerRepository` | non-null |
| 3 | After `registerInjections()`, resolve `injection.infra.assignmentRepository` | non-null |
| 4 | After `registerInjections()`, resolve `injection.infra.assignmentAuditRepository` | non-null |
| 5 | After `registerInjections()`, resolve `injection.infra.availabilityRepository` | non-null |
| 6 | After `registerInjections()`, resolve `injection.infra.ministryRepository` | non-null |
| 7 | After `registerInjections()`, resolve `injection.infra.roleRepository` | non-null |
| 8 | After `registerInjections()`, resolve `injection.infra.roleTemplateRepository` | non-null |
| 9 | After `registerInjections()`, resolve `injection.infra.teamRepository` | non-null |
| 10 | After `registerInjections()`, resolve `injection.infra.timeSlotRepository` | non-null |
| 11 | After `registerInjections()`, resolve `injection.infra.volunteerNotificationRepository` | non-null |
| 12 | After `registerInjections()`, resolve `injection.infra.unitOfWork` | non-null, implements `IUnitOfWork` |
| 13 | After `registerInjections()`, resolve `injection.infra.notificationService` | non-null |
| 14 | After `registerInjections()`, resolve `injection.infra.featureFlagService` | non-null, implements `IFeatureFlagService` |
| 15 | After `registerInjections()`, resolve `injection.managers.ministryManager` | non-null, implements `IMinistryManager` |
| 16 | After `registerInjections()`, resolve `injection.managers.eventManager` | non-null |
| 17 | After `registerInjections()`, resolve `injection.managers.volunteerManager` | non-null |
| 18 | After `registerInjections()`, resolve `injection.managers.assignmentManager` | non-null |
| 19 | After `registerInjections()`, resolve `injection.managers.roleManager` | non-null |
| 20 | `container.resolveAll(injection.controllers.fastify)` | array of length ≥ 3 (AdminLeaderController, VolunteerController, FeatureFlagController) |
| 21 | All registered `FastifyController` instances have unique `prefix` values | no duplicate prefixes |

---

## DTO + Mapper Unit Tests

Per-aggregate: Zod schema parsing + mapper round-trips. No DB, no HTTP.

### `tests/unit/dtos/event.dto.test.ts`

**GREEN when**: T052 (`api/dtos/event.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createEventBodySchema.parse(validBody)` | returns typed object, no throw |
| 2 | `createEventBodySchema.parse({ ...missingTitle })` | throws `ZodError` |
| 3 | `listEventsQuerySchema.parse(validQuery)` | returns typed object |
| 4 | `eventMapper.toResponse(eventEntity)` | output validates against `eventResponseSchema` |
| 5 | `eventMapper.toResponseList([entity1, entity2])` | returns array of 2 valid DTOs |
| 6 | Mapper with optional fields null/undefined | does not throw, maps to undefined/omits field |

---

### `tests/unit/dtos/time-slot.dto.test.ts`

**GREEN when**: T053 (`api/dtos/time-slot.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createSlotBodySchema.parse(validBody)` | no throw |
| 2 | `updateSlotBodySchema.parse(validBody)` | no throw |
| 3 | `slotRequirementBodySchema.parse({ requiredCount: 0 })` | throws ZodError (count must be ≥ 1) |
| 4 | `generateSlotsBodySchema.parse(validBody)` | no throw |
| 5 | `timeSlotMapper.toResponse(slotEntity)` | validates against `timeSlotResponseSchema` |

---

### `tests/unit/dtos/ministry.dto.test.ts`

**GREEN when**: T035 (`api/dtos/ministry.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `ministryMapper.toResponse(ministryEntity)` | validates against `ministryResponseSchema` |
| 2 | `ministryMapper.toResponseList([m1, m2])` | returns array of 2 |

---

### `tests/unit/dtos/volunteer.dto.test.ts`

**GREEN when**: T043 (`api/dtos/volunteer.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `dashboardMapper.toResponse(dashboardData)` | validates against `dashboardResponseSchema` |
| 2 | `availabilityBodySchema.parse(validBody)` | no throw |
| 3 | `respondToAssignmentBodySchema.parse({ status: 'confirmed' })` | no throw |
| 4 | `respondToAssignmentBodySchema.parse({ status: 'invalid' })` | throws ZodError |

---

### `tests/unit/dtos/notification.dto.test.ts`

**GREEN when**: T044 (`api/dtos/notification.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `notificationMapper.toResponse(notificationEntity)` | validates against response schema |
| 2 | `notificationMapper.toResponseList([n1, n2])` | returns array of 2 |

---

### `tests/unit/dtos/assignment.dto.test.ts`

**GREEN when**: T061 (`api/dtos/assignment.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createAssignmentBodySchema.parse(validBody)` | no throw |
| 2 | `createAssignmentBodySchema.parse({ ...missingSlotId })` | throws ZodError |
| 3 | `assignmentMapper.toResponse(assignmentEntity)` | validates against `assignmentResponseSchema` |
| 4 | `assignmentAuditMapper.toResponse(auditEntity)` | validates against `assignmentAuditResponseSchema` |

---

### `tests/unit/dtos/role.dto.test.ts`

**GREEN when**: T069 (`api/dtos/role.dto.ts`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `upsertRoleTemplateBodySchema.parse(validBody)` | no throw |
| 2 | `roleTemplateMapper.toResponse(templateEntity)` | validates against response schema |
| 3 | `roleTemplateMapper.toResponseList([t1, t2])` | returns array of 2 |

---

## Infrastructure Unit Tests

### `tests/unit/infrastructure/mappers.test.ts`

**GREEN when**: T018+T019 (mappers moved to `infrastructure/mappers/`)

One describe block per mapper. Tests verify round-trips and null-handling.

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `EventMapper.toDomain(dbRow)` — all fields present | returns Event entity, all fields set |
| 2 | `EventMapper.toDomain(dbRow)` — optional fields null | entity optional fields are undefined/null, no throw |
| 3 | `EventMapper.toDb(eventEntity)` — entity → DB row | all DB columns present |
| 4 | Same 3 cases for each of 13 mappers: Assignment, AssignmentAudit, Availability, Church, Ministry, Role, RoleTemplate, Slot, Team, TimeSlot, Volunteer, VolunteerNotification | same expectations |

---

### `tests/unit/infrastructure/drizzle-unit-of-work.test.ts`

**GREEN when**: T019 (DrizzleUnitOfWork import path updated to `application/contracts/`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `uow.run(async (tx) => 'result')` — success path | resolves to `'result'` |
| 2 | `uow.run(async (tx) => { throw new Error('fail') })` — throws | rejects with same error; DB transaction rolled back |
| 3 | Two writes inside `uow.run` — if second throws | first write rolled back (atomicity) |

---

### `tests/unit/infrastructure/unleash-feature-flag-service.test.ts`

**GREEN when**: T020 (`UnleashFeatureFlagService`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `isEnabled('some-flag')` when Unleash reachable + flag ON | returns `true` |
| 2 | `isEnabled('some-flag')` when Unleash reachable + flag OFF | returns `false` |
| 3 | `getAll()` when Unleash reachable | returns `Record<string, boolean>` with at least one entry |
| 4 | `isEnabled('any-flag')` when Unleash unreachable | returns `false` (no throw) |
| 5 | `getAll()` when Unleash unreachable | returns `{}` (no throw) |
| 6 | `isEnabled('unknown-flag')` — flag not configured in Unleash | returns `false` (Unleash default) |
| 7 | Unreachable Unleash logs warning via pino | warning log emitted (check pino spy) |
| 8 | `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE` flag returns correct value | respects Unleash config |

---

## Behavior Tests (transport-agnostic, DB integration)

These call manager methods directly. DB setup via `tests/integration/repositories/setup.ts`.

Behavior tests MUST pass before the corresponding migration batch (T027, T032, T040, T049, T058, T066). No tRPC. No HTTP.

### `tests/behavior/server.behavior.test.ts`

**GREEN when**: T021+T022+T023+T024 (full server bootstrap)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createFastify()` returns a Fastify instance | non-null, `typeof app.listen === 'function'` |
| 2 | After `app.listen({ port: 0 })`, server is bound | `app.server.listening === true` |
| 3 | `GET /api/auth/session` with no credentials | Not 404 (Better-Auth passthrough active) |
| 4 | `POST /api/auth/sign-in/email` | Not 404 |
| 5 | `GET /api/v1/not-a-real-route` | 404 with Fastify default response |

---

### `tests/behavior/ministry.behavior.test.ts`

**GREEN when**: T033 (IMinistryManager) + T034 (DbMinistryManager)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `listByLeader` — Alice is leader of Adult Ministry | returns array with Adult Ministry, length 1 |
| 2 | `listByLeader` — Alice is leader of both ministries | returns both ministries |
| 3 | `listByLeader` — Bob is volunteer (not leader) | returns empty array |
| 4 | `listByLeader` — church isolation: Alice as leader in church-1 queried for church-2 | returns empty array |
| 5 | `listByLeader` — result sorted alphabetically by name | first is Adult, second is Youth when both exist |

Note: Before each test, promote/demote Alice via direct DB update using `ministryVolunteer.systemRole`.

---

### `tests/behavior/volunteer.behavior.test.ts`

**GREEN when**: T041 (IVolunteerManager) + T042 (DbVolunteerManager)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `getDashboard` — Alice has confirmed assignment | dashboard includes upcoming slot |
| 2 | `getDashboard` — volunteer with no assignments | dashboard has empty upcoming list |
| 3 | `getUpcomingAssignments` — future events only | excludes past-dated events |
| 4 | `getAvailability` — Alice has one availability record | returns it |
| 5 | `upsertAvailability` — create new window | creates and returns new record with generated ID |
| 6 | `upsertAvailability` — update existing | updates and returns updated record |
| 7 | `deleteAvailability` — existing record | record gone from DB |
| 8 | `deleteAvailability` — wrong volunteer (isolation) | throws NotFoundError or ignores (does not delete other's record) |
| 9 | `respondToAssignment` — `confirmed` → assignment status changes | `assignment.status === 'confirmed'` |
| 10 | `respondToAssignment` — `declined` → status changes | `assignment.status === 'declined'` |
| 11 | `respondToAssignment` — assignment not belonging to volunteer | throws NotFoundError |
| 12 | `getNotifications` — Alice has no notifications | returns empty array |
| 13 | `markNotificationRead` — marks single notification | `notification.readAt` is non-null |
| 14 | `markAllNotificationsRead` — multiple unread | all have non-null `readAt` |
| 15 | `getMinistrySchedule` — returns schedule for ministry Alice belongs to | non-null result |

---

### `tests/behavior/event.behavior.test.ts`

**GREEN when**: T050 (IEventManager) + T051 (DbEventManager)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createEvent` — valid future dates | returns Event with generated ID |
| 2 | `createEvent` — end before start | throws `InvalidDateRangeError` (code `INVALID_DATE_RANGE`) |
| 3 | `listEvents` — by ministry | returns events for that ministry only |
| 4 | `listEvents` — church isolation | events from other churches not included |
| 5 | `publishEvent` — draft event in future | event.status becomes `'published'` |
| 6 | `publishEvent` — already published | throws `InvalidStateTransitionError` |
| 7 | `cancelEvent` — draft or published event | event.status becomes `'cancelled'` |
| 8 | `cancelEvent` — cancelled event | throws `InvalidStateTransitionError` |
| 9 | `createSlot` — valid time within event range | returns TimeSlot with generated ID |
| 10 | `updateSlot` — change label | returns updated TimeSlot |
| 11 | `deleteSlot` — existing slot | slot removed from DB |
| 12 | `generateSlots` — hourly slots for 2-hour event | returns 2 slots |
| 13 | `generateSlots` — existing slots present | throws `DuplicateSlotsError` |
| 14 | `upsertSlotRequirement` — create new | returns SlotRequirement with requiredCount |
| 15 | `upsertSlotRequirement` — update existing | returns updated requiredCount |
| 16 | `upsertSlotRequirement` — count < 1 | throws `InvalidRequiredCountError` |
| 17 | `sendReminder` — event with confirmed assignments | notification created for each assigned volunteer |
| 18 | `getScheduleBuilderData` — returns event, slots, requirements, assignments, availability | all fields present |

---

### `tests/behavior/assignment.behavior.test.ts`

**GREEN when**: T059 (IAssignmentManager) + T060 (DbAssignmentManager)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `createAssignment` — valid slot, volunteer, role | returns Assignment with status `'pending'` or `'draft'` |
| 2 | `createAssignment` — volunteer already assigned to overlapping slot (hard constraint) | throws `HardConstraintError` (code `HARD_CONSTRAINT_VIOLATION`) |
| 3 | `createAssignment` — past-dated slot | throws `PastEventError` (code `PAST_EVENT`) |
| 4 | `deleteAssignment` — draft assignment | physical delete; row gone from DB |
| 5 | `deleteAssignment` — confirmed assignment | logical cancel; `assignment.status === 'cancelled'` |
| 6 | `deleteAssignment` — wrong church (isolation) | throws NotFoundError |
| 7 | `listAuditLog` — assignment with 2 audit entries | returns 2 entries in descending timestamp order |
| 8 | `listAuditLog` — assignment with no audits | returns empty array |

---

### `tests/behavior/role.behavior.test.ts`

**GREEN when**: T067 (IRoleManager) + T068 (DbRoleManager)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `listTemplates` — church with templates | returns all templates for church |
| 2 | `listTemplates` — empty church | returns empty array |
| 3 | `listTemplates` — church isolation | templates from other church not included |
| 4 | `upsertTemplate` — create new | returns RoleTemplate with generated ID |
| 5 | `upsertTemplate` — update existing (same templateId) | returns updated template |
| 6 | `applyTemplate` — valid event and template | roles applied to event slots |
| 7 | `applyTemplate` — template not belonging to church | throws NotFoundError |
| 8 | `deleteTemplate` — existing template | template removed from DB |
| 9 | `deleteTemplate` — wrong church | throws NotFoundError or ignores (does not delete other church's template) |

---

## HTTP Contract Tests

All use `app.inject()` from a `createTestApp()` helper (`tests/http/setup.ts`).

The helper:
1. Builds the full Fastify app (calls `createFastify()` + `registerInjections()` + registers controllers)
2. Mocks `auth.api.getSession` via `vi.mock` — returns a preset session object (userId, churchId, role) or `null` per test case; no network call to Better-Auth
3. The real `preHandler` code path runs unchanged; only the `getSession` return value is mocked

Mock pattern:

```typescript
vi.mock('<path-to-auth-module>', () => ({
  auth: {
    api: {
      getSession: vi.fn()
    },
    handler: vi.fn()  // for /api/auth/* passthrough
  }
}))

// Per test:
vi.mocked(auth.api.getSession).mockResolvedValue({
  user: { id: SEED.userAlice, ... },
  session: { userId: SEED.userAlice, churchId: SEED.church, role: 'leader', ... }
})

// Unauthenticated:
vi.mocked(auth.api.getSession).mockResolvedValue(null)
```

### `tests/http/setup.ts` (helper, not a test file)

Exports:

- `createTestApp()` → Promise<FastifyInstance> — builds app; caller sets up `vi.mock` before calling
- `mockSession(userId, churchId, role)` → calls `vi.mocked(auth.api.getSession).mockResolvedValue(...)` with preset session
- `mockNoSession()` → `vi.mocked(auth.api.getSession).mockResolvedValue(null)`
- Re-exports `SEED` constants and `truncateAll` / `seed` from `tests/integration/repositories/setup.ts`

---

### `tests/http/auth.http.test.ts`

**GREEN when**: T024 (server.ts wiring) — these routes exist outside `/api/v1/` prefix

| # | Method + path | Auth | Expected status |
|---|---|---|---|
| 1 | `GET /api/auth/session` | none | 200 or 401 (not 404 — passthrough active) |
| 2 | `POST /api/auth/sign-in/email` | none | 422 or 400 (Better-Auth validates body) — not 404 |
| 3 | `GET /api/v1/health` (if implemented) | none | 200 |
| 4 | `GET /api/v1/not-found` | none | 404 |

---

### `tests/http/admin-ministry.http.test.ts`

**GREEN when**: T036 (AdminLeaderController with GET /admin/ministries) + T038 (run tests)

| # | Method + path | Auth | Expected status | Notes |
|---|---|---|---|---|
| 1 | `GET /api/v1/admin/ministries` | Alice as leader | 200 | body: `{ ministries: [...] }` |
| 2 | `GET /api/v1/admin/ministries` | no auth | 401 | preHandler gate |
| 3 | `GET /api/v1/admin/ministries` | Alice as volunteer (not leader/admin) | 403 | role check |
| 4 | `GET /api/v1/admin/ministries` | admin role | 200 | admin sees all ministries |
| 5 | Response body validates against ministry DTO schema | — | shape match |

---

### `tests/http/volunteer.http.test.ts`

**GREEN when**: T045 (VolunteerController with all 10 routes) + T047 (run tests)

| # | Method + path | Auth | Expected status |
|---|---|---|---|
| 1 | `GET /api/v1/volunteer/dashboard` | Alice | 200 |
| 2 | `GET /api/v1/volunteer/dashboard` | no auth | 401 |
| 3 | `GET /api/v1/volunteer/upcoming-assignments` | Alice | 200 |
| 4 | `GET /api/v1/volunteer/ministry/:ministryId/schedule` | Alice | 200 |
| 5 | `GET /api/v1/volunteer/availability` | Alice | 200 |
| 6 | `PUT /api/v1/volunteer/availability` | Alice, valid body | 200 |
| 7 | `DELETE /api/v1/volunteer/availability/:availabilityId` | Alice | 204 |
| 8 | `PATCH /api/v1/volunteer/assignments/:assignmentId/respond` | Alice, `{ status: 'confirmed' }` | 200 |
| 9 | `GET /api/v1/volunteer/notifications` | Alice | 200 |
| 10 | `PATCH /api/v1/volunteer/notifications/:id/read` | Alice | 200 |
| 11 | `POST /api/v1/volunteer/notifications/read-all` | Alice | 201 |
| 12 | Any volunteer route | no auth | 401 |

---

### `tests/http/admin-events.http.test.ts`

**GREEN when**: T054 (event + slot routes added to AdminLeaderController) + T056 (run tests)

| # | Method + path | Auth | Expected status | Notes |
|---|---|---|---|---|
| 1 | `GET /api/v1/admin/schedule-builder` | leader | 200 | query: `?eventId=...` |
| 2 | `GET /api/v1/admin/events` | leader | 200 | query: `?ministryId=...&churchId=...` |
| 3 | `POST /api/v1/admin/events` | leader, valid body | 201 | body has `id` |
| 4 | `POST /api/v1/admin/events` | leader, end before start | 400 | `{ error: 'INVALID_DATE_RANGE' }` |
| 5 | `POST /api/v1/admin/events/:id/publish` | leader | 201 | event must be future-dated in seed |
| 6 | `POST /api/v1/admin/events/:id/cancel` | leader | 201 | |
| 7 | `POST /api/v1/admin/events/:id/reminders` | leader | 201 | |
| 8 | `POST /api/v1/admin/events/:id/apply-template` | leader | 201 | |
| 9 | `POST /api/v1/admin/events/:id/slots` | leader, valid body | 201 | |
| 10 | `PATCH /api/v1/admin/events/:id/slots/:slotId` | leader | 200 | |
| 11 | `DELETE /api/v1/admin/events/:id/slots/:slotId` | leader | 204 | |
| 12 | `POST /api/v1/admin/events/:id/slots/generate` | leader | 201 | |
| 13 | `PUT /api/v1/admin/events/:id/slots/:slotId/requirements` | leader | 200 | |
| 14 | Any event route | no auth | 401 | |
| 15 | Any event route | volunteer (not leader) | 403 | |

---

### `tests/http/admin-assignments.http.test.ts`

**GREEN when**: T062 (assignment routes added to AdminLeaderController) + T064 (run tests)

| # | Method + path | Auth | Expected status | Notes |
|---|---|---|---|---|
| 1 | `POST /api/v1/admin/assignments` | leader, valid body | 201 | returns Assignment DTO |
| 2 | `POST /api/v1/admin/assignments` | leader, hard conflict | 409 | `{ error: 'HARD_CONSTRAINT_VIOLATION' }` |
| 3 | `DELETE /api/v1/admin/assignments/:assignmentId` | leader | 204 | |
| 4 | `GET /api/v1/admin/assignments/:assignmentId/audit` | leader | 200 | returns array |
| 5 | Assignment routes | no auth | 401 | |
| 6 | Assignment routes | volunteer (not leader) | 403 | |

---

### `tests/http/admin-roles.http.test.ts`

**GREEN when**: T070 (role template routes added to AdminLeaderController) + T072 (run tests)

| # | Method + path | Auth | Expected status | Notes |
|---|---|---|---|---|
| 1 | `GET /api/v1/admin/role-templates` | leader | 200 | returns array |
| 2 | `PUT /api/v1/admin/role-templates/:templateId` | leader, valid body | 200 | creates or updates |
| 3 | `DELETE /api/v1/admin/role-templates/:templateId` | leader | 204 | |
| 4 | Role template routes | no auth | 401 | |
| 5 | Role template routes | volunteer (not leader) | 403 | |

---

### `tests/http/feature-flags.http.test.ts`

**GREEN when**: T074 (FeatureFlagController) + T075 (dto)

| # | Method + path | Auth | Expected status | Notes |
|---|---|---|---|---|
| 1 | `GET /api/v1/feature-flags` | no auth (public) | 200 | body: `{ flags: Record<string, boolean> }` |
| 2 | `GET /api/v1/feature-flags` | authenticated | 200 | context populated with userId/churchId |
| 3 | `GET /api/v1/feature-flags` | Unleash unreachable | 200 | falls back to empty/false flags, no 500 |
| 4 | Response schema validates against `z.record(z.string(), z.boolean())` | — | shape match |

---

## Cross-Cutting / New Architecture Tests

These test capabilities that did not exist in the tRPC codebase. No dedicated test file — verified inline during relevant tasks.

### Biome boundary enforcement (lint-as-test)

**Verified during**: T079 + T080

| # | Action | Expected |
|---|--------|----------|
| 1 | Add `import ... from '../../infrastructure/repositories/drizzle-event.repository'` inside `api/controllers/admin-leader-controller.ts` | `biome check` exits non-zero with `lint/style/noRestrictedImports` naming the violated rule |
| 2 | Add `import ... from '../../application/db-event-manager'` inside `domain/value-objects/date-range.ts` | `biome check` exits non-zero |
| 3 | Add any import inside `main/` from any layer | `biome check` exits zero (wiring layer is unrestricted) |
| 4 | Clean codebase with no violations | `biome check apps/server/src` exits zero |

### OpenAPI spec validity

**Verified during**: T077 (generate + commit `auto-generated-api.yaml`)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `auto-generated-api.yaml` parses as valid YAML | no YAML parse error |
| 2 | File validates against OpenAPI 3.x JSON Schema | no schema violations |
| 3 | All 31 endpoint paths in yaml match `contracts/http-api.md` | no missing or extra paths |
| 4 | All paths live under `/api/v1/` prefix | no path missing the version prefix |

### Server startup (verified during T024 + T027)

| # | Test case | Expected |
|---|-----------|----------|
| 1 | Server starts and binds — logged output contains `server ready` in structured JSON | `listening` event fires |
| 2 | All `/api/v1/` routes registered — inject valid path → not 404 | true for all 31 routes |
| 3 | `/api/auth/*` accessible outside `/api/v1/` prefix | not 404 |
| 4 | Scalar API reference served at `GET /documentation` when `NODE_ENV=development` | 200 |
| 5 | Scalar API reference not served when `NODE_ENV=production` | 404 |

---

## Coverage Summary

| Layer | Test type | Approx cases | Threshold |
|-------|-----------|--------------|-----------|
| Domain: branded IDs | UNIT | 11 | 100% branch |
| Domain: DateRange VO | UNIT | 14 | 100% branch |
| Domain: error codes | UNIT | 16 | 100% branch |
| Application: 5 managers | INTEGRATION (behavior) | ~55 | 80% line |
| API: DTOs + mappers (7 files) | UNIT | ~25 | — |
| API: error handler | UNIT | 17 | — |
| API: DI container | UNIT | 21 | — |
| API: HTTP contracts (31 routes) | INTEGRATION (http) | ~70 | — |
| Infrastructure: mappers | UNIT | ~40 | — |
| Infrastructure: UoW | INTEGRATION | 3 | — |
| Infrastructure: Unleash service | UNIT/INTEGRATION | 8 | — |
| Cross-cutting (lint, OpenAPI, startup) | INTEGRATION | ~15 | — |
| **Total** | | **~295** | |

---

## Task → Test File Cross-Reference

Quick lookup: which task makes which test file green.

| Task | Creates/modifies | Test file(s) affected |
|------|---|---|
| T002 | `DomainError` gets `abstract code` | `tests/domain/error-codes.test.ts` (partial) |
| T008 | `domain/branded-ids/` (9 files) | `tests/domain/branded-ids.test.ts` |
| T009 | `DateRange` VO | `tests/domain/date-range.test.ts` |
| T010 | All 14 error subclasses get `.code` | `tests/domain/error-codes.test.ts` |
| T018+T019 | Mappers moved, imports updated | `tests/unit/infrastructure/mappers.test.ts` |
| T020 | `UnleashFeatureFlagService` | `tests/unit/infrastructure/unleash-feature-flag-service.test.ts` |
| T021 | `main/fastify/setup.ts` + `setErrorHandler` | `tests/unit/error-handler.test.ts` |
| T022 | `register-controllers.ts` | — |
| T023 | `main/di/injections.ts` | `tests/unit/di-container.test.ts` |
| T024 | `main/server.ts` | `tests/behavior/server.behavior.test.ts` |
| T027 | Write server behavior tests | `tests/behavior/server.behavior.test.ts` ← write here |
| T031 | Write auth HTTP tests | `tests/http/auth.http.test.ts` ← write here |
| T032 | Write ministry behavior tests | `tests/behavior/ministry.behavior.test.ts` ← write here |
| T033+T034 | `IMinistryManager` + `DbMinistryManager` | `tests/behavior/ministry.behavior.test.ts` |
| T035 | `api/dtos/ministry.dto.ts` | `tests/unit/dtos/ministry.dto.test.ts` |
| T036 | `AdminLeaderController` (ministry routes) | `tests/http/admin-ministry.http.test.ts` |
| T038 | Write admin-ministry HTTP tests | `tests/http/admin-ministry.http.test.ts` ← write here |
| T040 | Write volunteer behavior tests | `tests/behavior/volunteer.behavior.test.ts` ← write here |
| T041+T042 | `IVolunteerManager` + `DbVolunteerManager` | `tests/behavior/volunteer.behavior.test.ts` |
| T043 | `api/dtos/volunteer.dto.ts` | `tests/unit/dtos/volunteer.dto.test.ts` |
| T044 | `api/dtos/notification.dto.ts` | `tests/unit/dtos/notification.dto.test.ts` |
| T045 | `VolunteerController` (all 10 routes) | `tests/http/volunteer.http.test.ts` |
| T047 | Write volunteer HTTP tests | `tests/http/volunteer.http.test.ts` ← write here |
| T049 | Write event behavior tests | `tests/behavior/event.behavior.test.ts` ← write here |
| T050+T051 | `IEventManager` + `DbEventManager` | `tests/behavior/event.behavior.test.ts` |
| T052 | `api/dtos/event.dto.ts` | `tests/unit/dtos/event.dto.test.ts` |
| T053 | `api/dtos/time-slot.dto.ts` | `tests/unit/dtos/time-slot.dto.test.ts` |
| T054 | `AdminLeaderController` (event + slot routes) | `tests/http/admin-events.http.test.ts` |
| T056 | Write admin-events HTTP tests | `tests/http/admin-events.http.test.ts` ← write here |
| T058 | Write assignment behavior tests | `tests/behavior/assignment.behavior.test.ts` ← write here |
| T059+T060 | `IAssignmentManager` + `DbAssignmentManager` | `tests/behavior/assignment.behavior.test.ts` |
| T061 | `api/dtos/assignment.dto.ts` | `tests/unit/dtos/assignment.dto.test.ts` |
| T062 | `AdminLeaderController` (assignment routes) | `tests/http/admin-assignments.http.test.ts` |
| T064 | Write admin-assignment HTTP tests | `tests/http/admin-assignments.http.test.ts` ← write here |
| T066 | Write role behavior tests | `tests/behavior/role.behavior.test.ts` ← write here |
| T067+T068 | `IRoleManager` + `DbRoleManager` | `tests/behavior/role.behavior.test.ts` |
| T069 | `api/dtos/role.dto.ts` | `tests/unit/dtos/role.dto.test.ts` |
| T070 | `AdminLeaderController` (role template routes) | `tests/http/admin-roles.http.test.ts` |
| T072 | Write admin-roles HTTP tests | `tests/http/admin-roles.http.test.ts` ← write here |
| T074+T075 | `FeatureFlagController` + dto | `tests/http/feature-flags.http.test.ts` |
| T077 | `auto-generated-api.yaml` committed | OpenAPI validity checks |
| T079+T080 | Biome `noRestrictedImports` overrides | Biome boundary lint-as-tests |
| T089 | Vitest coverage config | all test files (coverage thresholds) |
| T090 | Fill coverage gaps | all domain + application test files |

---

## Rules for Writing Tests (implementation-time reminders)

1. **No tRPC wire format** — zero uses of `{ result: { data: {...} } }` anywhere (FR-023)
2. **Behavior tests before deletions** — T027/T032/T040/T049/T058/T066 must pass BEFORE T028 (delete routers/)
3. **Reuse `tests/integration/repositories/setup.ts`** — `truncateAll()` + `seed()` in `beforeEach`; never re-declare seed IDs
4. **HTTP tests use `app.inject()`** — never call the running server on a port; use Fastify's built-in inject
5. **Domain coverage = 100% branches** — every branch path in DateRange, error codes, value objects must have a test
6. **No test of private methods** — only public interface (manager methods, HTTP endpoints, VO static factory)
7. **Tests survive internal refactor** — if you rename a private field and the test breaks, the test is wrong
