import { NotFoundError } from '@church/core';
import { compareInstants, fromDate, parseInstant } from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  RoleId,
  SectorId,
} from '@/domain/branded-ids';
import type {
  CountActiveAssignmentsInput,
  CreateEventTimeBlockRepositoryInput,
  EventTimeBlockRepository,
  EventTimeBlocksByEventInput,
  FindOverlappingEventTimeBlocksInput,
  GetEventTimeBlockInput,
  UpdateEventTimeBlockRepositoryInput,
} from '@/domain/contracts/infrastructure/event-time-block.repository';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import {
  ShiftRequirement,
  type ShiftRequirementId,
} from '@/domain/entities/shift-requirement';
import { runEventTimeBlockRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/event-time-block.contract-spec';

class MockEventTimeBlockRepository implements EventTimeBlockRepository {
  private eventTimeBlocks = new Map<string, EventTimeBlock>();
  private idCounter = 1;

  constructor() {
    const req = new ShiftRequirement(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventTimeBlockId:
          '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        sectorId: '55555555-5555-5555-5555-5555555555a1' as SectorId,
        sectorName: 'Palco',
        peopleNeeded: 1,
      },
      '88888888-8888-8888-8888-888888888881' as ShiftRequirementId,
    );

    const eventTimeBlock = new EventTimeBlock(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: '66666666-6666-6666-6666-666666666661' as EventId,
        startTime: parseInstant({ value: '2024-06-05T10:00:00Z' }),
        endTime: parseInstant({ value: '2024-06-05T12:00:00Z' }),
        status: 'active',
        requirements: [req],
      },
      '77777777-7777-7777-7777-777777777771' as EventTimeBlockId,
    );

    this.eventTimeBlocks.set(eventTimeBlock.id, eventTimeBlock);
  }

  async getById({
    churchId,
    eventTimeBlockId: id,
  }: GetEventTimeBlockInput): Promise<EventTimeBlock> {
    const eventTimeBlock = this.eventTimeBlocks.get(id);
    if (!eventTimeBlock || eventTimeBlock.churchId !== churchId) {
      throw new NotFoundError('Event time block not found');
    }
    return eventTimeBlock;
  }

  async listByEvent({
    churchId,
    eventId,
  }: EventTimeBlocksByEventInput): Promise<EventTimeBlock[]> {
    return Array.from(this.eventTimeBlocks.values()).filter(
      (s) => s.churchId === churchId && s.eventId === eventId,
    );
  }

  async deleteByEvent({
    churchId,
    eventId,
  }: EventTimeBlocksByEventInput): Promise<void> {
    for (const eventTimeBlock of Array.from(this.eventTimeBlocks.values())) {
      if (
        eventTimeBlock.churchId === churchId &&
        eventTimeBlock.eventId === eventId
      ) {
        this.eventTimeBlocks.delete(eventTimeBlock.id);
      }
    }
  }

  async countActiveAssignments(
    _input: CountActiveAssignmentsInput,
  ): Promise<number> {
    return 0;
  }

  async create({
    churchId,
    input,
  }: CreateEventTimeBlockRepositoryInput): Promise<EventTimeBlock> {
    const id = `event-time-block-gen-${this.idCounter++}` as EventTimeBlockId;
    const eventTimeBlock = new EventTimeBlock(
      {
        churchId,
        eventId: input.eventId,
        startTime: fromDate({ date: input.startTime }),
        endTime: fromDate({ date: input.endTime }),
        label: input.label,
        status: 'active',
        requirements: [],
      },
      id,
    );
    this.eventTimeBlocks.set(eventTimeBlock.id, eventTimeBlock);
    return eventTimeBlock;
  }

  async update({
    churchId,
    eventTimeBlockId: id,
    input,
  }: UpdateEventTimeBlockRepositoryInput): Promise<EventTimeBlock> {
    const existing = await this.getById({ churchId, eventTimeBlockId: id });
    const updated = new EventTimeBlock(
      {
        churchId: existing.churchId,
        eventId: existing.eventId,
        startTime: input.startTime
          ? fromDate({ date: input.startTime })
          : existing.startTime,
        endTime: input.endTime
          ? fromDate({ date: input.endTime })
          : existing.endTime,
        label: input.label ?? existing.label,
        status: existing.status,
        requirements: existing.requirements,
      },
      existing.id,
    );
    this.eventTimeBlocks.set(updated.id, updated);
    return updated;
  }

  async deleteById({
    churchId,
    eventTimeBlockId: id,
  }: GetEventTimeBlockInput): Promise<void> {
    const eventTimeBlock = this.eventTimeBlocks.get(id);
    if (eventTimeBlock && eventTimeBlock.churchId === churchId) {
      this.eventTimeBlocks.delete(id);
    }
  }

  async findOverlapping({
    churchId,
    eventId,
    startTime,
    endTime,
    excludeEventTimeBlockId,
  }: FindOverlappingEventTimeBlocksInput): Promise<EventTimeBlock[]> {
    return Array.from(this.eventTimeBlocks.values()).filter(
      (eventTimeBlock) =>
        eventTimeBlock.churchId === churchId &&
        eventTimeBlock.eventId === eventId &&
        eventTimeBlock.id !== excludeEventTimeBlockId &&
        compareInstants({
          left: eventTimeBlock.startTime,
          right: fromDate({ date: endTime }),
        }) < 0 &&
        compareInstants({
          left: eventTimeBlock.endTime,
          right: fromDate({ date: startTime }),
        }) > 0,
    );
  }
}

runEventTimeBlockRepositoryContractTests(
  async () => new MockEventTimeBlockRepository(),
  async () => {},
);
