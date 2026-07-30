import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  getActiveChurchDestination,
  switchActiveChurch,
} from './active-church-switch';

interface SelectActiveChurchInput {
  churchId: string;
}

interface NavigateInput {
  destination: string;
}

type SelectActiveChurch = (input: SelectActiveChurchInput) => Promise<void>;
type Navigate = (input: NavigateInput) => Promise<void>;

interface SwitchTestDependencies {
  queryClient: QueryClient;
  selectActiveChurch: ReturnType<typeof vi.fn<SelectActiveChurch>>;
  navigate: ReturnType<typeof vi.fn<Navigate>>;
}

function createSwitchTestDependencies(): SwitchTestDependencies {
  return {
    queryClient: new QueryClient(),
    selectActiveChurch: vi
      .fn<SelectActiveChurch>()
      .mockResolvedValue(undefined),
    navigate: vi.fn<Navigate>().mockResolvedValue(undefined),
  };
}

describe('active Church route policy', () => {
  it.each([
    [
      '/dashboard?section=availability#today',
      '/dashboard?section=availability#today',
    ],
    ['/notifications', '/notifications'],
    ['/volunteer/availability', '/volunteer/availability'],
    ['/scheduling/planning-cycles', '/scheduling/planning-cycles'],
    ['/scheduling/planning-cycles/', '/scheduling/planning-cycles/'],
    ['/scheduling/tailoring/', '/scheduling/tailoring/'],
    ['/scheduling/planning-cycles/cycle-1', '/dashboard'],
    ['/scheduling/', '/dashboard'],
    ['/scheduling/tailoring/ministry-1', '/dashboard'],
    ['/unrecognized-route', '/dashboard'],
    ['https://untrusted.example/dashboard', '/dashboard'],
  ])('resolves %s to %s', (destination, expectedDestination) => {
    expect(getActiveChurchDestination({ destination })).toBe(
      expectedDestination,
    );
  });
});

describe('switchActiveChurch', () => {
  it('cancels and removes cached Church-scoped data before selecting and navigating', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    const calls: string[] = [];
    const cancelQueries = vi
      .spyOn(queryClient, 'cancelQueries')
      .mockImplementation(async () => {
        calls.push('cancel');
      });
    const removeQueries = vi
      .spyOn(queryClient, 'removeQueries')
      .mockImplementation(() => {
        calls.push('remove');
      });
    selectActiveChurch.mockImplementation(async () => {
      calls.push('select');
    });
    navigate.mockImplementation(async () => {
      calls.push('navigate');
    });

    await switchActiveChurch({
      churchId: 'church-b',
      destination: '/dashboard?section=availability',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(removeQueries).toHaveBeenCalledOnce();
    expect(selectActiveChurch).toHaveBeenCalledWith({ churchId: 'church-b' });
    expect(navigate).toHaveBeenCalledWith({
      destination: '/dashboard?section=availability',
    });
    expect(calls).toEqual(['cancel', 'remove', 'select', 'navigate']);
  });

  it('falls back to the dashboard for a route without a preserve declaration', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();

    await switchActiveChurch({
      churchId: 'church-b',
      destination: '/scheduling/tailoring/ministry-1',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(navigate).toHaveBeenCalledWith({ destination: '/dashboard' });
  });

  it('removes Church-scoped data without removing selector data', async () => {
    const { queryClient, selectActiveChurch, navigate } =
      createSwitchTestDependencies();
    queryClient.setQueryData(['planning-cycles'], { church: 'church-a' });
    queryClient.setQueryData(['active-church', 'options'], {
      churches: ['church-a', 'church-b'],
    });

    await switchActiveChurch({
      churchId: 'church-b',
      destination: '/dashboard',
      navigate,
      queryClient,
      selectActiveChurch,
    });

    expect(queryClient.getQueryData(['planning-cycles'])).toBeUndefined();
    expect(queryClient.getQueryData(['active-church', 'options'])).toEqual({
      churches: ['church-a', 'church-b'],
    });
  });
});
