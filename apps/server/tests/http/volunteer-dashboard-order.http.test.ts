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
import { Church } from '@/domain/entities/church';
import { Event } from '@/domain/entities/event';
import { Ministry } from '@/domain/entities/ministry';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { Role } from '@/domain/entities/role';
import { Shift } from '@/domain/entities/shift';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
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
const churchRepo = createChurchRepositoryFake();

beforeAll(async () => {
  churchRepo.getById.mockResolvedValue(
    new Church({
      id: churchId,
      props: { name: 'Church', slug: 'church', timezone: 'America/Sao_Paulo' },
    }),
  );
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
    churchRepo,
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
  });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
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
    assignmentRepo.listPublishedByVolunteer.mockResolvedValue(
      [...assignments, tied].map((assignment) => ({
        assignment,
        cancelled: false,
      })),
    );
    participationRepo.listByIds.mockResolvedValue(participations);
    eventRepo.listByIds.mockResolvedValue(events);
    shiftRepo.listByIds.mockResolvedValue(shifts);
    shiftRepo.listRequirementsByIds.mockResolvedValue(requirements);
    roleRepo.listByIds.mockResolvedValue([
      new Role({ id: 'role', props: { churchId, ministryId, name: 'Singer' } }),
    ]);
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
    assignmentRepo.listPublishedByVolunteer.mockResolvedValue([]);
    participationRepo.listByIds.mockResolvedValue([]);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/volunteer/dashboard',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().nextAssignment).toBeNull();
  });
});

interface ArrangedItem {
  id: string;
  eventId: string;
  start: string;
  status: 'pending';
  ministry?: string;
}

interface ArrangeInput {
  events: {
    id: string;
    title: string;
    start: string;
    status?: 'cancelled';
  }[];
  items: ArrangedItem[];
}

/** One participation, shift and requirement per item, each ending two hours after its start. */
function arrange({ events, items }: ArrangeInput) {
  setTestClock({ instant: instant('2026-08-01T00:00:00Z') });
  session.mockResolvedValue({
    user: { id: userId },
    session: { activeOrganizationId: null },
  } as never);
  const ministryIds = [
    ...new Set(items.map((item) => item.ministry ?? 'Music')),
  ];
  const eventEntities = events.map(
    (event) =>
      new Event({
        id: event.id,
        props: {
          churchId,
          cycleId: 'cycle',
          title: event.title,
          start: instant(event.start),
          end: instant('2026-08-09T23:00:00Z'),
          status: event.status,
        },
      }),
  );
  const participations = items.map(
    (item) =>
      new MinistryParticipation({
        id: `p-${item.id}`,
        props: {
          churchId,
          ministryId: MinistryId.from(item.ministry ?? 'Music'),
          eventId: item.eventId,
          state: 'published',
        },
      }),
  );
  const shifts = items.map((item) => {
    const start = instant(item.start);
    return new Shift({
      id: `s-${item.id}`,
      props: {
        churchId,
        participationId: `p-${item.id}`,
        eventTimeBlockId: `b-${item.id}`,
        startTime: start,
        endTime: instant(
          new Date(Date.parse(start) + 2 * 3_600_000).toISOString(),
        ),
      },
    });
  });
  volunteerRepo.listMemberMinistryIds.mockResolvedValue(
    ministryIds.map((id) => MinistryId.from(id)),
  );
  ministryRepo.listByChurch.mockResolvedValue(
    ministryIds.map(
      (id) =>
        new Ministry({
          id: MinistryId.from(id),
          props: { churchId, name: id },
        }),
    ),
  );
  const assignments = items.map(
    (item) =>
      new Assignment({
        id: item.id,
        props: {
          churchId,
          volunteerId,
          eventTimeBlockId: `b-${item.id}`,
          participationId: `p-${item.id}`,
          shiftId: `s-${item.id}`,
          roleId: 'role',
          shiftRequirementId: `r-${item.id}`,
          status: item.status,
        },
      }),
  );
  // The read leaves a cancelled Event's work out of the live list.
  const cancelledEventIds = new Set(
    events.filter((event) => event.status).map((event) => event.id),
  );
  assignmentRepo.listPublishedByVolunteer.mockResolvedValue(
    assignments
      .filter((_, index) => !cancelledEventIds.has(items[index]?.eventId ?? ''))
      .map((assignment) => ({ assignment, cancelled: false })),
  );
  participationRepo.listByIds.mockResolvedValue(participations);
  eventRepo.listByIds.mockResolvedValue(eventEntities);
  shiftRepo.listByIds.mockResolvedValue(shifts);
  shiftRepo.listRequirementsByIds.mockResolvedValue(
    items.map(
      (item) =>
        new ShiftRequirement({
          id: `r-${item.id}`,
          props: {
            churchId,
            eventTimeBlockId: `b-${item.id}`,
            participationId: `p-${item.id}`,
            shiftId: `s-${item.id}`,
            roleId: 'role',
            sectorId: 'sector',
            sectorName: 'Stage',
            peopleNeeded: 1,
          },
        }),
    ),
  );
  roleRepo.listByIds.mockResolvedValue([
    new Role({ id: 'role', props: { churchId, ministryId, name: 'Singer' } }),
  ]);
  notificationRepo.countUnread.mockResolvedValue(0);
  notificationRepo.list.mockResolvedValue({ items: [] });
}

async function getDashboard() {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/volunteer/dashboard',
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as {
    nextAssignment: { assignmentId: string } | null;
    servingHistory: { month: string; served: number }[];
    upcomingAssignmentGroups: {
      eventId: string;
      ministryName: string;
      assignments: { assignmentId: string; status: string }[];
    }[];
  };
}

const assignmentIds = (groups: { assignments: { assignmentId: string }[] }[]) =>
  groups.flatMap((group) => group.assignments.map((a) => a.assignmentId));

describe('volunteer dashboard upcoming cap and order', () => {
  it('caps upcoming assignments without changing which one is next', async () => {
    const limit = appConfig.volunteerDashboard.upcomingLimit;
    // The earlier-starting Event holds only later shifts, so it fills the cap.
    arrange({
      events: [
        { id: 'long', title: 'Retreat', start: '2026-08-02T08:00:00Z' },
        { id: 'short', title: 'Prayer', start: '2026-08-02T09:00:00Z' },
      ],
      items: [
        ...Array.from({ length: limit + 1 }, (_, index) => ({
          id: `long-${index}`,
          eventId: 'long',
          start: `2026-08-0${3 + index}T15:00:00Z`,
          status: 'pending' as const,
        })),
        {
          id: 'short-0',
          eventId: 'short',
          start: '2026-08-02T10:00:00Z',
          status: 'pending',
        },
      ],
    });
    const dashboard = await getDashboard();
    expect(dashboard.nextAssignment?.assignmentId).toBe('short-0');
    expect(assignmentIds(dashboard.upcomingAssignmentGroups)).toEqual(
      Array.from({ length: limit }, (_, index) => `long-${index}`),
    );
  });

  it('orders equal-start groups by Ministry name and equal-start items by id', async () => {
    arrange({
      events: [{ id: 'e', title: 'Sunday', start: '2026-08-02T08:00:00Z' }],
      items: [
        {
          id: 'z-b',
          eventId: 'e',
          start: '2026-08-02T09:00:00Z',
          status: 'pending',
          ministry: 'Worship',
        },
        {
          id: 'k-b',
          eventId: 'e',
          start: '2026-08-02T09:00:00Z',
          status: 'pending',
          ministry: 'Kids',
        },
        {
          id: 'k-a',
          eventId: 'e',
          start: '2026-08-02T09:00:00Z',
          status: 'pending',
          ministry: 'Kids',
        },
      ],
    });
    const dashboard = await getDashboard();
    expect(
      dashboard.upcomingAssignmentGroups.map((group) => group.ministryName),
    ).toEqual(['Kids', 'Worship']);
    expect(assignmentIds(dashboard.upcomingAssignmentGroups)).toEqual([
      'k-a',
      'k-b',
      'z-b',
    ]);
  });
});

describe('volunteer dashboard serving history', () => {
  it('counts started, published shifts per Church month, skipping cancelled Events', async () => {
    arrange({
      events: [
        { id: 'e', title: 'Sunday', start: '2026-02-01T08:00:00Z' },
        {
          id: 'gone',
          title: 'Retreat',
          start: '2026-06-01T08:00:00Z',
          status: 'cancelled',
        },
      ],
      items: [
        // 01:00 UTC on 1 March is still 28 February in São Paulo.
        {
          id: 'feb-edge',
          eventId: 'e',
          start: '2026-03-01T01:00:00Z',
          status: 'pending',
        },
        {
          id: 'mar',
          eventId: 'e',
          start: '2026-03-08T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'jul',
          eventId: 'e',
          start: '2026-07-05T12:00:00Z',
          status: 'pending',
        },
        // 31 July 22:00 in São Paulo: this month, but not served yet.
        {
          id: 'jul-future',
          eventId: 'e',
          start: '2026-08-01T01:00:00Z',
          status: 'pending',
        },
        {
          id: 'jun-cancelled-event',
          eventId: 'gone',
          start: '2026-06-07T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'aug-outside',
          eventId: 'e',
          start: '2026-08-02T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'jan-outside',
          eventId: 'e',
          start: '2026-01-10T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'sep-outside',
          eventId: 'e',
          start: '2026-09-06T12:00:00Z',
          status: 'pending',
        },
      ],
    });
    const dashboard = await getDashboard();
    // The clock (2026-08-01T00:00Z) is still 31 July in São Paulo, so July is the current month.
    expect(dashboard.servingHistory).toEqual([
      { month: '2026-02-01', served: 1 },
      { month: '2026-03-01', served: 1 },
      { month: '2026-04-01', served: 0 },
      { month: '2026-05-01', served: 0 },
      { month: '2026-06-01', served: 0 },
      { month: '2026-07-01', served: 1 },
    ]);
  });
});
