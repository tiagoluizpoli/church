# Data Model: Domain Entities

## Entity Base Class

```
Entity<T>
├── _id: string (UUID, auto-generated if not provided)
├── _props: T (protected, not exposed externally)
├── _createdAt: Date (UTC)
├── _updatedAt: Date (UTC, mutable internally)
├── get id(): string
├── get createdAt(): Date
├── get updatedAt(): Date
├── equals(other?: Entity<T>): boolean
└── [subclass-specific getters and mutation methods]
```

## Domain Error Hierarchy

```
DomainError (extends Error)
├── InvalidDateRangeError     — start >= end on Event/TimeSlot/Availability
└── InvalidRequiredCountError — requiredCount < 1 on SlotRequirement
```

## Entities

### 1. Church

| Field    | Type                        | Notes                    |
|----------|-----------------------------|--------------------------|
| name     | string                      | Required                 |
| slug     | string                      | Required, unique         |
| timezone | string                      | Default: 'UTC'           |
| settings | Record<string, unknown>     | JSONB, default: {}       |

**Getters**: `name`, `slug`, `timezone`, `settings`
**Mutations**: None in this spec (managed via admin API in future specs)

---

### 2. Ministry

| Field           | Type                    | Notes                          |
|-----------------|-------------------------|--------------------------------|
| churchId        | string                  | FK → Church                    |
| name            | string                  | Required                       |
| description     | string?                 | Optional                       |
| enforcementType | 'soft' \| 'hard'        | Default: 'soft'                |
| deletedAt       | Date?                   | Soft-delete timestamp          |

**Getters**: `churchId`, `name`, `description`, `enforcementType`, `deletedAt`
**Mutations**: `softDelete()` — sets `deletedAt` to current UTC time

---

### 3. Team

| Field      | Type   | Notes           |
|------------|--------|-----------------|
| churchId   | string | FK → Church     |
| ministryId | string | FK → Ministry   |
| name       | string | Required        |

**Getters**: `churchId`, `ministryId`, `name`
**Mutations**: None in this spec

---

### 4. Role

| Field      | Type    | Notes                         |
|------------|---------|-------------------------------|
| churchId   | string  | FK → Church                   |
| ministryId | string? | Optional FK → Ministry        |
| name       | string  | Required                      |
| isGlobal   | boolean | Default: false                |

**Getters**: `churchId`, `ministryId`, `name`, `isGlobal`
**Mutations**: None in this spec

---

### 5. Volunteer

| Field    | Type                               | Notes                |
|----------|-------------------------------------|----------------------|
| churchId | string                              | FK → Church          |
| userId   | string                              | FK → User (auth)     |
| status   | 'active' \| 'inactive' \| 'on_hold' | Default: 'active'    |
| notes    | string?                             | Optional             |

**Getters**: `churchId`, `userId`, `status`, `notes`
**Mutations**: `activate()`, `deactivate()`, `putOnHold()`

---

### 6. MinistryVolunteer

| Field            | Type                                   | Notes                     |
|------------------|----------------------------------------|---------------------------|
| churchId         | string                                 | FK → Church               |
| volunteerId      | string                                 | FK → Volunteer            |
| ministryId       | string                                 | FK → Ministry             |
| teamId           | string?                                | Optional FK → Team        |
| systemRole       | 'leader' \| 'sub_leader' \| 'volunteer'| Default: 'volunteer'      |
| status           | 'active' \| 'inactive'                 | Default: 'active'         |
| joinedAt         | Date                                   | UTC timestamp             |

**Getters**: `churchId`, `volunteerId`, `ministryId`, `teamId`, `systemRole`, `status`, `joinedAt`
**Mutations**: `promote(role)`, `assignTeam(teamId)`, `removeTeam()`

---

### 7. Event

| Field       | Type                                      | Notes                        |
|-------------|-------------------------------------------|------------------------------|
| churchId    | string                                    | FK → Church                  |
| ministryId  | string                                    | FK → Ministry                |
| title       | string                                    | Required                     |
| description | string?                                   | Optional                     |
| location    | string?                                   | Optional                     |
| startDate   | Date                                      | UTC, must be < endDate       |
| endDate     | Date                                      | UTC                          |
| status      | 'draft' \| 'published' \| 'cancelled'     | Default: 'draft'             |

**Getters**: `churchId`, `ministryId`, `title`, `description`, `location`, `startDate`, `endDate`, `status`
**Mutations**: `publish()`, `cancel()`
**Invariant**: Constructor throws `InvalidDateRangeError` if `startDate >= endDate`

---

### 8. TimeSlot

| Field     | Type    | Notes                          |
|-----------|---------|--------------------------------|
| churchId  | string  | FK → Church                    |
| eventId   | string  | FK → Event                     |
| startTime | Date    | UTC, must be < endTime         |
| endTime   | Date    | UTC                            |
| label     | string? | Optional                       |

**Getters**: `churchId`, `eventId`, `startTime`, `endTime`, `label`
**Mutations**: None in this spec
**Invariant**: Constructor throws `InvalidDateRangeError` if `startTime >= endTime`

---

### 9. SlotRequirement

| Field         | Type    | Notes                        |
|---------------|---------|------------------------------|
| churchId      | string  | FK → Church                  |
| slotId        | string  | FK → TimeSlot                |
| roleId        | string  | FK → Role                    |
| teamId        | string? | Optional FK → Team           |
| requiredCount | number  | Must be >= 1                 |
| notes         | string? | Optional                     |

**Getters**: `churchId`, `slotId`, `roleId`, `teamId`, `requiredCount`, `notes`
**Mutations**: None in this spec
**Invariant**: Constructor throws `InvalidRequiredCountError` if `requiredCount < 1`

---

### 10. Assignment

| Field       | Type                                      | Notes                    |
|-------------|-------------------------------------------|--------------------------|
| churchId    | string                                    | FK → Church              |
| slotId      | string                                    | FK → TimeSlot            |
| volunteerId | string                                    | FK → Volunteer           |
| roleId      | string                                    | FK → Role                |
| status      | 'pending' \| 'confirmed' \| 'declined'    | Default: 'pending'       |
| reason      | string?                                   | Optional                 |
| assignedAt  | Date                                      | UTC timestamp            |
| assignedBy  | string?                                   | FK → User (nullable)     |

**Getters**: `churchId`, `slotId`, `volunteerId`, `roleId`, `status`, `reason`, `assignedAt`, `assignedBy`
**Mutations**: `confirm()`, `decline(reason?)`

---

### 11. AssignmentAudit

| Field        | Type                                                    | Notes               |
|--------------|---------------------------------------------------------|----------------------|
| churchId     | string                                                  | FK → Church          |
| assignmentId | string                                                  | FK → Assignment      |
| actorId      | string                                                  | FK → User            |
| action       | 'created' \| 'updated' \| 'deleted' \| 'status_change' | Audit action type    |
| reason       | string?                                                 | Optional             |
| timestamp    | Date                                                    | UTC                  |

**Getters**: `churchId`, `assignmentId`, `actorId`, `action`, `reason`, `timestamp`
**Mutations**: None (immutable audit record)

---

### 12. Availability

| Field       | Type                          | Notes                          |
|-------------|-------------------------------|--------------------------------|
| churchId    | string                        | FK → Church                    |
| volunteerId | string                        | FK → Volunteer                 |
| type        | 'available' \| 'unavailable'  | Default: 'unavailable'         |
| startTime   | Date                          | UTC, must be < endTime         |
| endTime     | Date                          | UTC                            |
| isAllDay    | boolean                       | Default: false                 |
| reason      | string?                       | Optional                       |
| repeatRule  | string?                       | Optional (iCal RRULE format)   |

**Getters**: `churchId`, `volunteerId`, `type`, `startTime`, `endTime`, `isAllDay`, `reason`, `repeatRule`
**Mutations**: None in this spec
**Invariant**: Constructor throws `InvalidDateRangeError` if `startTime >= endTime`

## EntityMapper Contract

```
interface EntityMapper<SchemaRow, DomainEntity> {
  toDomain(row: SchemaRow): DomainEntity
  toPersistence(entity: DomainEntity): InsertRow
}
```

- `SchemaRow` = Drizzle `$inferSelect` type (read from DB)
- `InsertRow` = Drizzle `$inferInsert` type (write to DB)
- Concrete implementations created in Spec R2

## Relationships Summary

```
Church (1) ──── (N) Ministry
Church (1) ──── (N) Team
Church (1) ──── (N) Role
Church (1) ──── (N) Volunteer
Ministry (1) ── (N) Team
Ministry (1) ── (N) Event
Volunteer (1) ─ (N) MinistryVolunteer ── (1) Ministry
                                        ── (0..1) Team
Event (1) ───── (N) TimeSlot
TimeSlot (1) ── (N) SlotRequirement ──── (1) Role
TimeSlot (1) ── (N) Assignment ────────── (1) Volunteer
Assignment (1)─ (N) AssignmentAudit
Volunteer (1) ─ (N) Availability
```
