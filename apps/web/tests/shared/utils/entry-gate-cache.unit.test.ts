import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedActiveChurchStatus,
  getCachedSession,
  invalidateActiveChurchStatus,
} from '@/shared/utils/entry-gate-cache';

const { getSession, getActiveChurchStatus } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getActiveChurchStatus: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({ authClient: { getSession } }));
vi.mock('@/utils/api-instances', () => ({
  activeChurchApi: { getActiveChurchStatus },
}));

describe('the entry gate cache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  it('sends one session request for repeated gate runs', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1' } } });

    await getCachedSession({ queryClient });
    await getCachedSession({ queryClient });

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('does not keep a missing session', async () => {
    getSession.mockResolvedValue({ data: null });

    await getCachedSession({ queryClient });
    await getCachedSession({ queryClient });

    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('sends one status request for repeated gate runs', async () => {
    getActiveChurchStatus.mockResolvedValue({ status: 'resolved' });

    await getCachedActiveChurchStatus({ queryClient });
    await getCachedActiveChurchStatus({ queryClient });

    expect(getActiveChurchStatus).toHaveBeenCalledTimes(1);
  });

  it('asks again after the status is invalidated by a church select', async () => {
    getActiveChurchStatus.mockResolvedValue({ status: 'resolved' });

    await getCachedActiveChurchStatus({ queryClient });
    invalidateActiveChurchStatus({ queryClient });
    await getCachedActiveChurchStatus({ queryClient });

    expect(getActiveChurchStatus).toHaveBeenCalledTimes(2);
  });

  it('never keeps a status that reports a removed Membership', async () => {
    getActiveChurchStatus
      .mockResolvedValueOnce({
        status: 'resolved',
        membershipRemovedFrom: 'Grace',
      })
      .mockResolvedValueOnce({ status: 'resolved' });

    await getCachedActiveChurchStatus({ queryClient });
    const next = await getCachedActiveChurchStatus({ queryClient });

    expect(next.membershipRemovedFrom).toBeUndefined();
    expect(getActiveChurchStatus).toHaveBeenCalledTimes(2);
  });
});
