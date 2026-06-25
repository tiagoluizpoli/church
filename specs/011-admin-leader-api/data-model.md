# Data Models & Schemas: Admin & Leader API (Spec A1)

## API Input & Output Schemas (Zod Shapes)

### 1. `getScheduleBuilderData`
- **Input**:
  ```typescript
  z.object({
    eventId: z.string().uuid(),
  })
  ```
- **Output**:
  ```typescript
  interface ScheduleBuilderDataResponse {
    event: {
      id: string;
      title: string;
      startDate: string;
      endDate: string;
      status: 'draft' | 'published' | 'cancelled';
      ministryId: string;
    };
    slots: Array<{
      id: string;
      startTime: string;
      endTime: string;
      label: string;
    }>;
    requirements: Array<{
      id: string;
      slotId: string;
      roleId: string;
      requiredCount: number;
    }>;
    assignments: Array<{
      id: string;
      slotId: string;
      volunteerId: string;
      roleId: string;
      status: 'draft' | 'pending' | 'confirmed' | 'declined' | 'cancelled';
      volunteerName: string;
    }>;
    volunteerAvailability: Array<{
      volunteerId: string;
      volunteerName: string;
      status: 'AVAILABLE' | 'UNAVAILABLE' | 'DOUBLE_BOOKED';
      conflictingId?: string;
    }>;
  }
  ```

### 2. `upsertSlotRequirement`
- **Input**:
  ```typescript
  z.object({
    timeSlotId: z.string().uuid(),
    roleId: z.string().uuid(),
    count: z.number().int().min(1),
  })
  ```
- **Output**:
  ```typescript
  interface UpsertSlotRequirementResponse {
    requirement: {
      id: string;
      slotId: string;
      roleId: string;
      requiredCount: number;
    };
    warning?: string; // e.g., "Slot is overstaffed: 2 assignments exist for requirement count 1"
  }
  ```

### 3. `createAssignment`
- **Input**:
  ```typescript
  z.object({
    timeSlotId: z.string().uuid(),
    volunteerId: z.string().uuid(),
    roleId: z.string().uuid(),
    allowOverride: z.boolean().optional(),
    overrideReason: z.string().optional(),
    asDraft: z.boolean().optional(),
  })
  ```
- **Output**:
  ```typescript
  interface CreateAssignmentResponse {
    assignment?: {
      id: string;
      slotId: string;
      volunteerId: string;
      roleId: string;
      status: 'draft' | 'pending' | 'confirmed';
    };
    conflictReport?: {
      hasConflicts: true;
      issues: Array<{
        type: 'UNAVAILABLE' | 'DOUBLE_BOOKED' | 'FAIRNESS_EXCEEDED';
        details: string;
        conflictingId?: string;
      }>;
    };
  }
  ```

### 4. `deleteAssignment`
- **Input**:
  ```typescript
  z.object({
    assignmentId: z.string().uuid(),
  })
  ```
- **Output**:
  ```typescript
  interface DeleteAssignmentResponse {
    success: true;
    transition: 'deleted' | 'cancelled';
  }
  ```

### 5. `publishEvent`
- **Input**:
  ```typescript
  z.object({
    eventId: z.string().uuid(),
  })
  ```
- **Output**:
  ```typescript
  interface PublishEventResponse {
    success: true;
    transitionedCount: number;
  }
  ```

### 6. `cancelEvent`
- **Input**:
  ```typescript
  z.object({
    eventId: z.string().uuid(),
  })
  ```
- **Output**:
  ```typescript
  interface CancelEventResponse {
    success: true;
    cancelledCount: number;
    deletedCount: number;
  }
  ```
