# tRPC Procedure Contracts: Schedule Builder

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26

All procedures live under `adminLeaderRouter` (`trpc.adminLeader.*`).
All procedures are `protectedProcedure` — require authenticated session.
All procedures enforce church isolation via `authorizeLeaderOrAdmin`.

---

## Existing Procedures (DO NOT MODIFY — reference only)

```typescript
// Already implemented — read-only reference
trpc.adminLeader.getScheduleBuilderData.useQuery({ eventId: string })
// Returns: { event, slots, requirements, assignments, volunteerAvailability }

trpc.adminLeader.createAssignment.useMutation()
// Input: { timeSlotId, volunteerId, roleId, allowOverride?, overrideReason?, asDraft? }
// Returns: { assignment?, conflictReport? }

trpc.adminLeader.deleteAssignment.useMutation()
// Input: { assignmentId }
// Returns: { success, transition: 'deleted' | 'cancelled' }

trpc.adminLeader.upsertSlotRequirement.useMutation()
// Input: { timeSlotId, roleId, count }
// Returns: { id, slotId, roleId, requiredCount }

trpc.adminLeader.publishEvent.useMutation()
// Input: { eventId }
// Returns: { success, notifiedCount }

trpc.adminLeader.cancelEvent.useMutation()
// Input: { eventId }
// Returns: { success }
```

---

## New Procedures

### Event Management

```typescript
// Create a new event (quick-create modal)
trpc.adminLeader.createEvent.useMutation()
// Input:
{
  ministryId: string;
  title: string;
  startDate: string; // ISO UTC
  endDate: string;   // ISO UTC
  eventType: 'hourly' | 'day_based'; // default 'hourly'
}
// Returns:
{
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  eventType: 'hourly' | 'day_based';
  status: 'draft';
  ministryId: string;
}
// Error: 400 if startDate >= endDate

// List events for a ministry
trpc.adminLeader.listEvents.useQuery({ ministryId: string })
// Returns: Array<{ id, title, startDate, endDate, status, eventType }>
// Sorted: startDate descending
```

---

### Slot Management

```typescript
// Create a single slot (manual addition in builder)
trpc.adminLeader.createSlot.useMutation()
// Input:
{
  eventId: string;
  startTime: string; // ISO UTC
  endTime: string;   // ISO UTC
  label?: string;
  copyRequirementsFromSlotId?: string; // if set, copies role requirements
}
// Returns: { id, eventId, startTime, endTime, label, requirements: [] }
// Error: 400 if slot overlaps existing slots in same event
// Error: 400 if event is Published

// Update slot time and/or label
trpc.adminLeader.updateSlot.useMutation()
// Input:
{
  slotId: string;
  startTime?: string; // ISO UTC
  endTime?: string;   // ISO UTC
  label?: string;
}
// Returns: { id, startTime, endTime, label }
// Error: 400 if new time overlaps other slots in same event
// Error: 400 if event is Published

// Delete a slot
trpc.adminLeader.deleteSlot.useMutation()
// Input: { slotId: string }
// Returns: { success: true, assignmentCount: number }
//   → client shows confirmation dialog if assignmentCount > 0
// Error: 400 if event is Published
```

---

### Slot Auto-Generation Wizard

```typescript
// Two-phase: preview first, then confirm
trpc.adminLeader.generateSlots.useMutation()
// Input:
{
  eventId: string;
  strategy: 'duration' | 'count';
  value: number; // minutes per slot (duration) OR total count (count)
  confirm: boolean; // false = preview only; true = save to DB
}
// Returns (preview, confirm=false):
{
  preview: Array<{ startTime: string; endTime: string; label: string }>;
  slotCount: number;
}
// Returns (confirmed, confirm=true):
{
  slots: Array<{ id: string; startTime: string; endTime: string; label: string }>;
  slotCount: number;
}
// Error: 400 if event is Published
// Error: 400 if strategy='duration' and duration does not divide evenly
//   → implementation should floor() and adjust last slot to event endDate
```

---

### Role Templates

```typescript
// List templates for a ministry
trpc.adminLeader.listRoleTemplates.useQuery({ ministryId: string })
// Returns: Array<{
//   id: string;
//   name: string;
//   items: Array<{ roleId: string; roleName: string; requiredCount: number }>;
// }>

// Create or update a role template
trpc.adminLeader.upsertRoleTemplate.useMutation()
// Input:
{
  templateId?: string; // omit to create new
  ministryId: string;
  name: string;
  items: Array<{ roleId: string; requiredCount: number }>;
}
// Returns: { id, name, items }

// Apply a template to all slots in an event
trpc.adminLeader.applyRoleTemplate.useMutation()
// Input: { eventId: string; templateId: string }
// Returns: { updatedSlotCount: number; requirementsCreated: number }
// Behavior: upserts (not replaces) requirements — existing requirements for
//   roles not in template are preserved.

// Delete a role template
trpc.adminLeader.deleteRoleTemplate.useMutation()
// Input: { templateId: string }
// Returns: { success: true }
```

---

### Send Reminder

```typescript
// Notify volunteers who haven't submitted availability
trpc.adminLeader.sendReminder.useMutation()
// Input: { eventId: string }
// Returns: { notifiedCount: number }
// Logic: find volunteers in ministry whose volunteerId has no availability
//   record overlapping the event's startDate–endDate range.
//   Send push notification via existing notificationService.
```

---

### Audit Log

```typescript
// Fetch all override audit entries for an event
trpc.adminLeader.listAuditLog.useQuery({ eventId: string })
// Returns: Array<{
//   id: string;
//   assignmentId: string;
//   volunteerId: string;
//   volunteerName: string;
//   slotId: string;
//   slotLabel: string; // or time range
//   roleId: string;
//   roleName: string;
//   action: 'created' | 'status_change';
//   reason: string | null;
//   actorId: string;
//   actorName: string;
//   timestamp: string; // ISO UTC
// }>
// Only returns entries where action involved an override (reason is not null)
```
