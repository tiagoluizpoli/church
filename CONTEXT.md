# Church Volunteer Scheduling Context

This context handles the scheduling, availability, and assignment of volunteers to roles within a church's events.

## Language

**Church**:
The root tenant representing a distinct congregation or local church body.
_Avoid_: Organization, tenant, customer

**Ministry**:
A high-level department or service area within a Church (e.g., "Kids Ministry", "Worship Ministry").
_Avoid_: Department, group

**Team**:
A specific group of volunteers within a Ministry (e.g., "Acoustic Team", "Media Team").
_Avoid_: Sub-group, crew

**Role**:
A specific function or position required during an event (e.g., "Vocalist", "Sound Tech").
_Avoid_: Position, job

**Volunteer**:
A person associated with a Church who can be scheduled to serve in one or more Roles.
_Avoid_: User, member, worker

**Event**:
A scheduled gathering at a Church (e.g., "Sunday Service").
_Avoid_: Gathering, service

**TimeSlot**:
A specific block of time within an Event where work or serving is scheduled.
_Avoid_: Shift, period

**SlotRequirement**:
The staffing needs for a specific Role and Team within a TimeSlot.
_Avoid_: Staffing need, requirement

**Assignment**:
The matching of a Volunteer to a specific Role and TimeSlot.
_Avoid_: Booking, scheduling

**Actor**:
The person who performed an audited action in the scheduling system. An Actor may be a Volunteer, Ministry Leader, or Admin depending on the workflow.
_Avoid_: Leader (when the action may also be performed by volunteers or admins)

**Availability**:
A volunteer's declared time periods when they are either available or unavailable to serve.
_Avoid_: Blockout, schedule

## Example Dialogue

**Developer**: "Are volunteers assigned directly to an Event or to a specific TimeSlot within the Event?"
**Domain Expert**: "They are assigned to a TimeSlot. An Event like 'Sunday Morning' might have multiple TimeSlots, and a Volunteer serves in a specific role during one of those slots."
**Developer**: "Can a Volunteer serve in multiple Roles during the same TimeSlot?"
**Domain Expert**: "No, a Volunteer can only hold one Assignment per TimeSlot. We must prevent double-bookings."

**Developer**: "Who performed this audit action — should we call them the Leader or the Actor?"
**Domain Expert**: "Use Actor. Some audit actions are performed by leaders, but others are performed by volunteers or admins, so Actor is the broader canonical term."
