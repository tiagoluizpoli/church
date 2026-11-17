import { appConfig } from '@church/app-config';
import { parseInstant, resetClock, setTestClock } from '@church/time';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import { Assignment } from '@/domain/entities/assignment';
import { Event } from '@/domain/entities/event';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testLocale } from '@/tests/test-support/fastify-locale';
import {
  createAssignmentRepositoryFake,
  createAuthorityManagerFake,
  createAvailabilityCheckRepositoryFake,
  createChurchRepositoryFake,
  createCycleRepositoryFake,
  createEventRepositoryFake,
  createMinistryParticipationRepositoryFake,
  createMinistryRepositoryFake,
  createNotificationRepositoryFake,
  createRoleRepositoryFake,
  createShiftRepositoryFake,
  createSwapRequestRepositoryFake,
  createTransactionContextFake,
  createUnavailableShiftRepositoryFake,
  createUnitOfWorkFake,
  createVolunteerRepositoryFake,
} from '@/tests/test-support/repository-contract-fakes';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));
const session = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);
const churchId = ChurchId.from('church');
const volunteerId = VolunteerId.from('volunteer');
const ministryId = MinistryId.from('ministry');
const userId = UserId.from('user');
const instant = (value: string) => parseInstant({ value });
let app: FastifyTypedInstance;
const volunteerRepo = createVolunteerRepositoryFake();
const assignmentRepo = createAssignmentRepositoryFake();
const eventRepo = createEventRepositoryFake();
const shiftRepo = createShiftRepositoryFake();
const ministryRepo = createMinistryRepositoryFake();
const participationRepo = createMinistryParticipationRepositoryFake();
const roleRepo = createRoleRepositoryFake();
const notificationRepo = createNotificationRepositoryFake();

beforeAll(async () => {
  const manager = new DbVolunteerManager({
    volunteerRepo,
    assignmentRepo,
    eventRepo,
    shiftRepo,
    ministryRepo,
    participationRepo,
    roleRepo,
    notificationRepo,
    swapRequestRepo: createSwapRequestRepositoryFake(),
    unavailableShiftRepo: createUnavailableShiftRepositoryFake(),
    cycleRepo: createCycleRepositoryFake(),
    availabilityCheckRepo: createAvailabilityCheckRepositoryFake(),
    churchRepo: createChurchRepositoryFake(),
    authorityManager: createAuthorityManagerFake(),
    unitOfWork: createUnitOfWorkFake({ tx: createTransactionContextFake() }),
    config: appConfig,
  });
  const controller = new VolunteerController({
    volunteerManager: manager,
    activeChurchResolver: {
      resolve: vi.fn().mockResolvedValue({
        status: 'resolved',
        churchId,
        volunteerId,
        hasVolunteerMembership: true,
        autoSelected: false,
      }),
    } as never,
    config: appConfig,
  });
  app = await createFastify({ locale: testLocale });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
afterEach(() => resetClock());

describe('volunteer dashboard next assignment', () => {
  it('returns the earliest shift across overlapping events and its sector', async () => {
    setTestClock({ instant: instant('2026-08-01T00:00:00Z') });
    session.mockResolvedValue({
      user: { id: userId },
      session: { activeOrganizationId: null },
    } as never);
    const events = [
      new Event({
        id: 'early-event',
        props: {
          churchId,
          cycleId: 'cycle',
          title: 'Early event',
          start: instant('2026-08-02T09:00:00Z'),
          end: instant('2026-08-02T19:00:00Z'),
        },
      }),
      new Event({
        id: 'later-event',
        props: {
          churchId,
          cycleId: 'cycle',
          title: 'Later event',
          start: instant('2026-08-02T10:00:00Z'),
          end: instant('2026-08-02T19:00:00Z'),
        },
      }),
    ];
    const participations = events.map(
      (event, index) =>
        new MinistryParticipation({
          id: `p${index}`,
          props: {
            churchId,
            ministryId,
            eventId: event.id,
            state: 'published',
          },
        }),
    );
    const shifts = participations.map(
      (participation, index) =>
        new Shift({
          id: `s${index}`,
          props: {
            churchId,
            participationId: participation.id,
            eventTimeBlockId: `b${index}`,
            startTime: instant(
              index === 0 ? '2026-08-02T16:00:00Z' : '2026-08-02T12:00:00Z',
            ),
            endTime: instant('2026-08-02T18:00:00Z'),
          },
        }),
    );
    const assignments = shifts.map(
      (shift, index) =>
        new Assignment({
          id: `a${index}`,
          props: {
            churchId,
            volunteerId,
            eventTimeBlockId: shift.eventTimeBlockId,
            participationId: shift.participationId,
            shiftId: shift.id,
            roleId: 'role',
            shiftRequirementId: `r${index}`,
            status: 'pending',
          },
        }),
    );
    const requirements = shifts.map(
      (shift, index) =>
        new ShiftRequirement({
          id: `r${index}`,
          props: {
            churchId,
            eventTimeBlockId: shift.eventTimeBlockId,
            participationId: shift.participationId,
            shiftId: shift.id,
            roleId: 'role',
            sectorId: 'sector',
            sectorName: 'Stage',
            peopleNeeded: 1,
          },
        }),
    );
    volunteerRepo.listMemberMinistryIds.mockResolvedValue([ministryId]);
    ministryRepo.listByChurch.mockResolvedValue([
      new Ministry({ id: ministryId, props: { churchId, name: 'Music' } }),
    ]);
    const laterShift = shifts[1];
    if (!laterShift) throw new Error('missing later shift');
    const tied = new Assignment({
      id: 'a-1',
      props: {
        churchId,
        volunteerId,
        eventTimeBlockId: laterShift.eventTimeBlockId,
        participationId: laterShift.participationId,
        shiftId: laterShift.id,
        roleId: 'role',
        shiftRequirementId: 'r1',
        status: 'pending',
      },
    });
    assignmentRepo.listByVolunteer.mockResolvedValue([...assignments, tied]);
    participationRepo.listByIds.mockResolvedValue(participations);
    eventRepo.getWithEventTimeBlocks.mockImplementation(async ({ eventId }) => {
      const event = events.find((item) => item.id === eventId);
      if (!event) throw new Error('missing event');
      return { event, eventTimeBlocks: [] };
    });
    eventRepo.getById.mockImplementation(async ({ eventId }) => {
      const event = events.find((item) => item.id === eventId);
      if (!event) throw new Error('missing event');
      return event;
    });
    shiftRepo.getById.mockImplementation(async ({ shiftId }) => {
      const shift = shifts.find((item) => item.id === shiftId);
      if (!shift) throw new Error('missing shift');
      return shift;
    });
    shiftRepo.listRequirementsByIds.mockResolvedValue(requirements);
    roleRepo.getById.mockResolvedValue(
      new Role({ id: 'role', props: { churchId, ministryId, name: 'Singer' } }),
    );
    notificationRepo.countUnread.mockResolvedValue(0);
    notificationRepo.list.mockResolvedValue({ items: [] });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/dashboard',
    });
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .upcomingAssignmentGroups.map(
          (group: { eventTitle: string }) => group.eventTitle,
        ),
    ).toEqual(['Early event', 'Later event']);
    expect(response.json().nextAssignment).toMatchObject({
      assignmentId: 'a-1',
      eventTitle: 'Later event',
      sectorName: 'Stage',
      roleName: 'Singer',
    });
    expect(shiftRepo.listRequirementsByIds).toHaveBeenCalledTimes(1);
  });
  it('returns null when no published assignments remain', async () => {
    session.mockResolvedValue({
      user: { id: userId },
      session: { activeOrganizationId: null },
    } as never);
    assignmentRepo.listByVolunteer.mockResolvedValue([]);
    participationRepo.listByIds.mockResolvedValue([]);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/dashboard',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().nextAssignment).toBeNull();
  });
});
