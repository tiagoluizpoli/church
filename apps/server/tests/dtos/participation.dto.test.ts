import { isCalendarDay, isInstant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  participationMapper,
  shiftResponseSchema,
} from '@/api/dtos/participation.dto';
import { CycleId } from '@/domain/branded-ids';
import type {
  CycleParticipationView,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
  ScheduleSummaryView,
} from '@/domain/contracts/application/participation-manager';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';

function buildParticipation(): MinistryParticipation {
  return new MinistryParticipation({
    props: {
      churchId: 'church-1',
      ministryId: 'ministry-1',
      eventId: 'event-1',
      state: 'assigning',
    },
    id: 'participation-1',
  });
}

function buildEvent(): Event {
  return new Event(
    {
      churchId: 'church-1',
      cycleId: 'cycle-1',
      title: 'Sunday Service',
      start: parseInstant({ value: '2026-05-15T09:00:00Z' }),
      end: parseInstant({ value: '2026-05-15T11:00:00Z' }),
    },
    'event-1',
  );
}

function buildEventTimeBlock(): EventTimeBlock {
  return new EventTimeBlock(
    {
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: parseInstant({ value: '2026-05-15T09:00:00Z' }),
      endTime: parseInstant({ value: '2026-05-15T10:00:00Z' }),
      label: 'Event time block A',
    },
    'event-time-block-1',
  );
}

function buildShift(label?: string): Shift {
  return new Shift({
    props: {
      churchId: 'church-1',
      participationId: 'participation-1',
      eventTimeBlockId: 'event-time-block-1',
      startTime: parseInstant({ value: '2026-05-15T09:00:00Z' }),
      endTime: parseInstant({ value: '2026-05-15T09:30:00Z' }),
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
        state: 'assigning',
      });
    });
  });

  describe('shiftToResponse', () => {
    it('maps a shift with a label present', () => {
      const shift = buildShift('First Half');

      expect(participationMapper.shiftToResponse(shift)).toEqual({
        id: 'shift-1',
        participationId: 'participation-1',
        eventTimeBlockId: 'event-time-block-1',
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: 'First Half',
      });
      const response = participationMapper.shiftToResponse(shift);
      expect(() => shiftResponseSchema.parse(response)).not.toThrow();
      expect(isInstant({ value: response.startTime })).toBe(true);
      expect(isInstant({ value: response.endTime })).toBe(true);
    });

    it('maps a shift with no label', () => {
      const shift = buildShift();

      expect(participationMapper.shiftToResponse(shift)).toEqual({
        id: 'shift-1',
        participationId: 'participation-1',
        eventTimeBlockId: 'event-time-block-1',
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: undefined,
      });
    });
  });

  describe('requirementToResponse', () => {
    it('maps a requirement with shiftId, participationId, sectorId, and notes present', () => {
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          shiftId: 'shift-1',
          participationId: 'participation-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          peopleNeeded: 2,
          notes: 'arrive early',
        },
        'req-1',
      );

      expect(participationMapper.requirementToResponse(requirement)).toEqual({
        id: 'req-1',
        shiftId: 'shift-1',
        participationId: 'participation-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 2,
        notes: 'arrive early',
      });
    });

    it('maps a requirement with shiftId, participationId, sectorId, and notes absent', () => {
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          peopleNeeded: 1,
        },
        'req-2',
      );

      expect(participationMapper.requirementToResponse(requirement)).toEqual({
        id: 'req-2',
        shiftId: '',
        participationId: '',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 1,
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
        eventTimeBlockId: 'event-time-block-1',
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: 'Only Shift',
      });
    });
  });

  describe('cycleViewToResponse', () => {
    it('maps a full nested structure with populated event time blocks, shifts, and requirements', () => {
      const participation = buildParticipation();
      const event = buildEvent();
      const eventTimeBlock = buildEventTimeBlock();
      const shift = buildShift('Morning Shift');
      const requirement = new ShiftRequirement(
        {
          churchId: 'church-1',
          eventTimeBlockId: 'event-time-block-1',
          shiftId: 'shift-1',
          participationId: 'participation-1',
          roleId: 'role-1',
          sectorId: 'sector-1',
          peopleNeeded: 1,
        },
        'req-1',
      );

      const populatedEventTimeBlockView: ParticipationEventTimeBlockView = {
        eventTimeBlock,
        included: true,
        shifts: [shift],
        requirements: [requirement],
      };

      const emptyEventTimeBlockView: ParticipationEventTimeBlockView = {
        eventTimeBlock: buildEventTimeBlock(),
        included: false,
        shifts: [],
        requirements: [],
      };

      const eventView: ParticipationEventView = {
        participation,
        event,
        eventTimeBlocks: [populatedEventTimeBlockView, emptyEventTimeBlockView],
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
      expect(mappedEventView.eventTimeBlocks).toHaveLength(2);

      const [populatedEventTimeBlock, emptyEventTimeBlock] =
        mappedEventView.eventTimeBlocks;
      if (!populatedEventTimeBlock || !emptyEventTimeBlock) {
        throw new Error('expected mapped event time blocks');
      }
      expect(populatedEventTimeBlock.included).toBe(true);
      expect(populatedEventTimeBlock.shifts).toHaveLength(1);
      expect(populatedEventTimeBlock.requirements).toHaveLength(1);
      expect(populatedEventTimeBlock.requirements[0]).toEqual({
        id: 'req-1',
        shiftId: 'shift-1',
        participationId: 'participation-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 1,
        notes: undefined,
      });

      expect(emptyEventTimeBlock.included).toBe(false);
      expect(emptyEventTimeBlock.shifts).toEqual([]);
      expect(emptyEventTimeBlock.requirements).toEqual([]);
    });

    it('maps an empty events list', () => {
      const view: CycleParticipationView = { events: [] };

      expect(participationMapper.cycleViewToResponse(view)).toEqual({
        events: [],
      });
    });
  });

  describe('scheduleSummaryListToResponse', () => {
    it('maps a summary view, recovering its CalendarDay bounds from raw Dates', () => {
      const view: ScheduleSummaryView = {
        cycleId: CycleId.from('cycle-1'),
        name: 'July 2026',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-08-01T00:00:00.000Z'),
        isPartOf: true,
        eventCount: 4,
        eventTimeBlockCount: 8,
        status: 'in_progress',
        availabilityRequestedForAll: false,
        availabilityRequestedForAny: true,
      };

      const response = participationMapper.scheduleSummaryListToResponse([
        view,
      ]);

      expect(response.cycles).toEqual([
        {
          cycleId: 'cycle-1',
          name: 'July 2026',
          startDate: '2026-07-01',
          endDate: '2026-08-01',
          isPartOf: true,
          eventCount: 4,
          eventTimeBlockCount: 8,
          status: 'in_progress',
          availabilityRequestedForAll: false,
          availabilityRequestedForAny: true,
        },
      ]);
      const summary = response.cycles[0];
      if (!summary) throw new Error('expected a mapped summary');
      expect(isCalendarDay({ value: summary.startDate })).toBe(true);
      expect(isCalendarDay({ value: summary.endDate })).toBe(true);
    });
  });
});
