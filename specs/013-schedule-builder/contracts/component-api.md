# Component API Contracts: Schedule Builder

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26

Key component prop shapes. These define the interface boundary between the builder container and its sub-components. Internal implementation details are not specified here.

---

## `<ScheduleBuilder>`

Top-level container. Owns data fetching and all mutations.

```typescript
interface ScheduleBuilderProps {
  eventId: string;
}
```

Internally derives all child props from `getScheduleBuilderData` response + local state.

---

## `<BuilderHeader>`

```typescript
interface BuilderHeaderProps {
  event: {
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    status: 'draft' | 'published';
    ministryId: string;
  };
  fillPercentage: number; // 0–1, drives event-level staffing meter
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  canPublish: boolean; // false when hard violations exist
  onPublish: () => void;
  onSendReminder: () => void;
  onRetry: () => void; // for auto-save error banner
  onOpenAuditLog: () => void;
  onOpenPrintExport: () => void; // navigates to F4 flow
}
```

---

## `<BuilderGrid>`

```typescript
interface BuilderGridProps {
  event: Pick<Event, 'id' | 'startDate' | 'endDate' | 'eventType' | 'status'>;
  slots: TimeSlot[];
  requirements: SlotRequirement[];
  assignments: Assignment[];
  volunteerAvailability: VolunteerAvailability[];
  roles: Role[];
  onAssign: (params: AssignParams) => void;
  onUnassign: (assignmentId: string) => void;
  onOverride: (params: OverrideParams) => void;
  onSubstitute: (declinedAssignmentId: string, newVolunteerId: string, roleId: string) => void;
  onAddSlot: () => void;
  onEditSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onIncrementCount: (slotId: string, roleId: string) => void;
  onDecrementCount: (slotId: string, roleId: string) => void;
}

interface AssignParams {
  slotId: string;
  volunteerId: string;
  roleId: string;
}

interface OverrideParams extends AssignParams {
  reason: string; // min 10 chars, validated before call
}
```

---

## `<VolunteerPoolSidebar>`

```typescript
interface VolunteerPoolSidebarProps {
  volunteers: VolunteerWithAvailability[]; // all pool volunteers
  assignments: Assignment[]; // used to compute workload count per volunteer
  onDragStart: (volunteerId: string) => void; // dnd-kit drag initiation
  // Filter state managed internally; no prop drilling needed
}

interface VolunteerWithAvailability {
  id: string;
  name: string; // formatted as "First L."
  status: 'available' | 'partial' | 'unavailable' | 'no_response';
  availabilityDetail?: string; // shown on hover
}
```

---

## `<RequirementCell>`

Single droppable cell in the grid (one assignment slot).

```typescript
interface RequirementCellProps {
  slotId: string;
  requirementId: string;
  roleId: string;
  fillIndex: number; // 0-based position in multi-fill stack
  assignment?: {
    id: string;
    volunteerId: string;
    volunteerName: string;
    conflictStatus?: 'double_booked' | 'unavailable';
    confirmationStatus?: 'pending' | 'confirmed' | 'declined';
  };
  suggestions: SuggestedVolunteer[]; // top 3, shown when no assignment
  isReadOnly: boolean; // true for sub-leader viewing other teams' cells
  isPublished: boolean; // drives confirmation badge visibility
  onDrop: (volunteerId: string) => void;
  onClickAssign: () => void; // opens AssignmentPicker
  onClickOverride: () => void; // opens OverrideDialog
  onClickSubstitute: () => void; // opens SubstitutionPicker (declined only)
}

interface SuggestedVolunteer {
  id: string;
  name: string;
  status: 'available' | 'partial';
  workloadCount: number;
}
```

---

## `<AssignmentPicker>`

On-demand popover opened by clicking an empty or assigned cell.

```typescript
interface AssignmentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'assign' | 'substitution';
  declinedVolunteerName?: string; // shown in substitution mode header
  volunteers: PickerVolunteer[];
  onSelect: (volunteerId: string) => void;
  onRemove?: () => void; // only shown when cell has an assignment
}

interface PickerVolunteer {
  id: string;
  name: string;
  availabilityStatus: 'available' | 'partial' | 'unavailable' | 'no_response';
  alreadyAssignedCount: number; // shown as "Already assigned (N slots)"
}
```

---

## `<OverrideDialog>`

```typescript
interface OverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflictType: 'double_booked' | 'unavailable';
  volunteerName: string;
  slotLabel: string;
  onConfirm: (reason: string) => void;
  isPending: boolean; // mutation in flight
}
// Internal: controlled textarea; confirm button disabled until reason.length >= 10
```

---

## `<StaffingMeter>`

Used in both event-level header and per-slot row variants.

```typescript
interface StaffingMeterProps {
  fillRatio: number; // 0–1
  variant: 'event' | 'slot';
  // 'event': renders labeled progress bar in header
  // 'slot': renders compact badge in row label
}
// Color logic: fillRatio < 0.5 → red, 0.5–0.99 → yellow, 1.0 → green
```

---

## `<SlotEditModal>`

```typescript
interface SlotEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  slot: {
    id: string;
    startTime: Date;
    endTime: Date;
    label?: string;
  };
  eventType: 'hourly' | 'day_based';
  onSave: (input: { startTime: Date; endTime: Date; label?: string }) => void;
  isPending: boolean;
}
```

---

## `<SlotGenerateWizard>`

```typescript
interface SlotGenerateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  event: { startDate: Date; endDate: Date; eventType: 'hourly' | 'day_based' };
  roleTemplates: RoleTemplate[];
  onGenerate: (input: GenerateInput) => void;
  isPending: boolean;
}

interface GenerateInput {
  strategy: 'duration' | 'count';
  value: number;
  applyTemplateId?: string;
}
// Internal steps: 1. Choose strategy + value, 2. Preview list, 3. Select template (optional)
```

---

## `<MobileInterstitial>`

```typescript
interface MobileInterstitialProps {
  onContinue: () => void; // hides interstitial, shows full builder
}
// Shown when: window.innerWidth < 1024 OR navigator.maxTouchPoints > 0
// Hidden permanently if user clicks "Continue anyway" (localStorage flag)
```
