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
  TeamId,
  TimeSlotId,
  UserId,
} from '../../src/domain/branded-ids';

const churchId = 'chu_home' as ChurchId;
const otherChurchId = 'chu_other' as ChurchId;
const ministryId = 'min_worship' as MinistryId;
const teamId = 'team_greeting' as TeamId;
const secondTeamId = 'team_welcome' as TeamId;
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
    teamMemberships: [],
  };
}

function teamLeaderActor(): AuthorityActor {
  return {
    ...volunteerActor(),
    teamMemberships: [
      {
        churchId,
        ministryId,
        teamId,
        accessLevel: 'leader',
      },
    ],
  };
}

const actorRepository = { resolveActor: vi.fn() };
const scopeRepository = {
  resolveParticipationMinistry: vi.fn(),
  resolveShiftMinistry: vi.fn(),
};
const eventRepository = { getMinistryId: vi.fn() };
const timeSlotRepository = { getById: vi.fn() };
const ministryRepository = { getById: vi.fn() };
const teamRepository = { listByIds: vi.fn() };

function createManager(): DbAuthorityManager {
  return new DbAuthorityManager(
    actorRepository as never,
    scopeRepository as never,
    eventRepository as never,
    timeSlotRepository as never,
    ministryRepository as never,
    teamRepository as never,
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

  it('canManageTeamShift allows only the explicitly led Team owning the Shift ministry', async () => {
    const manager = createManager();
    const shiftId = 'shift_1' as ShiftId;

    scopeRepository.resolveShiftMinistry.mockResolvedValue(ministryId);
    teamRepository.listByIds.mockResolvedValue([
      { id: teamId, ministryId, name: 'Greeting' },
    ]);
    actorRepository.resolveActor.mockResolvedValue(teamLeaderActor());

    await expect(
      manager.canManageTeamShift({ churchId, shiftId, teamId, userId }),
    ).resolves.toBe(true);
  });

  it('canManageTeamShift denies a forged Team from another Ministry without resolving the actor', async () => {
    const manager = createManager();
    const shiftId = 'shift_1' as ShiftId;

    scopeRepository.resolveShiftMinistry.mockResolvedValue(ministryId);
    teamRepository.listByIds.mockResolvedValue([
      { id: teamId, ministryId: 'min_other', name: 'Other' },
    ]);

    await expect(
      manager.canManageTeamShift({ churchId, shiftId, teamId, userId }),
    ).resolves.toBe(false);
    expect(actorRepository.resolveActor).not.toHaveBeenCalled();
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

  it('projects a TeamLeader only to the team they lead', async () => {
    const manager = createManager();

    actorRepository.resolveActor.mockResolvedValueOnce(teamLeaderActor());
    teamRepository.listByIds.mockResolvedValueOnce([
      { id: teamId, ministryId, name: 'Greeting' },
    ]);
    ministryRepository.getById.mockResolvedValueOnce({
      id: ministryId,
      name: 'Worship',
    });

    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({
      canAccessScheduling: true,
      entries: [
        {
          kind: 'team',
          ministryId,
          ministryName: 'Worship',
          teamId,
          name: 'Greeting',
        },
      ],
    });
  });

  it('projects every Team a TeamLeader leads, grouped by its owning Ministry', async () => {
    const manager = createManager();
    actorRepository.resolveActor.mockResolvedValueOnce({
      ...teamLeaderActor(),
      teamMemberships: [
        ...teamLeaderActor().teamMemberships,
        {
          churchId,
          ministryId,
          teamId: secondTeamId,
          accessLevel: 'leader',
        },
      ],
    });
    teamRepository.listByIds.mockResolvedValueOnce([
      { id: teamId, ministryId, name: 'Greeting' },
      { id: secondTeamId, ministryId, name: 'Welcome' },
    ]);
    ministryRepository.getById.mockResolvedValue({
      id: ministryId,
      name: 'Worship',
    });

    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({
      canAccessScheduling: true,
      entries: [
        {
          kind: 'team',
          ministryId,
          ministryName: 'Worship',
          teamId,
          name: 'Greeting',
        },
        {
          kind: 'team',
          ministryId,
          ministryName: 'Worship',
          teamId: secondTeamId,
          name: 'Welcome',
        },
      ],
    });
  });

  it('keeps mixed Ministry and Team leadership at their actual scopes', async () => {
    const manager = createManager();
    const teamOnlyMinistryId = 'min_kids' as MinistryId;
    const teamOnlyTeamId = 'team_checkin' as TeamId;

    actorRepository.resolveActor.mockResolvedValueOnce({
      ...ministryLeaderActor(),
      teamMemberships: [
        {
          churchId,
          ministryId,
          teamId,
          accessLevel: 'leader',
        },
        {
          churchId,
          ministryId: teamOnlyMinistryId,
          teamId: teamOnlyTeamId,
          accessLevel: 'leader',
        },
      ],
    });
    ministryRepository.getById
      .mockResolvedValueOnce({ id: ministryId, name: 'Worship' })
      .mockResolvedValueOnce({ id: ministryId, name: 'Worship' })
      .mockResolvedValueOnce({ id: teamOnlyMinistryId, name: 'Kids' });
    teamRepository.listByIds.mockResolvedValueOnce([
      { id: teamId, ministryId, name: 'Greeting' },
      {
        id: teamOnlyTeamId,
        ministryId: teamOnlyMinistryId,
        name: 'Check-in',
      },
    ]);

    await expect(
      manager.resolveSchedulingCapability({ churchId, userId }),
    ).resolves.toEqual({
      canAccessScheduling: true,
      entries: [
        { kind: 'ministry', ministryId, name: 'Worship' },
        {
          kind: 'team',
          ministryId: teamOnlyMinistryId,
          ministryName: 'Kids',
          teamId: teamOnlyTeamId,
          name: 'Check-in',
        },
      ],
    });
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
