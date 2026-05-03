# Spec 03: Core Entities — Assignments & Availability

## Purpose
Define the connection between volunteers and the slots they are assigned to, along with their reported availability.

---

## 1. Assignment Entity
The record of a volunteer being assigned to a specific requirement.

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **slot_id**: UUID (Foreign Key to Time Slot)
- **volunteer_id**: UUID (Foreign Key to Volunteer)
- **role_id**: UUID (Foreign Key to Role)
- **status**: "pending" | "confirmed" | "declined"
- **reason**: Text (Optional, for declines)
- **assigned_at**: Timestamp
- **assigned_by**: UUID (Foreign Key to User)

---

## 2. Availability Entity
Reporting when a volunteer is *not* able to serve.

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **volunteer_id**: UUID (Foreign Key to Volunteer)
- **type**: "available" | "unavailable" (Default: "unavailable" - blockout)
- **start_time**: Timestamp
- **end_time**: Timestamp
- **is_all_day**: Boolean
- **reason**: String (Optional)
- **repeat_rule**: String (Optional RRULE string for recurring blockouts)

---

## 3. Assignment Audit
Tracking overrides of conflicts.

### Fields
- **id**: UUID (Primary Key)
- **church_id**: UUID (Foreign Key to Church)
- **assignment_id**: UUID (Foreign Key to Assignment)
- **leader_id**: UUID (Foreign Key to User)
- **reason**: Text
- **timestamp**: Timestamp

---

## 4. Testing Requirements (Mandatory)
- **Unit**: Verify `Assignment` status transitions (e.g., cannot go from confirmed back to pending).
- **Unit**: Verify `Availability` overlaps with existing `Assignments` trigger a soft warning.
- **Security**: Verify that a volunteer can only create/edit their own `Availability`.
- **Audit**: Verify that any `Override` creates an `AssignmentAudit` entry.
