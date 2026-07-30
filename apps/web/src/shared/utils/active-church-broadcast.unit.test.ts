import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ActiveChurchSwitchedMessage,
  postActiveChurchSwitched,
  subscribeToActiveChurchSwitch,
} from './active-church-broadcast';

const SAMPLE_MESSAGE: ActiveChurchSwitchedMessage = {
  availableAreas: ['dashboard'],
  churchId: 'church-b',
  churchName: 'Igreja Central',
};

describe('active Church cross-tab broadcast', () => {
  const unsubscribers: (() => void)[] = [];

  afterEach(() => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
    vi.restoreAllMocks();
  });

  it('delivers a posted message to a subscriber', async () => {
    const onMessage = vi.fn();
    const received = new Promise<void>((resolve) => {
      onMessage.mockImplementation(() => resolve());
    });
    unsubscribers.push(subscribeToActiveChurchSwitch({ onMessage }));

    postActiveChurchSwitched(SAMPLE_MESSAGE);
    await received;

    expect(onMessage).toHaveBeenCalledWith(SAMPLE_MESSAGE);
  });

  it('does nothing when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    expect(() => postActiveChurchSwitched(SAMPLE_MESSAGE)).not.toThrow();
    const unsubscribe = subscribeToActiveChurchSwitch({
      onMessage: vi.fn(),
    });
    expect(() => unsubscribe()).not.toThrow();

    vi.unstubAllGlobals();
  });
});
