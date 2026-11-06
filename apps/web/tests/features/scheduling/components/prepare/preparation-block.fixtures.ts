import type {
  GetCycleParticipation200EventsItem,
  ListSchedules200SchedulesItem,
  GetCycleParticipation200EventsItemEventTimeBlocksItem as PreparationBlock,
  GetCycleParticipation200EventsItemEventTimeBlocksItemShiftsItemRequirementsItem as PreparationRequirement,
  GetCycleParticipation200EventsItemEventTimeBlocksItemShiftsItem as PreparationShift,
} from '@/infrastructure/api/churchAPI.schemas';

export const MINISTRY_ID = '11111111-1111-4111-8111-111111111111';
export const CYCLE_ID = '22222222-2222-4222-8222-222222222222';
export const BLOCK_ID = '33333333-3333-4333-8333-333333333333';
export const PARTICIPATION_ID = '44444444-4444-4444-8444-444444444444';
export const SHIFT_ID = '55555555-5555-4555-8555-555555555555';
export const SECTORS = [
  { id: 'sector-stage', name: 'Stage' },
  { id: 'sector-door', name: 'Door' },
];
export const ROLES = [{ id: 'role-singer', name: 'Singer' }];
export const SCHEDULE: ListSchedules200SchedulesItem = {
  ministry: { id: MINISTRY_ID, name: 'Worship' },
  cycle: {
    id: CYCLE_ID,
    name: 'January 2027',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    state: 'sent',
  },
  stage: 'to_prepare',
};
export const REQUIREMENT: PreparationRequirement = {
  id: 'requirement-1',
  shiftId: SHIFT_ID,
  participationId: PARTICIPATION_ID,
  roleId: 'role-singer',
  sectorId: 'sector-stage',
  sectorName: 'Stage',
  peopleNeeded: 2,
  assignedCount: 0,
};
export const SHIFT: PreparationShift = {
  id: SHIFT_ID,
  participationId: PARTICIPATION_ID,
  eventTimeBlockId: BLOCK_ID,
  startTime: '2027-01-04T01:00:00.000Z',
  endTime: '2027-01-04T05:00:00.000Z',
  requirements: [REQUIREMENT],
  unavailableMarkCount: 0,
  assignmentCount: 0,
  flagged: false,
};
export const BLOCK: PreparationBlock = {
  eventTimeBlock: {
    id: BLOCK_ID,
    eventId: 'event-1',
    churchId: 'church-1',
    startTime: '2027-01-04T01:00:00.000Z',
    endTime: '2027-01-04T05:00:00.000Z',
    label: 'Night',
    status: 'active',
    requirements: [],
  },
  included: true,
  shiftsChangedAfterAsk: false,
  shifts: [SHIFT],
  requirements: [],
};
export const EVENT: GetCycleParticipation200EventsItem = {
  participation: {
    id: PARTICIPATION_ID,
    ministryId: MINISTRY_ID,
    churchId: 'church-1',
    eventId: 'event-1',
    state: 'preparing',
  },
  event: {
    id: 'event-1',
    churchId: 'church-1',
    cycleId: CYCLE_ID,
    title: 'Sunday',
    start: '2027-01-04T01:00:00.000Z',
    end: '2027-01-04T05:00:00.000Z',
    status: 'scheduled',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  generatedFromTemplate: false,
  eventTimeBlocks: [BLOCK],
};
export const EDITOR_PATH = `/schedules/${MINISTRY_ID}/${CYCLE_ID}/slots/${BLOCK_ID}`;
