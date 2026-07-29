import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbAuthorityManager } from '../../src/application/db-authority-manager';
import type { AuthorityActor } from '../../src/domain/authority/types';
import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  TimeSlotId,
  UserId,
} from '../../src/domain/branded-ids';

const churchId = 'chu_home' as ChurchId;
const otherChurchId = 'chu_other' as ChurchId;
const ministryId = 'min_worship' as MinistryId;
const userId = 'usr_1' as UserId;

function adminActor(): AuthorityActor {
  return {
    userId,
    volunteerId: null,
    activeChurchId: churchId,
    churchMembership: { churchId, accessLevel: 'admin' },
    ministryMemberships: [],
    teamMemberships: [],
  };
}

function memberActor(): AuthorityActor {
  return {
    userId,
    volunteerId: null,
    activeChurchId: churchId,
    churchMembership: { churchId, accessLevel: 'member' },
    ministryMemberships: [],
    teamMemberships: [],
  };
}

function ministryLeaderActor(): AuthorityActor {
  return {
    userId,
    volunteerId: 'vol_1' as never,
    activeChurchId: churchId,
    churchMembership: { churchId, accessLevel: 'member' },
    ministryMemberships: [
      { churchId, ministryId, accessLevel: 'leader', qualifiedRoleIds: [] },
    ],
    teamMemberships: [],
  };
}

const actorRepository = { resolveActor: vi.fn() };
const scopeRepository = {
  resolveParticipationMinistry: vi.fn(),
  resolveShiftMinistry: vi.fn(),
};
const eventRepository = { getMinistryId: vi.fn() };
const timeSlotRepository = { getById: vi.fn() };

function createManager(): DbAuthorityManager {
  return new DbAuthorityManager(
    actorRepository as never,
    scopeRepository as never,
    eventRepository as never,
    timeSlotRepository as never,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DbAuthorityManager', () => {
  it('canManageChurch allows a Church admin and denies a plain member', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce(adminActor());
    await expect(manager.canManageChurch({ churchId, userId })).resolves.toBe(
      true,
    );

    actorRepository.resolveActor.mockResolvedValueOnce(memberActor());
    await expect(manager.canManageChurch({ churchId, userId })).resolves.toBe(
      false,
    );

    expect(actorRepository.resolveActor).toHaveBeenCalledWith({
      userId,
      activeChurchId: churchId,
    });
  });

  it('canManageMinistry allows the Ministry leader and denies a plain member', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.canManageMinistry({ churchId, ministryId, userId }),
    ).resolves.toBe(true);

    actorRepository.resolveActor.mockResolvedValueOnce(memberActor());
    await expect(
      manager.canManageMinistry({ churchId, ministryId, userId }),
    ).resolves.toBe(false);
  });

  it('canManageParticipation resolves the owning Ministry then delegates', async () => {
    const manager = createManager();
    const participationId = 'part_1' as MinistryParticipationId;

    scopeRepository.resolveParticipationMinistry.mockResolvedValueOnce(
      ministryId,
    );
    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(true);
    expect(scopeRepository.resolveParticipationMinistry).toHaveBeenCalledWith({
      churchId,
      participationId,
    });
  });

  it('canManageParticipation denies when the Participation cannot be resolved', async () => {
    const manager = createManager();
    const participationId = 'part_missing' as MinistryParticipationId;

    scopeRepository.resolveParticipationMinistry.mockResolvedValueOnce(null);
    await expect(
      manager.canManageParticipation({ churchId, participationId, userId }),
    ).resolves.toBe(false);
    expect(actorRepository.resolveActor).not.toHaveBeenCalled();
  });

  it('canManageShift resolves the owning Ministry then delegates', async () => {
    const manager = createManager();
    const shiftId = 'shift_1' as ShiftId;

    scopeRepository.resolveShiftMinistry.mockResolvedValueOnce(ministryId);
    actorRepository.resolveActor.mockResolvedValueOnce(memberActor());
    await expect(
      manager.canManageShift({ churchId, shiftId, userId }),
    ).resolves.toBe(false);
    expect(scopeRepository.resolveShiftMinistry).toHaveBeenCalledWith({
      churchId,
      shiftId,
    });
  });

  it('canManageShift denies when the Shift cannot be resolved', async () => {
    const manager = createManager();
    const shiftId = 'shift_missing' as ShiftId;

    scopeRepository.resolveShiftMinistry.mockResolvedValueOnce(null);
    await expect(
      manager.canManageShift({ churchId, shiftId, userId }),
    ).resolves.toBe(false);
  });

  it('canManageEvent resolves the owning Ministry via EventRepository then delegates', async () => {
    const manager = createManager();
    const eventId = 'evt_1' as EventId;

    eventRepository.getMinistryId.mockResolvedValueOnce(ministryId);
    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.canManageEvent({ churchId, eventId, userId }),
    ).resolves.toBe(true);
    expect(eventRepository.getMinistryId).toHaveBeenCalledWith(
      churchId,
      eventId,
    );
  });

  it('canManageEvent denies for a Ministry owned by a different actor', async () => {
    const manager = createManager();
    const eventId = 'evt_1' as EventId;

    eventRepository.getMinistryId.mockResolvedValueOnce(ministryId);
    actorRepository.resolveActor.mockResolvedValueOnce(memberActor());
    await expect(
      manager.canManageEvent({ churchId, eventId, userId }),
    ).resolves.toBe(false);
  });

  it('canManageEventSlot resolves the owning Event via TimeSlotRepository then delegates', async () => {
    const manager = createManager();
    const slotId = 'slot_1' as TimeSlotId;
    const eventId = 'evt_1' as EventId;

    timeSlotRepository.getById.mockResolvedValueOnce({ eventId });
    eventRepository.getMinistryId.mockResolvedValueOnce(ministryId);
    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.canManageEventSlot({ churchId, slotId, userId }),
    ).resolves.toBe(true);
    expect(timeSlotRepository.getById).toHaveBeenCalledWith(churchId, slotId);
    expect(eventRepository.getMinistryId).toHaveBeenCalledWith(
      churchId,
      eventId,
    );
  });

  it('hasSchedulingAccess allows a Church admin, allows a Ministry leader, denies a plain member', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce(adminActor());
    await expect(
      manager.hasSchedulingAccess({ churchId, userId }),
    ).resolves.toBe(true);

    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.hasSchedulingAccess({ churchId, userId }),
    ).resolves.toBe(true);

    actorRepository.resolveActor.mockResolvedValueOnce(memberActor());
    await expect(
      manager.hasSchedulingAccess({ churchId, userId }),
    ).resolves.toBe(false);
  });

  it('denies a resource whose resolved Ministry belongs to a different Church', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce({
      ...ministryLeaderActor(),
      activeChurchId: otherChurchId,
      churchMembership: { churchId: otherChurchId, accessLevel: 'member' },
    });
    await expect(
      manager.canManageMinistry({
        churchId: otherChurchId,
        ministryId,
        userId,
      }),
    ).resolves.toBe(false);
  });
});
