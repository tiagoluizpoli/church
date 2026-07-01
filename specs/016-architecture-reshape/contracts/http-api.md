# HTTP API Contract

**Feature**: Monorepo Architecture Reshape | **Date**: 2026-07-01

All routes prefixed `/api/v1/`. Auth routes at `/api/auth/*` (Better-Auth passthrough, unchanged).

## Auth Conventions

- `[auth]` — requires valid Better-Auth session; returns `401` if missing
- `[role: admin-leader]` — requires `admin` or `leader` role on the church; returns `403` if insufficient
- `[role: volunteer]` — any authenticated user with a volunteer record

## Error Response Shape

All error responses:

```json
{ "error": "ERROR_CODE", "message": "Human readable description" }
```

HTTP status determined by the error code (see data-model.md Error Code Registry).

---

## AdminLeaderController — prefix: `/admin`

All routes: `[auth]` + `[role: admin-leader]`

### Schedule Builder

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/admin/schedule-builder` | 200 | Full schedule builder data (events, slots, assignments, volunteers) for a ministry |

Query: `{ churchId, ministryId }`

Response: aggregated `ScheduleBuilderData` DTO

---

### Events

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/admin/events` | 200 | List events for a ministry |
| `POST` | `/admin/events` | **201** | Create a new event |
| `POST` | `/admin/events/:eventId/publish` | **201** | Publish an event (trigger notifications) |
| `POST` | `/admin/events/:eventId/cancel` | **201** | Cancel a published event |
| `POST` | `/admin/events/:eventId/reminders` | **201** | Send reminder notifications for an event |
| `POST` | `/admin/events/:eventId/apply-template` | **201** | Apply a role template to event slots |

Request `POST /admin/events` body: `{ ministryId, name, description?, date, timezone, ... }`

---

### Time Slots

| Method | Path | Status | Description |
|---|---|---|---|
| `POST` | `/admin/events/:eventId/slots` | **201** | Create a time slot |
| `PATCH` | `/admin/events/:eventId/slots/:slotId` | 200 | Update a time slot |
| `DELETE` | `/admin/events/:eventId/slots/:slotId` | **204** | Delete a time slot |
| `POST` | `/admin/events/:eventId/slots/generate` | **201** | Generate slots from template |
| `PUT` | `/admin/events/:eventId/slots/:slotId/requirements` | 200 | Upsert slot role requirement |

---

### Assignments

| Method | Path | Status | Description |
|---|---|---|---|
| `POST` | `/admin/assignments` | **201** | Create an assignment (volunteer → slot) |
| `DELETE` | `/admin/assignments/:assignmentId` | **204** | Delete an assignment |
| `GET` | `/admin/assignments/:assignmentId/audit` | 200 | List audit log for an assignment |

---

### Role Templates

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/admin/role-templates` | 200 | List role templates for a church |
| `PUT` | `/admin/role-templates/:templateId` | 200 | Create or update a role template |
| `DELETE` | `/admin/role-templates/:templateId` | **204** | Delete a role template |

---

## VolunteerController — prefix: `/volunteer`

All routes: `[auth]` + `[role: volunteer]`

### Dashboard & Schedule

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/volunteer/dashboard` | 200 | Full volunteer dashboard snapshot |
| `GET` | `/volunteer/assignments` | 200 | My upcoming assignments |
| `GET` | `/volunteer/ministries/:ministryId/schedule` | 200 | Ministry schedule (public view) |

---

### Availability

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/volunteer/availability` | 200 | My availability records |
| `PUT` | `/volunteer/availability` | 200 | Create or update availability |
| `DELETE` | `/volunteer/availability/:availabilityId` | **204** | Delete an availability record |

---

### Assignments (volunteer-side)

| Method | Path | Status | Description |
|---|---|---|---|
| `PATCH` | `/volunteer/assignments/:assignmentId` | 200 | Respond to assignment (accept/decline) |

Request body: `{ response: 'accepted' | 'declined', reason?: string }`

---

### Notifications

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/volunteer/notifications` | 200 | My notifications |
| `PATCH` | `/volunteer/notifications/:notificationId` | 200 | Mark notification as read |
| `POST` | `/volunteer/notifications/read-all` | **201** | Mark all notifications as read |

---

## FeatureFlagController — prefix: `/feature-flags`

No auth required for reading flags (flags are non-sensitive booleans; context enriched server-side).

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/feature-flags` | 200 | All feature flags for current session context |

Response: `{ flags: Record<string, boolean> }`

Server enriches Unleash context with `churchId` + `userId` from session (if authenticated). Unleash API token never exposed.

---

## Auth Passthrough (unchanged)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/auth/*` | Better-Auth handler passthrough |
| `POST` | `/api/auth/*` | Better-Auth handler passthrough |

Registered outside the `/api/v1/` prefix, directly on the Fastify instance in `main/fastify/setup.ts`.

---

## OpenAPI Tags

Each controller maps to one OpenAPI tag (used by orval's `mode: 'tags'` for file splitting):

| Controller | Tag | orval output file |
|---|---|---|
| AdminLeaderController | `admin` | `apps/web/src/infrastructure/api/admin.ts` |
| VolunteerController | `volunteer` | `apps/web/src/infrastructure/api/volunteer.ts` |
| FeatureFlagController | `feature-flags` | `apps/web/src/infrastructure/api/feature-flags.ts` |

---

## Status Code Summary

| Scenario | Code |
|---|---|
| Read (GET) | 200 |
| Update (PATCH, PUT) | 200 |
| Create (POST) | **201** |
| Delete (DELETE), no body | **204** |
| Validation error | 400 |
| Unauthenticated | 401 |
| Unauthorized (role) | 403 |
| Not found | 404 |
| Conflict / state violation | 409 |
| Business rule violation | 422 |
| Unknown / unmapped error | 500 |
