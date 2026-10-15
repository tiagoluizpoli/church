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
    it('maps a requirement with teamId and notes present', () => {
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          teamId: 'team-1',
          peopleNeeded: 3,
          notes: 'bring a friend',
        },
        'req-1',
      );

      const response = eventTimeBlockMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-1',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        teamId: 'team-1',
        peopleNeeded: 3,
        notes: 'bring a friend',
      });
    });

    it('maps a requirement with teamId and notes absent', () => {
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          peopleNeeded: 1,
        },
        'req-2',
      );

      const response = eventTimeBlockMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-2',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        teamId: undefined,
        peopleNeeded: 1,
        notes: undefined,
      });
    });
  });

  describe('toResponse', () => {
    it('maps a slot with a label and non-empty requirements', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          peopleNeeded: 2,
        },
        'req-1',
      );
      const slot = new EventTimeBlock(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Morning Slot',
          requirements: [requirement],
        },
        'event-time-block-1',
      );

      const response = eventTimeBlockMapper.toResponse(slot);

      expect(response).toEqual({
        id: 'event-time-block-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime,
        endTime: endTime,
        label: 'Morning Slot',
        status: 'active',
        requirements: [
          {
            id: 'req-1',
            eventTimeBlockId: 'event-time-block-1',
            roleId: 'role-1',
            teamId: undefined,
            peopleNeeded: 2,
            notes: undefined,
          },
        ],
      });
      expect(() => eventTimeBlockResponseSchema.parse(response)).not.toThrow();
      expect(isInstant({ value: response.startTime })).toBe(true);
      expect(isInstant({ value: response.endTime })).toBe(true);
    });

    it('maps a slot with no label and empty requirements', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const slot = new EventTimeBlock(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
        },
        'event-time-block-2',
      );

      const response = eventTimeBlockMapper.toResponse(slot);

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
    it('maps an empty list of slots', () => {
      expect(eventTimeBlockMapper.listToResponse([])).toEqual({ slots: [] });
    });

    it('maps a non-empty list of slots', () => {
      const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
      const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
      const slot = new EventTimeBlock(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Slot A',
        },
        'event-time-block-3',
      );

      const response = eventTimeBlockMapper.listToResponse([slot]);

      expect(response.slots).toHaveLength(1);
      expect(response.slots[0]).toEqual({
        id: 'event-time-block-3',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime,
        endTime: endTime,
        label: 'Slot A',
        status: 'active',
        requirements: [],
      });
    });
  });
});
