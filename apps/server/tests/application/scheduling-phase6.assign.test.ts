import { appConfig } from '@church/app-config';
import { parseCalendarDay, parseInstant, setTestClock } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { Church } from '@/domain/entities/church';
import { Cycle } from '@/domain/entities/cycle';
import { Event } from '@/domain/entities/event';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';
import { Volunteer } from '@/domain/entities/volunteer';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';
import {
  createAssignmentAuditRepositoryFake,
  createAssignmentRepositoryFake,
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
  createTransactionContextFake,
  createUnavailableShiftRepositoryFake,
  createUnitOfWorkFake,
  createUsualSetupRepositoryFake,
  createVolunteerRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

const churchId = ChurchId.from('church');
const ministryId = MinistryId.from('ministry');
const participationId = MinistryParticipationId.from('participation');
const cycleId = CycleId.from('cycle');
const shiftId = ShiftId.from('shift');
const volunteerId = VolunteerId.from('volunteer');
const actorId = UserId.from('actor');
const shiftRequirementId = ShiftRequirementId.from({ raw: 'requirement' });
const start = parseInstant({ value: '2026-08-10T09:00:00Z' });
const end = parseInstant({ value: '2026-08-10T10:00:00Z' });

function createHarness() {
  const assignmentRepository = createAssignmentRepositoryFake();
  const assignmentAuditRepository = createAssignmentAuditRepositoryFake();
  const shiftRepository = createShiftRepositoryFake();
  const ministryParticipationRepository =
    createMinistryParticipationRepositoryFake();
  const volunteerRepository = createVolunteerRepositoryFake();
  const unavailableShiftRepository = createUnavailableShiftRepositoryFake();
  const cycleRepository = createCycleRepositoryFake();
  const churchRepository = createChurchRepositoryFake();
  const planningEventRepository = createPlanningEventRepositoryFake();
  const eventTimeBlockRepository = createEventTimeBlockRepositoryFake();
  const ministryRepository = createMinistryRepositoryFake();
  const usualSetupRepository = createUsualSetupRepositoryFake();
  const eventTemplateRepository = createEventTemplateRepositoryFake();
  const roleRepository = createRoleRepositoryFake();
  const sectorRepository = createSectorRepositoryFake();
  const notificationRepository = createNotificationRepositoryFake();
  const eventRepository = createEventRepositoryFake();
  const availabilityCheckRepository = createAvailabilityCheckRepositoryFake();
  const tx = createTransactionContextFake();
  const unitOfWork = createUnitOfWorkFake({ tx });
  const notifications = createChurchNotificationsSpy();
  const participation = new MinistryParticipation({
    id: participationId,
    props: {
      churchId,
      ministryId,
      eventId: EventId.from('event'),
      state: 'availability_requested',
    },
  });
  const shift = new Shift({
    id: shiftId,
    props: {
      churchId,
      participationId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      startTime: start,
      endTime: end,
      label: 'Morning',
    },
  });
  const requirement = new ShiftRequirement({
    id: shiftRequirementId,
    props: {
      churchId,
      participationId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      shiftId,
      roleId: RoleId.from('role'),
      sectorId: SectorId.from('sector'),
      sectorName: 'Alpha',
      peopleNeeded: 1,
    },
  });
  const assignment = new Assignment({
    id: AssignmentId.from('assignment'),
    props: {
      churchId,
      participationId,
      eventTimeBlockId: EventTimeBlockId.from('block'),
      shiftId,
      volunteerId,
      roleId: RoleId.from('role'),
      shiftRequirementId,
      status: 'pending',
    },
  });
  const volunteer = new Volunteer({
    id: volunteerId,
    props: { churchId, userId: UserId.from('user'), name: 'Alice Alpha' },
  });
  const event = new Event({
    id: EventId.from('event'),
    props: { churchId, cycleId, title: 'Service', start, end },
  });
  const ministry = new Ministry({
    id: ministryId,
    props: { churchId, name: 'Welcome' },
  });
  churchRepository.getById.mockResolvedValue(
    new Church({
      id: churchId,
      props: { name: 'Church', slug: 'church', timezone: 'UTC' },
    }),
  );
  cycleRepository.getById.mockResolvedValue(
    new Cycle({
      id: cycleId,
      props: {
        churchId,
        name: 'Cycle',
        startDate: parseCalendarDay({ value: '2026-08-01' }),
        endDate: parseCalendarDay({ value: '2026-08-31' }),
        state: 'sent',
      },
    }),
  );
  roleRepository.getById.mockResolvedValue(
    new Role({
      id: RoleId.from('role'),
      props: { churchId, ministryId, name: 'Greeter' },
    }),
  );
  shiftRepository.listByParticipation.mockResolvedValue([shift]);
  shiftRepository.getById.mockResolvedValue(shift);
  shiftRepository.getRequirementForShift.mockResolvedValue(requirement);
  shiftRepository.listRequirementsByParticipation.mockResolvedValue([
    requirement,
  ]);
  ministryParticipationRepository.getById.mockResolvedValue(participation);
  ministryParticipationRepository.lockById.mockResolvedValue(participation);
  ministryParticipationRepository.lockSchedule.mockResolvedValue([
    participation,
  ]);
  ministryParticipationRepository.findByMinistryEvent.mockResolvedValue(
    participation,
  );
  volunteerRepository.hasMembershipInMinistry.mockResolvedValue(true);
  volunteerRepository.hasRoleQualification.mockResolvedValue(true);
  volunteerRepository.listQualifiedForRole.mockResolvedValue([volunteer]);
  volunteerRepository.listMinistryMemberships.mockResolvedValue([]);
  volunteerRepository.listByIds.mockResolvedValue([volunteer]);
  assignmentRepository.listByShift.mockResolvedValue([]);
  assignmentRepository.listByVolunteers.mockResolvedValue([]);
  assignmentRepository.listByVolunteerInRange.mockResolvedValue([]);
  assignmentRepository.listByParticipation.mockResolvedValue([assignment]);
  assignmentRepository.create.mockResolvedValue(assignment);
  unavailableShiftRepository.listByVolunteers.mockResolvedValue([]);
  planningEventRepository.getEvent.mockResolvedValue(event);
  availabilityCheckRepository.listActiveMemberships.mockResolvedValue([]);
  availabilityCheckRepository.listByCycle.mockResolvedValue([]);
  planningEventRepository.listCycleEvents.mockResolvedValue([
    { event, eventTimeBlocks: [] },
  ]);
  ministryRepository.getById.mockResolvedValue(ministry);
  const participationManager = new DbParticipationManager({
    availabilityCheckRepository,
    participationRepository: ministryParticipationRepository,
    shiftRepository,
    eventRepository: planningEventRepository,
    assignmentRepository,
    unavailableShiftRepository,
    eventTimeBlockRepository,
    volunteerRepository,
    ministryRepository,
    usualSetupRepository,
    eventTemplateRepository,
    cycleRepository,
    roleRepository,
    sectorRepository,
    notifications,
    churchRepository,
    staffingSeeder: {} as never,
    unitOfWork,
  });
  const assignmentManager = new DbAssignmentManager({
    assignmentRepo: assignmentRepository,
    auditRepo: assignmentAuditRepository,
    shiftRepository,
    participationRepository: ministryParticipationRepository,
    volunteerRepository,
    unavailableShiftRepository,
    cycleRepository,
    unitOfWork,
  });
  const volunteerManager = new DbVolunteerManager({
    volunteerRepo: volunteerRepository,
    assignmentRepo: assignmentRepository,
    unavailableShiftRepo: unavailableShiftRepository,
    notificationRepo: notificationRepository,
    eventRepo: eventRepository,
    shiftRepo: shiftRepository,
    ministryRepo: ministryRepository,
    participationRepo: ministryParticipationRepository,
    roleRepo: roleRepository,
    availabilityCheckRepo: availabilityCheckRepository,
    unitOfWork,
    config: appConfig,
  });
  return {
    participationManager,
    availabilityCheckRepository,
    assignmentManager,
    volunteerManager,
    participation,
    shift,
    requirement,
    assignment,
    volunteer,
    event,
    ministry,
    shiftRepository,
    ministryParticipationRepository,
    volunteerRepository,
    assignmentRepository,
    unavailableShiftRepository,
    planningEventRepository,
    eventRepository,
    roleRepository,
    notifications,
    tx,
  };
}

describe('Assignment and publication managers', () => {
  beforeEach(() =>
    setTestClock({ instant: parseInstant({ value: '2026-08-01T00:00:00Z' }) }),
  );
  it('caps completion per requirement and excludes declined and cancelled assignments', async () => {
    const f = createHarness();
    const beta = new ShiftRequirement({
      id: ShiftRequirementId.from({ raw: 'beta' }),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        roleId: RoleId.from('role'),
        sectorId: SectorId.from('beta-sector'),
        sectorName: 'Beta',
        peopleNeeded: 1,
      },
    });
    const extra = new Assignment({
      id: AssignmentId.from('extra'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId: VolunteerId.from('other'),
        roleId: RoleId.from('role'),
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    const declined = new Assignment({
      id: AssignmentId.from('declined'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId: VolunteerId.from('third'),
        roleId: RoleId.from('role'),
        shiftRequirementId: ShiftRequirementId.from({ raw: 'beta' }),
        status: 'declined',
      },
    });
    const cancelled = new Assignment({
      id: AssignmentId.from('cancelled'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId: VolunteerId.from('fourth'),
        roleId: RoleId.from('role'),
        shiftRequirementId: ShiftRequirementId.from({ raw: 'beta' }),
        status: 'cancelled',
      },
    });
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
      beta,
    ]);
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
      extra,
      declined,
      cancelled,
    ]);
    await expect(
      f.participationManager.getCompletion({ churchId, participationId }),
    ).resolves.toMatchObject({
      peopleNeeded: 2,
      assignedCount: 2,
      completionPercent: 50,
    });
  });

  it('creates a pending assignment for the requested requirement and starts assigning', async () => {
    const f = createHarness();
    const result = await f.assignmentManager.createParticipationAssignment({
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    });
    expect(result.assignment).toBe(f.assignment);
    expect(result.warnings).toEqual([]);
    expect(f.assignmentRepository.create).toHaveBeenCalledWith({
      churchId,
      input: {
        eventTimeBlockId: EventTimeBlockId.from('block'),
        participationId,
        shiftId,
        volunteerId,
        shiftRequirementId,
        status: 'pending',
        assignedBy: actorId,
      },
      tx: f.tx,
    });
    expect(f.ministryParticipationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'assigning',
      tx: f.tx,
    });
  });

  it('rejects overlapping active assignments', async () => {
    const f = createHarness();
    const overlap = new Assignment({
      id: AssignmentId.from('overlap'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId: ShiftId.from('other-shift'),
        volunteerId,
        roleId: RoleId.from('role'),
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    f.assignmentRepository.listByVolunteerInRange.mockResolvedValue([overlap]);
    await expect(
      f.assignmentManager.createParticipationAssignment({
        churchId,
        shiftId,
        volunteerId,
        shiftRequirementId,
        actorId,
      }),
    ).rejects.toMatchObject({ reason: 'DUPLICATE_ASSIGNMENT' });
    expect(f.assignmentRepository.create).not.toHaveBeenCalled();
  });

  it('requires confirmation before publishing an incomplete participation and notifies its assigned volunteers', async () => {
    const f = createHarness();
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      new ShiftRequirement({
        id: shiftRequirementId,
        props: {
          churchId,
          participationId,
          eventTimeBlockId: EventTimeBlockId.from('block'),
          shiftId,
          roleId: RoleId.from('role'),
          sectorId: SectorId.from('sector'),
          sectorName: 'Alpha',
          peopleNeeded: 2,
        },
      }),
    ]);
    const input = { churchId, cycleId, ministryId, userId: actorId };
    await expect(
      f.participationManager.publishCycle(input),
    ).resolves.toMatchObject({ published: false, belowFull: true });
    expect(
      f.ministryParticipationRepository.updateState,
    ).not.toHaveBeenCalled();
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
    ]);
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      new ShiftRequirement({
        id: shiftRequirementId,
        props: {
          churchId,
          participationId,
          eventTimeBlockId: EventTimeBlockId.from('block'),
          shiftId,
          roleId: RoleId.from('role'),
          sectorId: SectorId.from('sector'),
          sectorName: 'Alpha',
          peopleNeeded: 2,
        },
      }),
    ]);
    await expect(
      f.participationManager.publishCycle({ ...input, confirmBelowFull: true }),
    ).resolves.toMatchObject({ published: true, belowFull: true });
    expect(f.ministryParticipationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'published',
      tx: f.tx,
    });
    expect(f.notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'schedule_published',
        to: [{ userId: UserId.from('user'), churchId }],
      }),
    );
  });

  it('shows only published participation assignments with visible statuses', async () => {
    const f = createHarness();
    const published = new MinistryParticipation({
      id: MinistryParticipationId.from('published'),
      props: {
        churchId,
        ministryId,
        eventId: EventId.from('event'),
        state: 'published',
      },
    });
    const visible = new Assignment({
      id: AssignmentId.from('visible'),
      props: {
        churchId,
        participationId: MinistryParticipationId.from('published'),
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId,
        roleId: RoleId.from('role'),
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    const draft = new Assignment({
      id: AssignmentId.from('draft'),
      props: {
        churchId,
        participationId: MinistryParticipationId.from('published'),
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId,
        roleId: RoleId.from('role'),
        shiftRequirementId,
        status: 'draft',
      },
    });
    f.assignmentRepository.listByVolunteer.mockResolvedValue([
      visible,
      draft,
      f.assignment,
    ]);
    f.ministryParticipationRepository.listByIds.mockResolvedValue([
      published,
      f.participation,
    ]);
    await expect(
      f.volunteerManager.getPublishedSchedule({ churchId, volunteerId }),
    ).resolves.toEqual([visible]);
  });

  it('ranks available volunteers by earlier service and marks unavailable volunteers last', async () => {
    const f = createHarness();
    const ada = new Volunteer({
      id: VolunteerId.from('ada'),
      props: {
        churchId,
        userId: UserId.from('ada-user'),
        name: 'Ada Lovelace',
      },
    });
    const grace = new Volunteer({
      id: VolunteerId.from('grace'),
      props: {
        churchId,
        userId: UserId.from('grace-user'),
        name: 'Grace Hopper',
      },
    });
    const alan = new Volunteer({
      id: VolunteerId.from('alan'),
      props: {
        churchId,
        userId: UserId.from('alan-user'),
        name: 'Alan Turing',
      },
    });
    const older = new Shift({
      id: ShiftId.from('older'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        startTime: parseInstant({ value: '2026-08-01T09:00:00Z' }),
        endTime: parseInstant({ value: '2026-08-01T10:00:00Z' }),
      },
    });
    const newer = new Shift({
      id: ShiftId.from('newer'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        startTime: parseInstant({ value: '2026-08-02T09:00:00Z' }),
        endTime: parseInstant({ value: '2026-08-02T10:00:00Z' }),
      },
    });
    const prior = (id: string, volunteer: string, priorShift: string) =>
      new Assignment({
        id,
        props: {
          churchId,
          participationId,
          eventTimeBlockId: EventTimeBlockId.from('block'),
          shiftId: priorShift,
          volunteerId: volunteer,
          roleId: RoleId.from('role'),
          shiftRequirementId,
          status: 'confirmed',
        },
      });
    f.volunteerRepository.listQualifiedForRole.mockResolvedValue([
      grace,
      alan,
      ada,
    ]);
    f.availabilityCheckRepository.listActiveMemberships.mockResolvedValue(
      [ada, grace, alan].map((person) => ({
        ministryMembershipId: person.id as string,
        volunteerId: person.id,
        userId: person.userId,
        volunteerName: person.name ?? '',
      })),
    );
    f.availabilityCheckRepository.listByCycle.mockResolvedValue(
      [ada, grace, alan].map(
        (person) =>
          new AvailabilityCheck({
            props: {
              churchId,
              cycleId,
              ministryMembershipId: person.id as string,
              state: 'confirmed',
            },
          }),
      ),
    );
    f.assignmentRepository.listByVolunteers.mockResolvedValue([
      prior('a', 'ada', 'older'),
      prior('g', 'grace', 'newer'),
    ]);
    f.shiftRepository.listConflictFacts.mockResolvedValue(
      [older, newer].map((shift) => ({
        shift,
        ministryName: 'Ministry',
        eventTitle: 'Prior service',
      })),
    );
    f.unavailableShiftRepository.listByVolunteers.mockResolvedValue([
      new UnavailableShift({
        props: {
          churchId,
          availabilityCheckId: AvailabilityCheckId.from('check'),
          shiftId,
          volunteerId: VolunteerId.from('alan'),
          shiftStartTime: start,
          shiftEndTime: end,
        },
      }),
    ]);
    const eligible = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(
      eligible.map((item) => [
        item.volunteerName,
        item.answerState === 'available',
      ]),
    ).toEqual([
      ['Ada Lovelace', true],
      ['Grace Hopper', true],
      ['Alan Turing', false],
    ]);
  });

  it('maps same-role sector requirements to their own assignments and open places', async () => {
    const f = createHarness();
    const beta = new ShiftRequirement({
      id: ShiftRequirementId.from({ raw: 'beta' }),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        roleId: RoleId.from('role'),
        sectorId: SectorId.from('beta-sector'),
        sectorName: 'Beta',
        peopleNeeded: 1,
      },
    });
    const declined = new Assignment({
      id: AssignmentId.from('declined'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId,
        volunteerId,
        roleId: RoleId.from('role'),
        shiftRequirementId: ShiftRequirementId.from({ raw: 'beta' }),
        status: 'declined',
      },
    });
    f.volunteerRepository.listMemberMinistryIds.mockResolvedValue([ministryId]);
    f.ministryParticipationRepository.listByMinistry.mockResolvedValue([
      f.participation,
    ]);
    f.eventRepository.getById.mockResolvedValue(f.event);
    f.shiftRepository.listByParticipation.mockResolvedValue([f.shift]);
    f.shiftRepository.listRequirementsByParticipation.mockResolvedValue([
      f.requirement,
      beta,
    ]);
    f.assignmentRepository.listByParticipation.mockResolvedValue([
      f.assignment,
      declined,
    ]);
    f.roleRepository.listByMinistry.mockResolvedValue([
      new Role({
        id: RoleId.from('role'),
        props: { churchId, ministryId, name: 'Host' },
      }),
    ]);
    const schedule = await f.volunteerManager.getMinistrySchedule({
      churchId,
      ministryId,
      volunteerId,
    });
    expect(schedule.events[0]?.rows).toEqual([
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Alpha',
        volunteerDisplayName: 'Alice A.',
        confirmationState: 'pending',
      }),
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta',
        volunteerDisplayName: 'Alice A.',
        confirmationState: 'declined',
      }),
      expect.objectContaining({
        roleName: 'Host',
        sectorName: 'Beta',
        confirmationState: 'open',
      }),
    ]);
    expect(
      f.ministryParticipationRepository.listByMinistry,
    ).toHaveBeenCalledWith({ churchId, ministryId, state: 'published' });
  });

  it('warns when an assignment is requested for an unavailable volunteer', async () => {
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
    const result = await f.assignmentManager.createParticipationAssignment({
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'UNAVAILABLE' }),
    ]);
  });

  it('refuses a duplicate on the same shift and a requirement from another shift', async () => {
    const f = createHarness();
    f.assignmentRepository.listByShift.mockResolvedValue([f.assignment]);
    const input = {
      churchId,
      shiftId,
      volunteerId,
      shiftRequirementId,
      actorId,
    };
    await expect(
      f.assignmentManager.createParticipationAssignment(input),
    ).rejects.toMatchObject({ reason: 'DUPLICATE_ASSIGNMENT' });
    expect(f.assignmentRepository.create).not.toHaveBeenCalled();
    f.shiftRepository.getRequirementForShift.mockRejectedValue(
      new Error('Shift requirement not found'),
    );
    await expect(
      f.assignmentManager.createParticipationAssignment(input),
    ).rejects.toThrow('Shift requirement not found');
  });

  it('breaks equal eligibility ties by name and flags overlapping service', async () => {
    const f = createHarness();
    const zoe = new Volunteer({
      id: VolunteerId.from('zoe'),
      props: { churchId, userId: UserId.from('zoe-user'), name: 'Zoe' },
    });
    const amy = new Volunteer({
      id: VolunteerId.from('amy'),
      props: { churchId, userId: UserId.from('amy-user'), name: 'Amy' },
    });
    f.volunteerRepository.listQualifiedForRole.mockResolvedValue([zoe, amy]);
    const eligible = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(eligible.map((item) => item.volunteerName)).toEqual(['Amy', 'Zoe']);
    const overlapShift = new Shift({
      id: ShiftId.from('overlap'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        startTime: start,
        endTime: end,
      },
    });
    const overlap = new Assignment({
      id: AssignmentId.from('overlap-assignment'),
      props: {
        churchId,
        participationId,
        eventTimeBlockId: EventTimeBlockId.from('block'),
        shiftId: ShiftId.from('overlap'),
        volunteerId: VolunteerId.from('amy'),
        roleId: RoleId.from('role'),
        shiftRequirementId,
        status: 'confirmed',
      },
    });
    f.assignmentRepository.listByVolunteers.mockResolvedValue([overlap]);
    f.shiftRepository.listConflictFacts.mockResolvedValue([
      {
        shift: overlapShift,
        ministryName: 'Ministry',
        eventTitle: 'Other service',
      },
    ]);
    const conflicted = await f.participationManager.listEligibleVolunteers({
      churchId,
      shiftId,
    });
    expect(
      conflicted.find((item) => item.volunteerName === 'Amy'),
    ).toMatchObject({
      conflict: expect.objectContaining({ assignmentId: expect.any(String) }),
    });
  });
});
