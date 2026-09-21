import { describe, expect, it, vi } from 'vitest';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import {
  ChurchId,
  MinistryId,
  PlanningCycleId,
  TeamId,
  UserId,
} from '../../src/domain/branded-ids';

const churchId = ChurchId.from('11111111-1111-4111-8111-111111111111');
const ministryId = MinistryId.from('22222222-2222-4222-8222-222222222222');
const cycleId = PlanningCycleId.from('33333333-3333-4333-8333-333333333333');
const teamId = TeamId.from('44444444-4444-4444-8444-444444444444');
const otherTeamId = TeamId.from('55555555-5555-4555-8555-555555555555');
const userId = UserId.from('66666666-6666-4666-8666-666666666666');

function createManager() {
  const participationRepository = {
    findByMinistryEvent: vi.fn(),
    create: vi.fn(),
    listInclusions: vi.fn(),
    listByIds: vi.fn(),
  };
  const shiftRepository = {
    listByParticipation: vi.fn(),
    listRequirementsByParticipation: vi.fn(),
    getById: vi.fn(),
  };
  const eventRepository = { listCycleEvents: vi.fn() };
  const assignmentRepository = {
    listByParticipation: vi.fn(),
    listByVolunteers: vi.fn(),
  };
  const availabilityRepository = { listByVolunteers: vi.fn() };
  const timeSlotRepository = {};
  const volunteerRepository = {
    listMinistryMemberships: vi.fn(),
    listQualifiedForRole: vi.fn(),
    listByMinistry: vi.fn(),
  };
  const ministryRepository = { getById: vi.fn() };
  const servingProfileRepository = {};
  const roleRepository = { listByMinistry: vi.fn() };
  const notificationService = {};
  const unitOfWork = {
    run: async (work: (tx: undefined) => unknown) => work(undefined),
  };

  return {
    manager: new DbParticipationManager(
      participationRepository as never,
      shiftRepository as never,
      eventRepository as never,
      assignmentRepository as never,
      availabilityRepository as never,
      timeSlotRepository as never,
      volunteerRepository as never,
      ministryRepository as never,
      servingProfileRepository as never,
      roleRepository as never,
      notificationService as never,
      unitOfWork as never,
    ),
    participationRepository,
    shiftRepository,
    eventRepository,
    assignmentRepository,
    availabilityRepository,
    volunteerRepository,
    ministryRepository,
    roleRepository,
  };
}

describe('DbParticipationManager Team roster scope', () => {
  it('does not create a Participation while a TeamLeader reads a cycle', async () => {
    const {
      manager,
      eventRepository,
      ministryRepository,
      participationRepository,
      roleRepository,
      volunteerRepository,
    } = createManager();
    ministryRepository.getById.mockResolvedValue({});
    eventRepository.listCycleEvents.mockResolvedValue([
      { event: { id: 'event-1' }, slots: [] },
    ]);
    roleRepository.listByMinistry.mockResolvedValue([]);
    volunteerRepository.listMinistryMemberships.mockResolvedValue([]);
    participationRepository.findByMinistryEvent.mockResolvedValue(null);

    await expect(
      manager.getCycleBuilderData({
        churchId,
        cycleId,
        ministryId,
        teamId,
        userId,
      }),
    ).resolves.toEqual({ events: [], roles: [] });
    expect(participationRepository.create).not.toHaveBeenCalled();
  });

  it('returns only the selected Team’s requirements, shifts, assignments, and Volunteers', async () => {
    const {
      manager,
      assignmentRepository,
      availabilityRepository,
      eventRepository,
      ministryRepository,
      participationRepository,
      roleRepository,
      shiftRepository,
      volunteerRepository,
    } = createManager();
    ministryRepository.getById.mockResolvedValue({});
    eventRepository.listCycleEvents.mockResolvedValue([
      {
        event: {
          id: 'event-1',
          status: 'scheduled',
          start: '2027-01-01T09:00:00.000Z',
        },
        slots: [{ id: 'slot-a' }, { id: 'slot-b' }],
      },
    ]);
    participationRepository.findByMinistryEvent.mockResolvedValue({
      id: 'participation-1',
      ministryId,
      state: 'rostering',
    });
    participationRepository.listInclusions.mockResolvedValue([]);
    shiftRepository.listByParticipation.mockResolvedValue([
      { id: 'shift-a', timeSlotId: 'slot-a' },
    ]);
    shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      { id: 'requirement-a', shiftId: 'shift-a', roleId: 'role-a', teamId },
      {
        id: 'requirement-b',
        shiftId: 'shift-a',
        roleId: 'role-b',
        teamId: otherTeamId,
      },
    ]);
    assignmentRepository.listByParticipation.mockResolvedValue([
      {
        id: 'assignment-a',
        shiftId: 'shift-a',
        roleId: 'role-a',
        volunteerId: 'volunteer-a',
      },
      {
        id: 'assignment-b',
        shiftId: 'shift-a',
        roleId: 'role-a',
        volunteerId: 'volunteer-b',
      },
    ]);
    assignmentRepository.listByVolunteers.mockResolvedValue([]);
    availabilityRepository.listByVolunteers.mockResolvedValue([]);
    roleRepository.listByMinistry.mockResolvedValue([
      { id: 'role-a', name: 'Greeter' },
    ]);
    volunteerRepository.listMinistryMemberships.mockResolvedValue([
      {
        volunteerId: 'volunteer-a',
        qualifiedRoleIds: ['role-a'],
        ministryAccessLevel: 'volunteer',
        teamMemberships: [{ teamId, accessLevel: 'member' }],
      },
      {
        volunteerId: 'volunteer-b',
        qualifiedRoleIds: ['role-a'],
        ministryAccessLevel: 'volunteer',
        teamMemberships: [{ teamId: otherTeamId, accessLevel: 'member' }],
      },
    ]);
    volunteerRepository.listQualifiedForRole.mockResolvedValue([
      { id: 'volunteer-a', name: 'Alpha' },
      { id: 'volunteer-b', name: 'Beta' },
    ]);

    const view = await manager.getCycleBuilderData({
      churchId,
      cycleId,
      ministryId,
      teamId,
      userId,
    });

    const shifts = view.events[0]?.slots.flatMap((slot) => slot.shifts) ?? [];
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.shift.id).toBe('shift-a');
    expect(
      shifts[0]?.requirements.map((requirement) => requirement.requirement.id),
    ).toEqual(['requirement-a']);
    expect(shifts[0]?.requirements[0]?.canMutateAssignments).toBe(true);
    expect(shifts[0]?.assignments.map((assignment) => assignment.id)).toEqual([
      'assignment-a',
    ]);
    expect(
      shifts[0]?.eligibleVolunteers.map((volunteer) => volunteer.volunteerId),
    ).toEqual(['volunteer-a']);
  });

  it('withholds a TeamLeader mutation capability when same-role requirements are ambiguous', async () => {
    const {
      manager,
      assignmentRepository,
      availabilityRepository,
      eventRepository,
      ministryRepository,
      participationRepository,
      roleRepository,
      shiftRepository,
      volunteerRepository,
    } = createManager();
    ministryRepository.getById.mockResolvedValue({});
    eventRepository.listCycleEvents.mockResolvedValue([
      {
        event: {
          id: 'event-1',
          status: 'scheduled',
          start: '2027-01-01T09:00:00.000Z',
        },
        slots: [{ id: 'slot-a' }],
      },
    ]);
    participationRepository.findByMinistryEvent.mockResolvedValue({
      id: 'participation-1',
      ministryId,
      state: 'rostering',
    });
    participationRepository.listInclusions.mockResolvedValue([]);
    shiftRepository.listByParticipation.mockResolvedValue([
      { id: 'shift-a', timeSlotId: 'slot-a' },
    ]);
    shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      { id: 'requirement-a', shiftId: 'shift-a', roleId: 'role-a', teamId },
      {
        id: 'requirement-b',
        shiftId: 'shift-a',
        roleId: 'role-a',
        teamId: otherTeamId,
      },
    ]);
    assignmentRepository.listByParticipation.mockResolvedValue([]);
    assignmentRepository.listByVolunteers.mockResolvedValue([]);
    availabilityRepository.listByVolunteers.mockResolvedValue([]);
    roleRepository.listByMinistry.mockResolvedValue([
      { id: 'role-a', name: 'Greeter' },
    ]);
    volunteerRepository.listMinistryMemberships.mockResolvedValue([
      {
        volunteerId: 'volunteer-a',
        qualifiedRoleIds: ['role-a'],
        ministryAccessLevel: 'volunteer',
        teamMemberships: [{ teamId, accessLevel: 'member' }],
      },
    ]);
    volunteerRepository.listQualifiedForRole.mockResolvedValue([
      { id: 'volunteer-a', name: 'Alpha' },
    ]);

    const view = await manager.getCycleBuilderData({
      churchId,
      cycleId,
      ministryId,
      teamId,
      userId,
    });

    expect(
      view.events[0]?.slots[0]?.shifts[0]?.requirements[0]
        ?.canMutateAssignments,
    ).toBe(false);
  });

  it('keeps a Ministry leader capable of mutating every returned requirement', async () => {
    const {
      manager,
      assignmentRepository,
      availabilityRepository,
      eventRepository,
      ministryRepository,
      participationRepository,
      roleRepository,
      shiftRepository,
      volunteerRepository,
    } = createManager();
    ministryRepository.getById.mockResolvedValue({});
    eventRepository.listCycleEvents.mockResolvedValue([
      { event: { id: 'event-1' }, slots: [{ id: 'slot-a' }] },
    ]);
    participationRepository.findByMinistryEvent.mockResolvedValue({
      id: 'participation-1',
      ministryId,
      state: 'published',
    });
    participationRepository.listInclusions.mockResolvedValue([]);
    shiftRepository.listByParticipation.mockResolvedValue([
      { id: 'shift-a', timeSlotId: 'slot-a' },
    ]);
    shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      { id: 'requirement-a', shiftId: 'shift-a', roleId: 'role-a' },
    ]);
    assignmentRepository.listByParticipation.mockResolvedValue([]);
    assignmentRepository.listByVolunteers.mockResolvedValue([]);
    availabilityRepository.listByVolunteers.mockResolvedValue([]);
    roleRepository.listByMinistry.mockResolvedValue([
      { id: 'role-a', name: 'Greeter' },
    ]);
    volunteerRepository.listMinistryMemberships.mockResolvedValue([]);
    volunteerRepository.listQualifiedForRole.mockResolvedValue([]);

    const view = await manager.getCycleBuilderData({
      churchId,
      cycleId,
      ministryId,
      userId,
    });

    expect(
      view.events[0]?.slots[0]?.shifts[0]?.requirements[0]
        ?.canMutateAssignments,
    ).toBe(true);
  });
});
