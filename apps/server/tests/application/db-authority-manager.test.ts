import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import type { AuthorityActor } from '@/domain/authority/types';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '@/domain/branded-ids';

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
  };
}

function memberActor(): AuthorityActor {
  return {
    userId,
    volunteerId: null,
    activeChurchId: churchId,
    churchMembership: { churchId, accessLevel: 'member' },
    ministryMemberships: [],
  };
}

function volunteerActor(): AuthorityActor {
  return {
    ...memberActor(),
    volunteerId: 'vol_1' as never,
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
  };
}

const actorRepository = { resolveActor: vi.fn() };
const scopeRepository = {
  resolveParticipationMinistry: vi.fn(),
  resolveShiftMinistry: vi.fn(),
};
const eventRepository = { getMinistryId: vi.fn() };
const eventTimeBlockRepository = { getById: vi.fn() };
const ministryRepository = { getById: vi.fn() };

function createManager(): DbAuthorityManager {
  return new DbAuthorityManager({
    actorRepository: actorRepository as never,
    scopeRepository: scopeRepository as never,
    eventRepository: eventRepository as never,
    eventTimeBlockRepository: eventTimeBlockRepository as never,
    ministryRepository: ministryRepository as never,
  });
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

  it('canManageEventTimeBlock resolves the owning Event via EventTimeBlockRepository then delegates', async () => {
    const manager = createManager();
    const eventTimeBlockId = 'event_time_block_1' as EventTimeBlockId;
    const eventId = 'evt_1' as EventId;

    eventTimeBlockRepository.getById.mockResolvedValueOnce({ eventId });
    eventRepository.getMinistryId.mockResolvedValueOnce(ministryId);
    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    await expect(
      manager.canManageEventTimeBlock({ churchId, eventTimeBlockId, userId }),
    ).resolves.toBe(true);
    expect(eventTimeBlockRepository.getById).toHaveBeenCalledWith(
      churchId,
      eventTimeBlockId,
    );
    expect(eventRepository.getMinistryId).toHaveBeenCalledWith(
      churchId,
      eventId,
    );
  });

  it('projects Scheduling entries for Church admins and Ministry leaders, but not plain Volunteers', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce(adminActor());
    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({
      canAccessScheduling: true,
      entries: [{ kind: 'church' }],
    });

    actorRepository.resolveActor.mockResolvedValueOnce(ministryLeaderActor());
    ministryRepository.getById.mockResolvedValueOnce({ name: 'Worship' });
    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({
      canAccessScheduling: true,
      entries: [{ kind: 'ministry', ministryId, name: 'Worship' }],
    });

    actorRepository.resolveActor.mockResolvedValueOnce(volunteerActor());
    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({ canAccessScheduling: false, entries: [] });
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
  it('distinguishes missing objects, hidden objects and denied functions through the scope-aware seam', async () => {
    const manager = createManager();
    await expect(
      manager.decideAuthority({
        churchId,
        userId,
        action: 'manage',
        resource: null,
        scope: 'object',
      }),
    ).resolves.toEqual({ allowed: false, reason: 'RESOURCE_NOT_FOUND' });
    actorRepository.resolveActor.mockResolvedValue(memberActor());
    await expect(
      manager.decideAuthority({
        churchId,
        userId,
        action: 'manage',
        resource: { type: 'ministry', churchId, ministryId },
        scope: 'object',
      }),
    ).resolves.toEqual({ allowed: false, reason: 'OUTSIDE_SCOPE' });
    await expect(
      manager.decideAuthority({
        churchId,
        userId,
        action: 'manage',
        resource: { type: 'church', churchId },
        scope: 'function',
      }),
    ).resolves.toEqual({ allowed: false, reason: 'INSUFFICIENT_ACCESS_LEVEL' });
  });
});
