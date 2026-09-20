import { parseInstant, resetClock, setTestClock } from '@church/time';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import type {
  AssignmentId,
  ChurchId,
  MinistryId,
  MinistryParticipationId,
  PlanningCycleId,
  RoleId,
  ShiftId,
  TeamId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import type { TransactionContext } from '../../src/domain/contracts/infrastructure/transaction-context';
import { Assignment } from '../../src/domain/entities/assignment';
import { Event } from '../../src/domain/entities/event';
import { Ministry } from '../../src/domain/entities/ministry';
import { MinistryParticipation } from '../../src/domain/entities/ministry-participation';
import { Shift } from '../../src/domain/entities/shift';
import { SlotRequirement } from '../../src/domain/entities/slot-requirement';
import { RosterActionNotAvailableError } from '../../src/domain/errors/roster-action-not-available';

const churchId = 'church-1' as ChurchId;
const ministryId = 'ministry-1' as MinistryId;
const participationId = 'participation-1' as MinistryParticipationId;
const shiftId = 'shift-1' as ShiftId;
const slotId = 'slot-1' as TimeSlotId;
const roleId = 'role-1' as RoleId;
const teamId = 'team-1' as TeamId;
const volunteerId = 'volunteer-1' as VolunteerId;
const actorId = 'user-1' as UserId;
const assignmentId = 'assignment-1' as AssignmentId;
const now = parseInstant({ value: '2026-09-20T00:00:00.000Z' });
const start = parseInstant({ value: '2026-10-04T09:00:00.000Z' });
const end = parseInstant({ value: '2026-10-04T10:00:00.000Z' });

type TransactionWork = (tx: TransactionContext) => Promise<unknown>;

const assignmentRepository = {
  create: vi.fn(),
  getById: vi.fn(),
  deleteById: vi.fn(),
  listByShift: vi.fn(),
  listByVolunteerInRange: vi.fn(),
};
const auditRepository = { create: vi.fn() };
const shiftRepository = {
  getById: vi.fn(),
  listRequirementsByParticipation: vi.fn(),
};
const participationRepository = {
  getById: vi.fn(),
  updateState: vi.fn(),
};
const ministryRepository = { getById: vi.fn() };
const volunteerRepository = {
  hasMembershipInMinistry: vi.fn(),
  hasRoleQualification: vi.fn(),
  listMinistryMemberships: vi.fn(),
};
const availabilityRepository = { listByVolunteers: vi.fn() };
const planningEventRepository = { getEvent: vi.fn() };
const notificationService = { notifyVolunteer: vi.fn() };
const unitOfWork = {
  run: vi.fn(async (work: TransactionWork) =>
    work(undefined as unknown as TransactionContext),
  ),
};

function createManager(): DbAssignmentManager {
  return new DbAssignmentManager(
    assignmentRepository as never,
    auditRepository as never,
    shiftRepository as never,
    participationRepository as never,
    ministryRepository as never,
    volunteerRepository as never,
    availabilityRepository as never,
    planningEventRepository as never,
    notificationService as never,
    unitOfWork as never,
  );
}

function participation(state: 'rostering' | 'published') {
  return new MinistryParticipation({
    id: participationId,
    props: {
      churchId,
      ministryId,
      eventId: 'event-1',
      state,
    },
  });
}

function event(status: 'scheduled' | 'past') {
  return new Event(
    {
      churchId,
      planningCycleId: 'cycle-1' as PlanningCycleId,
      title: 'Sunday Service',
      start,
      end,
      status,
      eventType: 'hourly',
    },
    'event-1',
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  setTestClock({ instant: now });

  const shift = new Shift({
    id: shiftId,
    props: {
      churchId,
      participationId,
      timeSlotId: slotId,
      startTime: start,
      endTime: end,
    },
  });
  const requirement = new SlotRequirement({
    churchId,
    slotId,
    participationId,
    shiftId,
    roleId,
    teamId,
    requiredCount: 1,
  });
  const assignment = new Assignment(
    {
      churchId,
      slotId,
      participationId,
      shiftId,
      volunteerId,
      roleId,
      status: 'pending',
    },
    assignmentId,
  );

  unitOfWork.run.mockImplementation(async (work: TransactionWork) =>
    work(undefined as unknown as TransactionContext),
  );
  shiftRepository.getById.mockResolvedValue(shift);
  shiftRepository.listRequirementsByParticipation.mockResolvedValue([
    requirement,
  ]);
  participationRepository.getById.mockResolvedValue(participation('rostering'));
  ministryRepository.getById.mockResolvedValue(
    new Ministry({ churchId, name: 'Worship' }, ministryId),
  );
  volunteerRepository.hasMembershipInMinistry.mockResolvedValue(true);
  volunteerRepository.hasRoleQualification.mockResolvedValue(true);
  volunteerRepository.listMinistryMemberships.mockResolvedValue([
    {
      volunteerId,
      teamMemberships: [{ teamId, accessLevel: 'member' }],
      qualifiedRoleIds: [roleId],
      ministryAccessLevel: 'volunteer',
    },
  ]);
  availabilityRepository.listByVolunteers.mockResolvedValue([]);
  assignmentRepository.listByShift.mockResolvedValue([]);
  assignmentRepository.listByVolunteerInRange.mockResolvedValue([]);
  assignmentRepository.create.mockResolvedValue(assignment);
  assignmentRepository.getById.mockResolvedValue(assignment);
  planningEventRepository.getEvent.mockResolvedValue(event('scheduled'));
});

afterEach(() => {
  resetClock();
});

describe('DbAssignmentManager TeamLeader roster mutations', () => {
  it('creates an Assignment only after the transactional Team roster policy passes', async () => {
    const result = await createManager().createParticipationAssignment({
      churchId,
      shiftId,
      volunteerId,
      roleId,
      teamId,
      teamLeaderScopeId: teamId,
      actorId,
    });

    expect(result.assignment.id).toBe(assignmentId);
    expect(assignmentRepository.create).toHaveBeenCalledOnce();
  });

  it('rejects a stale published create request before writing', async () => {
    participationRepository.getById.mockResolvedValueOnce(
      participation('published'),
    );

    await expect(
      createManager().createParticipationAssignment({
        churchId,
        shiftId,
        volunteerId,
        roleId,
        teamId,
        teamLeaderScopeId: teamId,
        actorId,
      }),
    ).rejects.toBeInstanceOf(RosterActionNotAvailableError);
    expect(assignmentRepository.create).not.toHaveBeenCalled();
  });

  it('removes an Assignment only after the transactional Team roster policy passes', async () => {
    await createManager().deleteAssignment({
      churchId,
      assignmentId,
      actorId,
      teamLeaderScopeId: teamId,
    });

    expect(assignmentRepository.deleteById).toHaveBeenCalledOnce();
  });

  it('rejects a past remove request before deleting', async () => {
    planningEventRepository.getEvent.mockResolvedValueOnce(event('past'));

    await expect(
      createManager().deleteAssignment({
        churchId,
        assignmentId,
        actorId,
        teamLeaderScopeId: teamId,
      }),
    ).rejects.toBeInstanceOf(RosterActionNotAvailableError);
    expect(assignmentRepository.deleteById).not.toHaveBeenCalled();
  });
});
