# Spec 04: Repository Contracts & Interfaces

## Purpose
Define the abstraction layer between business logic and the database implementation. This ensures the system is testable with mocks and handles data isolation consistently.

---

## 1. Core Principles
- **Church Isolation**: Every repository method MUST accept `churchId` as the first argument or extract it from a secure context.
- **Transactional Integrity**: Operations spanning multiple entities (e.g., creating an Event with Slots) must be atomic.
- **Type Safety**: Use Branded Types for IDs to prevent cross-entity ID swapping.

---

## 2. Main Repositories

### I. VolunteerRepository
- `getById(churchId, id)`
- `findByEmail(churchId, email)`
- `listByMinistry(churchId, ministryId)`
- `getAvailability(churchId, volunteerId, range)`

### II. EventRepository
- `getById(churchId, id)`
- `listUpcoming(churchId, ministryId)`
- `createWithSlots(churchId, eventData, slotData)`
- `updateStatus(churchId, eventId, status)`

### III. AssignmentRepository
- `create(churchId, assignmentData)`
- `confirm(churchId, assignmentId)`
- `decline(churchId, assignmentId)`
- `listByVolunteer(churchId, volunteerId)`

---

## 3. Testing Requirements (Mandatory)
- **Contract**: Verify that the concrete Drizzle implementation perfectly matches the interface.
- **Security**: Verify that any query without a `church_id` filter is rejected at the repository level.
- **Transaction**: Verify that a failure in one part of a multi-entity operation rolls back all changes.
