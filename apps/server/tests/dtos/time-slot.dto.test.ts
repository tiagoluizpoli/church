import { describe, expect, it } from 'vitest';
import { timeSlotMapper } from '../../src/api/dtos/time-slot.dto';
import { SlotRequirement } from '../../src/domain/entities/slot-requirement';
import { TimeSlot } from '../../src/domain/entities/time-slot';

describe('timeSlotMapper', () => {
  describe('requirementToResponse', () => {
    it('maps a requirement with teamId and notes present', () => {
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          roleId: 'role-1',
          teamId: 'team-1',
          requiredCount: 3,
          notes: 'bring a friend',
        },
        'req-1',
      );

      const response = timeSlotMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-1',
        slotId: 'slot-1',
        roleId: 'role-1',
        teamId: 'team-1',
        requiredCount: 3,
        notes: 'bring a friend',
      });
    });

    it('maps a requirement with teamId and notes absent', () => {
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          roleId: 'role-1',
          requiredCount: 1,
        },
        'req-2',
      );

      const response = timeSlotMapper.requirementToResponse(requirement);

      expect(response).toEqual({
        id: 'req-2',
        slotId: 'slot-1',
        roleId: 'role-1',
        teamId: undefined,
        requiredCount: 1,
        notes: undefined,
      });
    });
  });

  describe('toResponse', () => {
    it('maps a slot with a label and non-empty requirements', () => {
      const startTime = new Date('2026-05-15T10:00:00Z');
      const endTime = new Date('2026-05-15T12:00:00Z');
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          roleId: 'role-1',
          requiredCount: 2,
        },
        'req-1',
      );
      const slot = new TimeSlot(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Morning Slot',
          requirements: [requirement],
        },
        'slot-1',
      );

      const response = timeSlotMapper.toResponse(slot);

      expect(response).toEqual({
        id: 'slot-1',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        label: 'Morning Slot',
        status: 'active',
        requirements: [
          {
            id: 'req-1',
            slotId: 'slot-1',
            roleId: 'role-1',
            teamId: undefined,
            requiredCount: 2,
            notes: undefined,
          },
        ],
      });
    });

    it('maps a slot with no label and empty requirements', () => {
      const startTime = new Date('2026-05-15T10:00:00Z');
      const endTime = new Date('2026-05-15T12:00:00Z');
      const slot = new TimeSlot(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
        },
        'slot-2',
      );

      const response = timeSlotMapper.toResponse(slot);

      expect(response).toEqual({
        id: 'slot-2',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        label: undefined,
        status: 'active',
        requirements: [],
      });
    });
  });

  describe('listToResponse', () => {
    it('maps an empty list of slots', () => {
      expect(timeSlotMapper.listToResponse([])).toEqual({ slots: [] });
    });

    it('maps a non-empty list of slots', () => {
      const startTime = new Date('2026-05-15T10:00:00Z');
      const endTime = new Date('2026-05-15T12:00:00Z');
      const slot = new TimeSlot(
        {
          churchId: 'church-1',
          eventId: 'event-1',
          startTime,
          endTime,
          label: 'Slot A',
        },
        'slot-3',
      );

      const response = timeSlotMapper.listToResponse([slot]);

      expect(response.slots).toHaveLength(1);
      expect(response.slots[0]).toEqual({
        id: 'slot-3',
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        label: 'Slot A',
        status: 'active',
        requirements: [],
      });
    });
  });
});
