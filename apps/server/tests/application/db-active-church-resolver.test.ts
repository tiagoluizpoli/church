import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbActiveChurchResolver } from '../../src/application/db-active-church-resolver';
import type { AuthorityActor } from '../../src/domain/authority/types';
import type {
  ChurchId,
  UserId,
  VolunteerId,
} from '../../src/domain/branded-ids';

const churchId = 'chu_home' as ChurchId;
const otherChurchId = 'chu_other' as ChurchId;
const userId = 'usr_1' as UserId;
const volunteerId = 'vol_1' as VolunteerId;

interface ActorWithMembershipInput {
  churchId: ChurchId;
  accessLevel: 'member' | 'admin';
  volunteerId?: VolunteerId | null;
}

function actorWithMembership(input: ActorWithMembershipInput): AuthorityActor {
  return {
    userId,
    volunteerId: input.volunteerId ?? null,
    activeChurchId: input.churchId,
    churchMembership: {
      churchId: input.churchId,
      accessLevel: input.accessLevel,
    },
    ministryMemberships: [],
    teamMemberships: [],
  };
}

function actorWithoutMembership(activeChurchId: ChurchId): AuthorityActor {
  return {
    userId,
    volunteerId: null,
    activeChurchId,
    churchMembership: null,
    ministryMemberships: [],
    teamMemberships: [],
  };
}

const actorRepository = { resolveActor: vi.fn() };
const membershipRepository = { listByUserId: vi.fn(), touchOpened: vi.fn() };
const churchRepository = { getById: vi.fn() };
const unitOfWork = { run: vi.fn() };
const FAKE_TX = { brand: 'fake-tx' } as never;

function createResolver(): DbActiveChurchResolver {
  return new DbActiveChurchResolver(
    actorRepository as never,
    membershipRepository as never,
    churchRepository as never,
    unitOfWork as never,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  // `run` executes its callback against one shared fake transaction — proves
  // the caller threads that same `tx` through every repository call it makes
  // inside the callback, the way `repeatable read` requires for one snapshot.
  unitOfWork.run.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(FAKE_TX),
  );
});

describe('DbActiveChurchResolver', () => {
  it('resolves against the session active organization, revalidating Church Membership', async () => {
    const resolver = createResolver();
    actorRepository.resolveActor.mockResolvedValueOnce(
      actorWithMembership({ churchId, accessLevel: 'admin', volunteerId }),
    );

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: churchId,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId,
      volunteerId,
      autoSelected: false,
    });
    expect(actorRepository.resolveActor).toHaveBeenCalledWith({
      userId,
      activeChurchId: churchId,
    });
    expect(membershipRepository.listByUserId).not.toHaveBeenCalled();
  });

  it('shows the selector with a removal notice when the session names a Church the User was removed from and several Memberships remain', async () => {
    const resolver = createResolver();
    actorRepository.resolveActor.mockResolvedValueOnce(
      actorWithoutMembership(churchId),
    );
    churchRepository.getById.mockResolvedValueOnce({
      name: 'Former Home Church',
    } as never);
    membershipRepository.listByUserId.mockResolvedValueOnce([
      { churchId: otherChurchId, accessLevel: 'member' },
      { churchId: 'chu_third' as ChurchId, accessLevel: 'admin' },
    ]);

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: churchId,
    });

    expect(result).toEqual({
      status: 'selection_required',
      membershipRemovedFrom: 'Former Home Church',
    });
    expect(churchRepository.getById).toHaveBeenCalledWith({ id: churchId });
  });

  it('auto-selects the one remaining Church with a removal notice when the session names a Church the User was removed from', async () => {
    const resolver = createResolver();
    actorRepository.resolveActor
      .mockResolvedValueOnce(actorWithoutMembership(churchId))
      .mockResolvedValueOnce(
        actorWithMembership({ churchId: otherChurchId, accessLevel: 'member' }),
      );
    churchRepository.getById.mockResolvedValueOnce({
      name: 'Former Home Church',
    } as never);
    membershipRepository.listByUserId.mockResolvedValueOnce([
      { churchId: otherChurchId, accessLevel: 'member' },
    ]);

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: churchId,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId: otherChurchId,
      volunteerId: null,
      autoSelected: true,
      membershipRemovedFrom: 'Former Home Church',
    });
    expect(membershipRepository.touchOpened).toHaveBeenCalledWith({
      userId,
      churchId: otherChurchId,
      tx: FAKE_TX,
    });
  });

  it('shows a removal notice on the no-access outcome when the session names a Church the User was removed from and none remain', async () => {
    const resolver = createResolver();
    actorRepository.resolveActor.mockResolvedValueOnce(
      actorWithoutMembership(churchId),
    );
    churchRepository.getById.mockResolvedValueOnce({
      name: 'Former Home Church',
    } as never);
    membershipRepository.listByUserId.mockResolvedValueOnce([]);

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: churchId,
    });

    expect(result).toEqual({
      status: 'no_membership',
      membershipRemovedFrom: 'Former Home Church',
    });
  });

  it('auto-selects the one Church when the session has none active and exactly one Membership exists, inside one repeatable-read transaction', async () => {
    const resolver = createResolver();
    membershipRepository.listByUserId.mockResolvedValueOnce([
      { churchId, accessLevel: 'member' },
    ]);
    actorRepository.resolveActor.mockResolvedValueOnce(
      actorWithMembership({ churchId, accessLevel: 'member' }),
    );

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({
      status: 'resolved',
      churchId,
      volunteerId: null,
      autoSelected: true,
    });
    expect(unitOfWork.run).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
    expect(membershipRepository.listByUserId).toHaveBeenCalledWith({
      userId,
      tx: FAKE_TX,
    });
    expect(actorRepository.resolveActor).toHaveBeenCalledWith({
      userId,
      activeChurchId: churchId,
      tx: FAKE_TX,
    });
    expect(membershipRepository.touchOpened).toHaveBeenCalledWith({
      userId,
      churchId,
      tx: FAKE_TX,
    });
  });

  it('does not touch "last opened" when resolving against an already-active Church on every scoped request', async () => {
    const resolver = createResolver();
    actorRepository.resolveActor.mockResolvedValueOnce(
      actorWithMembership({ churchId, accessLevel: 'admin', volunteerId }),
    );

    await resolver.resolve({ userId, activeOrganizationId: churchId });

    expect(membershipRepository.touchOpened).not.toHaveBeenCalled();
  });

  it('requires selection when the session has no active Church and several Memberships exist', async () => {
    const resolver = createResolver();
    membershipRepository.listByUserId.mockResolvedValueOnce([
      { churchId, accessLevel: 'member' },
      { churchId: otherChurchId, accessLevel: 'admin' },
    ]);

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({ status: 'selection_required' });
    expect(actorRepository.resolveActor).not.toHaveBeenCalled();
  });

  it('denies when the session has no active Church and no Membership exists', async () => {
    const resolver = createResolver();
    membershipRepository.listByUserId.mockResolvedValueOnce([]);

    const result = await resolver.resolve({
      userId,
      activeOrganizationId: null,
    });

    expect(result).toEqual({ status: 'no_membership' });
    expect(actorRepository.resolveActor).not.toHaveBeenCalled();
  });
});
