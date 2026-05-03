# Spec 09: System — Permissions & RBAC

## Purpose
Enforce data isolation and functional authority across the system.

---

## 1. Role Hierarchy

| Role | Scope | Authority |
| :--- | :--- | :--- |
| **CHURCH_ADMIN** | Global (Church-wide) | Full CRUD on all ministries, events, and settings. |
| **MINISTRY_LEADER** | Ministry-level | CRUD on events, slots, and assignments within their ministry. |
| **SUB_LEADER** | Team-level | Manage assignments for their specific `team_id`. |
| **VOLUNTEER** | Individual | View personal schedule, submit availability. |

---

## 2. Contextual Enforcement (Middleware)
Permissions are resolved via the `Ministry_Volunteer` join table.

```typescript
// Logic Example
const userRole = await db.query.ministryVolunteer.findFirst({
  where: and(
    eq(mv.volunteerId, userId),
    eq(mv.ministryId, targetMinistryId)
  )
});
```

---

## 3. Mandatory Testing Requirements
- **Security**: Verify that a `VOLUNTEER` cannot call `publishEvent`.
- **Security**: Verify that a `SUB_LEADER` from Team A cannot edit `SlotRequirements` for Team B.
- **Security**: Verify that `CHURCH_ADMIN` can perform any action in any ministry.
- **Isolation**: Verify that no user can see resources from a different `church_id`, regardless of their role.
