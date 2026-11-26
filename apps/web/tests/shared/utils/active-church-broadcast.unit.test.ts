import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ActiveChurchSwitchedMessage,
  postActiveChurchSwitched,
  subscribeToActiveChurchSwitch,
} from '@/shared/utils/active-church-broadcast';
import {
  listenAsAnotherTab,
  postFromAnotherTab,
} from '@/tests/setup/active-church-broadcast';

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

  it("delivers another tab's switch to a subscriber", async () => {
    const onMessage = vi.fn();
    const received = new Promise<void>((resolve) => {
      onMessage.mockImplementation(() => resolve());
    });
    unsubscribers.push(subscribeToActiveChurchSwitch({ onMessage }));

    postFromAnotherTab(SAMPLE_MESSAGE);
    await received;

    expect(onMessage).toHaveBeenCalledWith(SAMPLE_MESSAGE);
  });

  it("reaches other tabs but not this tab's own subscribers", async () => {
    const onOwnMessage = vi.fn();
    const onOtherTabMessage = vi.fn();
    const otherTabReceived = new Promise<void>((resolve) => {
      onOtherTabMessage.mockImplementation(() => resolve());
    });
    unsubscribers.push(
      subscribeToActiveChurchSwitch({ onMessage: onOwnMessage }),
      listenAsAnotherTab({ onMessage: onOtherTabMessage }),
    );

    postActiveChurchSwitched(SAMPLE_MESSAGE);
    await otherTabReceived;

    expect(onOtherTabMessage).toHaveBeenCalledWith(SAMPLE_MESSAGE);
    expect(onOwnMessage).not.toHaveBeenCalled();
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
