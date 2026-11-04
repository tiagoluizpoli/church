import { NotFoundError } from '@church/core';
import { parseInstant } from '@church/time';
import { describe, expect, it, vi } from 'vitest';
import { DbAvailabilityCheckManager } from '@/application/db-availability-check-manager';
import {
  ChurchId,
  CycleId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import { AvailabilityCheck } from '@/domain/entities/availability-check';
import { Event } from '@/domain/entities/event';
import { MinistryParticipation } from '@/domain/entities/ministry-participation';
import { IllegalStateTransitionError } from '@/domain/errors';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';

const churchId = ChurchId.from('church-1');
const cycleId = CycleId.from('cycle-1');
const eventId = EventId.from('event-1');
const ministryId = MinistryId.from('ministry-1');
const participationId = MinistryParticipationId.from('participation-1');
const members = [
  {
    ministryMembershipId: 'membership-1',
    volunteerId: VolunteerId.from('volunteer-1'),
    userId: UserId.from('user-1'),
    volunteerName: 'One',
  },
  {
    ministryMembershipId: 'membership-2',
    volunteerId: VolunteerId.from('volunteer-2'),
    userId: UserId.from('user-2'),
    volunteerName: 'Two',
  },
];
function createFixture() {
  const tx = {} as TransactionContext;
  const participation = new MinistryParticipation({
    id: participationId,
    props: { churchId, ministryId, eventId },
  });
  const event = new Event({
    id: eventId,
    props: {
      churchId,
      cycleId,
      title: 'Service',
      start: parseInstant({ value: '2026-08-02T09:00:00Z' }),
      end: parseInstant({ value: '2026-08-02T10:00:00Z' }),
    },
  });
  const participationRepository = {
    getById: vi.fn(async () => participation),
    findByMinistryEvent: vi.fn(),
    create: vi.fn(),
    listByEvent: vi.fn(),
    hasCycleStaffing: vi.fn(),
    listByMinistry: vi.fn(),
    listByIds: vi.fn(),
    updateState: vi.fn(),
    listInclusions: vi.fn(),
    replaceInclusions: vi.fn(),
    addInclusion: vi.fn(),
    touch: vi.fn(),
    listScheduleSummaries: vi.fn(),
  } satisfies MinistryParticipationRepository;
  const eventRepository = {
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    getEvent: vi.fn(async () => event),
    deleteEvent: vi.fn(),
    listCycleEvents: vi.fn(),
    createEventTimeBlock: vi.fn(),
    seedParticipations: vi.fn(),
  } satisfies PlanningEventRepository;
  const availabilityCheckRepository = {
    listActiveMemberships: vi.fn<
      AvailabilityCheckRepository['listActiveMemberships']
    >(async () => members),
    listByCycle: vi.fn<AvailabilityCheckRepository['listByCycle']>(
      async () => [],
    ),
    createMany: vi.fn<AvailabilityCheckRepository['createMany']>(
      async ({ checks }) =>
        checks.map(
          (check) => new AvailabilityCheck({ props: { churchId, ...check } }),
        ),
    ),
    getCheckContext: vi.fn(),
    listByVolunteer: vi.fn(),
    listCheckShifts: vi.fn(),
    listMinistryLeaderVolunteerIds: vi.fn(),
    confirm: vi.fn(),
  } satisfies AvailabilityCheckRepository;
  const cycleRepository = {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    findOverlapping: vi.fn(),
    updateState: vi.fn(),
    acquireChurchLock: vi.fn(),
  } satisfies CycleRepository;
  const unitOfWork: UnitOfWork = {
    run: vi.fn(async (work) => work(tx)),
    runWith: vi.fn(async ({ work }) => work(tx)),
  };
  const notifications = createChurchNotificationsSpy();
  const manager = new DbAvailabilityCheckManager({
    participationRepository,
    eventRepository,
    availabilityCheckRepository,
    cycleRepository,
    unitOfWork,
    notifications,
  });
  return {
    manager,
    participation,
    participationRepository,
    eventRepository,
    availabilityCheckRepository,
    cycleRepository,
    unitOfWork,
    notifications,
    tx,
  };
}

describe('availability requests', () => {
  it('creates checks for active memberships and requests their notification', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      participationRepository,
      eventRepository,
      notifications,
      tx,
    } = createFixture();
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).resolves.toEqual({ createdCheckCount: 2, notifiedVolunteerCount: 2 });
    expect(checks.listActiveMemberships).toHaveBeenCalledWith({
      churchId,
      ministryId,
      tx,
    });
    expect(checks.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryMembershipIds: ['membership-1', 'membership-2'],
      tx,
    });
    expect(checks.createMany).toHaveBeenCalledWith({
      churchId,
      checks: [
        { cycleId, ministryMembershipId: 'membership-1' },
        { cycleId, ministryMembershipId: 'membership-2' },
      ],
      tx,
    });
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
      tx,
    });
    expect(eventRepository.getEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
      tx,
    });
    expect(participationRepository.updateState).toHaveBeenCalledWith({
      churchId,
      participationId,
      state: 'availability_requested',
      tx,
    });
    expect(notifications.enqueue).toHaveBeenCalledWith({
      tx,
      kind: 'availability_opened',
      to: [
        { userId: UserId.from('user-1'), churchId },
        { userId: UserId.from('user-2'), churchId },
      ],
      data: { cycleId, ministryId },
    });
  });
  it('reuses existing checks and notifies only newly requested members', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      notifications,
      tx,
    } = createFixture();
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
    ]);
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).resolves.toEqual({ createdCheckCount: 1, notifiedVolunteerCount: 1 });
    expect(checks.createMany).toHaveBeenCalledWith({
      churchId,
      checks: [{ cycleId, ministryMembershipId: 'membership-2' }],
      tx,
    });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ churchId, userId: UserId.from('user-2') }],
      }),
    );
  });

  it('rejects a repeated request and a reminder before requesting', async () => {
    const {
      manager,
      participation,
      availabilityCheckRepository: checks,
    } = createFixture();
    await expect(
      manager.resendReminder({ churchId, participationId }),
    ).rejects.toThrow(IllegalStateTransitionError);
    participation.askAvailability();
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).rejects.toThrow(IllegalStateTransitionError);
    expect(checks.createMany).not.toHaveBeenCalled();
  });

  it('reminds only pending members without creating checks', async () => {
    const {
      manager,
      participation,
      availabilityCheckRepository: checks,
      notifications,
      tx,
    } = createFixture();
    participation.askAvailability();
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
      new AvailabilityCheck({
        props: {
          churchId,
          cycleId,
          ministryMembershipId: 'membership-2',
          state: 'confirmed',
        },
      }),
    ]);
    await manager.resendReminder({ churchId, participationId });
    expect(checks.createMany).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith({
      tx,
      kind: 'availability_reminder',
      to: [{ churchId, userId: UserId.from('user-1') }],
      data: { cycleId, ministryId },
    });
  });

  it('propagates a scoped participation lookup failure', async () => {
    const {
      manager,
      participationRepository,
      availabilityCheckRepository: checks,
      tx,
    } = createFixture();
    participationRepository.getById.mockRejectedValue(
      new NotFoundError('participation'),
    );
    await expect(
      manager.askAvailability({ churchId, participationId }),
    ).rejects.toThrow(NotFoundError);
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
      tx,
    });
    expect(checks.createMany).not.toHaveBeenCalled();
  });

  it('lists pending, confirmed, and never-requested members through both status surfaces', async () => {
    const {
      manager,
      availabilityCheckRepository: checks,
      cycleRepository,
      participationRepository,
      eventRepository,
    } = createFixture();
    const confirmedAt = parseInstant({ value: '2026-08-01T12:00:00Z' });
    checks.listActiveMemberships.mockResolvedValue([
      ...members,
      {
        ministryMembershipId: 'membership-3',
        volunteerId: VolunteerId.from('volunteer-3'),
        userId: UserId.from('user-3'),
        volunteerName: 'Three',
      },
    ]);
    checks.listByCycle.mockResolvedValue([
      new AvailabilityCheck({
        props: { churchId, cycleId, ministryMembershipId: 'membership-1' },
      }),
      new AvailabilityCheck({
        props: {
          churchId,
          cycleId,
          ministryMembershipId: 'membership-2',
          state: 'confirmed',
          confirmedAt,
        },
      }),
    ]);
    const expected = [
      {
        volunteerId: 'volunteer-1',
        volunteerName: 'One',
        state: 'pending',
        confirmedAt: undefined,
      },
      {
        volunteerId: 'volunteer-2',
        volunteerName: 'Two',
        state: 'confirmed',
        confirmedAt,
      },
      {
        volunteerId: 'volunteer-3',
        volunteerName: 'Three',
        state: undefined,
        confirmedAt: undefined,
      },
    ];
    await expect(
      manager.listCheckStatuses({ churchId, participationId }),
    ).resolves.toEqual(expected);
    await expect(
      manager.listCycleCheckStatuses({ churchId, cycleId, ministryId }),
    ).resolves.toEqual(expected);
    expect(participationRepository.getById).toHaveBeenCalledWith({
      churchId,
      participationId,
    });
    expect(eventRepository.getEvent).toHaveBeenCalledWith({
      churchId,
      eventId,
    });
    expect(cycleRepository.getById).toHaveBeenCalledWith({ churchId, cycleId });
    expect(checks.listByCycle).toHaveBeenCalledWith({
      churchId,
      cycleId,
      ministryMembershipIds: ['membership-1', 'membership-2', 'membership-3'],
    });
  });
});
