import { NotFoundError } from '@church/core';
import { runTimeSlotRepositoryContractTests } from '../../../src/application/contracts/contract-tests/time-slot.contract-spec';
import type {
  BulkCreateTimeSlotsInput,
  CreateTimeSlotInput,
  TimeSlotRepository,
  UpdateTimeSlotInput,
  UpsertSlotRequirementInput,
} from '../../../src/application/contracts/time-slot.repository';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import type { RoleId } from '../../../src/domain/entities/role';
import {
  SlotRequirement,
  type SlotRequirementId,
} from '../../../src/domain/entities/slot-requirement';
import {
  TimeSlot,
  type TimeSlotId,
} from '../../../src/domain/entities/time-slot';

class MockTimeSlotRepository implements TimeSlotRepository {
  private slots = new Map<string, TimeSlot>();
  private idCounter = 1;

  constructor() {
    const req = new SlotRequirement(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        slotId: '77777777-7777-7777-7777-777777777771' as TimeSlotId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        requiredCount: 1,
      },
      '88888888-8888-8888-8888-888888888881' as SlotRequirementId,
    );

    const slot = new TimeSlot(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
        startTime: new Date('2024-06-05T10:00:00Z'),
        endTime: new Date('2024-06-05T12:00:00Z'),
        status: 'active',
        requirements: [req],
      },
      '77777777-7777-7777-7777-777777777771' as TimeSlotId,
    );

    this.slots.set(slot.id, slot);
  }

  async getById(churchId: ChurchId, id: TimeSlotId): Promise<TimeSlot> {
    const slot = this.slots.get(id);
    if (!slot || slot.churchId !== churchId) {
      throw new NotFoundError('Time slot not found');
    }
    return slot;
  }

  async listByEvent(churchId: ChurchId, eventId: EventId): Promise<TimeSlot[]> {
    return Array.from(this.slots.values()).filter(
      (s) => s.churchId === churchId && s.eventId === eventId,
    );
  }

  async bulkCreate(
    churchId: ChurchId,
    input: BulkCreateTimeSlotsInput,
  ): Promise<TimeSlot[]> {
    const created: TimeSlot[] = [];
    for (const item of input.slots) {
      const slotId = `slot-gen-${this.idCounter++}` as TimeSlotId;
      const requirements = (item.requirements ?? []).map((reqItem, index) => {
        return new SlotRequirement(
          {
            churchId,
            slotId,
            roleId: reqItem.roleId,
            teamId: reqItem.teamId,
            requiredCount: reqItem.requiredCount,
            notes: reqItem.notes,
          },
          `req-gen-${slotId}-${index}` as SlotRequirementId,
        );
      });

      const slot = new TimeSlot(
        {
          churchId,
          eventId: input.eventId,
          startTime: item.startTime,
          endTime: item.endTime,
          label: item.label,
          status: 'active',
          requirements,
        },
        slotId,
      );

      this.slots.set(slot.id, slot);
      created.push(slot);
    }
    return created;
  }

  async deleteByEvent(churchId: ChurchId, eventId: EventId): Promise<void> {
    for (const slot of Array.from(this.slots.values())) {
      if (slot.churchId === churchId && slot.eventId === eventId) {
        this.slots.delete(slot.id);
      }
    }
  }

  async upsertRequirement(
    churchId: ChurchId,
    slotId: TimeSlotId,
    input: UpsertSlotRequirementInput,
  ): Promise<SlotRequirement> {
    return new SlotRequirement(
      {
        churchId,
        slotId,
        roleId: input.roleId,
        requiredCount: input.requiredCount,
        teamId: input.teamId,
        notes: input.notes,
      },
      `req-upsert-${slotId}` as SlotRequirementId,
    );
  }

  async countActiveAssignments(
    _churchId: ChurchId,
    _slotId: TimeSlotId,
    _roleId: RoleId,
  ): Promise<number> {
    return 0;
  }

  async create(
    churchId: ChurchId,
    input: CreateTimeSlotInput,
  ): Promise<TimeSlot> {
    const id = `slot-gen-${this.idCounter++}` as TimeSlotId;
    const slot = new TimeSlot(
      {
        churchId,
        eventId: input.eventId,
        startTime: input.startTime,
        endTime: input.endTime,
        label: input.label,
        status: 'active',
        requirements: [],
      },
      id,
    );
    this.slots.set(slot.id, slot);
    return slot;
  }

  async update(
    churchId: ChurchId,
    id: TimeSlotId,
    input: UpdateTimeSlotInput,
  ): Promise<TimeSlot> {
    const existing = await this.getById(churchId, id);
    const updated = new TimeSlot(
      {
        churchId: existing.churchId,
        eventId: existing.eventId,
        startTime: input.startTime ?? existing.startTime,
        endTime: input.endTime ?? existing.endTime,
        label: input.label ?? existing.label,
        status: existing.status,
        requirements: existing.requirements,
      },
      existing.id,
    );
    this.slots.set(updated.id, updated);
    return updated;
  }

  async deleteById(churchId: ChurchId, id: TimeSlotId): Promise<void> {
    const slot = this.slots.get(id);
    if (slot && slot.churchId === churchId) {
      this.slots.delete(id);
    }
  }

  async findOverlapping(
    churchId: ChurchId,
    eventId: EventId,
    startTime: Date,
    endTime: Date,
    excludeSlotId?: TimeSlotId,
  ): Promise<TimeSlot[]> {
    return Array.from(this.slots.values()).filter(
      (slot) =>
        slot.churchId === churchId &&
        slot.eventId === eventId &&
        slot.id !== excludeSlotId &&
        slot.startTime < endTime &&
        slot.endTime > startTime,
    );
  }
}

runTimeSlotRepositoryContractTests(
  async () => new MockTimeSlotRepository(),
  async () => {},
);
