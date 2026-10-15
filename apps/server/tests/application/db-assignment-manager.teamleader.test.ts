import { parseInstant, resetClock, setTestClock } from '@church/time';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import type {
  AssignmentId,
  ChurchId,
  CycleId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  ShiftId,
  TeamId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import { Assignment } from '@/domain/entities/assignment';
import { Event } from '@/domain/entities/event';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { AssignActionNotAvailableError } from '@/domain/errors/assign-action-not-available';

const churchId = 'church-1' as ChurchId;
const ministryId = 'ministry-1' as MinistryId;
const participationId = 'participation-1' as MinistryParticipationId;
const shiftId = 'shift-1' as ShiftId;
const eventTimeBlockId = 'event-time-block-1' as EventTimeBlockId;
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
const volunteerRepository = {
  hasMembershipInMinistry: vi.fn(),
  hasRoleQualification: vi.fn(),
  listMinistryMemberships: vi.fn(),
};
const unavailableShiftRepository = { listByVolunteers: vi.fn() };
const planningEventRepository = { getEvent: vi.fn() };
const notificationService = { notifyVolunteer: vi.fn() };
const unitOfWork = {
  run: vi.fn(async (work: TransactionWork) =>
    work(undefined as unknown as TransactionContext),
  ),
};

function createManager(): DbAssignmentManager {
  return new DbAssignmentManager({
    assignmentRepo: assignmentRepository as never,
    auditRepo: auditRepository as never,
    shiftRepository: shiftRepository as never,
    participationRepository: participationRepository as never,
    volunteerRepository: volunteerRepository as never,
    unavailableShiftRepository: unavailableShiftRepository as never,
    planningEventRepository: planningEventRepository as never,
    notificationService: notificationService as never,
    unitOfWork: unitOfWork as never,
  });
}

function participation(state: 'assigning' | 'published') {
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
      cycleId: 'cycle-1' as CycleId,
      title: 'Sunday Service',
      start,
      end,
      status,
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
      eventTimeBlockId: eventTimeBlockId,
      startTime: start,
      endTime: end,
    },
  });
  const requirement = new ShiftRequirement({
    churchId,
    eventTimeBlockId,
    participationId,
    shiftId,
    roleId,
    teamId,
    peopleNeeded: 1,
  });
  const assignment = new Assignment(
    {
      churchId,
      eventTimeBlockId,
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
  participationRepository.getById.mockResolvedValue(participation('assigning'));
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
  unavailableShiftRepository.listByVolunteers.mockResolvedValue([]);
  assignmentRepository.listByShift.mockResolvedValue([]);
  assignmentRepository.listByVolunteerInRange.mockResolvedValue([]);
  assignmentRepository.create.mockResolvedValue(assignment);
  assignmentRepository.getById.mockResolvedValue(assignment);
  planningEventRepository.getEvent.mockResolvedValue(event('scheduled'));
});

afterEach(() => {
  resetClock();
});

describe('DbAssignmentManager TeamLeader schedule mutations', () => {
  it('creates an Assignment only after the transactional Team schedule policy passes', async () => {
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
    ).rejects.toBeInstanceOf(AssignActionNotAvailableError);
    expect(assignmentRepository.create).not.toHaveBeenCalled();
  });

  it('removes an Assignment only after the transactional Team schedule policy passes', async () => {
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
    ).rejects.toBeInstanceOf(AssignActionNotAvailableError);
    expect(assignmentRepository.deleteById).not.toHaveBeenCalled();
  });
});
