import { describe, expect, it } from 'vitest';
import { participationMapper } from '../../src/api/dtos/participation.dto';
import type {
  CycleParticipationView,
  ParticipationEventView,
  ParticipationSlotView,
} from '../../src/domain/contracts/application/participation-manager';
import { Event } from '../../src/domain/entities/event';
import { MinistryParticipation } from '../../src/domain/entities/ministry-participation';
import { Shift } from '../../src/domain/entities/shift';
import { SlotRequirement } from '../../src/domain/entities/slot-requirement';
import { TimeSlot } from '../../src/domain/entities/time-slot';

function buildParticipation(): MinistryParticipation {
  return new MinistryParticipation({
    props: {
      churchId: 'church-1',
      ministryId: 'ministry-1',
      eventId: 'event-1',
      state: 'rostering',
    },
    id: 'participation-1',
  });
}

function buildEvent(): Event {
  return new Event(
    {
      churchId: 'church-1',
      planningCycleId: 'cycle-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-15T09:00:00Z'),
      endDate: new Date('2026-05-15T11:00:00Z'),
    },
    'event-1',
  );
}

function buildSlot(): TimeSlot {
  return new TimeSlot(
    {
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: new Date('2026-05-15T09:00:00Z'),
      endTime: new Date('2026-05-15T10:00:00Z'),
      label: 'Slot A',
    },
    'slot-1',
  );
}

function buildShift(label?: string): Shift {
  return new Shift({
    props: {
      churchId: 'church-1',
      participationId: 'participation-1',
      timeSlotId: 'slot-1',
      startTime: new Date('2026-05-15T09:00:00Z'),
      endTime: new Date('2026-05-15T09:30:00Z'),
      label,
    },
    id: 'shift-1',
  });
}

describe('participationMapper', () => {
  describe('toResponse', () => {
    it('maps a participation entity', () => {
      const participation = buildParticipation();

      expect(participationMapper.toResponse(participation)).toEqual({
        id: 'participation-1',
        churchId: 'church-1',
        ministryId: 'ministry-1',
        eventId: 'event-1',
        state: 'rostering',
      });
    });
  });

  describe('shiftToResponse', () => {
    it('maps a shift with a label present', () => {
      const shift = buildShift('First Half');

      expect(participationMapper.shiftToResponse(shift)).toEqual({
        id: 'shift-1',
        participationId: 'participation-1',
        timeSlotId: 'slot-1',
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        label: 'First Half',
      });
    });

    it('maps a shift with no label', () => {
      const shift = buildShift();

      expect(participationMapper.shiftToResponse(shift)).toEqual({
        id: 'shift-1',
        participationId: 'participation-1',
        timeSlotId: 'slot-1',
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        label: undefined,
      });
    });
  });

  describe('requirementToResponse', () => {
    it('maps a requirement with shiftId, participationId, teamId, and notes present', () => {
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          shiftId: 'shift-1',
          participationId: 'participation-1',
          roleId: 'role-1',
          teamId: 'team-1',
          requiredCount: 2,
          notes: 'arrive early',
        },
        'req-1',
      );

      expect(participationMapper.requirementToResponse(requirement)).toEqual({
        id: 'req-1',
        shiftId: 'shift-1',
        participationId: 'participation-1',
        roleId: 'role-1',
        teamId: 'team-1',
        requiredCount: 2,
        notes: 'arrive early',
      });
    });

    it('maps a requirement with shiftId, participationId, teamId, and notes absent', () => {
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          roleId: 'role-1',
          requiredCount: 1,
        },
        'req-2',
      );

      expect(participationMapper.requirementToResponse(requirement)).toEqual({
        id: 'req-2',
        shiftId: '',
        participationId: '',
        roleId: 'role-1',
        teamId: undefined,
        requiredCount: 1,
        notes: undefined,
      });
    });
  });

  describe('shiftListToResponse', () => {
    it('maps an empty list of shifts', () => {
      expect(participationMapper.shiftListToResponse([])).toEqual({
        shifts: [],
      });
    });

    it('maps a non-empty list of shifts', () => {
      const shift = buildShift('Only Shift');

      const response = participationMapper.shiftListToResponse([shift]);

      expect(response.shifts).toHaveLength(1);
      expect(response.shifts[0]).toEqual({
        id: 'shift-1',
        participationId: 'participation-1',
        timeSlotId: 'slot-1',
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        label: 'Only Shift',
      });
    });
  });

  describe('cycleViewToResponse', () => {
    it('maps a full nested structure with populated slots, shifts, and requirements', () => {
      const participation = buildParticipation();
      const event = buildEvent();
      const slot = buildSlot();
      const shift = buildShift('Morning Shift');
      const requirement = new SlotRequirement(
        {
          churchId: 'church-1',
          slotId: 'slot-1',
          shiftId: 'shift-1',
          participationId: 'participation-1',
          roleId: 'role-1',
          requiredCount: 1,
        },
        'req-1',
      );

      const populatedSlotView: ParticipationSlotView = {
        slot,
        included: true,
        shifts: [shift],
        requirements: [requirement],
      };

      const emptySlotView: ParticipationSlotView = {
        slot: buildSlot(),
        included: false,
        shifts: [],
        requirements: [],
      };

      const eventView: ParticipationEventView = {
        participation,
        event,
        slots: [populatedSlotView, emptySlotView],
      };

      const view: CycleParticipationView = {
        events: [eventView],
      };

      const response = participationMapper.cycleViewToResponse(view);

      expect(response.events).toHaveLength(1);
      const [mappedEventView] = response.events;
      if (!mappedEventView) {
        throw new Error('expected mapped event view');
      }
      expect(mappedEventView.participation).toEqual(
        participationMapper.toResponse(participation),
      );
      expect(mappedEventView.slots).toHaveLength(2);

      const [populatedSlot, emptySlot] = mappedEventView.slots;
      if (!populatedSlot || !emptySlot) {
        throw new Error('expected mapped slots');
      }
      expect(populatedSlot.included).toBe(true);
      expect(populatedSlot.shifts).toHaveLength(1);
      expect(populatedSlot.requirements).toHaveLength(1);
      expect(populatedSlot.requirements[0]).toEqual({
        id: 'req-1',
        shiftId: 'shift-1',
        participationId: 'participation-1',
        roleId: 'role-1',
        teamId: undefined,
        requiredCount: 1,
        notes: undefined,
      });

      expect(emptySlot.included).toBe(false);
      expect(emptySlot.shifts).toEqual([]);
      expect(emptySlot.requirements).toEqual([]);
    });

    it('maps an empty events list', () => {
      const view: CycleParticipationView = { events: [] };

      expect(participationMapper.cycleViewToResponse(view)).toEqual({
        events: [],
      });
    });
  });
});
