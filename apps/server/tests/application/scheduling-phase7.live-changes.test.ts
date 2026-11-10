import { appConfig } from '@church/app-config';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
  AssignmentId,
  AvailabilityCheckId,
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  RoleId,
  SectorId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { Assignment } from '@/domain/entities/assignment';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { AssignmentAccessDeniedError } from '@/domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '@/domain/errors/cancel-window-closed';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';
import {
  createAssignmentAuditRepositoryFake,
  createAssignmentRepositoryFake,
  createAuthorityManagerFake,
  createAvailabilityCheckRepositoryFake,
  createChurchRepositoryFake,
  createCycleRepositoryFake,
  createEventRepositoryFake,
  createEventTemplateRepositoryFake,
  createEventTimeBlockRepositoryFake,
  createMinistryParticipationRepositoryFake,
  createMinistryRepositoryFake,
  createNotificationRepositoryFake,
  createPlanningEventRepositoryFake,
  createRoleRepositoryFake,
  createSectorRepositoryFake,
  createShiftRepositoryFake,
  createSwapRequestRepositoryFake,
  createTransactionContextFake,
  createUnavailableShiftRepositoryFake,
  createUnitOfWorkFake,
  createUsualSetupRepositoryFake,
  createVolunteerRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

const churchId = ChurchId.from('church');
const shiftId = ShiftId.from('shift');
const requirementId = ShiftRequirementId.from({ raw: 'requirement' });
const volunteerId = VolunteerId.from('volunteer');
const replacementId = VolunteerId.from('replacement');
const assignmentId = AssignmentId.from('assignment');
const actorId = UserId.from('actor');
const ministryId = MinistryId.from('ministry');
const start = parseInstant({ value: '2099-01-01T09:00:00Z' });
const end = parseInstant({ value: '2099-01-01T10:00:00Z' });

function createHarness() {
  const tx = createTransactionContextFake();
  const shift = new Shift({
    id: shiftId,
    props: {
      churchId,
      participationId: MinistryParticipationId.from('participation'),
      eventTimeBlockId: EventTimeBlockId.from('block'),
      startTime: start,
      endTime: end,
    },
  });
  const requirement = new ShiftRequirement({
    id: requirementId,
    props: {
      churchId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      participationId: MinistryParticipationId.from('participation'),
      shiftId,
      roleId: RoleId.from('role'),
      sectorId: SectorId.from('sector'),
      sectorName: 'Sector',
      peopleNeeded: 1,
    },
  });
  const participation = new MinistryParticipation({
    id: MinistryParticipationId.from('participation'),
    props: {
      churchId,
      ministryId,
      eventId: EventId.from('event'),
      state: 'assigning',
    },
  });
  const assignment = new Assignment({
    id: assignmentId,
    props: {
      churchId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      participationId: MinistryParticipationId.from('participation'),
      shiftId,
      volunteerId,
      roleId: RoleId.from('role'),
      shiftRequirementId: requirementId,
      status: 'confirmed',
    },
  });
  const assignmentRepo = createAssignmentRepositoryFake();
  assignmentRepo.create.mockImplementation(
    async ({ input }) =>
      new Assignment({
        id: AssignmentId.from('new-assignment'),
        props: {
          churchId,
          eventTimeBlockId: EventTimeBlockId.from('block'),
          participationId: MinistryParticipationId.from('participation'),
          shiftId,
          volunteerId: input.volunteerId,
          roleId: RoleId.from('role'),
          shiftRequirementId: requirementId,
          status: 'pending',
        },
      }),
  );
  assignmentRepo.getById.mockImplementation(async () => assignment);
  assignmentRepo.listByShift.mockImplementation(async () => []);
  assignmentRepo.listByVolunteerInRange.mockImplementation(async () => []);
  const auditRepo = createAssignmentAuditRepositoryFake();
  const shiftRepository = createShiftRepositoryFake();
  shiftRepository.getById.mockImplementation(async () => shift);
  shiftRepository.getRequirementForShift.mockImplementation(
    async () => requirement,
  );
  const participationRepository = createMinistryParticipationRepositoryFake();
  participationRepository.getById.mockImplementation(async () => participation);
  participationRepository.lockById.mockImplementation(
    async () => participation,
  );
  const volunteerRepository = createVolunteerRepositoryFake();
  volunteerRepository.hasMembershipInMinistry.mockImplementation(
    async () => true,
  );
  volunteerRepository.hasRoleQualification.mockImplementation(async () => true);
  const unavailableShiftRepository = createUnavailableShiftRepositoryFake();
  unavailableShiftRepository.listByVolunteers.mockImplementation(
    async () => [],
  );
  const cycleRepository = createCycleRepositoryFake();
  const notificationRepo = createNotificationRepositoryFake();
  const eventRepo = createEventRepositoryFake();
  const ministryRepo = createMinistryRepositoryFake();
  const roleRepo = createRoleRepositoryFake();
  const availabilityCheckRepo = createAvailabilityCheckRepositoryFake();
  const eventRepository = createPlanningEventRepositoryFake();
  const eventTimeBlockRepository = createEventTimeBlockRepositoryFake();
  const usualSetupRepository = createUsualSetupRepositoryFake();
  const eventTemplateRepository = createEventTemplateRepositoryFake();
  const sectorRepository = createSectorRepositoryFake();
  const unitOfWork = createUnitOfWorkFake({ tx });
  const manager = new DbAssignmentManager({
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    swapRequestRepo: createSwapRequestRepositoryFake(),
    unitOfWork,
  });
  const notifications = createChurchNotificationsSpy();
  const participationManager = new DbParticipationManager({
    availabilityCheckRepository: availabilityCheckRepo,
    participationRepository,
    shiftRepository,
    assignmentRepository: assignmentRepo,
    unavailableShiftRepository,
    volunteerRepository,
    cycleRepository,
    eventRepository,
    eventTimeBlockRepository,
    usualSetupRepository,
    eventTemplateRepository,
    sectorRepository,
    ministryRepository: ministryRepo,
    roleRepository: roleRepo,
    notifications,
    churchRepository: {} as never,
    swapRequestRepo: createSwapRequestRepositoryFake(),
    staffingSeeder: {} as never,
    unitOfWork,
  });
  const volunteerManager = new DbVolunteerManager({
    swapRequestRepo: createSwapRequestRepositoryFake(),
    volunteerRepo: volunteerRepository,
    assignmentRepo,
    shiftRepo: shiftRepository,
    participationRepo: participationRepository,
    unavailableShiftRepo: unavailableShiftRepository,
    unitOfWork,
    config: appConfig,
    notificationRepo,
    cycleRepo: cycleRepository,
    eventRepo,
    ministryRepo,
    roleRepo,
    availabilityCheckRepo,
    churchRepo: createChurchRepositoryFake(),
    authorityManager: createAuthorityManagerFake(),
  });
  return {
    manager,
    volunteerManager,
    participationManager,
    requirement,
    notifications,
    assignmentRepo,
    auditRepo,
    shiftRepository,
    participationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    assignment,
    notificationRepo,
    shift,
    tx,
  };
}

const createInput = {
  churchId,
  shiftId,
  shiftRequirementId: requirementId,
  volunteerId,
  actorId,
};

describe('live assignment changes', () => {
  it('cancels an owner’s assignment outside the window', async () => {
    const f = createHarness();
    await f.volunteerManager.cancelOwnAssignment({
      churchId,
      assignmentId,
      volunteerId,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
    });
    expect(f.notificationRepo.create).not.toHaveBeenCalled();
  });
  it('reports the reopened participation after cancellation', async () => {
    const f = createHarness();
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
    ]);
    f.assignmentRepo.listByParticipation
      .mockResolvedValueOnce([f.assignment])
      .mockResolvedValueOnce([]);
    const participationId = MinistryParticipationId.from('participation');
    const before = await f.participationManager.getCompletion({
      churchId,
      participationId,
    });
    await f.volunteerManager.cancelOwnAssignment({
      churchId,
      assignmentId,
      volunteerId,
    });
    const after = await f.participationManager.getCompletion({
      churchId,
      participationId,
    });
    expect(before).toMatchObject({
      assignedCount: 1,
      peopleNeeded: 1,
      completionPercent: 100,
    });
    expect(after).toMatchObject({
      assignedCount: 0,
      peopleNeeded: 1,
      completionPercent: 0,
    });
    expect(f.notifications.enqueue).not.toHaveBeenCalled();
  });
  it('rejects another volunteer without deleting the assignment', async () => {
    const f = createHarness();
    await expect(
      f.volunteerManager.cancelOwnAssignment({
        churchId,
        assignmentId,
        volunteerId: replacementId,
      }),
    ).rejects.toBeInstanceOf(AssignmentAccessDeniedError);
    expect(f.assignmentRepo.deleteById).not.toHaveBeenCalled();
  });
  it('rejects cancellation within the configured lead time', async () => {
    const f = createHarness();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T08:00:00Z'));
    try {
      await expect(
        f.volunteerManager.cancelOwnAssignment({
          churchId,
          assignmentId,
          volunteerId,
        }),
      ).rejects.toBeInstanceOf(CancelWindowClosedError);
      expect(f.assignmentRepo.deleteById).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('creates a pending assignment and requests an audit even with the audit panel parked', async () => {
    const f = createHarness();
    expect(appConfig.parked.auditPanel).toBe(false);
    const result = await f.manager.createParticipationAssignment(createInput);
    expect(result.assignment).toMatchObject({
      shiftId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      participationId: MinistryParticipationId.from('participation'),
      status: 'pending',
      volunteerId,
    });
    expect(result.warnings).toEqual([]);
    expect(f.auditRepo.create).toHaveBeenCalledWith({
      churchId,
      input: { assignmentId: result.assignment.id, actorId, action: 'created' },
      tx: f.tx,
    });
    expect(f.assignmentRepo.create).toHaveBeenCalledWith({
      churchId,
      input: {
        shiftId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        participationId: MinistryParticipationId.from('participation'),
        shiftRequirementId: requirementId,
        volunteerId,
        status: 'pending',
        assignedBy: actorId,
      },
      tx: f.tx,
    });
  });
  it('rejects volunteers outside the ministry', async () => {
    const f = createHarness();
    f.volunteerRepository.hasMembershipInMinistry.mockResolvedValue(false);
    await expect(
      f.manager.createParticipationAssignment(createInput),
    ).rejects.toMatchObject({ reason: 'NOT_IN_MINISTRY' });
    expect(f.assignmentRepo.create).not.toHaveBeenCalled();
  });
  it('refuses missing qualification', async () => {
    const f = createHarness();
    f.volunteerRepository.hasRoleQualification.mockResolvedValue(false);
    await expect(
      f.manager.createParticipationAssignment(createInput),
    ).rejects.toMatchObject({ reason: 'NOT_QUALIFIED' });
  });
  it('returns an unavailability warning', async () => {
    const f = createHarness();
    f.unavailableShiftRepository.listByVolunteers.mockResolvedValue([
      new UnavailableShift({
        props: {
          churchId,
          availabilityCheckId: AvailabilityCheckId.from('check'),
          shiftId,
          volunteerId,
          shiftStartTime: start,
          shiftEndTime: end,
        },
      }),
    ]);
    const result = await f.manager.createParticipationAssignment(createInput);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE' }),
    ]);
  });
  it('reassigns the same shift and requirement and requests both audit entries', async () => {
    const f = createHarness();
    const result = await f.manager.reassignParticipationAssignment({
      churchId,
      assignmentId,
      volunteerId: replacementId,
      actorId,
    });
    expect(result).toMatchObject({
      shiftId,
      roleId: RoleId.from('role'),
      shiftRequirementId: requirementId,
      volunteerId: replacementId,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
      tx: f.tx,
    });
    expect(f.auditRepo.create).toHaveBeenNthCalledWith(1, {
      churchId,
      input: { assignmentId: result.id, actorId, action: 'created' },
      tx: f.tx,
    });
    expect(f.auditRepo.create).toHaveBeenNthCalledWith(2, {
      churchId,
      input: { assignmentId: result.id, actorId, action: 'updated' },
      tx: f.tx,
    });
  });
  it('requests audit before deletion in the same transaction', async () => {
    const f = createHarness();
    await f.manager.deleteAssignment({ churchId, assignmentId, actorId });
    expect(f.auditRepo.create).toHaveBeenCalledWith({
      churchId,
      input: { assignmentId, actorId, action: 'deleted' },
      tx: f.tx,
    });
    expect(f.assignmentRepo.deleteById).toHaveBeenCalledWith({
      churchId,
      assignmentId,
      tx: f.tx,
    });
    expect(f.auditRepo.create.mock.invocationCallOrder[0]).toBeLessThan(
      f.assignmentRepo.deleteById.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('checks the cycle before listing its audit', async () => {
    const f = createHarness();
    const cycleId = CycleId.from('cycle');
    f.auditRepo.listByCycle.mockResolvedValue([]);
    await expect(
      f.manager.listAuditLogForCycle({ churchId, cycleId, ministryId }),
    ).resolves.toEqual([]);
    expect(f.cycleRepository.getById).toHaveBeenCalledWith({
      churchId,
      cycleId,
    });
    expect(f.auditRepo.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryId,
    });
  });
});
