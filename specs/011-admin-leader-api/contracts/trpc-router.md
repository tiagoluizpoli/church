# Interface Contracts: adminLeaderRouter

The `adminLeaderRouter` is mounted at `adminLeader` on the main tRPC router. All procedures require user authentication (managed by `protectedProcedure`).

## Procedures

### Query: `getScheduleBuilderData`
Fetches slots, requirements, assignments, and volunteer availability for an event.

- **Request Payload**:
  ```json
  {
    "eventId": "66666666-6666-6666-6666-666666666661"
  }
  ```
- **Success Response**:
  ```json
  {
    "event": {
      "id": "66666666-6666-6666-6666-666666666661",
      "title": "Youth Gathering",
      "startDate": "2024-06-05T09:00:00.000Z",
      "endDate": "2024-06-05T11:00:00.000Z",
      "status": "draft",
      "ministryId": "33333333-3333-3333-3333-333333333331"
    },
    "slots": [
      {
        "id": "77777777-7777-7777-7777-777777777771",
        "startTime": "2024-06-05T09:00:00.000Z",
        "endTime": "2024-06-05T11:00:00.000Z",
        "label": "Morning Service"
      }
    ],
    "requirements": [
      {
        "id": "88888888-8888-8888-8888-888888888881",
        "slotId": "77777777-7777-7777-7777-777777777771",
        "roleId": "55555555-5555-5555-5555-555555555551",
        "requiredCount": 2
      }
    ],
    "assignments": [
      {
        "id": "99999999-9999-9999-9999-999999999991",
        "slotId": "77777777-7777-7777-7777-777777777771",
        "volunteerId": "44444444-4444-4444-4444-444444444441",
        "roleId": "55555555-5555-5555-5555-555555555551",
        "status": "confirmed",
        "volunteerName": "Alice Test"
      }
    ],
    "volunteerAvailability": [
      {
        "volunteerId": "44444444-4444-4444-4444-444444444441",
        "volunteerName": "Alice Test",
        "status": "AVAILABLE"
      }
    ]
  }
  ```

---

### Mutation: `upsertSlotRequirement`
Creates or updates required volunteer counts for a slot and role.

- **Request Payload**:
  ```json
  {
    "timeSlotId": "77777777-7777-7777-7777-777777777771",
    "roleId": "55555555-5555-5555-5555-555555555551",
    "count": 1
  }
  ```
- **Success Response (with warning)**:
  ```json
  {
    "requirement": {
      "id": "88888888-8888-8888-8888-888888888881",
      "slotId": "77777777-7777-7777-7777-777777777771",
      "roleId": "55555555-5555-5555-5555-555555555551",
      "requiredCount": 1
    },
    "warning": "Slot is overstaffed: 2 assignments exist for requirement count 1"
  }
  ```

---

### Mutation: `createAssignment`
Assigns a volunteer to a role in a slot.

- **Request Payload**:
  ```json
  {
    "timeSlotId": "77777777-7777-7777-7777-777777777771",
    "volunteerId": "44444444-4444-4444-4444-444444444441",
    "roleId": "55555555-5555-5555-5555-555555555551",
    "allowOverride": true,
    "overrideReason": "Short-staffed, approved by leader",
    "asDraft": false
  }
  ```
- **Conflict Response (Soft Conflicts exist, no override)**:
  ```json
  {
    "conflictReport": {
      "hasConflicts": true,
      "issues": [
        {
          "type": "DOUBLE_BOOKED",
          "details": "Volunteer is already assigned to another slot in this time range",
          "conflictingId": "99999999-9999-9999-9999-999999999993"
        }
      ]
    }
  }
  ```

---

### Mutation: `deleteAssignment`
Removes an assignment.

- **Request Payload**:
  ```json
  {
    "assignmentId": "99999999-9999-9999-9999-999999999991"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "transition": "cancelled"
  }
  ```

---

### Mutation: `publishEvent`
Publishes an event schedule.

- **Request Payload**:
  ```json
  {
    "eventId": "66666666-6666-6666-6666-666666666661"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "transitionedCount": 1
  }
  ```

---

### Mutation: `cancelEvent`
Cancels an event.

- **Request Payload**:
  ```json
  {
    "eventId": "66666666-6666-6666-6666-666666666661"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "cancelledCount": 0,
    "deletedCount": 1
  }
  ```
