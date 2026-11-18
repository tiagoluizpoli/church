import { isInstant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from '@/api/dtos/event-time-block.dto';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';

describe('eventTimeBlockMapper', () => {
  describe('requirementToResponse', () => {
    it('maps a requirement with sectorId and notes present', () => {
      const requirement = new ShiftRequirement({
        props: {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          sectorName: 'Palco',
          peopleNeeded: 3,
          notes: 'bring a friend',
        },
        id: 'req-1',
      });

      const response = eventTimeBlockMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-1',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 3,
        notes: 'bring a friend',
      });
    });

    it('maps a requirement with sectorId and notes absent', () => {
      const requirement = new ShiftRequirement({
        props: {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          sectorName: 'Palco',
          peopleNeeded: 1,
        },
        id: 'req-2',
      });

      const response = eventTimeBlockMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-2',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 1,
        notes: undefined,
      });
    });
  });

  describe('toResponse', () => {
    it('maps an event time block with a label and non-empty requirements', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const requirement = new ShiftRequirement({
        props: {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          sectorName: 'Palco',
          peopleNeeded: 2,
        },
        id: 'req-1',
      });
      const eventTimeBlock = new EventTimeBlock({
        props: {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Morning Event time block',
          requirements: [requirement],
        },
        id: 'event-time-block-1',
      });

      const response = eventTimeBlockMapper.toResponse(eventTimeBlock);

      expect(response).toEqual({
        id: 'event-time-block-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime,
        endTime: endTime,
        label: 'Morning Event time block',
        status: 'active',
        requirements: [
          {
            id: 'req-1',
            eventTimeBlockId: 'event-time-block-1',
            roleId: 'role-1',
            sectorId: 'sector-1',
            peopleNeeded: 2,
            notes: undefined,
          },
        ],
      });
      expect(() => eventTimeBlockResponseSchema.parse(response)).not.toThrow();
      expect(isInstant({ value: response.startTime })).toBe(true);
      expect(isInstant({ value: response.endTime })).toBe(true);
    });

    it('maps an event time block with no label and empty requirements', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const eventTimeBlock = new EventTimeBlock({
        props: {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
        },
        id: 'event-time-block-2',
      });

      const response = eventTimeBlockMapper.toResponse(eventTimeBlock);

      expect(response).toEqual({
        id: 'event-time-block-2',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime,
        endTime: endTime,
        label: undefined,
        status: 'active',
        requirements: [],
      });
    });
  });

  describe('listToResponse', () => {
    it('maps an empty list of event time blocks', () => {
      expect(eventTimeBlockMapper.listToResponse([])).toEqual({
        eventTimeBlocks: [],
      });
    });

    it('maps a non-empty list of event time blocks', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const eventTimeBlock = new EventTimeBlock({
        props: {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Event time block A',
        },
        id: 'event-time-block-3',
      });

      const response = eventTimeBlockMapper.listToResponse([eventTimeBlock]);

      expect(response.eventTimeBlocks).toHaveLength(1);
      expect(response.eventTimeBlocks[0]).toEqual({
        id: 'event-time-block-3',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime,
        endTime: endTime,
        label: 'Event time block A',
        status: 'active',
        requirements: [],
      });
    });
  });
});
