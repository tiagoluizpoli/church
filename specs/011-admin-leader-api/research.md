# Technical Research: Admin & Leader API (Spec A1)

## Contextual RBAC & Global Admin Identification

### Decision
A user's permission for event management is determined contextually at the request time:
1. **Global Church Admin**: Identified when a user's volunteer profile has a `systemRole === 'leader'` record in the `Administration` ministry.
2. **Ministry Leader**: Identified when a user's volunteer profile has a `systemRole === 'leader'` record in the ministry owning the event.

### Rationale
Storing roles contextually on the `ministry_volunteer` junction table avoids polluting the `user` table with tenant-specific roles, supporting future multi-church or sub-organization scaling.

### Alternatives Considered
- **Universal User Role column** (e.g., `user.role`): Rejected because user roles are contextual to each church and ministry. A user might be a leader in one ministry but a regular volunteer in another.

---

## Transactional Atomicity during Publishing

### Decision
Event publishing utilizes the `DrizzleUnitOfWork` to wrap the event and assignment transitions inside a single SQL transaction block.

### Rationale
This prevents partial event state updates if one assignment fails validation during the publishing cascade, maintaining database consistency.
