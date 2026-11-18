# Spec L3: Slot & Assignment Manager

## Purpose
Manage the high-level lifecycle of schedules (Publishing, Cancellations, Substitutions).

## 1. Publishing Flow
1. Change `Event.status` to `published`.
2. Change all `Assignment.status` from `draft` to `pending` (awaiting confirmation).
3. Notify all assigned volunteers.

**Refined (017, 2026-07-02):** Publishing is now **per `MinistryParticipation`**, not per Event. The flow becomes: (1) flip only **that ministry's** draft assignments (under its participation) `draft -> pending`; (2) transition its `MinistryParticipation` `rostering -> published`; (3) notify only **that ministry's** volunteers. `Event.status` is not touched here ("published" left the Event — see 12-lifecycle-rules). This is distinct from the **ChurchAdmin cycle-lock** (`PlanningCycle draft -> locked`) that happens earlier. Publish may proceed **below 100 %** staffed with a confirmation prompt (no hard block); completion % is computed per participation. (see ADR 0001 / CONTEXT.md)

## 2. Cancellation Logic
- **Event Cancellation**: Mark event as `cancelled`, delete future assignments, and notify volunteers.
- **Assignment Decline**: When a volunteer declines, mark as `declined` and notify the Ministry Leader.

## 3. Substitutions
- Method: `findReplacementVolunteers(slotId, roleId)`
- Returns a list of volunteers who:
    - Are qualified for the role.
    - Are available (via `AvailabilityEngine`).
    - Have not already declined this specific slot.

## 4. Testing Requirements (Mandatory)
- **Unit**: Verify that `publish` is atomic and correctly updates all linked Domain Entities (Spec D1).
- **Integration**: Verify that `findReplacementVolunteers` filters out volunteers who are already assigned to overlapping slots.
- **Cascade**: Verify that deleting a slot removes all linked assignments.

## 🔗 References
- [Spec D1: Domain Entities](./D1-domain-entities.md)
- [Spec 08: Slot Generator](./08-slot-generator.md)
- [Spec 12: Lifecycle Rules](./12-lifecycle-rules.md)
